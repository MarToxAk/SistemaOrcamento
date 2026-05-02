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
});
