from pathlib import Path

service_path = Path('apps/backend/src/modules/quotes/quotes.service.ts')
test_path = Path('apps/backend/src/modules/quotes/quotes.service.unit.test.ts')

service = service_path.read_text(encoding='utf-8')

# 1) add associated flag right after customer data resolution comment block
anchor = '    let athosMapped: any = null;\n'
insert = '    const isAssociatedCustomer = Boolean((quote as any)?.customer?.isAssociated);\n\n'
if insert not in service and anchor in service:
    service = service.replace(anchor, anchor + insert, 1)

# 2) approval link gating
service = service.replace('    if (clienteId) {', '    if (clienteId && isAssociatedCustomer) {', 1)

# 3) associated observation gating
service = service.replace('    if (clienteId) {', '    if (clienteId && isAssociatedCustomer) {', 1)

service_path.write_text(service, encoding='utf-8')

# Add unit tests for associated vs non-associated approval link behavior
text = test_path.read_text(encoding='utf-8')

if 'QuotesService - enviarParaCliente — regra de approvalLink por associado' not in text:
    block = '''

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

    // evita ruído dos fluxos opcionais
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
'''
    text = text + block


test_path.write_text(text, encoding='utf-8')
print('OK')
