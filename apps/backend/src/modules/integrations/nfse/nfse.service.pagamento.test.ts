import {
  quoteEntrada50Pix,
  quoteIntegralSemDesconto,
  quotePagoCaixa,
  quotePagoPix26809,
  quoteSemPagamento,
} from "../../quotes/__fixtures__/quote-pago.fixture";
import { NfseService } from "./nfse.service";

function makeService() {
  const prisma = {
    quote: { findFirst: jest.fn(), update: jest.fn() },
    paymentTransaction: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const athosService = { buscarOrcamentoPorNumero: jest.fn(), buscarClientePorId: jest.fn() };
  const nfseNacionalService = { emitir: jest.fn().mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" }) };
  const danfseNacionalPdfService = { gerar: jest.fn().mockResolvedValue(Buffer.from("PDF")) };
  const chatwootService = {
    sendOutgoingMessage: jest.fn().mockResolvedValue({}),
    sendAttachment: jest.fn().mockResolvedValue({}),
  };

  const service = Object.create(NfseService.prototype) as NfseService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  (service as any).prisma = prisma;
  (service as any).athosService = athosService;
  (service as any).nfseNacionalService = nfseNacionalService;
  (service as any).danfseNacionalPdfService = danfseNacionalPdfService;
  (service as any).chatwootService = chatwootService;
  const resolverTomadorQuote = jest.fn().mockResolvedValue({ idclienteAthos: null, documento: null, nome: null, endereco: null });
  (service as any).resolverTomadorQuote = resolverTomadorQuote;
  (service as any).parseXml = jest
    .fn()
    .mockReturnValue({ numeroNfse: "42", chaveAcesso: "CHV42", dataEmissao: new Date("2026-09-02T10:00:00Z"), valorServico: 100 });
  (service as any).storeXml = jest.fn().mockResolvedValue({ objectName: "obj/42.xml", publicUrl: "https://minio/obj/42.xml" });

  return { service, prisma, athosService, nfseNacionalService, resolverTomadorQuote };
}

function dtoCom(valorServico: number) {
  return { codigoServico: "130501" as const, nomeTomador: "Nome Manual", cpfTomador: "11122233344", valorServico };
}

async function capturar(promessa: Promise<unknown>): Promise<any> {
  try {
    await promessa;
  } catch (err) {
    return err;
  }
  throw new Error("Esperava uma excecao, mas a chamada terminou com sucesso.");
}

describe("NfseService.emitirQuoteNfseAutomatica - trava de pagamento (D-06, D-12, D-15)", () => {
  it("#26809 pago por PIX (paidTotal 164,35 com desconto 8,65) emite sem senha com valorServico 164,35", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quotePagoPix26809());

    const resultado = await service.emitirQuoteNfseAutomatica("26809", dtoCom(164.35) as any);

    expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    expect(resultado.numero).toBe("42");
  });

  it.each([164.36, 173])("#26809 com valorServico %s: 422 VALOR_ACIMA_DO_PAGO e emitir nao e chamado (D-15)", async (valor) => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quotePagoPix26809());

    const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(valor) as any));

    expect(erro.getStatus()).toBe(422);
    expect(erro.getResponse()).toMatchObject({ code: "VALOR_ACIMA_DO_PAGO", valorMaximo: 164.35 });
    expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it("entrada 50% sem senha: 403 PAGAMENTO_INTEGRAL_NAO_CONFIRMADO com situacao PARCIAL; Athos, SEFIN e update nao sao chamados", async () => {
    const { service, prisma, nfseNacionalService, athosService, resolverTomadorQuote } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(173) as any));

    expect(erro.getStatus()).toBe(403);
    expect(erro.getResponse()).toMatchObject({
      code: "PAGAMENTO_INTEGRAL_NAO_CONFIRMADO",
      situacao: "PARCIAL",
      valorPago: 86.5,
      valorDevido: 173,
      exigeSenha: true,
    });
    expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
    expect(resolverTomadorQuote).not.toHaveBeenCalled();
    expect(athosService.buscarOrcamentoPorNumero).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it("sem pagamento algum: 403 com situacao SEM_PAGAMENTO", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quoteSemPagamento());

    const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(173) as any));

    expect(erro.getStatus()).toBe(403);
    expect(erro.getResponse()).toMatchObject({ code: "PAGAMENTO_INTEGRAL_NAO_CONFIRMADO", situacao: "SEM_PAGAMENTO" });
    expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it("quote legado do #26809 (desconto 0, paidTotal 164,35, total 173) nao e integral: 403 (exige reconciliacao)", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(
      quotePagoPix26809({ paymentDiscount: "0.00", paymentAmount: null, paymentConfirmedAt: null, pendingTotal: "8.65" }),
    );

    const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(164.35) as any));

    expect(erro.getStatus()).toBe(403);
    expect(erro.getResponse()).toMatchObject({ code: "PAGAMENTO_INTEGRAL_NAO_CONFIRMADO", situacao: "PARCIAL" });
    expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it("pagamento no caixa (paymentNote, paidTotal 0) emite sem senha ate o total devido (D-12)", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quotePagoCaixa());

    await service.emitirQuoteNfseAutomatica("26809", dtoCom(173) as any);

    expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
  });

  it("pagamento no caixa com valorServico acima do devido: 422 VALOR_ACIMA_DO_PAGO", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quotePagoCaixa());

    const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(173.01) as any));

    expect(erro.getStatus()).toBe(422);
    expect(erro.getResponse()).toMatchObject({ code: "VALOR_ACIMA_DO_PAGO", valorMaximo: 173 });
    expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it("total <= 150 pago integralmente (sem desconto) emite", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quoteIntegralSemDesconto(120, { paymentConfirmedAt: null }));

    await service.emitirQuoteNfseAutomatica("30001", dtoCom(120) as any);

    expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
  });

  it("nfseNumero ja preenchido continua dando 400 antes da trava", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quoteSemPagamento({ nfseNumero: "77" }));

    const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(173) as any));

    expect(erro.getStatus()).toBe(400);
    expect(String(erro.message)).toContain("ja possui NFS-e emitida");
    expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it("identificador inexistente continua dando NotFoundException antes da trava", async () => {
    const { service, prisma } = makeService();
    prisma.quote.findFirst.mockResolvedValue(null);

    const erro = await capturar(service.emitirQuoteNfseAutomatica("999999", dtoCom(100) as any));

    expect(erro.getStatus()).toBe(404);
  });

  it("anexarQuoteNfse com quote sem pagamento NAO lanca 403 e grava normalmente (D-16)", async () => {
    const { service, prisma } = makeService();
    prisma.quote.findFirst.mockResolvedValue(quoteSemPagamento());

    const resultado = await service.anexarQuoteNfse("26809", {
      originalname: "nota.xml",
      buffer: Buffer.from("<xml/>"),
      mimetype: "application/xml",
      size: 6,
    });

    expect(resultado.numero).toBe("42");
    expect(prisma.quote.update).toHaveBeenCalledTimes(1);
  });

  describe("fronteira da tolerancia de R$ 0,02", () => {
    function quoteDesconto(paidTotal: string) {
      return quotePagoPix26809({ paidTotal, paymentConfirmedAt: null });
    }

    it("paidTotal 164,33 com devido 164,35 emite", async () => {
      const { service, prisma, nfseNacionalService } = makeService();
      prisma.quote.findFirst.mockResolvedValue(quoteDesconto("164.33"));

      await service.emitirQuoteNfseAutomatica("26809", dtoCom(164.33) as any);

      expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    });

    it("paidTotal 164,32 com devido 164,35 da 403", async () => {
      const { service, prisma, nfseNacionalService } = makeService();
      prisma.quote.findFirst.mockResolvedValue(quoteDesconto("164.32"));

      const erro = await capturar(service.emitirQuoteNfseAutomatica("26809", dtoCom(164.32) as any));

      expect(erro.getStatus()).toBe(403);
      expect(nfseNacionalService.emitir).not.toHaveBeenCalled();
    });
  });
});
