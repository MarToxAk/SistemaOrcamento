import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesService } from "./quotes.service";

// Fase 46 (plano 46-01): tracer e testes de integracao do total liquido.
// Caminho completo, SEM tocar no Athos real: pg falso (leitura do Athos) -> payload no
// formato da pagina /orcamento/novo -> QuotesService.create com Prisma em memoria.
//
// pg falso roteado pelo texto do SQL. Todos os numericos entram como STRING com tres casas,
// exatamente como o driver pg devolve colunas numeric.

type AthosFake = {
  cabecalho: Record<string, unknown>;
  itens: Array<Record<string, unknown>>;
  produtos: Array<Record<string, unknown>>;
};

const mockAthosFake: AthosFake = { cabecalho: {}, itens: [], produtos: [] };

const COLUNAS_POR_TABELA: Record<string, string[]> = {
  orcamento: ["idorcamento", "idcliente", "valor", "desconto", "descontors", "valoracrescimo", "dataorcamento"],
  orcamento_item: [
    "iditemorcamento",
    "idorcamento",
    "idproduto",
    "sequenciaitem",
    "quantidadeitem",
    "valoritem",
    "valordesconto",
    "orcamentodesconto",
    "orcamentovalorfinalitem",
  ],
  produto: ["idproduto", "descricaoproduto"],
};

jest.mock("pg", () => {
  const route = (sql: string, params?: unknown[]) => {
    if (sql.includes("information_schema.columns")) {
      const tabela = String(params?.[0] ?? (sql.includes("'orcamento'") ? "orcamento" : ""));
      const colunas = mockColunasPorTabela()[tabela] ?? [];
      return { rows: colunas.map((column_name) => ({ column_name })) };
    }
    if (sql.includes('FROM "orcamento_item"')) return { rows: mockFakeAtual().itens };
    if (sql.includes('FROM "orcamento"')) return { rows: [mockFakeAtual().cabecalho] };
    if (sql.includes('FROM "produto"')) return { rows: mockFakeAtual().produtos };
    return { rows: [] };
  };
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => route(sql, params)),
    release: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  };
  const pool = { connect: jest.fn().mockResolvedValue(client), on: jest.fn() };
  return { Pool: jest.fn(() => pool), Client: jest.fn(() => client) };
});

// Indirecao: o factory do jest.mock e hoisted acima das constantes; as referencias abaixo
// so sao resolvidas quando o pg falso recebe uma query (depois da inicializacao do modulo).
function mockColunasPorTabela() {
  return COLUNAS_POR_TABELA;
}
function mockFakeAtual() {
  return mockAthosFake;
}

function num3(valor: number) {
  return valor.toFixed(3);
}

type CabecalhoFake = { numero: number; valor: number; descontors?: number; desconto?: number; valoracrescimo?: number };
type ItemFake = {
  id: number;
  descricao: string;
  quantidade: number;
  valoritem: number;
  valordesconto?: number;
  orcamentodesconto?: number;
  final: number;
};

function prepararAthos(cabecalho: CabecalhoFake, itens: ItemFake[]) {
  mockAthosFake.cabecalho = {
    idorcamento: cabecalho.numero,
    valor: num3(cabecalho.valor),
    descontors: num3(cabecalho.descontors ?? 0),
    desconto: num3(cabecalho.desconto ?? 0),
    valoracrescimo: num3(cabecalho.valoracrescimo ?? 0),
    idcliente: null,
  };
  mockAthosFake.itens = itens.map((item, idx) => ({
    iditemorcamento: item.id,
    idorcamento: cabecalho.numero,
    idproduto: 1000 + idx,
    sequenciaitem: idx + 1,
    quantidadeitem: num3(item.quantidade),
    valoritem: num3(item.valoritem),
    valordesconto: num3(item.valordesconto ?? 0),
    orcamentodesconto: num3(item.orcamentodesconto ?? 0),
    orcamentovalorfinalitem: num3(item.final),
  }));
  mockAthosFake.produtos = itens.map((item, idx) => ({ idproduto: 1000 + idx, descricaoproduto: item.descricao }));
}

type Mapped = Awaited<ReturnType<AthosService["buscarOrcamentoPorNumero"]>>["mapped"];

