const fs = require('fs');
const filePath = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';
let content = fs.readFileSync(filePath, 'utf8');

const idx = content.indexOf('<<<<<<< HEAD');
if (idx === -1) throw new Error('conflict marker not found');

const tail = `describe("QuotesService - checkPaymentStatus", () => {
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
`;

fs.writeFileSync(filePath, content.slice(0, idx) + tail, 'utf8');
console.log('quotes.service.unit.test.ts tail rewritten');
