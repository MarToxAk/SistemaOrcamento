import { ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AthosService } from "./athos.service";
import { PrismaService } from "../../database/prisma.service";

const mockPrismaService = {
  orcamentoItemCorrecao: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

// pg mockado: nenhum teste fala com o Athos real (Fase 47, plano 03).
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

describe("AthosService.buscarNfeResumoPorTitulos (D-09, somente leitura)", () => {
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
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  function makeClient() {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new pgMock.Pool();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);
    return { client, pool };
  }

  it("A1. saneia ids (inteiros positivos, sem repeticao) e usa os mesmos filtros do download, sem n.xml no SELECT", async () => {
    const { client } = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] });

    await service.buscarNfeResumoPorTitulos([1363, 1364, 1363, -1, 1.5]);

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(params).toEqual([[1363, 1364]]);
    expect(sql).toContain("= ANY($1)");
    expect(sql).toContain("n.xml IS NOT NULL");
    expect(sql).toContain("n.nfechaveacesso IS NOT NULL");
    expect(sql).toContain("COALESCE(n.cancelada, false) = false");
    const colunas = sql.slice(sql.indexOf("SELECT"), sql.indexOf("FROM"));
    expect(colunas).not.toMatch(/n\.xml/);
    // Coluna real do valor da nota no Athos (validada no clone): totalvalornota, nao valornota.
    expect(colunas).toContain("n.totalvalornota AS valornota");
    expect(colunas).toContain("to_char(n.dataemissao, 'YYYY-MM-DD') AS dataemissao");
    // Somente leitura e compativel com PG 9.0.5.
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|pg_sequence_last_value/i);
  });

  it("A2. mapeia numero, data (AAAA-MM-DD) e valor; descarta numero vazio", async () => {
    const { client } = makeClient();
    client.query.mockResolvedValueOnce({
      rows: [
        { idcontareceber: 1363, numero: " 4521 ", dataemissao: new Date("2026-11-03T00:00:00.000Z"), valornota: "150.00" },
        { idcontareceber: 1364, numero: "   ", dataemissao: null, valornota: "10.00" },
        { idcontareceber: 1400, numero: "4600", dataemissao: " 2026-11-05 ", valornota: null },
        { idcontareceber: 1401, numero: "4601", dataemissao: null, valornota: "7.5" },
      ],
    });

    const r = await service.buscarNfeResumoPorTitulos([1363, 1364, 1400, 1401]);

    expect(r).toEqual([
      { idcontareceber: 1363, numero: "4521", dataemissao: "2026-11-03", valor: 150 },
      { idcontareceber: 1400, numero: "4600", dataemissao: "2026-11-05", valor: 0 },
      { idcontareceber: 1401, numero: "4601", dataemissao: null, valor: 7.5 },
    ]);
  });

  it("A3. lista vazia ou so ids invalidos: [] sem conectar no pool", async () => {
    const { pool } = makeClient();

    await expect(service.buscarNfeResumoPorTitulos([])).resolves.toEqual([]);
    await expect(service.buscarNfeResumoPorTitulos([0, -3, 2.5, NaN])).resolves.toEqual([]);

    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("A4. erro na query: ServiceUnavailableException e client.release chamado", async () => {
    const { client } = makeClient();
    client.query.mockRejectedValueOnce(new Error("conexao recusada"));

    await expect(service.buscarNfeResumoPorTitulos([1363])).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("A4b. sucesso tambem libera o client", async () => {
    const { client } = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] });

    await service.buscarNfeResumoPorTitulos([1363]);

    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
