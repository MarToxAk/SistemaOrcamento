import { Test, TestingModule } from "@nestjs/testing";
import { AthosService } from "./athos.service";

// Mock do módulo pg — deve vir antes dos imports do serviço
jest.mock("pg", () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  };
  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool), Client: jest.fn(() => mClient) };
});

jest.mock("node:fs/promises", () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsMock = require("node:fs/promises");

function getMockClient() {
  return pgMock.Pool.mock.results[0]?.value?.connect.mock.results[0]?.value ?? pgMock.Pool.mock.results[0]?.value?.connect();
}

// Helper: retorna o mock do client conectado pelo pool
async function getClient() {
  const pool = pgMock.Pool.mock.results[0]?.value;
  if (!pool) throw new Error("Pool mock not initialized");
  const client = await pool.connect();
  return client;
}

describe("AthosService - verificarPagamentoPorOrcamento", () => {
  let service: AthosService;

  beforeAll(() => {
    // Garantir variáveis de ambiente mínimas para getDbConfig não lançar
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  // Monta a sequência de respostas do client.query para o cenário padrão:
  // 1) information_schema para tabela venda (retorna colunas existentes)
  // 2) SELECT na tabela venda por orcamentoId
  // 3) information_schema para tabela financeira (retorna rows vazios → tabela não encontrada)
  function setupQuerySequence(client: { query: jest.Mock }, vendaRow: Record<string, unknown> | null) {
    client.query
      // 1. information_schema → tabela "venda" existe com colunas
      .mockResolvedValueOnce({
        rows: [
          { column_name: "idvenda" },
          { column_name: "idorcamento" },
          { column_name: "situacaovenda" },
          { column_name: "valortotal" },
        ],
      })
      // 2. SELECT na venda por orcamentoId
      .mockResolvedValueOnce({ rows: vendaRow ? [vendaRow] : [] })
      // 3. information_schema → nenhuma tabela financeira
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
  }

  it("deve retornar paid=true quando situacaovenda='PAGO'", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    setupQuerySequence(client, {
      idvenda: 42,
      idorcamento: "123",
      situacaovenda: "PAGO",
      valortotal: 500,
    });

    const result = await service.verificarPagamentoPorOrcamento("123");
    expect(result.paid).toBe(true);
    expect(result.idVenda).toBe(42);
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar paid=false quando situacaovenda='ABERTO'", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    setupQuerySequence(client, {
      idvenda: 10,
      idorcamento: "456",
      situacaovenda: "ABERTO",
      valortotal: 200,
    });

    const result = await service.verificarPagamentoPorOrcamento("456");
    expect(result.paid).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar paid=true com QUITADO", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    setupQuerySequence(client, {
      idvenda: 77,
      idorcamento: "789",
      situacaovenda: "QUITADO",
      valortotal: 800,
    });

    const result = await service.verificarPagamentoPorOrcamento("789");
    expect(result.paid).toBe(true);
  });

  it("deve priorizar busca por vendaId quando fornecido", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      // 1. information_schema → tabela venda com idvenda, situacaovenda
      .mockResolvedValueOnce({
        rows: [
          { column_name: "idvenda" },
          { column_name: "idorcamento" },
          { column_name: "situacaovenda" },
          { column_name: "valortotal" },
        ],
      })
      // 2. SELECT por vendaId=99 (busca direta)
      .mockResolvedValueOnce({
        rows: [{ idvenda: 99, idorcamento: "000", situacaovenda: "PAGO", valortotal: 300 }],
      })
      // tabelas financeiras — nenhuma encontrada
      .mockResolvedValue({ rows: [] });

    const result = await service.verificarPagamentoPorOrcamento("000", 99);
    expect(result.paid).toBe(true);
    expect(result.idVenda).toBe(99);
    // A segunda query (busca direta por vendaId) deve ter sido chamada com "99"
    const calls = client.query.mock.calls;
    const vendaQueryCall = calls[1];
    expect(vendaQueryCall[1]).toContain("99");
  });

  it("deve retornar paid=false sem excecao quando tabela venda nao encontrada (degradacao graciosa)", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    // information_schema retorna rows vazios para todas as tabelas candidatas
    client.query.mockResolvedValue({ rows: [] });

    const result = await service.verificarPagamentoPorOrcamento("999");
    expect(result.paid).toBe(false);
    expect(result.idVenda).toBeNull();
    expect(result.valor).toBe(0);
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar paid=false sem excecao quando pool.connect falha (degradacao graciosa)", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

    const result = await service.verificarPagamentoPorOrcamento("001");
    expect(result.paid).toBe(false);
    expect(result.valor).toBe(0);
  });
});

