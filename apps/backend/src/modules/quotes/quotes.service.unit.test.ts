import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QuotesService } from "./quotes.service";
import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { EfiService } from "../integrations/efi/efi.service";

// Quote completo com todos os campos que mapQuoteBody acessa
const makeQuote = (overrides: Record<string, unknown> = {}) => ({
  id: "quote-001",
  internalNumber: 1,
  externalQuoteId: null,
  status: "ENVIADO",
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
  customer: {
    id: "cus1",
    fullName: "Test Cliente",
    isAssociated: false,
    phone: null,
    email: null,
  },
  items: [],
  stamps: [],
  documents: [],
  ...overrides,
});

const buildProviders = () => {
  const mockPrismaService = {
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
  return {
    mockPrismaService,
    providers: [
      QuotesService,
      { provide: PrismaService, useValue: mockPrismaService },
      { provide: AthosService, useValue: { buscarOrcamentoPorNumero: jest.fn(), testarConexao: jest.fn(), verificarPagamentoPorOrcamento: jest.fn().mockResolvedValue({ paid: false, idVenda: null, valor: 0 }), buscarRelacaoOrcamentoVenda: jest.fn().mockResolvedValue({ idvenda: null }) } },
      { provide: QuotesPdfStorageService, useValue: { generateAndUploadPdf: jest.fn() } },
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      { provide: ChatwootService, useValue: { sendOutgoingMessage: jest.fn(), sendAttachment: jest.fn() } },
      { provide: EfiService, useValue: { createCharge: jest.fn(), getChargeStatus: jest.fn() } },
    ],
  };
};

describe("QuotesService - changeStatus", () => {
  let service: QuotesService;
  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];
  let athosMock: any;

  beforeEach(async () => {
    const { mockPrismaService, providers } = buildProviders();
    mockPrisma = mockPrismaService;
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = module.get<QuotesService>(QuotesService);
    athosMock = module.get(AthosService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("transicoes validas", () => {
    it("deve transitar de ENVIADO para APROVADO", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "ENVIADO" }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO" }));

      const result = await service.changeStatus("quote-001", "APROVADO", "test");
      expect(result).toBeDefined();
      expect(result.statusKey).toBe("APROVADO");
      expect(mockPrisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "APROVADO" }) }),
      );
    });

    it("deve transitar de ENVIADO para CANCELADO", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "ENVIADO" }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "CANCELADO" }));

      const result = await service.changeStatus("quote-001", "CANCELADO", "test");
      expect(result.statusKey).toBe("CANCELADO");
    });

    it("deve transitar de APROVADO para EM_PRODUCAO quando cliente e associado e aprovado via link", async () => {
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, saleExternalId: null, customer: assocCustomer }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));

      const result = await service.changeStatus("quote-001", "EM_PRODUCAO", "test");
      expect(result.statusKey).toBe("EM_PRODUCAO");
    });

    it("deve transitar de APROVADO para EM_PRODUCAO quando orcamento foi aprovado", async () => {
      const assocCustomer2 = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, customer: assocCustomer2 }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer2 }));

      const result = await service.changeStatus("quote-001", "EM_PRODUCAO", "test");
      expect(result.statusKey).toBe("EM_PRODUCAO");
    });
  });

  describe("transicoes invalidas", () => {
    it("deve lancar BadRequestException ao transitar de CANCELADO para EM_PRODUCAO", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "CANCELADO" }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
    });

    it("deve lancar BadRequestException ao transitar de CANCELADO para APROVADO", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "CANCELADO" }));
      await expect(service.changeStatus("quote-001", "APROVADO", "test")).rejects.toThrow(BadRequestException);
    });

    it("deve lancar BadRequestException ao transitar de EM_PRODUCAO para PENDENTE", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO" }));
      await expect(service.changeStatus("quote-001", "PENDENTE", "test")).rejects.toThrow(BadRequestException);
    });

    it("deve lancar NotFoundException se orcamento nao existe", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.changeStatus("nao-existe", "APROVADO", "test")).rejects.toThrow(NotFoundException);
    });

    it("deve lancar BadRequestException ao tentar EM_PRODUCAO sem associacao e sem pagamento", async () => {
      // Sem isAssociated E sem pagamento (approved=false, saleExternalId=null): bloqueia
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(
        "confirmacao de pagamento",
      );
    });

    it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {
      // isAssociated=true sem approved: bloqueia ate aprovacao via link
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null, customer: assocCustomer }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
    });

    it("deve bloquear EM_PRODUCAO quando Athos indicar idcliente mesmo com isAssociated=false", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(
        makeQuote({
          status: "APROVADO",
          approved: false,
          saleExternalId: BigInt(42),
          externalQuoteId: BigInt(999),
          customer: { id: "cus1", fullName: "Assoc", isAssociated: false, phone: null, email: null },
        }),
      );
      athosMock.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });

      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow("aprovacao via link");
    });

    it("deve permitir EM_PRODUCAO sem associacao quando tem approved=true", async () => {
      // Sem isAssociated mas com pagamento aprovado: libera
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, saleExternalId: null }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO" }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });

    it("deve permitir EM_PRODUCAO sem associacao quando tem saleExternalId (pagamento no caixa Athos)", async () => {
      // Sem isAssociated mas com saleExternalId: libera
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: BigInt(42) }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO" }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });
  });

  describe("normalizacao de status", () => {
    it("deve normalizar status em minusculas: 'aprovado' -> 'APROVADO'", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "ENVIADO" }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO" }));
      await expect(service.changeStatus("quote-001", "aprovado", "test")).resolves.toBeDefined();
    });

    it("deve normalizar 'Aprovado' -> 'APROVADO'", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "ENVIADO" }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO" }));
      await expect(service.changeStatus("quote-001", "Aprovado", "test")).resolves.toBeDefined();
    });

    it("deve lancar BadRequestException para status desconhecido", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "ENVIADO" }));
      await expect(service.changeStatus("quote-001", "STATUS_INVALIDO", "test")).rejects.toThrow(BadRequestException);
    });
  });
});

