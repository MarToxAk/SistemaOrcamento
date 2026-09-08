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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");

// Cada teste cria seu proprio client mock e sobrescreve pool.connect com ele,
// seguindo o mesmo idioma ja usado em athos.service.test.ts.
function setupClient() {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);
  return { pool, client };
}

const CLIENTE_ROW = {
  idcliente: 1,
  nome_cliente: "Cliente Teste",
  telefone_completo: "11999999999",
  emailcliente: "cliente@teste.com",
  emailcobrancacliente: null,
  limitecredito: 1000,
  bloqueaprazo: "N",
  total_devido: 500,
  total_atrasado: 200,
  titulos_pendentes: 2,
  maior_atraso_dias: 15,
};

function agregadosRow(overrides: Record<string, unknown> = {}) {
  return {
    aging_1_30: 0,
    aging_31_60: 0,
    aging_61_90: 0,
    aging_90_mais: 0,
    a_vencer_7d: 0,
    a_vencer_15d: 0,
    a_vencer_30d: 0,
    clientes_inadimplentes: 0,
    clientes_com_titulo_aberto: 0,
    ...overrides,
  };
}

describe("AthosService - buscarDashboardContasReceber (agregados fiscais D-02, D-07, D-09)", () => {
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

  it("mantem os tres campos legados do summary", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({ rows: [agregadosRow()] })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 0 }] });

    const result = await service.buscarDashboardContasReceber();

    expect(result.summary.total_a_receber).toBe(500);
    expect(result.summary.total_atrasado).toBe(200);
    expect(result.summary.total_clientes_devedores).toBe(1);
  });

  it("preenche as quatro faixas de aging a partir da segunda consulta", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({
        rows: [
          agregadosRow({
            aging_1_30: 100,
            aging_31_60: 200,
            aging_61_90: 300,
            aging_90_mais: 400,
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 0 }] });

    const result = await service.buscarDashboardContasReceber();

    expect(result.summary.aging).toEqual({
      d1_30: 100,
      d31_60: 200,
      d61_90: 300,
      d90_mais: 400,
    });
  });

  it("preenche os tres totais a vencer a partir da segunda consulta", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({
        rows: [agregadosRow({ a_vencer_7d: 10, a_vencer_15d: 25, a_vencer_30d: 40 })],
      })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 0 }] });

    const result = await service.buscarDashboardContasReceber();

    expect(result.summary.a_vencer).toEqual({ d7: 10, d15: 25, d30: 40 });
  });

  it("preenche total_recebido_mes a partir da terceira consulta", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({ rows: [agregadosRow()] })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 12345.67 }] });

    const result = await service.buscarDashboardContasReceber();

    expect(result.summary.total_recebido_mes).toBe(12345.67);
  });

  it("calcula taxa_inadimplencia com duas casas decimais", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({
        rows: [
          agregadosRow({ clientes_inadimplentes: 3, clientes_com_titulo_aberto: 8 }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 0 }] });

    const result = await service.buscarDashboardContasReceber();

    expect(result.summary.taxa_inadimplencia).toBe(37.5);
  });

  it("retorna taxa_inadimplencia 0 quando nao ha cliente com titulo aberto", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          agregadosRow({ clientes_inadimplentes: 0, clientes_com_titulo_aberto: 0 }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 0 }] });

    const result = await service.buscarDashboardContasReceber();

    expect(result.summary.taxa_inadimplencia).toBe(0);
    expect(Number.isNaN(result.summary.taxa_inadimplencia)).toBe(false);
    expect(Number.isFinite(result.summary.taxa_inadimplencia)).toBe(true);
  });

  it("usa uma unica conexao para as tres consultas", async () => {
    const { pool, client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({ rows: [agregadosRow()] })
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 0 }] });

    await service.buscarDashboardContasReceber();

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("degrada aging/a_vencer/taxa para zeros quando a consulta de agregados falha, sem afetar recebido_mes", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockRejectedValueOnce(new Error("falha simulada na consulta de agregados"))
      .mockResolvedValueOnce({ rows: [{ total_recebido_mes: 999 }] });

    const result = await service.buscarDashboardContasReceber();

    // clientes e summary legado permanecem normais
    expect(result.clientes).toHaveLength(1);
    expect(result.summary.total_a_receber).toBe(500);
    expect(result.summary.total_atrasado).toBe(200);
    expect(result.summary.total_clientes_devedores).toBe(1);

    // campos da consulta que falhou vem zerados
    expect(result.summary.taxa_inadimplencia).toBe(0);
    expect(result.summary.aging).toEqual({ d1_30: 0, d31_60: 0, d61_90: 0, d90_mais: 0 });
    expect(result.summary.a_vencer).toEqual({ d7: 0, d15: 0, d30: 0 });

    // a terceira consulta (recebido no mes) roda de forma independente e seu
    // resultado NAO e descartado pela falha da segunda consulta (CR-01)
    expect(result.summary.total_recebido_mes).toBe(999);
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it("preserva aging/a_vencer/taxa validos quando apenas a consulta de recebido_mes falha (CR-01)", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [CLIENTE_ROW] })
      .mockResolvedValueOnce({
        rows: [
          agregadosRow({
            aging_1_30: 100,
            aging_31_60: 200,
            aging_61_90: 300,
            aging_90_mais: 400,
            a_vencer_7d: 10,
            a_vencer_15d: 25,
            a_vencer_30d: 40,
            clientes_inadimplentes: 3,
            clientes_com_titulo_aberto: 8,
          }),
        ],
      })
      .mockRejectedValueOnce(new Error("falha simulada na consulta de recebido no mes"));

    const result = await service.buscarDashboardContasReceber();

    // os agregados fiscais calculados com sucesso NAO sao descartados pela
    // falha da consulta independente de recebido_mes
    expect(result.summary.aging).toEqual({ d1_30: 100, d31_60: 200, d61_90: 300, d90_mais: 400 });
    expect(result.summary.a_vencer).toEqual({ d7: 10, d15: 25, d30: 40 });
    expect(result.summary.taxa_inadimplencia).toBe(37.5);

    // apenas o campo cuja consulta falhou degrada para zero
    expect(result.summary.total_recebido_mes).toBe(0);
    expect(client.query).toHaveBeenCalledTimes(3);
  });
});