describe("AthosService - buscarRelacaoOrcamentoVenda", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve retornar idvenda quando row encontrado em relacao_orcamento_venda", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    client.query.mockResolvedValue({ rows: [{ idvenda: 42 }] });

    const result = await service.buscarRelacaoOrcamentoVenda(5);
    expect(result).toEqual({ idvenda: 42 });
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar idvenda=null quando nenhuma row encontrada", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    client.query.mockResolvedValue({ rows: [] });

    const result = await service.buscarRelacaoOrcamentoVenda(99);
    expect(result).toEqual({ idvenda: null });
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar idvenda=null sem lancar excecao quando pool.connect falha", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

    const result = await service.buscarRelacaoOrcamentoVenda(1);
    expect(result).toEqual({ idvenda: null });
  });
});

describe("AthosService - buscarClientes", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve retornar cliente PF ao buscar por documento (CPF)", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            idcliente: 123,
            nome_fisico: "João da Silva",
            nomefantasia: null,
            razaosocial: null,
            cpf: "123.456.789-01",
            cnpj: null,
            tipologradouro: "Rua",
            logradouro: "das Flores",
            end_numero: "10",
            bairro: "Centro",
            cep: "11630-000",
            codigocidade: "3520400",
            uf: "SP",
          },
        ],
      });

    const result = await service.buscarClientes({ documento: "12345678901" });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tipoPessoa).toBe("fisico");
    expect(result.items[0].nome).toBe("João da Silva");
    expect(result.items[0].documento).toBe("12345678901");
    expect(result.items[0].endereco?.logradouro).toBe("Rua das Flores");
    expect(client.release).toHaveBeenCalled();
  });

  it("deve retornar lista paginada ao buscar por nome", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            idcliente: 10,
            nome_fisico: "Ana Souza",
            nomefantasia: null,
            razaosocial: null,
            cpf: "111.111.111-11",
            cnpj: null,
            logradouro: null,
          },
          {
            idcliente: 20,
            nome_fisico: null,
            nomefantasia: "Ana Comercio",
            razaosocial: "Ana Comercio Ltda",
            cpf: null,
            cnpj: "12.345.678/0001-90",
            logradouro: null,
          },
        ],
      });

    const result = await service.buscarClientes({ nome: "Ana", page: 1, take: 10 });

    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.take).toBe(10);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].tipoPessoa).toBe("fisico");
    expect(result.items[1].tipoPessoa).toBe("juridico");
    expect(result.items[1].documento).toBe("12345678000190");
    expect(client.release).toHaveBeenCalled();
  });

  it("deve lançar BadRequestException quando nenhum filtro significativo for fornecido", async () => {
    await expect(service.buscarClientes({})).rejects.toThrow();
    await expect(service.buscarClientes({ nome: "ab" })).rejects.toThrow();
  });

  it("deve limitar take ao máximo de 50", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.buscarClientes({ idcliente: 1, take: 999 });

    expect(result.take).toBe(50);
    expect(client.release).toHaveBeenCalled();
  });
});

