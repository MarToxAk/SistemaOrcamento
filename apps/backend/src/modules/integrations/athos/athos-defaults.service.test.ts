// Mock do modulo pg — deve ser a primeira declaracao do arquivo (antes dos imports do servico)
jest.mock("pg", () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

import { Test, TestingModule } from "@nestjs/testing";
import { AthosDefaultsService } from "./athos-defaults.service";

// Linhas de amostra com todos os 15 campos para testes de integracao do servico
const SAMPLE_ROW = {
  icms: "12",
  icmsnfe: "12",
  tributacao: "T",
  tributacaonfe: "T",
  codigocsosn: "400",
  codigocsosnnfe: "400",
  origem: 0,
  origemnfe: 0,
  tipoitem: "00",
  piscst: "07",
  cofinscst: "07",
  idcfopsaida: "5102",
  ncm: "48025590",
  controlaestoque: true,
  baixarestoque: true,
};

describe("AthosDefaultsService", () => {
  let service: AthosDefaultsService;

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
      providers: [AthosDefaultsService],
    }).compile();
    service = module.get<AthosDefaultsService>(AthosDefaultsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("getDefaults", () => {
    it("dispara query e retorna defaults com moda correta da amostra (DEFD-01)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // 5 rows com os mesmos valores para garantir moda acima de DEFAULTS_MIN_SAMPLE
      client.query.mockResolvedValue({ rows: Array(5).fill(SAMPLE_ROW) });

      const result = await service.getDefaults();

      expect(result).toBeDefined();
      expect(result.icms).toBe("12");
      expect(result.tributacao).toBe("T");
      expect(result.controlaestoque).toBe(true);
      expect(result.baixarestoque).toBe(true);
      expect(client.query).toHaveBeenCalledTimes(1);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("segunda chamada usa cache e nao dispara nova query ao banco (DEFD-03)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockResolvedValue({ rows: Array(5).fill(SAMPLE_ROW) });

      const first = await service.getDefaults(); // primeira chamada — popula cache
      const second = await service.getDefaults(); // segunda chamada — deve usar cache

      // Referencia ao mesmo objeto em cache
      expect(first).toBe(second);
      // Query disparada apenas 1 vez no total (DEFD-03)
      expect(client.query).toHaveBeenCalledTimes(1);
    });

    it("client.release() chamado sempre — mesmo em erro de query (DEFD-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockRejectedValue(new Error("connection error"));

      await expect(service.getDefaults()).rejects.toThrow("connection error");
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("amostra vazia nao lanca excecao — estoque false, fiscais omitidos (DEFD-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockResolvedValue({ rows: [] });

      const result = await service.getDefaults();

      // Campos fiscais ausentes (amostra insuficiente)
      expect(result).not.toHaveProperty("icms");
      expect(result).not.toHaveProperty("tributacao");
      // Campos de estoque presentes com fallback false (D-07)
      expect(result.controlaestoque).toBe(false);
      expect(result.baixarestoque).toBe(false);
    });

    it("amostra insuficiente (< 5 valores) nao lanca excecao (DEFD-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // Apenas 3 rows — abaixo de DEFAULTS_MIN_SAMPLE=5
      client.query.mockResolvedValue({ rows: Array(3).fill(SAMPLE_ROW) });

      // Nao deve lancar excecao — retorna objeto com estoque em fallback false
      const result = await service.getDefaults();

      // Campos de estoque: 3 valores < minSample -> fallback false
      expect(result).toBeDefined();
      expect(result.controlaestoque).toBe(false);
      expect(result.baixarestoque).toBe(false);
    });

    it("SQL_ACTIVE_PRODUCTS filtra statusproduto e vendeproduto = true (D-01)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockResolvedValue({ rows: [] });

      await service.getDefaults();

      const sqlExecuted = String(client.query.mock.calls[0][0]).toUpperCase();
      expect(sqlExecuted).toMatch(/STATUSPRODUTO\s*=\s*TRUE/);
      expect(sqlExecuted).toMatch(/VENDEPRODUTO\s*=\s*TRUE/);
      // Nao deve filtrar por data (D-02: sem janela temporal)
      expect(sqlExecuted).not.toMatch(/DATACADASTRO/);
    });

    it("SQL nao contem INSERT, UPDATE ou DELETE (servico read-only, D-04)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      client.query.mockResolvedValue({ rows: [] });

      await service.getDefaults();

      const sqlExecuted = String(client.query.mock.calls[0][0]).toUpperCase();
      expect(sqlExecuted).not.toMatch(/\bINSERT\b/);
      expect(sqlExecuted).not.toMatch(/\bUPDATE\b/);
      expect(sqlExecuted).not.toMatch(/\bDELETE\b/);
    });

    it("promise-lock: chamadas paralelas disparam apenas 1 query ao banco (DEFD-03)", async () => {
      const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
      const client = { query: jest.fn(), release: jest.fn() };
      pool.connect = jest.fn().mockResolvedValue(client);

      // Simula latencia para garantir que chamadas paralelas chegam antes do cache
      client.query.mockImplementation(
        () => new Promise((res) => setTimeout(() => res({ rows: Array(5).fill(SAMPLE_ROW) }), 10)),
      );

      const [r1, r2, r3] = await Promise.all([
        service.getDefaults(),
        service.getDefaults(),
        service.getDefaults(),
      ]);

      // Todas as chamadas retornam o mesmo resultado
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
      // Apenas 1 query disparada no total (promise-lock)
      expect(client.query).toHaveBeenCalledTimes(1);
    });
  });
});
