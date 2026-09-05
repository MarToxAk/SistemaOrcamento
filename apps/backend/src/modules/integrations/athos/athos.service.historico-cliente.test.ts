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

describe("AthosService - buscarHistoricoClienteContasReceber", () => {
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
      providers: [AthosService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  it("mapeia linhas de pagamento para o formato do contrato, com datapagamento como Date e como string", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      // Consulta A (lista de pagos)
      .mockResolvedValueOnce({
        rows: [
          {
            idcontareceber: 1,
            numerotitulo: "T001",
            datavencimento: new Date("2026-03-10"),
            valor: "150.00",
            idvenda: 500,
            datapagamento: new Date("2026-03-12"),
            valorpago: "150.00",
            juros: "0",
            desconto: "0",
            numeroordem: "PED-1",
          },
          {
            idcontareceber: 2,
            numerotitulo: "T002",
            datavencimento: "2026-04-01",
            valor: "80.00",
            idvenda: 501,
            datapagamento: "2026-04-05",
            valorpago: "80.00",
            juros: "2.50",
            desconto: "0",
            numeroordem: null,
          },
        ],
      })
      // Consulta B (agregado)
      .mockResolvedValueOnce({ rows: [{ titulos_pagos: "2", total_pago: "230.00" }] });

    const result = await service.buscarHistoricoClienteContasReceber(2829);

    expect(result.pagos).toHaveLength(2);
    expect(result.pagos[0]).toEqual({
      idcontareceber: 1,
      numerotitulo: "T001",
      datavencimento: "2026-03-10",
      datapagamento: "2026-03-12",
      valor: 150,
      valorpago: 150,
      juros: 0,
      desconto: 0,
      idvenda: 500,
      numeroordem: "PED-1",
    });
    expect(result.pagos[1]).toEqual({
      idcontareceber: 2,
      numerotitulo: "T002",
      datavencimento: "2026-04-01",
      datapagamento: "2026-04-05",
      valor: 80,
      valorpago: 80,
      juros: 2.5,
      desconto: 0,
      idvenda: 501,
      numeroordem: null,
    });
    expect(result.truncado).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it("totalPago e titulosPagos vêm da consulta agregada, não da soma da lista (LIMIT 200 não afeta o total)", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            idcontareceber: 1,
            numerotitulo: "T001",
            datavencimento: "2026-03-10",
            valor: "10.00",
            idvenda: null,
            datapagamento: "2026-03-12",
            valorpago: "10.00",
            juros: "0",
            desconto: "0",
            numeroordem: null,
          },
        ],
      })
      // agregado reporta um total muito maior que a soma da lista (lista tem LIMIT)
      .mockResolvedValueOnce({ rows: [{ titulos_pagos: "500", total_pago: "999999.99" }] });

    const result = await service.buscarHistoricoClienteContasReceber(2829);

    expect(result.totalPago).toBe(999999.99);
    expect(result.titulosPagos).toBe(500);
  });

  it("truncado=true quando a lista de pagos atinge o LIMIT de 200", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    const rows = Array.from({ length: 200 }, (_, i) => ({
      idcontareceber: i + 1,
      numerotitulo: `T${i}`,
      datavencimento: "2026-03-10",
      valor: "10.00",
      idvenda: null,
      datapagamento: "2026-03-12",
      valorpago: "10.00",
      juros: "0",
      desconto: "0",
      numeroordem: null,
    }));

    client.query
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [{ titulos_pagos: "500", total_pago: "5000.00" }] });

    const result = await service.buscarHistoricoClienteContasReceber(2829);

    expect(result.pagos).toHaveLength(200);
    expect(result.truncado).toBe(true);
  });

  it("falha da consulta A (lista) devolve pagos:[] sem descartar totalPago da consulta B", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockRejectedValueOnce(new Error("query A falhou"))
      .mockResolvedValueOnce({ rows: [{ titulos_pagos: "3", total_pago: "300.00" }] });

    const result = await service.buscarHistoricoClienteContasReceber(2829);

    expect(result.pagos).toEqual([]);
    expect(result.truncado).toBe(false);
    expect(result.totalPago).toBe(300);
    expect(result.titulosPagos).toBe(3);
    expect(client.release).toHaveBeenCalled();
  });

  it("falha da consulta B (agregado) devolve totalPago/titulosPagos zerados sem descartar pagos da consulta A", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            idcontareceber: 1,
            numerotitulo: "T001",
            datavencimento: "2026-03-10",
            valor: "10.00",
            idvenda: null,
            datapagamento: "2026-03-12",
            valorpago: "10.00",
            juros: "0",
            desconto: "0",
            numeroordem: null,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("query B falhou"));

    const result = await service.buscarHistoricoClienteContasReceber(2829);

    expect(result.pagos).toHaveLength(1);
    expect(result.totalPago).toBe(0);
    expect(result.titulosPagos).toBe(0);
    expect(client.release).toHaveBeenCalled();
  });

  it("client.release() é chamado mesmo com as duas consultas falhando", async () => {
    const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect = jest.fn().mockResolvedValue(client);

    client.query
      .mockRejectedValueOnce(new Error("query A falhou"))
      .mockRejectedValueOnce(new Error("query B falhou"));

    const result = await service.buscarHistoricoClienteContasReceber(2829);

    expect(result.pagos).toEqual([]);
    expect(result.totalPago).toBe(0);
    expect(result.titulosPagos).toBe(0);
    expect(client.release).toHaveBeenCalled();
  });
});
