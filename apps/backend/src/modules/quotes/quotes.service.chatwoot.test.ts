import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { QuotesService } from "./quotes.service";
import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
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
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue({ id: "1" }) },
          quoteItem: { create: jest.fn() },
          customer: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: "cus1" }) },
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
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue({ id: "1" }) },
          quoteItem: { create: jest.fn() },
          customer: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: "cus1" }) },
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
        const mockTx = {
          quote: { create: jest.fn().mockResolvedValue({ id: "1" }) },
          quoteItem: { create: jest.fn() },
          customer: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: "cus1" }) },
        };
        return callback(mockTx);
      });

      await expect(service.create(payload)).resolves.toBeDefined();
    });
  });
});
