// Mock axios ANTES de qualquer import — processCardWebhook cria seu proprio axios.create()
// internamente (Basic Auth, sem mTLS), mesmo padrao ja usado em quotes-pdf-storage.service.test.ts
jest.mock("axios", () => ({ __esModule: true, default: { create: jest.fn() } }));

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { EfiService } from "./efi.service";
import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

const mockAxiosCreate = (axios as unknown as { create: jest.Mock }).create;

describe("EfiService - processCardWebhook", () => {
  let service: EfiService;

  const mockPrisma = {
    $transaction: jest.fn(),
    quote: { findFirst: jest.fn(), update: jest.fn() },
    paymentTransaction: { findFirst: jest.fn(), create: jest.fn() },
  };

  const mockQuotesService = {
    changeStatus: jest.fn(),
    getById: jest.fn(),
    sincronizarEtiquetasChatwoot: jest.fn(),
  };

  const mockChatwootService = {
    sendOutgoingMessage: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string) => {
      const values: Record<string, string> = {
        EFI_CLIENT_ID: "client-id",
        EFI_CLIENT_SECRET: "client-secret",
        EFI_COBRANCA_BASE_URL: "https://cobrancas-h.api.efipay.com.br",
      };
      return values[key];
    }),
  };

  function buildCobrancaClient(overrides: { post?: jest.Mock; get?: jest.Mock } = {}) {
    return {
      post: overrides.post ?? jest.fn().mockResolvedValue({ data: { access_token: "efi-token" } }),
      get: overrides.get ?? jest.fn().mockResolvedValue({ data: { data: { charge: { charge_id: 123, status: "paid" } } } }),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EfiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QuotesService, useValue: mockQuotesService },
        { provide: ChatwootService, useValue: mockChatwootService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EfiService>(EfiService);
  });

  afterEach(() => jest.clearAllMocks());

  it("1. token vazio: retorna sem chamar axios.create (nenhuma chamada de rede)", async () => {
    await service.processCardWebhook("");
    expect(mockAxiosCreate).not.toHaveBeenCalled();
  });

  it("2. autenticacao na EFI falha: retorna sem lancar e sem consultar prisma.quote.findFirst", async () => {
    const cobrancaClient = buildCobrancaClient({ post: jest.fn().mockRejectedValue(new Error("auth failure")) });
    mockAxiosCreate.mockReturnValue(cobrancaClient);

    await expect(service.processCardWebhook("token-123")).resolves.toBeUndefined();
    expect(mockPrisma.quote.findFirst).not.toHaveBeenCalled();
  });

  it("2b. autenticacao retorna sem access_token: retorna sem lancar e sem consultar prisma.quote.findFirst", async () => {
    const cobrancaClient = buildCobrancaClient({ post: jest.fn().mockResolvedValue({ data: {} }) });
    mockAxiosCreate.mockReturnValue(cobrancaClient);

    await expect(service.processCardWebhook("token-123")).resolves.toBeUndefined();
    expect(mockPrisma.quote.findFirst).not.toHaveBeenCalled();
  });

  it("3. charge_id ausente na resposta de notification: retorna sem chamar prisma.quote.findFirst", async () => {
    const cobrancaClient = buildCobrancaClient({ get: jest.fn().mockResolvedValue({ data: { data: { charge: { status: "paid" } } } }) });
    mockAxiosCreate.mockReturnValue(cobrancaClient);

    await service.processCardWebhook("token-123");
    expect(mockPrisma.quote.findFirst).not.toHaveBeenCalled();
  });

  it("4. nenhuma Quote encontrada para o cardChargeId resolvido: retorna sem chamar prisma.$transaction", async () => {
    mockAxiosCreate.mockReturnValue(buildCobrancaClient());
    mockPrisma.quote.findFirst.mockResolvedValue(null);

    await service.processCardWebhook("token-123");
    expect(mockPrisma.quote.findFirst).toHaveBeenCalledWith({ where: { cardChargeId: "123" } });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("5. status diferente de 'paid': prisma.$transaction NAO deve ser chamado", async () => {
    const cobrancaClient = buildCobrancaClient({
      get: jest.fn().mockResolvedValue({ data: { data: { charge: { charge_id: 123, status: "waiting" } } } }),
    });
    mockAxiosCreate.mockReturnValue(cobrancaClient);
    mockPrisma.quote.findFirst.mockResolvedValue({
      id: "quote-1",
      status: "PENDENTE",
      total: "100.00",
      paidTotal: "0.00",
      paymentConfirmedAt: null,
      conversationId: null,
    });

    await service.processCardWebhook("token-123");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("6. idempotencia via paymentConfirmedAt ja preenchido: prisma.$transaction NAO deve ser chamado", async () => {
    mockAxiosCreate.mockReturnValue(buildCobrancaClient());
    mockPrisma.quote.findFirst.mockResolvedValue({
      id: "quote-2",
      status: "APROVADO",
      total: "100.00",
      paidTotal: "100.00",
      paymentConfirmedAt: new Date("2026-07-01T00:00:00Z"),
      conversationId: null,
    });

    await service.processCardWebhook("token-123");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("7. idempotencia via PaymentTransaction ja existente: prisma.$transaction NAO deve ser chamado", async () => {
    mockAxiosCreate.mockReturnValue(buildCobrancaClient());
    mockPrisma.quote.findFirst.mockResolvedValue({
      id: "quote-3",
      status: "PENDENTE",
      total: "100.00",
      paidTotal: "0.00",
      paymentConfirmedAt: null,
      conversationId: null,
    });
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: "existing-ptx" });

    await service.processCardWebhook("token-123");
    expect(mockPrisma.paymentTransaction.findFirst).toHaveBeenCalledWith({ where: { externalId: "123" } });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("8. caminho feliz — pagamento aprovado processado com sucesso", async () => {
    mockAxiosCreate.mockReturnValue(buildCobrancaClient());

    const quoteMock = {
      id: "quote-happy",
      status: "PENDENTE",
      total: "150.00",
      paidTotal: "0.00",
      paymentConfirmedAt: null,
      conversationId: 42,
      customer: { fullName: "Cliente Feliz" },
      internalNumber: 777,
    };
    mockPrisma.quote.findFirst.mockResolvedValue(quoteMock);
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);

    const txCreateSpy = jest.fn().mockResolvedValue({ id: "ptx-happy" });
    const txQuoteUpdateSpy = jest.fn().mockResolvedValue({ status: "APROVADO" });
    const txStatusHistorySpy = jest.fn().mockResolvedValue({ id: "hist-happy" });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) =>
      callback({
        paymentTransaction: { create: txCreateSpy },
        quote: { update: txQuoteUpdateSpy },
        quoteStatusHistory: { create: txStatusHistorySpy },
      }),
    );

    mockQuotesService.getById.mockResolvedValue({
      body: {
        cliente: { nome: "Cliente Feliz" },
        idorcamento: "ORC-HAPPY",
        totais: { valor: "150.00" },
        itens: [],
        carimbos: { quantidade_total: 0 },
      },
      chatwootConversationUrl: null,
      latestPdfUrl: null,
    });

    await service.processCardWebhook("token-123");

    expect(txCreateSpy).toHaveBeenCalledTimes(1);
    const createArg = txCreateSpy.mock.calls[0][0];
    expect(createArg.data.method).toBe("CARD");
    expect(createArg.data.externalId).toBe("123");
    expect(createArg.data.source).toBe("EFI");

    expect(txQuoteUpdateSpy).toHaveBeenCalledTimes(1);
    const updateArg = txQuoteUpdateSpy.mock.calls[0][0];
    expect(updateArg.data.paymentMethod).toBe("CARD");
    expect(updateArg.data.paymentConfirmedAt).toBeInstanceOf(Date);

    expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalled();
  });

  // Fase 51 (plano 51-03, D-03): gancho de etiquetas do Chatwoot depois da transacao do webhook de cartao.
  describe("processCardWebhook - etiquetas do Chatwoot (fase 51)", () => {
    const quoteBase = (overrides: Record<string, unknown> = {}) => ({
      id: "quote-card-label",
      status: "PENDENTE",
      total: "150.00",
      paidTotal: "0.00",
      paymentConfirmedAt: null,
      conversationId: 42,
      customer: { fullName: "Cliente Cartao" },
      internalNumber: 888,
      ...overrides,
    });

    let transacaoTerminou: boolean;

    beforeEach(() => {
      transacaoTerminou = false;
      mockAxiosCreate.mockReturnValue(buildCobrancaClient());
      mockQuotesService.sincronizarEtiquetasChatwoot.mockReset();
      mockQuotesService.getById.mockReset();
      mockQuotesService.getById.mockResolvedValue({
        body: { cliente: { nome: "Cliente Cartao" }, idorcamento: "ORC-CARD", totais: { valor: "150.00" } },
        chatwootConversationUrl: null,
      });
      mockChatwootService.sendOutgoingMessage.mockReset();
      mockChatwootService.sendOutgoingMessage.mockResolvedValue(undefined);
      mockPrisma.paymentTransaction.findFirst.mockReset();
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockReset();
      mockPrisma.quote.findFirst.mockResolvedValue(quoteBase());
      mockPrisma.$transaction.mockReset();
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const resultado = await callback({
          paymentTransaction: { create: jest.fn().mockResolvedValue({ id: "ptx-card-label" }) },
          quote: { update: jest.fn().mockResolvedValue({ status: "APROVADO" }) },
          quoteStatusHistory: { create: jest.fn().mockResolvedValue({ id: "hist-card-label" }) },
        });
        transacaoTerminou = true;
        return resultado;
      });
    });

    it("H1: PENDENTE -> APROVADO sincroniza uma vez, depois da transacao e antes da mensagem ao cliente", async () => {
      let terminouNaChamada: boolean | undefined;
      mockQuotesService.sincronizarEtiquetasChatwoot.mockImplementation(() => {
        terminouNaChamada = transacaoTerminou;
        return Promise.resolve();
      });

      await service.processCardWebhook("token-123");

      expect(mockQuotesService.sincronizarEtiquetasChatwoot).toHaveBeenCalledTimes(1);
      expect(mockQuotesService.sincronizarEtiquetasChatwoot).toHaveBeenCalledWith("quote-card-label");
      expect(terminouNaChamada).toBe(true);
      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalled();
      expect(mockQuotesService.sincronizarEtiquetasChatwoot.mock.invocationCallOrder[0]).toBeLessThan(
        mockChatwootService.sendOutgoingMessage.mock.invocationCallOrder[0],
      );
    });

    it("H2: status que nao muda (ja APROVADO, sem confirmacao previa) nao sincroniza", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(quoteBase({ status: "APROVADO" }));

      await service.processCardWebhook("token-123");

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockQuotesService.sincronizarEtiquetasChatwoot).not.toHaveBeenCalled();
    });

    it("H3: cotacao sem conversationId nao sincroniza", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(quoteBase({ conversationId: null }));

      await service.processCardWebhook("token-123");

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockQuotesService.sincronizarEtiquetasChatwoot).not.toHaveBeenCalled();
    });

    it("H4: falha sincrona ou rejeicao do gancho nao derruba o webhook nem a mensagem ao cliente", async () => {
      mockQuotesService.sincronizarEtiquetasChatwoot.mockImplementationOnce(() => {
        throw new Error("falha sincrona");
      });
      await expect(service.processCardWebhook("token-123")).resolves.toBeUndefined();
      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);

      mockChatwootService.sendOutgoingMessage.mockClear();
      mockQuotesService.sincronizarEtiquetasChatwoot.mockRejectedValueOnce(new Error("rejeitou"));
      await expect(service.processCardWebhook("token-123")).resolves.toBeUndefined();
      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    });

    it("H5: QuotesService antigo, sem sincronizarEtiquetasChatwoot, nao derruba o webhook", async () => {
      const original = mockQuotesService.sincronizarEtiquetasChatwoot;
      delete (mockQuotesService as any).sincronizarEtiquetasChatwoot;
      try {
        await expect(service.processCardWebhook("token-123")).resolves.toBeUndefined();
        expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);
      } finally {
        mockQuotesService.sincronizarEtiquetasChatwoot = original;
      }
    });
  });
});
