import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { AthosProdutoCompostoService } from "./athos-produto-composto.service";

// Mock do módulo pg — deve vir antes dos imports do serviço
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

describe("AthosProdutoCompostoService", () => {
  let service: AthosProdutoCompostoService;

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
      providers: [AthosProdutoCompostoService],
    }).compile();
    service = module.get<AthosProdutoCompostoService>(AthosProdutoCompostoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("listarPorMaster", () => {
    it("COMP-01-404: lanca NotFoundException quando idprodutomaster nao existe", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      // master check returns empty
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.listarPorMaster(999)).rejects.toThrow(NotFoundException);
      expect(client.release).toHaveBeenCalled();
    });

    it("COMP-01-empty: retorna [] quando master existe mas nao tem componentes", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // master exists
        .mockResolvedValueOnce({ rows: [] }); // no components

      const result = await service.listarPorMaster(42);
      expect(result).toEqual([]);
    });

    it("COMP-01-list: retorna lista enriquecida ordenada por idprodutocomposto", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      const mockRow = {
        idprodutocomposto: 1,
        idprodutodetail: 10,
        descricaoproduto: "Papel A4",
        statusproduto: true,
        quantidade: "5",
      };
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.listarPorMaster(42);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockRow);
    });

    it("COMP-01-inactive: inclui componentes com statusproduto=false (D-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              idprodutocomposto: 2,
              idprodutodetail: 20,
              statusproduto: false,
              descricaoproduto: "Produto Inativo",
              quantidade: "3",
            },
          ],
        });

      const result = await service.listarPorMaster(42);
      expect(result).toHaveLength(1);
      expect(result[0].statusproduto).toBe(false);
    });

    it("COMP-01-leftjoin: SQL usa LEFT JOIN (nao INNER JOIN)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.listarPorMaster(42);

      const sqls: string[] = client.query.mock.calls.map(([sql]: [string]) =>
        String(sql).toUpperCase(),
      );
      const joinSql = sqls.find((s) => s.includes("LEFT JOIN"));
      expect(joinSql).toBeDefined();
    });

    it("propaga erro quando pool.connect falha", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      pool.connect = jest.fn().mockRejectedValue(new Error("connection refused"));

      await expect(service.listarPorMaster(1)).rejects.toThrow();
    });
  });
});
