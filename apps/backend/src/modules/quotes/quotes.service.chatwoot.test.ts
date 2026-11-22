import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QuotesService } from "./quotes.service";
import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { EfiService } from "../integrations/efi/efi.service";
import { CreateQuoteDto } from "./dto/create-quote.dto";

describe("QuotesService - Chatwoot Validation", () => {
  let service: QuotesService;
  let prismaService: PrismaService;

  // Mock básico que evita erros
  const mockPrismaService = {
    $transaction: jest.fn(),
    quote: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    quoteItem: {
      create: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    quoteStamp: {
      deleteMany: jest.fn(),
    },
  };

  const mockAthosService = {
    buscarOrcamentoPorNumero: jest.fn(),
    testarConexao: jest.fn(),
  };

  const mockQuotesPdfStorageService = {
    generateAndUploadPdf: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AthosService, useValue: mockAthosService },
        { provide: QuotesPdfStorageService, useValue: mockQuotesPdfStorageService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: ChatwootService, useValue: { sendOutgoingMessage: jest.fn(), sendAttachment: jest.fn() } },
        { provide: EfiService, useValue: { createCharge: jest.fn(), getChargeStatus: jest.fn() } },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validateChatwootContext", () => {
    it("deve aceitar payload sem Chatwoot IDs", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
      };

      // Mock transaction
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const mockQuoteCreated = { id: "1", internalNumber: 1, externalQuoteId: null, status: "PENDENTE", approved: false, approvedAt: null, approvalToken: null, approvalExpiresAt: null, notes: null, total: BigInt(10000), discount: BigInt(0), surcharge: BigInt(0), sellerName: null, conversationId: null, chatwootContactId: null, validity: null, deliveryDate: null, paymentTerms: null, createdAt: new Date(), updatedAt: new Date(), editedAt: null, customer: { id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }, items: [], stamps: [], documents: [] };
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue(mockQuoteCreated), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(mockQuoteCreated), update: jest.fn().mockResolvedValue(mockQuoteCreated) },
          quoteItem: { create: jest.fn().mockResolvedValue({ id: "item1" }), deleteMany: jest.fn(), createMany: jest.fn() },
          quoteStampItem: { deleteMany: jest.fn() },
          customer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }), update: jest.fn() },
        };
        return callback(mockTx);
      });

      await expect(service.create(payload)).resolves.toBeDefined();
    });

    it("deve aceitar payload com conversationId válido (> 0)", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
        conversationId: 12345,
        chatwootContactId: 67890,
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const mockQuoteCreated = { id: "1", internalNumber: 1, externalQuoteId: null, status: "PENDENTE", approved: false, approvedAt: null, approvalToken: null, approvalExpiresAt: null, notes: null, total: BigInt(10000), discount: BigInt(0), surcharge: BigInt(0), sellerName: null, conversationId: null, chatwootContactId: null, validity: null, deliveryDate: null, paymentTerms: null, createdAt: new Date(), updatedAt: new Date(), editedAt: null, customer: { id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }, items: [], stamps: [], documents: [] };
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue(mockQuoteCreated), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(mockQuoteCreated), update: jest.fn().mockResolvedValue(mockQuoteCreated) },
          quoteItem: { create: jest.fn().mockResolvedValue({ id: "item1" }), deleteMany: jest.fn(), createMany: jest.fn() },
          quoteStampItem: { deleteMany: jest.fn() },
          customer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }), update: jest.fn() },
        };
        return callback(mockTx);
      });

      await expect(service.create(payload)).resolves.toBeDefined();
    });

    it("deve rejeitar conversationId inválido (0)", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
        conversationId: 0,
      };

      await expect(service.create(payload)).rejects.toThrow(BadRequestException);
      await expect(service.create(payload)).rejects.toThrow("conversationId invalido");
    });

    it("deve rejeitar conversationId negativo", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
        conversationId: -1,
      };

      await expect(service.create(payload)).rejects.toThrow(BadRequestException);
      await expect(service.create(payload)).rejects.toThrow("conversationId invalido");
    });

    it("deve rejeitar chatwootContactId inválido (0)", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
        chatwootContactId: 0,
      };

      await expect(service.create(payload)).rejects.toThrow(BadRequestException);
      await expect(service.create(payload)).rejects.toThrow("chatwootContactId invalido");
    });

    it("deve rejeitar chatwootContactId negativo", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
        chatwootContactId: -99,
      };

      await expect(service.create(payload)).rejects.toThrow(BadRequestException);
      await expect(service.create(payload)).rejects.toThrow("chatwootContactId invalido");
    });

    it("deve aceitar conversationId válido e chatwootContactId null", async () => {
      const payload: CreateQuoteDto = {
        cliente: { nome: "João" },
        itens: [
          {
            produto: { descricaoproduto: "Produto" },
            quantidadeitem: 1,
            valoritem: 100,
          },
        ],
        conversationId: 12345,
        chatwootContactId: undefined,
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const mockQuoteCreated = { id: "1", internalNumber: 1, externalQuoteId: null, status: "PENDENTE", approved: false, approvedAt: null, approvalToken: null, approvalExpiresAt: null, notes: null, total: BigInt(10000), discount: BigInt(0), surcharge: BigInt(0), sellerName: null, conversationId: null, chatwootContactId: null, validity: null, deliveryDate: null, paymentTerms: null, createdAt: new Date(), updatedAt: new Date(), editedAt: null, customer: { id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }, items: [], stamps: [], documents: [] };
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue(mockQuoteCreated), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(mockQuoteCreated), update: jest.fn().mockResolvedValue(mockQuoteCreated) },
          quoteItem: { create: jest.fn().mockResolvedValue({ id: "item1" }), deleteMany: jest.fn(), createMany: jest.fn() },
          quoteStampItem: { deleteMany: jest.fn() },
          customer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }), update: jest.fn() },
        };
        return callback(mockTx);
      });

      await expect(service.create(payload)).resolves.toBeDefined();
    });
  });

  // Fase 51 (plano 51-02, D-03): create dispara a sincronizacao de etiquetas depois da transacao.
  describe("etiquetas do Chatwoot apos create (fase 51)", () => {
    const payloadBase = (extra: Partial<CreateQuoteDto> = {}): CreateQuoteDto => ({
      cliente: { nome: "João" },
      itens: [{ produto: { descricaoproduto: "Produto" }, quantidadeitem: 1, valoritem: 100 }],
      ...extra,
    });

    /** $transaction falso; devolve a flag "terminou" para provar a ordem. */
    const prepararTransacao = (conversationId: bigint | null) => {
      const estado = { terminou: false };
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const criada = { id: "quote-create-1", internalNumber: 1, externalQuoteId: null, status: "PENDENTE", approved: false, approvedAt: null, approvalToken: null, approvalExpiresAt: null, notes: null, total: BigInt(10000), discount: BigInt(0), surcharge: BigInt(0), sellerName: null, conversationId, chatwootContactId: null, validity: null, deliveryDate: null, paymentTerms: null, createdAt: new Date(), updatedAt: new Date(), editedAt: null, customer: { id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }, items: [], stamps: [], documents: [] };
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue(criada), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(criada), update: jest.fn().mockResolvedValue(criada) },
          quoteItem: { create: jest.fn().mockResolvedValue({ id: "item1" }), deleteMany: jest.fn(), createMany: jest.fn() },
          quoteStampItem: { deleteMany: jest.fn() },
          customer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "cus1", fullName: "João", isAssociated: false, phone: null, email: null }), update: jest.fn() },
        };
        const resultado = await callback(mockTx);
        estado.terminou = true;
        return resultado;
      });
      return estado;
    };

    it("G4: com conversationId sincroniza com o id criado, depois da transacao; sem conversationId nao", async () => {
      const estado = prepararTransacao(BigInt(12345));
      let terminouNaChamada: boolean | undefined;
      const sync = jest.spyOn(service, "sincronizarEtiquetasChatwoot").mockImplementation(async () => {
        terminouNaChamada = estado.terminou;
      });

      await service.create(payloadBase({ conversationId: 12345 }));

      expect(sync).toHaveBeenCalledTimes(1);
      expect(sync).toHaveBeenCalledWith("quote-create-1");
      expect(terminouNaChamada).toBe(true);

      sync.mockClear();
      prepararTransacao(null);
      await service.create(payloadBase());
      expect(sync).not.toHaveBeenCalled();
    });

    it("G5: sincronizacao que rejeita nao derruba o create", async () => {
      prepararTransacao(BigInt(12345));
      jest.spyOn(service, "sincronizarEtiquetasChatwoot").mockRejectedValue(new Error("labels fora"));

      await expect(service.create(payloadBase({ conversationId: 12345 }))).resolves.toBeDefined();
    });
  });
});