// Espelha, campo a campo, o gerarOrcamento de apps/frontend/src/app/orcamento/novo/page.tsx
// (fonte do contrato do payload do Quote): valoritem = item.valor, valordesconto = item.desconto,
// orcamentovalorfinalitem = item.total; totais.valor = soma dos totais (liquido, sem acrescimo)
// e totais.desconto = soma dos descontos. Se a pagina mudar, este helper deve mudar junto.
function payloadComoPaginaNovo(mapped: Mapped, extras: { valoracrescimo?: number } = {}) {
  const itens = (mapped.itensDetalhados as Array<Record<string, any>>).map((item) => ({
    descricao: String(item?.produto?.descricaocurta || item?.produto?.descricaoproduto || item?.descricao || ""),
    quantidade: Number(item?.quantidade ?? 0),
    valor: Number(item?.valor ?? 0),
    desconto: Number(item?.desconto ?? 0),
    total: Number(item?.total ?? 0),
  }));

  const acrescimo = Number((extras.valoracrescimo ?? 0).toFixed(2));

  return {
    idorcamento: Number(mapped.numero),
    vendedorNome: "Vendedor Teste",
    conversationId: 10,
    chatwootContactId: 20,
    cliente: { nome: "Cliente Teste", telefone: "5512999990000" },
    itens: itens.map((item, idx) => {
      const totalCalculado = Number.isFinite(Number(item.total))
        ? Number(item.total)
        : Number((item.quantidade * item.valor - item.desconto).toFixed(2));
      return {
        sequenciaitem: idx + 1,
        produto: { descricaoproduto: item.descricao, descricaocurta: item.descricao },
        quantidadeitem: item.quantidade,
        valoritem: item.valor,
        valordesconto: item.desconto,
        orcamentovalorfinalitem: totalCalculado,
      };
    }),
    totais: {
      desconto: Number(itens.reduce((acc, item) => acc + item.desconto, 0).toFixed(2)),
      valor: Number(itens.reduce((acc, item) => acc + item.total, 0).toFixed(2)),
      ...(acrescimo > 0 ? { valoracrescimo: acrescimo } : {}),
    },
    source: "MANUAL" as const,
  };
}

function criarPrismaEmMemoria() {
  const itensCriados: Array<Record<string, any>> = [];
  const quoteCriados: Array<Record<string, any>> = [];

  const tx: any = {
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: "cus-1", ...data })),
      update: jest.fn(),
    },
    quote: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        quoteCriados.push(data);
        return { id: "q-1" };
      }),
      update: jest.fn(),
      findUnique: jest.fn().mockImplementation(async () => {
        const data = quoteCriados[0] ?? {};
        return {
          id: "q-1",
          internalNumber: 1,
          externalQuoteId: data.externalQuoteId ?? null,
          budgetDate: null,
          sellerExternalId: null,
          saleExternalId: null,
          sellerName: data.sellerName ?? null,
          conversationId: data.conversationId ?? null,
          chatwootContactId: data.chatwootContactId ?? null,
          status: data.status ?? "PENDENTE",
          notes: null,
          validity: null,
          deliveryDate: null,
          paymentTerms: null,
          createdAt: new Date("2026-11-12T00:00:00Z"),
          updatedAt: new Date("2026-11-12T00:00:00Z"),
          editedAt: null,
          discount: data.discount,
          surcharge: data.surcharge,
          total: data.total,
          customer: { id: "cus-1", fullName: "Cliente Teste", phone: "5512999990000", email: null, isAssociated: false },
          items: itensCriados
            .filter((i) => !i.parentItemId)
            .map((i) => ({ ...i, children: [] })),
          stamps: [],
          documents: [],
        };
      }),
    },
    quoteItem: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        itensCriados.push(data);
        return { id: `qi-${itensCriados.length}` };
      }),
      createMany: jest.fn().mockImplementation(async ({ data }: any) => {
        itensCriados.push(...data);
        return { count: data.length };
      }),
      deleteMany: jest.fn(),
    },
    quoteStampItem: { createMany: jest.fn(), deleteMany: jest.fn() },
    quoteStatusHistory: { create: jest.fn() },
  };

  const prisma: any = {
    $transaction: jest.fn(async (cb: (client: any) => unknown) => cb(tx)),
    quoteDocument: { create: jest.fn() },
    orcamentoItemCorrecao: { findMany: jest.fn().mockResolvedValue([]) },
    quote: tx.quote,
  };

  return { prisma, tx, itensCriados, quoteCriados };
}

function criarServicos() {
  const infra = criarPrismaEmMemoria();
  const athos = new AthosService(infra.prisma);
  const pdf = { generateAndStore: jest.fn().mockRejectedValue(new Error("pdf desligado no teste")) };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const chatwoot = { sendOutgoingMessage: jest.fn(), sendAttachment: jest.fn() };
  const efi = { createCharge: jest.fn(), createPixPaymentLink: jest.fn() };
  const quotes = new QuotesService(infra.prisma, athos, pdf as any, config as any, chatwoot as any, efi as any);
  return { ...infra, athos, quotes };
}

const dec = (valor: unknown) => Number((valor as Prisma.Decimal).toString());

