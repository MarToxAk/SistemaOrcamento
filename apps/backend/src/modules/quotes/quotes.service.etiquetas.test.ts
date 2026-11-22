/**
 * Fase 51 (plano 51-01): tracer changeStatus -> gancho -> GET labels -> mescla -> POST labels.
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

describe("QuotesService - etiquetas do Chatwoot por fase (Fase 51, plano 51-01)", () => {
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

  /** Prepara changeStatus PENDENTE -> APROVADO; conversationId opcional. */
  const prepararTroca = (conversationId: bigint | null) => {
    prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "PENDENTE", conversationId }));
    prisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO", conversationId }));
    prisma.quote.findUnique.mockResolvedValue({ status: "APROVADO", conversationId });
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
});
