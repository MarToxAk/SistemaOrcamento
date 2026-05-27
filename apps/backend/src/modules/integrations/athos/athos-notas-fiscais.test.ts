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

describe("AthosService - buscarNotasFiscaisCliente", () => {
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

  /**
   * Cria um client mock independente e conecta o pool a ele.
   * Padrão idêntico ao athos.service.test.ts (L89-91).
   */
  function makeClient() {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    return client;
  }

  it("(a) lista com 3 notas ativas mapeadas corretamente", async () => {
    const client = makeClient();
    const dataFixa = new Date("2024-03-15T00:00:00.000Z");
    client.query.mockResolvedValueOnce({
      rows: [
        { numero: "1001", dataemissao: dataFixa, valornota: "1500.00" },
        { numero: "1002", dataemissao: dataFixa, valornota: "2000.50" },
        { numero: "1003", dataemissao: dataFixa, valornota: "500.75" },
      ],
    });

    const result = await service.buscarNotasFiscaisCliente(42);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      numero: "1001",
      dataemissao: "2024-03-15",
      valor: 1500,
      tipo: "NF-e",
    });
    expect(result[1]).toEqual({
      numero: "1002",
      dataemissao: "2024-03-15",
      valor: 2000.5,
      tipo: "NF-e",
    });
    expect(result[2]).toEqual({
      numero: "1003",
      dataemissao: "2024-03-15",
      valor: 500.75,
      tipo: "NF-e",
    });
  });

  it("(b) com numero passa 2 params e filtra por numero exato", async () => {
    const client = makeClient();
    const dataFixa = new Date("2024-06-20T00:00:00.000Z");
    client.query.mockResolvedValueOnce({
      rows: [
        { numero: "12345", dataemissao: dataFixa, valornota: "300.00" },
      ],
    });

    const result = await service.buscarNotasFiscaisCliente(99, "12345");

    expect(result).toHaveLength(1);
    expect(result[0].numero).toBe("12345");

    // Verifica que a query foi chamada com 2 parâmetros (idcliente + numero)
    const queryCall = client.query.mock.calls[0] as [string, unknown[]];
    expect(queryCall[1]).toEqual([99, "12345"]);
    // E que o SQL contém o filtro de numero
    expect(queryCall[0]).toContain("n.numero = $2");
  });

  it("(c) sem resultado retorna array vazio []", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.buscarNotasFiscaisCliente(777, "99999");

    expect(result).toEqual([]);
  });

  it("(d) LIMIT 50 presente no SQL da query", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] });

    await service.buscarNotasFiscaisCliente(1);

    const queryCall = client.query.mock.calls[0] as [string, unknown[]];
    expect(queryCall[0]).toContain("LIMIT 50");
  });
});