describe("QuotesService.create - total liquido (fase 46)", () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "athos-falso.invalid";
    process.env.ATHOS_PG_DB = "athos_falso";
    process.env.ATHOS_PG_USER = "usuario_falso";
    process.env.ATHOS_PG_PASS = "senha_falsa";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("T1 tracer 25877: Athos (qtd 200, 0,65, valordesconto 60,00, final 130,00) -> payload da pagina -> Quote com unitPrice 0,95, desconto 60,00 e total 130,00", async () => {
    prepararAthos(
      { numero: 25877, valor: 130 },
      [{ id: 501, descricao: "Caneta teste", quantidade: 200, valoritem: 0.65, valordesconto: 60, final: 130 }],
    );
    const { athos, quotes, itensCriados, quoteCriados } = criarServicos();

    const { mapped } = await athos.buscarOrcamentoPorNumero("25877");
    const item = (mapped.itensDetalhados as any[])[0];
    expect(item.valor).toBe(0.95);
    expect(item.desconto).toBe(60);
    expect(item.total).toBe(130);

    await quotes.create(payloadComoPaginaNovo(mapped) as any);

    expect(itensCriados).toHaveLength(1);
    expect(dec(itensCriados[0].unitPrice)).toBe(0.95);
    expect(dec(itensCriados[0].discount)).toBe(60);
    expect(dec(itensCriados[0].finalPrice)).toBe(130);
    expect(dec(quoteCriados[0].total)).toBe(130);
    expect(dec(quoteCriados[0].discount)).toBe(60);

    const avisosDivergentes = warnSpy.mock.calls.filter((call) => String(call[0]).includes("divergente"));
    expect(avisosDivergentes).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Payload escrito a mao no formato da pagina para o 25952 (qtd 110, valoritem 5,30, desconto 58,30).
  const itens25952 = [
    {
      sequenciaitem: 1,
      produto: { descricaoproduto: "Produto 25952", descricaocurta: "Produto 25952" },
      quantidadeitem: 110,
      valoritem: 5.3,
      valordesconto: 58.3,
      orcamentovalorfinalitem: 524.7,
    },
  ];
  const basePayload = {
    idorcamento: 25952,
    vendedorNome: "Vendedor Teste",
    conversationId: 10,
    chatwootContactId: 20,
    cliente: { nome: "Cliente Teste", telefone: "5512999990000" },
    source: "MANUAL" as const,
  };

  it("C1 25952 com o payload da pagina (valor ja liquido): total 524,70 e nunca 583,00", async () => {
    const { quotes, quoteCriados } = criarServicos();
    await quotes.create({ ...basePayload, itens: itens25952, totais: { valor: 524.7, desconto: 58.3 } } as any);
    expect(dec(quoteCriados[0].total)).toBe(524.7);
    expect(dec(quoteCriados[0].total)).not.toBe(583);
    expect(dec(quoteCriados[0].discount)).toBe(58.3);
  });

  it("C2 25952 com o cabecalho BRUTO do Athos (valor 583,00 + descontors 58,30): total 524,70 e desconto 58,30", async () => {
    const { quotes, quoteCriados } = criarServicos();
    await quotes.create({ ...basePayload, itens: itens25952, totais: { valor: 583, descontors: 58.3 } } as any);
    expect(dec(quoteCriados[0].total)).toBe(524.7);
    expect(dec(quoteCriados[0].discount)).toBe(58.3);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("C3 25877 com acrescimo de 7,50 no cabecalho: total 137,50 e surcharge 7,50", async () => {
    prepararAthos(
      { numero: 25877, valor: 130, valoracrescimo: 7.5 },
      [{ id: 501, descricao: "Caneta teste", quantidade: 200, valoritem: 0.65, valordesconto: 60, final: 130 }],
    );
    const { athos, quotes, quoteCriados } = criarServicos();
    const { mapped } = await athos.buscarOrcamentoPorNumero("25877");
    expect(mapped.totais.valoracrescimo).toBe(7.5);

    await quotes.create(payloadComoPaginaNovo(mapped, { valoracrescimo: mapped.totais.valoracrescimo }) as any);
    expect(dec(quoteCriados[0].total)).toBe(137.5);
    expect(dec(quoteCriados[0].surcharge)).toBe(7.5);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("C4 aumento de preco 1,00 -> 1,50 com qtd 4: item finalPrice 6,00, desconto 0 e total 6,00", async () => {
    prepararAthos(
      { numero: 25901, valor: 6 },
      [{ id: 502, descricao: "Item reajustado", quantidade: 4, valoritem: 1.5, final: 6 }],
    );
    const { athos, quotes, itensCriados, quoteCriados } = criarServicos();
    const { mapped } = await athos.buscarOrcamentoPorNumero("25901");
    await quotes.create(payloadComoPaginaNovo(mapped) as any);
    expect(dec(itensCriados[0].finalPrice)).toBe(6);
    expect(dec(itensCriados[0].discount)).toBe(0);
    expect(dec(quoteCriados[0].total)).toBe(6);
  });

  it("C5 divergencia cabecalho x itens (valor 500 contra itens 524,70): logger.error 'Divergencia de total' e total persistido 500", async () => {
    const { quotes, quoteCriados } = criarServicos();
    await quotes.create({ ...basePayload, itens: itens25952, totais: { valor: 500, desconto: 58.3 } } as any);
    expect(dec(quoteCriados[0].total)).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Divergencia de total"));
  });

  it("C6 D-04 desconto maior que a linha (qtd 1, 10,00, desconto 15,00): finalPrice 0 e aviso preservado", async () => {
    const { quotes, itensCriados } = criarServicos();
    await quotes.create({
      ...basePayload,
      idorcamento: 26001,
      itens: [
        {
          sequenciaitem: 1,
          produto: { descricaoproduto: "Item inconsistente" },
          quantidadeitem: 1,
          valoritem: 10,
          valordesconto: 15,
        },
      ],
    } as any);
    expect(dec(itensCriados[0].finalPrice)).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("desconto maior que o valor do item"));
  });
});
