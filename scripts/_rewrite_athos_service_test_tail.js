const fs = require('fs');
const filePath = 'apps/backend/src/modules/integrations/athos/athos.service.test.ts';
let content = fs.readFileSync(filePath, 'utf8');

const anchor = 'describe("AthosService - buscarRelacaoOrcamentoVenda", () => {';
const idx = content.indexOf(anchor);
if (idx === -1) throw new Error('anchor not found');

const tail = `describe("AthosService - buscarRelacaoOrcamentoVenda", () => {
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
`;

fs.writeFileSync(filePath, content.slice(0, idx) + tail, 'utf8');
console.log('athos.service.test.ts tail rewritten');
