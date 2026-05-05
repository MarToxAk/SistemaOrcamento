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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

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