describe("AthosService - criarContaPagar", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve criar conta a pagar com INSERT bem-sucedido e retornar idcontapagar", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "descricaoconta" },
            { column_name: "datavencimento" },
            { column_name: "valorconta" },
          ],
        };
      }

      if (text === "BEGIN" || text === "COMMIT" || text.startsWith("LOCK TABLE")) {
        return { rows: [] };
      }

      if (text.includes("SELECT COALESCE(MAX(CAST(\"idcontapagar\" AS INTEGER))")) {
        return { rows: [{ next_id: 42 }] };
      }

      if (text.includes("INSERT INTO \"conta_pagar\"")) {
        return { rows: [{ idcontapagar: 42 }] };
      }

      return { rows: [] };
    });

    const result = await service.criarContaPagar({
      descricaoconta: "Conta fornecedor ABC",
      datavencimento: "2026-06-30",
      valorconta: 1500.5,
      dataemissao: "2026-05-01",
      observacao: "Pagamento após aprovação",
      idfornecedor: 10,
      numerodocumento: "NF-001",
    });

    expect(result.idcontapagar).toBe(42);
    expect(client.release).toHaveBeenCalled();
  });

  it("deve lançar erro quando tabela de contas a pagar não encontrada", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    // Mock client.query to return empty rows for all table candidates
    // findExistingTable will call getTableColumns for each candidate table
    client.query.mockResolvedValue({ rows: [] });

    await expect(
      service.criarContaPagar({
        descricaoconta: "Conta teste",
        datavencimento: "2026-06-30",
        valorconta: 100,
      }),
    ).rejects.toThrow();
    expect(client.release).toHaveBeenCalled();
  });

  it("deve lançar erro quando pool.connect falha", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

    await expect(
      service.criarContaPagar({
        descricaoconta: "Conta teste",
        datavencimento: "2026-06-30",
        valorconta: 100,
      }),
    ).rejects.toThrow();
  });

  it("deve chamar client.release() mesmo quando query falha", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "descricaoconta" },
            { column_name: "datavencimento" },
            { column_name: "valorconta" },
          ],
        };
      }

      if (text === "BEGIN" || text === "ROLLBACK" || text.startsWith("LOCK TABLE")) {
        return { rows: [] };
      }

      if (text.includes("SELECT COALESCE(MAX(CAST(\"idcontapagar\" AS INTEGER))")) {
        return { rows: [{ next_id: 42 }] };
      }

      if (text.includes("INSERT INTO \"conta_pagar\"")) {
        throw new Error("database error");
      }

      return { rows: [] };
    });

    await expect(
      service.criarContaPagar({
        descricaoconta: "Conta teste",
        datavencimento: "2026-06-30",
        valorconta: 100,
      }),
    ).rejects.toThrow("Erro ao criar conta a pagar no Athos");
    expect(client.release).toHaveBeenCalled();
  });
});

