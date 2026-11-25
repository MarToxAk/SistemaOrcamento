import {
  quoteEntrada50Pix,
  quotePagoCaixa,
  quotePagoPix26809,
  quoteSemPagamento,
} from "../../quotes/__fixtures__/quote-pago.fixture";
import {
  LIMITE_FALHAS_GLOBAL,
  LIMITE_FALHAS_POR_IP,
  LimitadorFalhas,
  NFSE_OVERRIDE_ENV,
} from "./nfse-liberacao.util";
import { NfseService } from "./nfse.service";

// Literais obviamente falsos, so para os testes. Nenhuma senha real existe neste repositorio.
const SENHA_CERTA = "senha-de-teste-nao-real";
const SENHA_ERRADA = "outra-senha-de-teste-errada";
const CONTEXTO = { ip: "203.0.113.7", userAgent: "jest-agent" };

function makeService(opts: { senhaConfigurada?: string | undefined } = { senhaConfigurada: SENHA_CERTA }) {
  const relogio = { agora: 1_000_000 };
  const prisma = {
    quote: { findFirst: jest.fn(), update: jest.fn() },
    nfseLiberacao: {
      create: jest.fn().mockResolvedValue({ id: "lib-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const nfseNacionalService = { emitir: jest.fn().mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" }) };
  const danfseNacionalPdfService = { gerar: jest.fn().mockResolvedValue(Buffer.from("PDF")) };
  const chatwootService = {
    sendOutgoingMessage: jest.fn().mockResolvedValue({}),
    sendAttachment: jest.fn().mockResolvedValue({}),
  };
  const configService = {
    get: jest.fn((chave: string) => (chave === NFSE_OVERRIDE_ENV ? opts.senhaConfigurada : undefined)),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  const service = Object.create(NfseService.prototype) as NfseService;
  (service as any).logger = logger;
  (service as any).prisma = prisma;
  (service as any).configService = configService;
  (service as any).nfseNacionalService = nfseNacionalService;
  (service as any).danfseNacionalPdfService = danfseNacionalPdfService;
  (service as any).chatwootService = chatwootService;
  (service as any).limitadorPorIp = new LimitadorFalhas(LIMITE_FALHAS_POR_IP.max, LIMITE_FALHAS_POR_IP.janelaMs, () => relogio.agora);
  (service as any).limitadorGlobal = new LimitadorFalhas(LIMITE_FALHAS_GLOBAL.max, LIMITE_FALHAS_GLOBAL.janelaMs, () => relogio.agora);
  const resolverTomadorQuote = jest.fn().mockResolvedValue({ idclienteAthos: null, documento: null, nome: null, endereco: null });
  (service as any).resolverTomadorQuote = resolverTomadorQuote;
  (service as any).parseXml = jest
    .fn()
    .mockReturnValue({ numeroNfse: "42", chaveAcesso: "CHV42", dataEmissao: new Date("2026-09-02T10:00:00Z"), valorServico: 100 });
  (service as any).storeXml = jest.fn().mockResolvedValue({ objectName: "obj/42.xml", publicUrl: "https://minio/obj/42.xml" });

  return { service, prisma, nfseNacionalService, configService, logger, relogio, resolverTomadorQuote };
}

function dtoCom(extra: Record<string, unknown> = {}, valorServico = 100) {
  return { codigoServico: "130501" as const, nomeTomador: "Nome Manual", cpfTomador: "11122233344", valorServico, ...extra };
}

async function capturar(promessa: Promise<unknown>): Promise<any> {
  try {
    await promessa;
  } catch (err) {
    return err;
  }
  throw new Error("Esperava uma excecao, mas a chamada terminou com sucesso.");
}

function tudoQueFoiGravadoOuLogado(m: ReturnType<typeof makeService>): string {
  return JSON.stringify([
    m.prisma.nfseLiberacao.create.mock.calls,
    m.prisma.nfseLiberacao.update.mock.calls,
    m.logger.log.mock.calls,
    m.logger.warn.mock.calls,
    m.logger.debug.mock.calls,
    m.logger.error.mock.calls,
  ]);
}

describe("NfseService.emitirQuoteNfseAutomatica - liberacao por senha (D-09)", () => {
  it("entrada 50% com senha certa e liberadoPor: emite; audita LIBERADO ANTES de emitir e depois grava o nfseNumero", async () => {
    const m = makeService();
    m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const resultado = await m.service.emitirQuoteNfseAutomatica(
      "26809",
      dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }, 120) as any,
      CONTEXTO,
    );

    expect(resultado.numero).toBe("42");
    expect(m.nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    expect(m.prisma.nfseLiberacao.create).toHaveBeenCalledTimes(1);
    expect(m.prisma.nfseLiberacao.create.mock.calls[0][0].data).toMatchObject({
      quoteId: "quote-26809",
      resultado: "LIBERADO",
      situacao: "PARCIAL",
      valorPago: 86.5,
      valorDevido: 173,
      valorNota: 120,
      liberadoPor: "Maria",
      ip: CONTEXTO.ip,
      userAgent: CONTEXTO.userAgent,
    });
    expect(m.prisma.nfseLiberacao.create.mock.invocationCallOrder[0]).toBeLessThan(
      m.nfseNacionalService.emitir.mock.invocationCallOrder[0],
    );
    expect(m.prisma.nfseLiberacao.update).toHaveBeenCalledWith({ where: { id: "lib-1" }, data: { nfseNumero: "42" } });
    expect(tudoQueFoiGravadoOuLogado(m)).not.toContain(SENHA_CERTA);
  });

  it("senha certa mas valorServico acima do devido (200 > 173): 422 VALOR_ACIMA_DO_PAGO e nada e emitido", async () => {
    const m = makeService();
    m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const erro = await capturar(
      m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }, 200) as any, CONTEXTO),
    );

    expect(erro.getStatus()).toBe(422);
    expect(erro.getResponse()).toMatchObject({ code: "VALOR_ACIMA_DO_PAGO", valorMaximo: 173 });
    expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
    expect(m.prisma.nfseLiberacao.create).not.toHaveBeenCalled();
  });

  it("sem pagamento algum e senha certa: libera ate o valor devido", async () => {
    const m = makeService();
    m.prisma.quote.findFirst.mockResolvedValue(quoteSemPagamento());

    await m.service.emitirQuoteNfseAutomatica(
      "26809",
      dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }, 173) as any,
      CONTEXTO,
    );

    expect(m.nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    expect(m.prisma.nfseLiberacao.create.mock.calls[0][0].data).toMatchObject({ situacao: "SEM_PAGAMENTO", valorPago: 0, valorDevido: 173 });
  });

  it("senha errada: 403 SENHA_LIBERACAO_INVALIDA, grava SENHA_INVALIDA, nao emite e conta a falha", async () => {
    const m = makeService();
    m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const erro = await capturar(
      m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_ERRADA, liberadoPor: "Maria" }) as any, CONTEXTO),
    );

    expect(erro.getStatus()).toBe(403);
    expect(erro.getResponse()).toMatchObject({ code: "SENHA_LIBERACAO_INVALIDA" });
    expect(m.prisma.nfseLiberacao.create).toHaveBeenCalledTimes(1);
    expect(m.prisma.nfseLiberacao.create.mock.calls[0][0].data).toMatchObject({ resultado: "SENHA_INVALIDA", ip: CONTEXTO.ip });
    expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
    expect((m.service as any).limitadorPorIp.tamanho()).toBe(1);
    expect(tudoQueFoiGravadoOuLogado(m)).not.toContain(SENHA_ERRADA);
  });

  it.each([undefined, "", "   "])("NFSE_OVERRIDE_PASSWORD ausente/vazia (%j): 403 LIBERACAO_NAO_CONFIGURADA mesmo com senha preenchida", async (configurada) => {
    const m = makeService({ senhaConfigurada: configurada });
    m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const erro = await capturar(
      m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: "qualquer", liberadoPor: "Maria" }) as any, CONTEXTO),
    );

    expect(erro.getStatus()).toBe(403);
    expect(erro.getResponse()).toMatchObject({ code: "LIBERACAO_NAO_CONFIGURADA" });
    expect(m.prisma.nfseLiberacao.create.mock.calls[0][0].data).toMatchObject({ resultado: "NAO_CONFIGURADA" });
    expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])("senha informada com liberadoPor %j: 400 LIBERADO_POR_OBRIGATORIO e nada e gravado ou emitido", async (liberadoPor) => {
    const m = makeService();
    m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const erro = await capturar(
      m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor }) as any, CONTEXTO),
    );

    expect(erro.getStatus()).toBe(400);
    expect(erro.getResponse()).toMatchObject({ code: "LIBERADO_POR_OBRIGATORIO" });
    expect(m.prisma.nfseLiberacao.create).not.toHaveBeenCalled();
    expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
  });

  it("sem senha no corpo: 403 PAGAMENTO_INTEGRAL_NAO_CONFIRMADO e nenhuma auditoria (nao e tentativa de senha)", async () => {
    const m = makeService();
    m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());

    const erro = await capturar(m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ liberadoPor: "Maria" }) as any, CONTEXTO));

    expect(erro.getStatus()).toBe(403);
    expect(erro.getResponse()).toMatchObject({ code: "PAGAMENTO_INTEGRAL_NAO_CONFIRMADO", situacao: "PARCIAL" });
    expect(m.prisma.nfseLiberacao.create).not.toHaveBeenCalled();
  });

  describe("limitador de forca bruta", () => {
    async function errarCincoVezes(m: ReturnType<typeof makeService>) {
      for (let i = 0; i < 5; i += 1) {
        const erro = await capturar(
          m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_ERRADA, liberadoPor: "Maria" }) as any, CONTEXTO),
        );
        expect(erro.getResponse()).toMatchObject({ code: "SENHA_LIBERACAO_INVALIDA" });
      }
    }

    it("apos 5 senhas erradas do mesmo IP, a sexta (ainda que certa) da 429 LIBERACAO_BLOQUEADA e audita BLOQUEADO", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      await errarCincoVezes(m);

      const erro = await capturar(
        m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any, CONTEXTO),
      );

      expect(erro.getStatus()).toBe(429);
      expect(erro.getResponse()).toMatchObject({ code: "LIBERACAO_BLOQUEADA" });
      expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
      const ultima = m.prisma.nfseLiberacao.create.mock.calls.at(-1)![0].data;
      expect(ultima.resultado).toBe("BLOQUEADO");
    });

    it("com o relogio alem de 15 minutos volta a funcionar", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      await errarCincoVezes(m);

      m.relogio.agora += 15 * 60 * 1000 + 1;
      await m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any, CONTEXTO);

      expect(m.nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    });

    it("sucesso zera a contagem do IP", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      for (let i = 0; i < 4; i += 1) {
        await capturar(
          m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_ERRADA, liberadoPor: "Maria" }) as any, CONTEXTO),
        );
      }
      await m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any, CONTEXTO);

      expect((m.service as any).limitadorPorIp.bloqueado(CONTEXTO.ip)).toBe(false);
      expect((m.service as any).limitadorPorIp.tamanho()).toBe(0);
    });

    it("20 falhas globais (IPs diferentes) bloqueiam qualquer origem, mesmo com a senha certa", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      for (let i = 0; i < 20; i += 1) {
        await capturar(
          m.service.emitirQuoteNfseAutomatica(
            "26809",
            dtoCom({ senhaLiberacao: SENHA_ERRADA, liberadoPor: "Maria" }) as any,
            { ip: `198.51.100.${i + 1}`, userAgent: "x" },
          ),
        );
      }

      const erro = await capturar(
        m.service.emitirQuoteNfseAutomatica(
          "26809",
          dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any,
          { ip: "192.0.2.99", userAgent: "x" },
        ),
      );

      expect(erro.getStatus()).toBe(429);
      expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
    });
  });

  describe("auditoria fail-closed", () => {
    it("create LIBERADO falhando: a emissao e abortada (nao existe liberacao sem rastro)", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      m.prisma.nfseLiberacao.create.mockRejectedValue(new Error("banco fora do ar"));

      const erro = await capturar(
        m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any, CONTEXTO),
      );

      expect(erro.getStatus()).toBe(500);
      expect(erro.getResponse()).toMatchObject({ code: "LIBERACAO_NAO_AUDITADA" });
      expect(m.nfseNacionalService.emitir).not.toHaveBeenCalled();
      expect(m.prisma.quote.update).not.toHaveBeenCalled();
    });

    it("create falhando para SENHA_INVALIDA: so um warn, a resposta 403 normal e mantida", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      m.prisma.nfseLiberacao.create.mockRejectedValue(new Error("banco fora do ar"));

      const erro = await capturar(
        m.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_ERRADA, liberadoPor: "Maria" }) as any, CONTEXTO),
      );

      expect(erro.getStatus()).toBe(403);
      expect(erro.getResponse()).toMatchObject({ code: "SENHA_LIBERACAO_INVALIDA" });
      expect(m.logger.warn).toHaveBeenCalled();
      expect(tudoQueFoiGravadoOuLogado(m)).not.toContain(SENHA_ERRADA);
    });

    it("create falhando para NAO_CONFIGURADA e para BLOQUEADO: so warn, 403/429 mantidos", async () => {
      const semConfig = makeService({ senhaConfigurada: undefined });
      semConfig.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      semConfig.prisma.nfseLiberacao.create.mockRejectedValue(new Error("x"));
      const e1 = await capturar(
        semConfig.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: "a", liberadoPor: "Maria" }) as any, CONTEXTO),
      );
      expect(e1.getStatus()).toBe(403);

      const bloq = makeService();
      bloq.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      for (let i = 0; i < 5; i += 1) (bloq.service as any).limitadorPorIp.registrarFalha(CONTEXTO.ip);
      bloq.prisma.nfseLiberacao.create.mockRejectedValue(new Error("x"));
      const e2 = await capturar(
        bloq.service.emitirQuoteNfseAutomatica("26809", dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any, CONTEXTO),
      );
      expect(e2.getStatus()).toBe(429);
      expect(bloq.logger.warn).toHaveBeenCalled();
    });

    it("update do nfseNumero falhando e best-effort: a emissao continua com sucesso", async () => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(quoteEntrada50Pix());
      m.prisma.nfseLiberacao.update.mockRejectedValue(new Error("x"));

      const resultado = await m.service.emitirQuoteNfseAutomatica(
        "26809",
        dtoCom({ senhaLiberacao: SENHA_CERTA, liberadoPor: "Maria" }) as any,
        CONTEXTO,
      );

      expect(resultado.numero).toBe("42");
      expect(m.logger.warn).toHaveBeenCalled();
    });
  });

  describe("pagamento integral ou caixa ignora a senha", () => {
    it.each([
      ["PIX integral (#26809)", () => quotePagoPix26809(), 164.35],
      ["caixa", () => quotePagoCaixa(), 173],
    ])("%s: nao consulta a senha nem grava auditoria mesmo com senhaLiberacao no corpo", async (_nome, fabrica, valor) => {
      const m = makeService();
      m.prisma.quote.findFirst.mockResolvedValue(fabrica());

      await m.service.emitirQuoteNfseAutomatica(
        "26809",
        dtoCom({ senhaLiberacao: SENHA_ERRADA, liberadoPor: "Maria" }, valor) as any,
        CONTEXTO,
      );

      expect(m.nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
      expect(m.configService.get).not.toHaveBeenCalledWith(NFSE_OVERRIDE_ENV);
      expect(m.prisma.nfseLiberacao.create).not.toHaveBeenCalled();
      expect((m.service as any).limitadorPorIp.tamanho()).toBe(0);
    });
  });
});
