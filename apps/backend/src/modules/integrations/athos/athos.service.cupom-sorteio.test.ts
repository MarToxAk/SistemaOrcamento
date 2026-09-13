import { Test, TestingModule } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { AthosService } from "./athos.service";
import { PrismaService } from "../../database/prisma.service";

const mockPrismaService = {
  orcamentoItemCorrecao: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

// Mock do modulo pg — deve vir antes dos imports do servico
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

function setupClient() {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);
  return { pool, client };
}

describe("AthosService - verificarCupomFiscalSorteio", () => {
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
      providers: [AthosService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("linha com coo igual, nao cancelada e valor 80 devolve valido com valor 80", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ idvenda: 1, coo: "12345", valor: 80, cancelada: false, cupomcancelado: false }],
    });

    const result = await service.verificarCupomFiscalSorteio("12345", 50);

    expect(result).toEqual({ valido: true, valor: 80 });
  });

  it("nenhuma linha devolve invalido", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    const result = await service.verificarCupomFiscalSorteio("99999", 50);

    expect(result).toEqual({ valido: false, valor: null });
  });

  it("linha cancelada devolve invalido", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ idvenda: 1, coo: "12345", valor: 80, cancelada: true, cupomcancelado: false }],
    });

    const result = await service.verificarCupomFiscalSorteio("12345", 50);

    expect(result).toEqual({ valido: false, valor: null });
  });

  it("linha com cupom cancelado devolve invalido", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ idvenda: 1, coo: "12345", valor: 80, cancelada: false, cupomcancelado: true }],
    });

    const result = await service.verificarCupomFiscalSorteio("12345", 50);

    expect(result).toEqual({ valido: false, valor: null });
  });

  it("linha com valor abaixo do minimo devolve invalido", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ idvenda: 1, coo: "12345", valor: 20, cancelada: false, cupomcancelado: false }],
    });

    const result = await service.verificarCupomFiscalSorteio("12345", 50);

    expect(result).toEqual({ valido: false, valor: null });
  });

  it("linha com valor exatamente igual ao minimo devolve invalido (estritamente maior)", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ idvenda: 1, coo: "12345", valor: 50, cancelada: false, cupomcancelado: false }],
    });

    const result = await service.verificarCupomFiscalSorteio("12345", 50);

    expect(result).toEqual({ valido: false, valor: null });
  });

  it("duas linhas com o mesmo coo (20 e 90) devolvem valido com o maior valor", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { idvenda: 1, coo: "12345", valor: 20, cancelada: false, cupomcancelado: false },
        { idvenda: 2, coo: "12345", valor: 90, cancelada: false, cupomcancelado: false },
      ],
    });

    const result = await service.verificarCupomFiscalSorteio("12345", 50);

    expect(result).toEqual({ valido: true, valor: 90 });
  });

  it("erro do driver pg lanca ServiceUnavailableException", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock).mockRejectedValueOnce(new Error("conexao perdida"));

    await expect(service.verificarCupomFiscalSorteio("12345", 50)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