describe("AthosService - listarContasPagar com statusconta filter", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve aplicar filtro statusconta corretamente no WHERE", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    // Mock para findExistingTable
    client.query
      .mockResolvedValueOnce({
        rows: [
          { column_name: "datavencimento" },
          { column_name: "statusconta" },
          { column_name: "descricaoconta" },
        ],
      })
      // Mock para SELECT com filtro statusconta
      .mockResolvedValueOnce({
        rows: [
          {
            idcontapagar: 15,
            descricaoconta: "Conta ABERTA",
            dataemissao: "2026-05-01",
            datavencimento: "2026-06-30",
            valorconta: 500,
            statusconta: "ABERTO",
            observacao: "Pagamento pendente",
            jurosconta: 12.5,
            multaconta: 8.75,
            competenciames: "05",
            competenciaano: "2026",
            enviaalerta: true,
            recorrenciafornecedor: false,
          },
        ],
      });

    const result = await service.listarContasPagar(undefined, undefined, "ABERTO");

    expect(result).toHaveLength(1);
    expect(result[0].idcontapagar).toBe(15);
    expect(result[0].statusconta).toBe("ABERTO");
    expect(result[0].jurosconta).toBe(12.5);
    expect(result[0].multaconta).toBe(8.75);
    expect(result[0].competenciames).toBe("05");
    expect(result[0].competenciaano).toBe("2026");
    expect(result[0].enviaalerta).toBe(true);
    expect(result[0].recorrenciafornecedor).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it("deve converter statusconta para UPPERCASE mesmo se fornecido em minúsculas", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    // Mock para findExistingTable
    client.query
      .mockResolvedValueOnce({
        rows: [
          { column_name: "datavencimento" },
          { column_name: "statusconta" },
        ],
      })
      // Mock para SELECT
      .mockResolvedValueOnce({
        rows: [
          {
            descricaoconta: "Conta PAGO",
            datavencimento: "2026-05-30",
            valorconta: 1000,
            statusconta: "PAGO",
          },
        ],
      });

    const result = await service.listarContasPagar(undefined, undefined, "pago");

    expect(result).toHaveLength(1);
    expect(result[0].statusconta).toBe("PAGO");
    expect(client.release).toHaveBeenCalled();

    // Verificar que statusconta foi convertido para UPPERCASE na query
    const queryCall = client.query.mock.calls[1];
    expect(queryCall[1]).toContain("PAGO");
  });

  it("deve retornar lista vazia quando nenhuma conta tem o statusconta especificado", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    // Mock para findExistingTable
    client.query
      .mockResolvedValueOnce({
        rows: [
          { column_name: "datavencimento" },
          { column_name: "statusconta" },
        ],
      })
      // Mock para SELECT retornando vazio
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.listarContasPagar(undefined, undefined, "CANCELADO");

    expect(result).toHaveLength(0);
    expect(client.release).toHaveBeenCalled();
  });
});