describe("QuotesService - approveByToken", () => {
  let service: QuotesService;
  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];

  beforeEach(async () => {
    const { mockPrismaService, providers } = buildProviders();
    mockPrisma = mockPrismaService;
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = module.get<QuotesService>(QuotesService);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve aprovar orcamento com token valido", async () => {
    const futureDate = new Date(Date.now() + 86400000);
    const quote = makeQuote({ status: "ENVIADO", approvalToken: "valid-token-abc", approvalExpiresAt: futureDate });
    // Second findFirst (inside changeStatus) returns quote with ENVIADO status (token already invalidated by first update)
    const quoteAfterTokenClear = makeQuote({ status: "ENVIADO", approvalToken: null, approved: true });
    const approvedQuote = makeQuote({ status: "APROVADO", approvalToken: null, approved: true });

    mockPrisma.quote.findFirst
      .mockResolvedValueOnce(quote)          // approveByToken initial lookup
      .mockResolvedValueOnce(quoteAfterTokenClear); // changeStatus lookup (pre-transition)
    mockPrisma.quote.update
      .mockResolvedValueOnce({ id: "quote-001" })  // first update: set approvalToken=null
      .mockResolvedValueOnce(approvedQuote);        // changeStatus update

    const result = await service.approveByToken("quote-001", "valid-token-abc");
    expect(result).toMatchObject({ approved: true, quoteId: "quote-001" });
    expect(mockPrisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalToken: null }) }),
    );
  });

  it("deve rejeitar token incorreto com BadRequestException", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ approvalToken: "correct-token", approvalExpiresAt: new Date(Date.now() + 86400000) }),
    );
    await expect(service.approveByToken("quote-001", "wrong-token")).rejects.toThrow(BadRequestException);
    await expect(service.approveByToken("quote-001", "wrong-token")).rejects.toThrow("Token de aprovacao invalido");
  });

  it("deve rejeitar token expirado com BadRequestException", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ approvalToken: "expired-token", approvalExpiresAt: new Date(Date.now() - 3600000) }),
    );
    await expect(service.approveByToken("quote-001", "expired-token")).rejects.toThrow(BadRequestException);
    await expect(service.approveByToken("quote-001", "expired-token")).rejects.toThrow("Token expirado");
  });

  it("deve rejeitar quando token nao existe no orcamento", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ approvalToken: null }));
    await expect(service.approveByToken("quote-001", "any-token")).rejects.toThrow(BadRequestException);
    await expect(service.approveByToken("quote-001", "any-token")).rejects.toThrow("Token de aprovacao nao encontrado");
  });

  it("deve lancar NotFoundException para orcamento inexistente", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(null);
    await expect(service.approveByToken("nao-existe", "token")).rejects.toThrow(NotFoundException);
  });

  it("deve invalidar token apos uso (approvalToken: null no update)", async () => {
    const futureDate = new Date(Date.now() + 86400000);
    const quote = makeQuote({ status: "ENVIADO", approvalToken: "use-once-token", approvalExpiresAt: futureDate });
    const quoteAfterTokenClear = makeQuote({ status: "ENVIADO", approvalToken: null, approved: true });
    const approvedQuote = makeQuote({ status: "APROVADO", approvalToken: null, approved: true });

    mockPrisma.quote.findFirst
      .mockResolvedValueOnce(quote)
      .mockResolvedValueOnce(quoteAfterTokenClear);
    mockPrisma.quote.update
      .mockResolvedValueOnce({ id: "quote-001" })
      .mockResolvedValueOnce(approvedQuote);

    await service.approveByToken("quote-001", "use-once-token");

    const updateCalls = (mockPrisma.quote.update.mock.calls as any[]);
    const tokenNullCall = updateCalls.find((call: any[]) => call[0]?.data?.approvalToken === null);
    expect(tokenNullCall).toBeDefined();
  });
});

