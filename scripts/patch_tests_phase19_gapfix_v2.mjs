import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';
let c = readFileSync(path, 'utf8');

c = c.replace(
  'describe("QuotesService - changeStatus", () => {\n  let service: QuotesService;\n  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];',
  'describe("QuotesService - changeStatus", () => {\n  let service: QuotesService;\n  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];\n  let athosMock: any;',
);

c = c.replace(
  '    service = module.get<QuotesService>(QuotesService);',
  '    service = module.get<QuotesService>(QuotesService);\n    athosMock = module.get(AthosService);',
);

const anchorTest = `    it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {
      // isAssociated=true sem approved: bloqueia ate aprovacao via link
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null, customer: assocCustomer }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
    });`;

const newTest = anchorTest + `

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
    });`;

if (!c.includes(anchorTest)) throw new Error('anchor test not found');
c = c.replace(anchorTest, newTest);

if (!c.includes('describe("QuotesService - checkPaymentStatus"')) {
  c += `

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
`;
}

writeFileSync(path, c, 'utf8');
console.log('OK');