describe("AthosService - updateContaPagar", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve atualizar conta a pagar com payload parcial e retornar registro completo", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      if (text === "BEGIN" || text === "COMMIT") {
        return { rows: [] };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "conta_pagar") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "statusconta" },
            { column_name: "valorpago" },
            { column_name: "datapagamento" },
            { column_name: "idfuncionario" },
            { column_name: "valorconta" },
            { column_name: "observacao" },
          ],
        };
      }

      if (text.includes('UPDATE "conta_pagar"')) {
        return {
          rows: [
            {
              idcontapagar: 42,
              statusconta: "PAG",
              valorpago: 600,
              valorconta: 600,
              datapagamento: "2026-05-11",
              idfuncionario: 3,
              observacao: "Pagamento efetuado",
            },
          ],
        };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro_io") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "idlivroregistro" },
            { column_name: "idfuncionario" },
            { column_name: "valorsaida" },
            { column_name: "datadocumento" },
            { column_name: "datalancamento" },
            { column_name: "horalancamento" },
            { column_name: "descricao" },
            { column_name: "numerodocumento" },
            { column_name: "tipopagamento" },
            { column_name: "observacao" },
            { column_name: "idorigemlancamento" },
            { column_name: "idrevenda" },
            { column_name: "sincronizado" },
            { column_name: "transferencia" },
            { column_name: "history_code" },
            { column_name: "transaction_id" },
          ],
        };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro") {
        return {
          rows: [
            { column_name: "idlivroregistro" },
            { column_name: "idcontacorrente" },
            { column_name: "descricao" },
            { column_name: "acesso" },
            { column_name: "conciliacaobancaria" },
          ],
        };
      }

      if (text.includes('FROM "livro_registro"')) {
        return {
          rows: [
            {
              idlivroregistro: 1,
              idcontacorrente: 2,
              descricao: "Santander",
              acesso: "BANCO",
              conciliacaobancaria: true,
            },
          ],
        };
      }

      if (text.includes('INSERT INTO "livro_registro_io"')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const result = await service.updateContaPagar(42, {
      statusconta: "PAG",
      valorpago: 600,
      datapagamento: "2026-05-11",
      idfuncionario: 3,
    });

    expect(result).toMatchObject({
      idcontapagar: 42,
      statusconta: "PAG",
      valorpago: 600,
      datapagamento: "2026-05-11",
    });
    const queries = client.query.mock.calls.map((call) => String(call[0]));
    expect(queries.some((query) => query.includes('INSERT INTO "livro_registro_io"'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO "caixa_saida"'))).toBe(false);

    const livroInsertCall = client.query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO "livro_registro_io"'));
    const livroInsertParams = (livroInsertCall?.[1] ?? []) as unknown[];
    expect(livroInsertParams).toContain("DINHEIRO");
    expect(livroInsertParams).toContain("Dinheiro");
    expect(livroInsertParams).toContain(11305);
    expect(livroInsertParams).toContain(1);
    expect(livroInsertParams).toContain(false);

    expect(client.release).toHaveBeenCalled();
  });

  it("deve permitir liquidacao PAG sem idcaixacentral", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      if (text === "BEGIN" || text === "ROLLBACK") {
        return { rows: [] };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "conta_pagar") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "statusconta" },
            { column_name: "valorpago" },
            { column_name: "idfuncionario" },
          ],
        };
      }

      if (text.includes('UPDATE "conta_pagar"')) {
        return {
          rows: [
            {
              idcontapagar: 42,
              statusconta: "PAG",
              valorpago: 600,
              valorconta: 600,
              datapagamento: "2026-05-11",
              idfuncionario: 3,
            },
          ],
        };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro_io") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "idfuncionario" },
            { column_name: "valorsaida" },
            { column_name: "idlivroregistro" },
          ],
        };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro") {
        return {
          rows: [
            { column_name: "idlivroregistro" },
            { column_name: "idcontacorrente" },
            { column_name: "descricao" },
            { column_name: "acesso" },
            { column_name: "conciliacaobancaria" },
          ],
        };
      }

      if (text.includes('FROM "livro_registro"')) {
        return {
          rows: [
            {
              idlivroregistro: 1,
              idcontacorrente: 2,
              descricao: "Santander",
              acesso: "BANCO",
              conciliacaobancaria: true,
            },
          ],
        };
      }

      if (text.includes('INSERT INTO "livro_registro_io"')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    await expect(
      service.updateContaPagar(42, {
        statusconta: "PAG",
        valorpago: 600,
        idfuncionario: 3,
      }),
    ).resolves.toMatchObject({
      idcontapagar: 42,
      statusconta: "PAG",
      valorpago: 600,
    });

    expect(client.release).toHaveBeenCalled();
  });

  it("deve rejeitar PATCH sem nenhum campo valido para atualizar", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text === "BEGIN" || text === "ROLLBACK") {
        return { rows: [] };
      }

      if (text.includes("information_schema.columns")) {
        return { rows: [{ column_name: "idcontapagar" }] };
      }

      return { rows: [] };
    });

    await expect(service.updateContaPagar(42, {})).rejects.toThrow("Nenhum campo valido informado para atualizacao");
    expect(client.release).toHaveBeenCalled();
  });

  it("deve exigir idlivroregistro quando houver mais de um banco disponivel", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text === "BEGIN" || text === "ROLLBACK") {
        return { rows: [] };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "conta_pagar") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "statusconta" },
            { column_name: "valorpago" },
            { column_name: "idfuncionario" },
            { column_name: "idorigempagamento" },
          ],
        };
      }

      if (text.includes('UPDATE "conta_pagar"')) {
        return {
          rows: [
            {
              idcontapagar: 42,
              statusconta: "PAG",
              valorpago: 600,
              valorconta: 600,
              datapagamento: "2026-05-11",
              idfuncionario: 3,
              idorigempagamento: 2,
            },
          ],
        };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro_io") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "idfuncionario" },
            { column_name: "valorsaida" },
            { column_name: "idlivroregistro" },
          ],
        };
      }

      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro") {
        return {
          rows: [
            { column_name: "idlivroregistro" },
            { column_name: "idcontacorrente" },
            { column_name: "descricao" },
            { column_name: "acesso" },
            { column_name: "conciliacaobancaria" },
          ],
        };
      }

      if (text.includes('FROM "livro_registro"')) {
        return {
          rows: [
            { idlivroregistro: 1, idcontacorrente: 2, descricao: "Banco A", acesso: "BANCO", conciliacaobancaria: true },
            { idlivroregistro: 2, idcontacorrente: 2, descricao: "Banco B", acesso: "BANCO", conciliacaobancaria: true },
          ],
        };
      }

      return { rows: [] };
    });

    await expect(
      service.updateContaPagar(42, {
        statusconta: "PAG",
        valorpago: 600,
        idfuncionario: 3,
        idorigempagamento: 2,
      }),
    ).rejects.toThrow("Multiplos bancos encontrados");

    expect(client.release).toHaveBeenCalled();
  });
});

