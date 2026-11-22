/**
 * Fase 51 (planos 51-01 e 51-02): tracer changeStatus -> gancho -> GET labels -> mescla -> POST labels.
 * ChatwootService REAL com axios FALSO (nenhuma chamada de rede) e Athos FALSO explicito
 * (o gancho de etiquetas nao pode consultar o Athos).
 */
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { QuotesService } from "./quotes.service";
import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { EfiService } from "../integrations/efi/efi.service";

const axiosGet = (axios as unknown as { get: jest.Mock }).get;
const axiosPost = (axios as unknown as { post: jest.Mock }).post;

const URL_LABELS = "https://chat.exemplo.test/api/v1/accounts/7/conversations/42/labels";

const makeQuote = (overrides: Record<string, unknown> = {}) => ({
  id: "quote-001",
  internalNumber: 1,
  externalQuoteId: null,
  status: "PENDENTE",
  approved: false,
  approvedAt: null,
  approvalToken: null,
  approvalExpiresAt: null,
  notes: null,
  total: BigInt(10000),
  discount: BigInt(0),
  surcharge: BigInt(0),
  sellerName: null,
  conversationId: null,
  chatwootContactId: null,
  validity: null,
  deliveryDate: null,
  paymentTerms: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  editedAt: null,
  customer: { id: "cus1", fullName: "Test Cliente", isAssociated: false, phone: null, email: null },
  items: [],
  stamps: [],
  documents: [],
  ...overrides,
});

/** Chamadas do mock cujo primeiro argumento (URL) termina em /labels. */
const chamadasDeLabels = (mock: jest.Mock) =>
  mock.mock.calls.filter((chamada) => typeof chamada[0] === "string" && (chamada[0] as string).endsWith("/labels"));

