import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EfiService } from "./efi.service";
import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

describe("EfiService - processWebhook", () => {
  let service: EfiService;

  const mockPrisma = {
    $transaction: jest.fn(),
    quote: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    paymentTransaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockQuotesService = {
    changeStatus: jest.fn(),
    sincronizarEtiquetasChatwoot: jest.fn(),
  };

  const mockChatwootService = {
    sendOutgoingMessage: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue(undefined),
  };

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

  describe("payload sem pagamentos", () => {
    it("deve retornar ignored=true para payload vazio {}", async () => {
      const result = await service.processWebhook({});
      expect(result.ignored).toBe(true);
      expect(result.processed).toBe(0);
      expect(result.reason).toBe("payload_sem_pagamentos_reconhecidos");
    });

    it("deve retornar ignored=true para payload sem txid", async () => {
      const result = await service.processWebhook({ pix: [] });
      expect(result.ignored).toBe(true);
    });

    it("deve retornar ignored=true para payload com pix sem valor", async () => {
      const result = await service.processWebhook({
        pix: [{ txid: "ABC123", endToEndId: "E0000001", valor: "0" }],
      });
      expect(result.ignored).toBe(true);
    });
  });

  describe("assinatura opcional e auditoria", () => {
    it("deve processar webhook sem assinatura quando payload for valido", async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(null);

      const payload = {
        txid: "TX_NO_SIG",
        endToEndId: "E_NO_SIG",
        valor: "25.00",
      };

      const result = await service.processWebhook(payload, undefined);
      expect(result.received).toBe(true);
      expect(result.processed).toBe(0);
      expect(result.notFound).toBe(1);
    });

    it("deve persistir metadata.signature como null quando assinatura estiver ausente", async () => {
      const quoteMock = {
        id: "quote-audit-1",
        status: "PENDENTE",
        paymentExternalId: "TX_AUDIT_1",
        secondInstallmentExternalId: null,
        total: "100.00",
        paidTotal: "0.00",
        paymentConfirmedAt: null,
        conversationId: null,
      };

      const txCreateSpy = jest.fn().mockResolvedValue({ id: "ptx-audit-1" });
      const txQuoteUpdateSpy = jest.fn().mockResolvedValue({ status: "PAGAMENTO_PARCIAL" });
      const txStatusHistorySpy = jest.fn().mockResolvedValue({ id: "hist-audit-1" });

      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(quoteMock);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) =>
        callback({
          paymentTransaction: { create: txCreateSpy },
          quote: { update: txQuoteUpdateSpy },
          quoteStatusHistory: { create: txStatusHistorySpy },
        }),
      );

      (mockQuotesService as any).getById = jest.fn().mockResolvedValue({
        body: {
          cliente: { nome: "Cliente Teste" },
          idorcamento: "ORC-AUDIT",
          totais: { valor: "100.00" },
          itens: [],
          carimbos: { quantidade_total: 0 },
        },
      });

      const payload = {
        pix: [{ txid: "TX_AUDIT_1", endToEndId: "E_AUDIT_1", valor: "30.00" }],
      };

      const result = await service.processWebhook(payload, undefined);

      expect(result.processed).toBe(1);
      expect(txCreateSpy).toHaveBeenCalled();
      const createArg = txCreateSpy.mock.calls[0][0];
      expect(createArg.data.metadata.signature).toBeNull();
    });
  });

  describe("payload com pagamento pix válido mas sem quote vinculada", () => {
    it("deve registrar 'quote_not_found' quando txid não tem quote", async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(null);

      const payload = {
        pix: [{ txid: "TXID001", endToEndId: "E0000001", valor: "150.00" }],
      };

      const result = await service.processWebhook(payload);
      expect(result.ignored).toBeFalsy();
      expect(Array.isArray((result as any).results)).toBe(true);
      const r = (result as any).results[0];
      expect(r.status).toBe("quote_not_found");
    });
  });

  describe("idempotência por eventId", () => {
    it("deve ignorar pagamento duplicado já registrado", async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: "existing-tx" });

      const payload = {
        pix: [{ txid: "TXID_DUP", endToEndId: "E_DUP_001", valor: "200.00" }],
      };

      const result = await service.processWebhook(payload);
      const r = (result as any).results[0];
      expect(r.status).toBe("ignored_duplicate");
      // Não deve criar nova transação
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("deve ignorar duplicado mesmo sem assinatura", async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: "existing-tx-no-sign" });

      const payload = {
        pix: [{ txid: "TXID_DUP_NO_SIGN", endToEndId: "E_DUP_NO_SIGN", valor: "200.00" }],
      };

      const result = await service.processWebhook(payload, undefined);
      const r = (result as any).results[0];
      expect(r.status).toBe("ignored_duplicate");
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("extração de payload", () => {
    it("deve extrair corretamente payload formato pix array", async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(null);

      const payload = {
        pix: [
          { txid: "TX01", endToEndId: "ETE01", valor: "99.90" },
          { txid: "TX02", endToEndId: "ETE02", valor: "49.50" },
        ],
      };

      const result = await service.processWebhook(payload);
      // Dois pagamentos foram extraídos (ambos sem quote)
      expect((result as any).results).toHaveLength(2);
    });

    it("deve extrair payload formato simples (fallback)", async () => {
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(null);

      const payload = {
        txid: "TXSIMPLE",
        endToEndId: "ETE_SIMPLE",
        valor: "75.00",
      };

      const result = await service.processWebhook(payload);
      expect((result as any).results).toHaveLength(1);
    });
  });

  describe("processWebhook — Chatwoot message tone", () => {
    const buildQuoteMock = (overrides: Record<string, unknown> = {}) => ({
      id: "quote-tone-1",
      status: "APROVADO",
      paymentExternalId: "TXPIX_TONE",
      secondInstallmentExternalId: null,
      total: "200.00",
      paidTotal: "0.00",
      conversationId: 99,
      firstInstallmentAmount: null,
      ...overrides,
    });

    const buildMappedQuote = (clienteNome = "Ana Paula Souza") => ({
      body: {
        cliente: { nome: clienteNome },
        conversationId: 99,
        idorcamento: "ORÇ-TONE",
        totais: { valor: "200.00" },
        itens: [],
        carimbos: { quantidade_total: 0 },
      },
      chatwootConversationUrl: null,
      latestPdfUrl: null,
    });

    beforeEach(() => {
      (mockQuotesService as any).getById = jest.fn().mockResolvedValue(buildMappedQuote());
      mockPrisma.$transaction.mockResolvedValue({
        transaction: { id: "tx-tone-1" },
        quoteUpdate: { status: "PAGO" },
      });
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(buildQuoteMock());
    });

    it("MSG-03 — fullyPaid: mensagem usa nome completo do cliente, nao apenas primeiro nome", async () => {
      // amount = total → fullyPaid = true
      const payload = {
        pix: [{ txid: "TXPIX_TONE", endToEndId: "E_TONE_001", valor: "200.00" }],
      };

      await service.processWebhook(payload);

      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Ana Paula Souza"),
      );
      const msg: string = mockChatwootService.sendOutgoingMessage.mock.calls[0][1];
      // Verificar que usa nome completo, nao apenas "Ana" como primeiroNome
      expect(msg).toContain("Ana Paula Souza");
    });

    it("MSG-04 — entrada 50%: mensagem usa nome completo e contem 'entrada'", async () => {
      // amount = 100 = total/2 → isHalf = true, fullyPaid = false
      mockPrisma.quote.findFirst.mockResolvedValue(buildQuoteMock({ total: "200.00", paidTotal: "0.00" }));
      const payload = {
        pix: [{ txid: "TXPIX_TONE", endToEndId: "E_TONE_002", valor: "100.00" }],
      };

      await service.processWebhook(payload);

      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Ana Paula Souza"),
      );
      const msg: string = mockChatwootService.sendOutgoingMessage.mock.calls[0][1];
      expect(msg).toContain("entrada");
    });

    it("MSG-02 — parcial nao isHalf: mensagem usa nome completo e contem 'parcial'", async () => {
      // amount = 60 (30% de 200) → isHalf = false, fullyPaid = false
      mockPrisma.quote.findFirst.mockResolvedValue(buildQuoteMock({ total: "200.00", paidTotal: "0.00" }));
      const payload = {
        pix: [{ txid: "TXPIX_TONE", endToEndId: "E_TONE_003", valor: "60.00" }],
      };

      await service.processWebhook(payload);

      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Ana Paula Souza"),
      );
      const msg: string = mockChatwootService.sendOutgoingMessage.mock.calls[0][1];
      expect(msg).toContain("parcial");
    });
  });

  // Fase 51 (plano 51-03, D-03): gancho de etiquetas do Chatwoot depois da transacao do webhook PIX.
  describe("processWebhook - etiquetas do Chatwoot (fase 51)", () => {
    const quoteBase = (overrides: Record<string, unknown> = {}) => ({
      id: "quote-label-1",
      status: "PENDENTE",
      paymentExternalId: "TXPIX_LABEL",
      secondInstallmentExternalId: null,
      total: "200.00",
      paidTotal: "0.00",
      paymentConfirmedAt: null,
      conversationId: 99,
      firstInstallmentAmount: null,
      customer: { fullName: "Cliente Etiqueta" },
      ...overrides,
    });

    const payloadPix = (valor: string) => ({ pix: [{ txid: "TXPIX_LABEL", endToEndId: "E_LABEL_1", valor }] });

    let transacaoTerminou: boolean;

    beforeEach(() => {
      transacaoTerminou = false;
      mockQuotesService.sincronizarEtiquetasChatwoot.mockReset();
      (mockQuotesService as any).getById = jest.fn().mockResolvedValue({
        body: { cliente: { nome: "Cliente Etiqueta" }, conversationId: 99, idorcamento: "ORC-LABEL", totais: { valor: "200.00" } },
        chatwootConversationUrl: null,
      });
      mockChatwootService.sendOutgoingMessage.mockReset();
      mockChatwootService.sendOutgoingMessage.mockResolvedValue(undefined);
      mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.quote.findFirst.mockResolvedValue(quoteBase());
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const resultado = await callback({
          paymentTransaction: { create: jest.fn().mockResolvedValue({ id: "ptx-label" }) },
          quote: { update: jest.fn().mockResolvedValue({ status: "APROVADO" }) },
          quoteStatusHistory: { create: jest.fn().mockResolvedValue({ id: "hist-label" }) },
        });
        transacaoTerminou = true;
        return resultado;
      });
    });

    it("H1 (tracer): PENDENTE -> APROVADO sincroniza uma vez, depois da transacao e antes da mensagem ao cliente", async () => {
      let terminouNaChamada: boolean | undefined;
      mockQuotesService.sincronizarEtiquetasChatwoot.mockImplementation(() => {
        terminouNaChamada = transacaoTerminou;
        return Promise.resolve();
      });

      await service.processWebhook(payloadPix("200.00"));

      expect(mockQuotesService.sincronizarEtiquetasChatwoot).toHaveBeenCalledTimes(1);
      expect(mockQuotesService.sincronizarEtiquetasChatwoot).toHaveBeenCalledWith("quote-label-1");
      expect(terminouNaChamada).toBe(true);
      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalled();
      expect(mockQuotesService.sincronizarEtiquetasChatwoot.mock.invocationCallOrder[0]).toBeLessThan(
        mockChatwootService.sendOutgoingMessage.mock.invocationCallOrder[0],
      );
    });

    it("H2: pagamento parcial adicional em PAGAMENTO_PARCIAL (status nao muda) nao sincroniza", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(quoteBase({ status: "PAGAMENTO_PARCIAL", paidTotal: "50.00" }));

      await service.processWebhook(payloadPix("40.00"));

      expect(mockQuotesService.sincronizarEtiquetasChatwoot).not.toHaveBeenCalled();
    });

    it("H3: cotacao sem conversationId nao sincroniza", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(quoteBase({ conversationId: null }));

      await service.processWebhook(payloadPix("200.00"));

      expect(mockQuotesService.sincronizarEtiquetasChatwoot).not.toHaveBeenCalled();
    });

    it("H4: falha sincrona ou rejeicao do gancho nao derruba o webhook nem a mensagem ao cliente", async () => {
      mockQuotesService.sincronizarEtiquetasChatwoot.mockImplementationOnce(() => {
        throw new Error("falha sincrona");
      });
      await expect(service.processWebhook(payloadPix("200.00"))).resolves.toMatchObject({ processed: 1 });
      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);

      mockChatwootService.sendOutgoingMessage.mockClear();
      mockQuotesService.sincronizarEtiquetasChatwoot.mockRejectedValueOnce(new Error("rejeitou"));
      await expect(service.processWebhook(payloadPix("200.00"))).resolves.toMatchObject({ processed: 1 });
      expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    });

    it("H5: QuotesService antigo, sem sincronizarEtiquetasChatwoot, nao derruba o webhook", async () => {
      const original = mockQuotesService.sincronizarEtiquetasChatwoot;
      delete (mockQuotesService as any).sincronizarEtiquetasChatwoot;
      try {
        await expect(service.processWebhook(payloadPix("200.00"))).resolves.toMatchObject({ processed: 1 });
        expect(mockChatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);
      } finally {
        mockQuotesService.sincronizarEtiquetasChatwoot = original;
      }
    });
  });
});