describe("AthosService - anexarContaPagar", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
    // Garantir que o mount Linux não interfere — testes cobrem comportamento Windows/UNC
    delete process.env.ATHOS_SMB_MOUNT_PATH;
    process.env.SMB_ENABLED = "false";
  });

  afterAll(() => {
    delete process.env.ATHOS_SMB_MOUNT_PATH;
    delete process.env.SMB_ENABLED;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    fsMock.mkdir.mockResolvedValue(undefined);
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.unlink.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve gravar arquivo, inserir em anexo e retornar metadados", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ column_name: "idcontapagar" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "idanexo" },
          { column_name: "idfuncionario" },
          { column_name: "caminhoanexo" },
          { column_name: "arquivo" },
          { column_name: "idclientehistorico" },
          { column_name: "idcontapagar" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ idanexo: 77 }] });

    const result = await service.anexarContaPagar({
      idcontapagar: 55,
      file: {
        originalname: "boleto final.pdf",
        buffer: Buffer.from("pdf"),
        mimetype: "application/pdf",
        size: 3,
      },
    });

    expect(fsMock.mkdir).toHaveBeenCalledWith("\\\\192.168.3.203\\html\\Anexo\\contapagar\\55", { recursive: true });
    const writtenFilePath = String(fsMock.writeFile.mock.calls[0][0]);
    expect(writtenFilePath).toMatch(/^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\55\\[a-f0-9]{32}\.pdf$/);

    const insertParams = client.query.mock.calls[3][1] as unknown[];
    expect(insertParams[0]).toBe(1);
    expect(String(insertParams[1])).toMatch(/^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\55\\[a-f0-9]{32}\.pdf$/);
    expect(String(insertParams[2])).toMatch(/^[a-f0-9]{32}\.pdf$/);
    expect(insertParams[3]).toBe(0);
    expect(insertParams[4]).toBe(55);

    expect(result).toEqual({
      idanexo: 77,
      idcontapagar: 55,
      arquivo: expect.stringMatching(/^[a-f0-9]{32}\.pdf$/),
      caminhoanexo: expect.stringMatching(/^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\55\\[a-f0-9]{32}\.pdf$/),
    });
    expect(client.release).toHaveBeenCalled();
  });

  it("deve abortar antes do INSERT quando a escrita SMB falha", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    fsMock.writeFile.mockRejectedValue(new Error("share unavailable"));

    client.query
      .mockResolvedValueOnce({ rows: [{ column_name: "idcontapagar" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "idanexo" },
          { column_name: "idfuncionario" },
          { column_name: "caminhoanexo" },
          { column_name: "arquivo" },
          { column_name: "idclientehistorico" },
          { column_name: "idcontapagar" },
        ],
      });

    await expect(
      service.anexarContaPagar({
        idcontapagar: 55,
        file: {
          originalname: "boleto.pdf",
          buffer: Buffer.from("pdf"),
          mimetype: "application/pdf",
          size: 3,
        },
      }),
    ).rejects.toThrow("Erro ao anexar conta a pagar no Athos");

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(fsMock.unlink).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it("deve fazer cleanup do arquivo quando o INSERT em anexo falha", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({ rows: [{ column_name: "idcontapagar" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "idanexo" },
          { column_name: "idfuncionario" },
          { column_name: "caminhoanexo" },
          { column_name: "arquivo" },
          { column_name: "idclientehistorico" },
          { column_name: "idcontapagar" },
        ],
      })
      .mockRejectedValueOnce(new Error("insert failed"));

    await expect(
      service.anexarContaPagar({
        idcontapagar: 88,
        file: {
          originalname: "comprovante.jpg",
          buffer: Buffer.from("img"),
          mimetype: "image/jpeg",
          size: 3,
        },
        idfuncionario: 7,
      }),
    ).rejects.toThrow("Erro ao anexar conta a pagar no Athos");

    expect(String(fsMock.unlink.mock.calls[0][0])).toMatch(
      /^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\88\\[a-f0-9]{32}\.jpg$/,
    );
    expect(client.release).toHaveBeenCalled();
  });
});

