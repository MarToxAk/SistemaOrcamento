import { CobrancaService } from "./cobranca.service";

describe("CobrancaService.buscarTitulosComBoletoAtivo (Fase 48)", () => {
  let service: CobrancaService;

  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      cobrancaBoletoTitulo: { findMany: jest.fn() },
    };
  });

  function linha(
    idcontareceber: number,
    cobrancaBoleto: Partial<Record<string, unknown>> = {},
  ) {
    return {
      idcontareceber,
      cobrancaBoleto: {
        id: 100 + idcontareceber,
        status: "pendente",
        linkBoleto: "http://example.com/boleto",
        nomeArquivo: "boleto.pdf",
        expireAt: "2026-11-20",
        athosBaixaDataPagamento: null,
        emailEnvios: [],
        ...cobrancaBoleto,
      },
    };
  }

  it("boleto pago devolve expireAt e dataPagamento", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([
      linha(1, { status: "pago", expireAt: "2026-11-20", athosBaixaDataPagamento: "2026-11-18" }),
    ]);

    const result = await service.buscarTitulosComBoletoAtivo([1]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        idcontareceber: 1,
        cobrancaId: 101,
        status: "pago",
        expireAt: "2026-11-20",
        dataPagamento: "2026-11-18",
      }),
    );
  });

  it("boleto pendente devolve dataPagamento null mesmo com a data preenchida", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([
      linha(2, { status: "pendente", athosBaixaDataPagamento: "2026-11-18" }),
    ]);

    const result = await service.buscarTitulosComBoletoAtivo([2]);

    expect(result[0].dataPagamento).toBeNull();
    expect(result[0].expireAt).toBe("2026-11-20");
  });

  it("expireAt null do boleto e preservado como null", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([
      linha(3, { expireAt: null }),
    ]);

    const result = await service.buscarTitulosComBoletoAtivo([3]);

    expect(result[0].expireAt).toBeNull();
    expect(result[0].dataPagamento).toBeNull();
  });

  it("select do Prisma inclui expireAt e athosBaixaDataPagamento e mantem o filtro de status", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([]);

    await service.buscarTitulosComBoletoAtivo([1, 2]);

    const args = (service as any).prisma.cobrancaBoletoTitulo.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      idcontareceber: { in: [1, 2] },
      cobrancaBoleto: { status: { in: ["pendente", "pago"] } },
    });
    expect(args.select.cobrancaBoleto.select.expireAt).toBe(true);
    expect(args.select.cobrancaBoleto.select.athosBaixaDataPagamento).toBe(true);
  });

  it("lista vazia devolve [] sem chamar o Prisma", async () => {
    const result = await service.buscarTitulosComBoletoAtivo([]);

    expect(result).toEqual([]);
    expect((service as any).prisma.cobrancaBoletoTitulo.findMany).not.toHaveBeenCalled();
  });
});
