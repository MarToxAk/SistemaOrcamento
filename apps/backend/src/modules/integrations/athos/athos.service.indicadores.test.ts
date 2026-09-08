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
// seguindo o mesmo idioma ja usado em athos.service.dashboard.test.ts.
function setupClient() {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);
  return { pool, client };
}

const TOP_PRODUTO_ROW = {
  idproduto: 10,
  descricao: "Papel A4 Resma",
  quantidade: 500,
  valor_total: 12500.5,
  compras: 120,
};

const TOP_SERVICO_ROW = {
  idproduto: 20,
  descricao: "Plastificacao",
  quantidade: 300,
  valor_total: 4500.75,
  compras: 90,
};

describe("AthosService - buscarIndicadoresContasReceber (QT-GXV-01/QT-GXV-02)", () => {
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

  it("retorna topProduto e topServico normalizados a partir das consultas A e B", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto).toEqual({
      idproduto: 10,
      descricao: "Papel A4 Resma",
      quantidade: 500,
      valorTotal: 12500.5,
      compras: 120,
    });
    expect(result.topServico).toEqual({
      idproduto: 20,
      descricao: "Plastificacao",
      quantidade: 300,
      valorTotal: 4500.75,
      compras: 90,
    });
  });

  it("retorna topProduto null quando a consulta nao encontra nenhuma linha (sem produto fisico vendido)", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto).toBeNull();
    expect(result.topServico).not.toBeNull();
  });

  it("retorna topServico null quando a consulta nao encontra nenhuma linha (sem servico vendido)", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto).not.toBeNull();
    expect(result.topServico).toBeNull();
  });

  it("aplica fallback 'Produto #N' quando descricao vem vazia", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ ...TOP_PRODUTO_ROW, descricao: "   " }] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto?.descricao).toBe("Produto #10");
  });

  it("degrada topProduto para null quando a consulta falha, sem afetar topServico", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockRejectedValueOnce(new Error("falha simulada na consulta de topProduto"))
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto).toBeNull();
    expect(result.topServico).not.toBeNull();
  });

  it("degrada topServico para null quando a consulta falha, sem afetar topProduto", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockRejectedValueOnce(new Error("falha simulada na consulta de topServico"));

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto).not.toBeNull();
    expect(result.topServico).toBeNull();
  });

  const CLIENTE_INATIVO_ROW_DATE = {
    idcliente: 100,
    nome_cliente: "Cliente Sumido",
    telefone_completo: "11988887777",
    emailcliente: "sumido@teste.com",
    ultimo_pedido: new Date("2025-01-01T00:00:00.000Z"),
    total_pedidos: 5,
  };

  const CLIENTE_INATIVO_ROW_STRING = {
    idcliente: 101,
    nome_cliente: "Cliente Sumido String",
    telefone_completo: null,
    emailcliente: null,
    ultimo_pedido: "2025-02-01",
    total_pedidos: 2,
  };

  it("calcula ultimoPedido e diasInativo a partir de uma linha com Date", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockResolvedValueOnce({ rows: [CLIENTE_INATIVO_ROW_DATE] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.clientesInativos).toHaveLength(1);
    expect(result.clientesInativos[0]?.ultimoPedido).toBe("2025-01-01");
    expect(result.clientesInativos[0]?.diasInativo).toBeGreaterThan(0);
    expect(Number.isInteger(result.clientesInativos[0]?.diasInativo)).toBe(true);
  });

  it("calcula ultimoPedido e diasInativo a partir de uma linha com data string", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockResolvedValueOnce({ rows: [CLIENTE_INATIVO_ROW_STRING] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.clientesInativos).toHaveLength(1);
    expect(result.clientesInativos[0]?.ultimoPedido).toBe("2025-02-01");
    expect(result.clientesInativos[0]?.diasInativo).toBeGreaterThan(0);
    expect(result.clientesInativos[0]?.telefone_completo).toBeNull();
    expect(result.clientesInativos[0]?.emailcliente).toBeNull();
  });

  it("totalClientesInativos vem da consulta agregada, nao do tamanho da lista", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockResolvedValueOnce({ rows: [CLIENTE_INATIVO_ROW_DATE] })
      .mockResolvedValueOnce({ rows: [{ total: 250 }] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.clientesInativos).toHaveLength(1);
    expect(result.totalClientesInativos).toBe(250);
  });

  it("truncado vira true quando a lista atinge 100 linhas", async () => {
    const { client } = setupClient();
    const cem = Array.from({ length: 100 }, (_, i) => ({
      ...CLIENTE_INATIVO_ROW_DATE,
      idcliente: i + 1,
    }));
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockResolvedValueOnce({ rows: cem })
      .mockResolvedValueOnce({ rows: [{ total: 100 }] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.truncado).toBe(true);
  });

  it("falha na consulta de lista devolve clientesInativos: [] sem descartar topProduto/topServico ja calculados", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockRejectedValueOnce(new Error("falha simulada na lista de clientes inativos"))
      .mockResolvedValueOnce({ rows: [{ total: 5 }] });

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.clientesInativos).toEqual([]);
    expect(result.truncado).toBe(false);
    expect(result.topProduto).not.toBeNull();
    expect(result.topServico).not.toBeNull();
    // consulta de total independente continua rodando e nao e descartada
    expect(result.totalClientesInativos).toBe(5);
  });

  it("falha na consulta de total devolve totalClientesInativos: 0 preservando a lista", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockResolvedValueOnce({ rows: [CLIENTE_INATIVO_ROW_DATE] })
      .mockRejectedValueOnce(new Error("falha simulada no total de clientes inativos"));

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.totalClientesInativos).toBe(0);
    expect(result.clientesInativos).toHaveLength(1);
  });

  it("client.release() e chamado mesmo com alguma das quatro consultas falhando", async () => {
    const { client } = setupClient();
    (client.query as jest.Mock)
      .mockRejectedValueOnce(new Error("falha topProduto"))
      .mockRejectedValueOnce(new Error("falha topServico"))
      .mockRejectedValueOnce(new Error("falha clientesInativos"))
      .mockRejectedValueOnce(new Error("falha totalClientesInativos"));

    const result = await service.buscarIndicadoresContasReceber();

    expect(result.topProduto).toBeNull();
    expect(result.topServico).toBeNull();
    expect(result.clientesInativos).toEqual([]);
    expect(result.totalClientesInativos).toBe(0);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("usa uma unica conexao para as quatro consultas e libera o client ao final", async () => {
    const { pool, client } = setupClient();
    (client.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [TOP_PRODUTO_ROW] })
      .mockResolvedValueOnce({ rows: [TOP_SERVICO_ROW] })
      .mockResolvedValueOnce({ rows: [CLIENTE_INATIVO_ROW_DATE] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    await service.buscarIndicadoresContasReceber();

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