describe("AthosService - criarContaPagar com novos campos do DTO", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await (await import("@nestjs/testing")).Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve incluir historicocontabil, idbudget e recorrenciafornecedor no INSERT quando presentes na tabela", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    const capturedInsertParams: unknown[] = [];

    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "descricaoconta" },
            { column_name: "datavencimento" },
            { column_name: "valorconta" },
            { column_name: "historicocontabil" },
            { column_name: "idbudget" },
            { column_name: "recorrenciafornecedor" },
            { column_name: "numeronota" },
          ],
        };
      }
      if (text === "BEGIN" || text === "COMMIT" || text.startsWith("LOCK TABLE")) {
        return { rows: [] };
      }
      if (text.includes("SELECT COALESCE(MAX(CAST")) {
        return { rows: [{ next_id: 10 }] };
      }
      if (text.includes("INSERT INTO") && params) {
        capturedInsertParams.push(...params);
        return { rows: [{ idcontapagar: 10 }] };
      }
      return { rows: [] };
    });

    await service.criarContaPagar({
      descricaoconta: "Suzano papel couche",
      datavencimento: "2026-07-15",
      valorconta: 8200,
      historicocontabil: "Conta Suzano - papel couche",
      idbudget: 2026,
      recorrenciafornecedor: true,
      numeronota: "NF-99887",
    });

    expect(capturedInsertParams).toContain("Conta Suzano - papel couche");
    expect(capturedInsertParams).toContain(2026);
    expect(capturedInsertParams).toContain(true);
    expect(capturedInsertParams).toContain("NF-99887");
  });

  it("deve omitir campos novos do INSERT quando nao existem na tabela DB", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    const capturedSqls: string[] = [];

    client.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      capturedSqls.push(text);
      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "descricaoconta" },
            { column_name: "datavencimento" },
            { column_name: "valorconta" },
          ],
        };
      }
      if (text === "BEGIN" || text === "COMMIT" || text.startsWith("LOCK TABLE")) {
        return { rows: [] };
      }
      if (text.includes("SELECT COALESCE(MAX(CAST")) {
        return { rows: [{ next_id: 11 }] };
      }
      if (text.includes("INSERT INTO")) {
        return { rows: [{ idcontapagar: 11 }] };
      }
      return { rows: [] };
    });

    await service.criarContaPagar({
      descricaoconta: "Aluguel",
      datavencimento: "2026-07-01",
      valorconta: 4500,
      historicocontabil: "Conta aluguel",
      idbudget: 2026,
    });

    const insertSql = capturedSqls.find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toBeDefined();
    expect(insertSql).not.toContain("historicocontabil");
    expect(insertSql).not.toContain("idbudget");
  });
});