describe("QuotesService - changeStatus — Chatwoot notifications", () => {
  let service: QuotesService;
  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];
  let chatwootMock: { sendOutgoingMessage: jest.Mock; sendAttachment: jest.Mock };

  beforeEach(async () => {
    const { mockPrismaService, providers } = buildProviders();
    mockPrisma = mockPrismaService;
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = module.get<QuotesService>(QuotesService);
    chatwootMock = module.get(ChatwootService) as any;
    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  it("deve chamar sendOutgoingMessage quando newStatus === EM_PRODUCAO e conversationId existe", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    await service.changeStatus("quote-001", "EM_PRODUCAO", "test");
    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("entrou em produção"));
  });

  it("deve chamar sendOutgoingMessage quando newStatus === PRONTO_PARA_ENTREGA", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42) }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "PRONTO_PARA_ENTREGA", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    await service.changeStatus("quote-001", "PRONTO_PARA_ENTREGA", "test");
    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("pronto para retirada"));
  });

  it("deve chamar sendOutgoingMessage quando newStatus === ENTREGUE", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "PRONTO_PARA_ENTREGA", conversationId: BigInt(42) }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "ENTREGUE", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    await service.changeStatus("quote-001", "ENTREGUE", "test");
    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("foi entregue"));
  });

  it("deve chamar sendOutgoingMessage quando newStatus === CANCELADO", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "ENVIADO", conversationId: BigInt(42) }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "CANCELADO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    await service.changeStatus("quote-001", "CANCELADO", "test");
    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("foi cancelado"));
  });

  it("nao deve chamar sendOutgoingMessage quando newStatus === APROVADO", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "ENVIADO", conversationId: BigInt(42) }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "APROVADO", conversationId: BigInt(42) }),
    );
    await service.changeStatus("quote-001", "APROVADO", "test");
    expect(chatwootMock.sendOutgoingMessage).not.toHaveBeenCalled();
  });

  it("deve logar warn e NAO lancar quando conversationId e null", async () => {
    const assocCust4 = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: null, customer: assocCust4 }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: null, customer: assocCust4 }),
    );
    await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    expect(chatwootMock.sendOutgoingMessage).not.toHaveBeenCalled();
  });

  it("deve logar warn e NAO lancar quando sendOutgoingMessage lanca excecao", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    (chatwootMock.sendOutgoingMessage as jest.Mock).mockRejectedValue(new Error("timeout"));
    await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
  });
});


describe("QuotesService - checkPaymentStatus", () => {
  let service: QuotesService;
  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];
  let athosMock: any;
  let chatwootMock: { sendOutgoingMessage: jest.Mock; sendAttachment: jest.Mock };

  beforeEach(async () => {
    const { mockPrismaService, providers } = buildProviders();
    mockPrisma = mockPrismaService;
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = module.get<QuotesService>(QuotesService);
    athosMock = module.get(AthosService);
    chatwootMock = module.get(ChatwootService) as any;
    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  it("deve notificar cliente ao confirmar pagamento no caixa e incluir numero da venda", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({
        id: "quote-001",
        status: "APROVADO",
        externalQuoteId: BigInt(123),
        conversationId: BigInt(42),
        saleExternalId: null,
        paymentConfirmedAt: null,
      }),
    );

    athosMock.verificarPagamentoPorOrcamento.mockResolvedValue({ paid: true, idVenda: 77, valor: 100 });
    mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO" }));

    await service.checkPaymentStatus("quote-001");

    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("venda #77"),
    );

    const paymentStampCall = (mockPrisma.quote.update.mock.calls as any[]).find(
      (call: any[]) => call[0]?.data?.paymentConfirmedAt,
    );
    expect(paymentStampCall).toBeDefined();
  });
});

describe("QuotesService - enviarParaCliente — regra de approvalLink por associado", () => {
  let service: QuotesService;
  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];
  let athosMock: { buscarOrcamentoPorNumero: jest.Mock; testarConexao: jest.Mock };

  beforeEach(async () => {
    const { mockPrismaService, providers } = buildProviders();
    mockPrisma = mockPrismaService;
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = module.get<QuotesService>(QuotesService);
    athosMock = module.get(AthosService) as any;

    mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO" }));
    mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO" }));
    mockPrisma.quoteDocument.findFirst.mockResolvedValue(null);

    (service as any).checkPaymentStatus = jest.fn().mockResolvedValue(undefined);
    const efi = module.get(EfiService) as any;
    efi.resolvePaymentOptions = jest.fn().mockReturnValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  it("deve retornar approvalLink quando cliente e associado e idcliente existe", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({
        status: "APROVADO",
        customer: { id: "cus1", fullName: "Cliente Assoc", isAssociated: true, phone: null, email: null },
      }),
    );

    athosMock.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });

    const result = await service.enviarParaCliente("quote-001");

    expect(result.approvalLink).toEqual(expect.stringContaining('/orcamento/quote-001/approve?token='));
  });

  it("nao deve retornar approvalLink quando cliente NAO e associado mesmo com idcliente", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({
        status: "APROVADO",
        customer: { id: "cus1", fullName: "Cliente Nao Assoc", isAssociated: false, phone: null, email: null },
      }),
    );

    athosMock.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 456 } });

    const result = await service.enviarParaCliente("quote-001");

    expect(result.approvalLink).toBeNull();
  });
});