/** Deixa a sincronizacao (nao aguardada pelo changeStatus) terminar. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

describe("QuotesService - etiquetas do Chatwoot por fase (Fase 51, planos 51-01 e 51-02)", () => {
  let service: QuotesService;
  let prisma: any;
  let athos: Record<string, jest.Mock>;
  let configValues: Record<string, string | undefined>;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    axiosGet.mockReset();
    axiosPost.mockReset();
    axiosPost.mockResolvedValue({ data: { payload: [] } });
    configValues = {
      CHATWOOT_BASE_URL: "https://chat.exemplo.test",
      CHATWOOT_ACCOUNT_ID: "7",
      CHATWOOT_API_TOKEN: "token-secreto-xyz",
    };
    prisma = {
      $transaction: jest.fn(),
      quote: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      quoteItem: { create: jest.fn(), deleteMany: jest.fn() },
      quoteStatusHistory: { create: jest.fn() },
      customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      quoteStamp: { deleteMany: jest.fn() },
      quoteDocument: { findFirst: jest.fn() },
    };
    athos = {
      buscarOrcamentoPorNumero: jest.fn(),
      buscarClientePorId: jest.fn(),
      testarConexao: jest.fn(),
      verificarPagamentoPorOrcamento: jest.fn(),
      buscarRelacaoOrcamentoVenda: jest.fn(),
      buscarVendaCaixa: jest.fn(),
    };
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        ChatwootService,
        { provide: PrismaService, useValue: prisma },
        { provide: AthosService, useValue: athos },
        { provide: QuotesPdfStorageService, useValue: { generateAndUploadPdf: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn((chave: string) => configValues[chave]) } },
        { provide: EfiService, useValue: { createCharge: jest.fn(), getChargeStatus: jest.fn() } },
      ],
    }).compile();
    service = modulo.get(QuotesService);
    warn = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  /**
   * Prepara changeStatus PENDENTE -> APROVADO; conversationId opcional. O findFirst distingue a busca
   * do changeStatus (por identificador) da busca da conversa (where.conversationId definido, 51-02).
   */
  const prepararTroca = (
    conversationId: bigint | null,
    conversa: { status: string; customerId: string | null } = { status: "APROVADO", customerId: "cus1" },
  ) => {
    prisma.quote.findFirst.mockImplementation(async (args: any) =>
      args?.where?.conversationId !== undefined
        ? conversa
        : makeQuote({ status: "PENDENTE", conversationId }),
    );
    prisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO", conversationId }));
    prisma.quote.findUnique.mockResolvedValue({ status: "APROVADO", conversationId });
    prisma.quote.count.mockResolvedValue(0);
  };

  const semChamadasAoAthos = () => {
    for (const fn of Object.values(athos)) expect(fn).not.toHaveBeenCalled();
  };

  it("E1 (tracer): PENDENTE -> APROVADO troca a etiqueta da fase, preserva a manual e nao consulta o Athos", async () => {
    prepararTroca(BigInt(42));
    axiosGet.mockResolvedValue({ data: { payload: ["cliente-vip-manual", "orcamento-pendente"] } });

    const resultado = await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(resultado).toMatchObject({ statusKey: "APROVADO" });
    expect(axiosGet).toHaveBeenCalledWith(
      URL_LABELS,
      expect.objectContaining({ headers: { api_access_token: "token-secreto-xyz" } }),
    );
    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(axiosPost).toHaveBeenCalledWith(
      URL_LABELS,
      { labels: ["cliente-vip-manual", "aprovado"] },
      expect.objectContaining({ headers: { api_access_token: "token-secreto-xyz" } }),
    );
    semChamadasAoAthos();
  });

  it("E2: falha do GET no Chatwoot nao impede a troca de status e vira warn com o id da cotacao", async () => {
    prepararTroca(BigInt(42));
    axiosGet.mockRejectedValue(new Error("timeout"));

    const resultado = await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(resultado).toMatchObject({ statusKey: "APROVADO" });
    expect(chamadasDeLabels(axiosPost)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("quote-001"));
  });

  it("E3: orcamento sem conversationId nao faz nenhuma chamada HTTP nem consulta a cotacao", async () => {
    prepararTroca(null);

    const resultado = await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(resultado).toMatchObject({ statusKey: "APROVADO" });
    expect(chamadasDeLabels(axiosGet)).toHaveLength(0);
    expect(chamadasDeLabels(axiosPost)).toHaveLength(0);
    expect(prisma.quote.findUnique).not.toHaveBeenCalled();
  });

  it("E4: lista ja correta no Chatwoot nao dispara POST", async () => {
    prepararTroca(BigInt(42));
    axiosGet.mockResolvedValue({ data: { payload: ["aprovado"] } });

    await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(chamadasDeLabels(axiosGet)).toHaveLength(1);
    expect(chamadasDeLabels(axiosPost)).toHaveLength(0);
  });

  it("E5: Chatwoot recusa o POST -> changeStatus resolve e o erro vira warn", async () => {
    prepararTroca(BigInt(42));
    axiosGet.mockResolvedValue({ data: { payload: ["orcamento-pendente"] } });
    axiosPost.mockRejectedValue(new Error("Request failed with status code 422"));

    const resultado = await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(resultado).toMatchObject({ statusKey: "APROVADO" });
    expect(chamadasDeLabels(axiosPost)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("422"));
  });
  it("E6: CHATWOOT_ETIQUETAS_ATIVAS=false desliga a sincronizacao (sem GET nem POST)", async () => {
    configValues.CHATWOOT_ETIQUETAS_ATIVAS = " False ";
    prepararTroca(BigInt(42));
    axiosGet.mockResolvedValue({ data: { payload: ["orcamento-pendente"] } });

    const resultado = await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(resultado).toMatchObject({ statusKey: "APROVADO" });
    expect(chamadasDeLabels(axiosGet)).toHaveLength(0);
    expect(chamadasDeLabels(axiosPost)).toHaveLength(0);
    expect(prisma.quote.findUnique).not.toHaveBeenCalled();
  });

  it("E7: o log de falha nunca contem o token, mesmo quando o erro do axios carrega config.headers", async () => {
    prepararTroca(BigInt(42));
    const erro: any = new Error("Request failed with status code 500");
    erro.config = { headers: { api_access_token: "token-secreto-xyz" }, url: URL_LABELS };
    axiosGet.mockRejectedValue(erro);

    await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(warn).toHaveBeenCalled();
    for (const chamada of warn.mock.calls) {
      expect(JSON.stringify(chamada)).not.toContain("token-secreto-xyz");
    }
  });

  it("F1 (tracer): APROVADO de cliente com 3 pedidos recebe aprovado + cliente-frequente e nao consulta o Athos", async () => {
    prepararTroca(BigInt(42), { status: "APROVADO", customerId: "cus1" });
    prisma.quote.count.mockResolvedValue(3);
    axiosGet.mockResolvedValue({ data: { payload: ["orcamento-pendente"] } });

    await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(prisma.quote.count).toHaveBeenCalledTimes(1);
    expect(chamadasDeLabels(axiosPost)).toHaveLength(1);
    expect(axiosPost).toHaveBeenCalledWith(
      URL_LABELS,
      { labels: ["aprovado", "cliente-frequente"] },
      expect.anything(),
    );
    semChamadasAoAthos();
  });

  it("F2: com 2 pedidos a cliente-frequente que ja estava na conversa sai", async () => {
    prepararTroca(BigInt(42));
    prisma.quote.count.mockResolvedValue(2);
    axiosGet.mockResolvedValue({ data: { payload: ["manual-x", "aprovado", "cliente-frequente"] } });

    await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(chamadasDeLabels(axiosPost)).toHaveLength(1);
    expect(axiosPost).toHaveBeenCalledWith(URL_LABELS, { labels: ["manual-x", "aprovado"] }, expect.anything());
  });

  it("F3: a fase vem da cotacao mais recente da conversa (updatedAt desc), nao da cotacao passada ao gancho", async () => {
    prepararTroca(BigInt(42), { status: "EM_PRODUCAO", customerId: "cus9" });
    axiosGet.mockResolvedValue({ data: { payload: ["aprovado"] } });

    await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    const buscasDaConversa = prisma.quote.findFirst.mock.calls.filter(
      (chamada: any[]) => chamada[0]?.where?.conversationId !== undefined,
    );
    expect(buscasDaConversa).toHaveLength(1);
    expect(buscasDaConversa[0][0]).toEqual({
      where: { conversationId: BigInt(42) },
      orderBy: { updatedAt: "desc" },
      select: { status: true, customerId: true },
    });
    expect(prisma.quote.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cus9" }) }),
    );
    expect(axiosPost).toHaveBeenCalledWith(URL_LABELS, { labels: ["em-producao"] }, expect.anything());
  });

  it("F4: CHATWOOT_CLIENTE_FREQUENTE_MIN=2 faz 2 pedidos bastarem", async () => {
    configValues.CHATWOOT_CLIENTE_FREQUENTE_MIN = "2";
    prepararTroca(BigInt(42));
    prisma.quote.count.mockResolvedValue(2);
    axiosGet.mockResolvedValue({ data: { payload: ["orcamento-pendente"] } });

    await service.changeStatus("quote-001", "APROVADO", "Painel");
    await flush();

    expect(axiosPost).toHaveBeenCalledWith(
      URL_LABELS,
      { labels: ["aprovado", "cliente-frequente"] },
      expect.anything(),
    );
  });

  it("F5: duas sincronizacoes da MESMA conversa sao serializadas (2o GET so depois do 1o POST)", async () => {
    prepararTroca(BigInt(42));
    const eventos: string[] = [];
    let liberarPrimeiroGet!: () => void;
    const primeiroGetPreso = new Promise<void>((resolver) => {
      liberarPrimeiroGet = resolver;
    });
    let gets = 0;
    axiosGet.mockImplementation(async () => {
      gets++;
      eventos.push(`get-${gets}`);
      if (gets === 1) await primeiroGetPreso;
      return { data: { payload: ["orcamento-pendente"] } };
    });
    axiosPost.mockImplementation(async () => {
      eventos.push("post");
      return { data: { payload: [] } };
    });

    const s1 = service.sincronizarEtiquetasChatwoot("quote-001");
    const s2 = service.sincronizarEtiquetasChatwoot("quote-001");
    await flush();
    expect(eventos).toEqual(["get-1"]);

    liberarPrimeiroGet();
    await Promise.all([s1, s2]);

    expect(eventos.slice(0, 3)).toEqual(["get-1", "post", "get-2"]);
  });

  it("F6: CANCELADO de cliente frequente recebe cancelado + cliente-frequente", async () => {
    prepararTroca(BigInt(42), { status: "CANCELADO", customerId: "cus1" });
    prisma.quote.count.mockResolvedValue(5);
    axiosGet.mockResolvedValue({ data: { payload: ["aprovado"] } });

    await service.changeStatus("quote-001", "CANCELADO", "Painel");
    await flush();

    expect(axiosPost).toHaveBeenCalledWith(
      URL_LABELS,
      { labels: ["cancelado", "cliente-frequente"] },
      expect.anything(),
    );
  });
});