describe("AthosService - workflow: criar conta e liquidar pagamento", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await (await import("@nestjs/testing")).Test.createTestingModule({
      providers: [AthosService],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("workflow completo: criarContaPagar retorna ID, updateContaPagar liquida com livro_registro_io", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();

    // ---- FASE 1: criar ----
    const createClient = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValueOnce(createClient);

    createClient.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "descricaoconta" },
            { column_name: "datavencimento" },
            { column_name: "valorconta" },
            { column_name: "statusconta" },
            { column_name: "idfuncionario" },
            { column_name: "valorpago" },
            { column_name: "datapagamento" },
          ],
        };
      }
      if (text === "BEGIN" || text === "COMMIT" || text.startsWith("LOCK TABLE")) return { rows: [] };
      if (text.includes("SELECT COALESCE(MAX(CAST")) return { rows: [{ next_id: 200 }] };
      if (text.includes("INSERT INTO")) return { rows: [{ idcontapagar: 200 }] };
      return { rows: [] };
    });

    const created = await service.criarContaPagar({
      descricaoconta: "Fornecedor XYZ",
      datavencimento: "2026-06-30",
      valorconta: 1200,
      statusconta: "ABE",
    });

    expect(created.idcontapagar).toBe(200);
    expect(createClient.release).toHaveBeenCalled();

    // ---- FASE 2: liquidar (PAG) ----
    const updateClient = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValueOnce(updateClient);

    updateClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text === "BEGIN" || text === "COMMIT") return { rows: [] };
      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "conta_pagar") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "statusconta" },
            { column_name: "valorpago" },
            { column_name: "valorconta" },
            { column_name: "datapagamento" },
            { column_name: "idfuncionario" },
            { column_name: "observacao" },
          ],
        };
      }
      if (text.includes('UPDATE "conta_pagar"')) {
        return {
          rows: [{
            idcontapagar: 200,
            statusconta: "PAG",
            valorpago: 1200,
            valorconta: 1200,
            datapagamento: "2026-06-10",
            idfuncionario: 5,
          }],
        };
      }
      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro_io") {
        return {
          rows: [
            { column_name: "idcontapagar" },
            { column_name: "idfuncionario" },
            { column_name: "valorsaida" },
            { column_name: "idlivroregistro" },
            { column_name: "descricao" },
          ],
        };
      }
      if (text.includes("information_schema.columns") && Array.isArray(params) && params[0] === "livro_registro") {
        return {
          rows: [
            { column_name: "idlivroregistro" },
            { column_name: "idcontacorrente" },
            { column_name: "descricao" },
            { column_name: "acesso" },
            { column_name: "conciliacaobancaria" },
          ],
        };
      }
      if (text.includes('FROM "livro_registro"')) {
        return { rows: [{ idlivroregistro: 3, idcontacorrente: 1, descricao: "Santander", acesso: "BANCO", conciliacaobancaria: true }] };
      }
      if (text.includes('INSERT INTO "livro_registro_io"')) return { rows: [] };
      return { rows: [] };
    });

    const updated = await service.updateContaPagar(200, {
      statusconta: "PAG",
      valorpago: 1200,
      datapagamento: "2026-06-10",
      idfuncionario: 5,
    });

    expect(updated.statusconta).toBe("PAG");
    expect(updated.valorpago).toBe(1200);

    const sqls = updateClient.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('INSERT INTO "livro_registro_io"'))).toBe(true);
    expect(updateClient.release).toHaveBeenCalled();
  });

  it("workflow: dataInicio > dataFinal deve rejeitar antes de chamar DB", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query.mockResolvedValue({
      rows: [{ column_name: "datavencimento" }, { column_name: "statusconta" }],
    });

    await expect(
      service.listarContasPagar("2026-12-31", "2026-01-01"),
    ).rejects.toThrow("dataInicio nao pode ser maior que dataFinal");

    expect(client.release).toHaveBeenCalled();
  });
});
