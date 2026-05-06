import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';
let c = readFileSync(path, 'utf8');
const nl = c.includes('\r\n') ? '\r\n' : '\n';

c = c.replace(
  'describe("QuotesService - changeStatus", () => {' + nl + '  let service: QuotesService;' + nl + '  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];',
  'describe("QuotesService - changeStatus", () => {' + nl + '  let service: QuotesService;' + nl + '  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];' + nl + '  let athosMock: any;',
);

const firstServiceAssign = '    service = module.get<QuotesService>(QuotesService);';
if (c.includes(firstServiceAssign) && !c.includes('athosMock = module.get(AthosService);')) {
  c = c.replace(firstServiceAssign, firstServiceAssign + nl + '    athosMock = module.get(AthosService);');
}

const marker = 'it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {';
const start = c.indexOf(marker);
if (start < 0) throw new Error('marker not found');
const end = c.indexOf(nl + '    });', start);
if (end < 0) throw new Error('end marker not found');
const insertPos = end + (nl + '    });').length;

const newTest = nl + nl + [
  '    it("deve bloquear EM_PRODUCAO quando Athos indicar idcliente mesmo com isAssociated=false", async () => {',
  '      mockPrisma.quote.findFirst.mockResolvedValue(',
  '        makeQuote({',
  '          status: "APROVADO",',
  '          approved: false,',
  '          saleExternalId: BigInt(42),',
  '          externalQuoteId: BigInt(999),',
  '          customer: { id: "cus1", fullName: "Assoc", isAssociated: false, phone: null, email: null },',
  '        }),',
  '      );',
  '      athosMock.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });',
  '',
  '      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);',
  '      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow("aprovacao via link");',
  '    });',
].join(nl);

if (!c.includes('Athos indicar idcliente')) {
  c = c.slice(0, insertPos) + newTest + c.slice(insertPos);
}

if (!c.includes('describe("QuotesService - checkPaymentStatus"')) {
  c += nl + nl + [
    'describe("QuotesService - checkPaymentStatus", () => {',
    '  let service: QuotesService;',
    '  let mockPrisma: ReturnType<typeof buildProviders>["mockPrismaService"];',
    '  let athosMock: any;',
    '  let chatwootMock: { sendOutgoingMessage: jest.Mock; sendAttachment: jest.Mock };',
    '',
    '  beforeEach(async () => {',
    '    const { mockPrismaService, providers } = buildProviders();',
    '    mockPrisma = mockPrismaService;',
    '    const module: TestingModule = await Test.createTestingModule({ providers }).compile();',
    '    service = module.get<QuotesService>(QuotesService);',
    '    athosMock = module.get(AthosService);',
    '    chatwootMock = module.get(ChatwootService) as any;',
    '    jest.clearAllMocks();',
    '  });',
    '',
    '  afterEach(() => jest.clearAllMocks());',
    '',
    '  it("deve notificar cliente ao confirmar pagamento no caixa e incluir numero da venda", async () => {',
    '    mockPrisma.quote.findFirst.mockResolvedValue(',
    '      makeQuote({',
    '        id: "quote-001",',
    '        status: "APROVADO",',
    '        externalQuoteId: BigInt(123),',
    '        conversationId: BigInt(42),',
    '        saleExternalId: null,',
    '        paymentConfirmedAt: null,',
    '      }),',
    '    );',
    '',
    '    athosMock.verificarPagamentoPorOrcamento.mockResolvedValue({ paid: true, idVenda: 77, valor: 100 });',
    '    mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "APROVADO" }));',
    '',
    '    await service.checkPaymentStatus("quote-001");',
    '',
    '    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith(',
    '      "42",',
    '      expect.stringContaining("venda #77"),',
    '    );',
    '',
    '    const paymentStampCall = (mockPrisma.quote.update.mock.calls as any[]).find(',
    '      (call: any[]) => call[0]?.data?.paymentConfirmedAt,',
    '    );',
    '    expect(paymentStampCall).toBeDefined();',
    '  });',
    '});',
  ].join(nl);
}

writeFileSync(path, c, 'utf8');
console.log('OK');
