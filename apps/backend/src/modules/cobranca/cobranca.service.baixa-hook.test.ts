import { BadRequestException } from "@nestjs/common";
import { CobrancaService } from "./cobranca.service";

// Gancho da baixa Athos no CobrancaService. Sem pg, axios mockado (D-07).
jest.mock("axios");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const axios = require("axios");

function montar(opts: {
  boleto?: { id: number; status: string; txidEfi?: string } | null;
  notificacao?: { charge_id?: number; status?: string };
  cobrancaEfi?: unknown | Error;
  baixaRejeita?: boolean;
}) {
  const boleto = opts.boleto === undefined ? { id: 7, status: "pendente", txidEfi: "9001" } : opts.boleto;

  const get = jest.fn(async (url: string) => {
    if (url.startsWith("/v1/notification/")) {
      return { data: { data: { charge: opts.notificacao ?? { charge_id: 9001, status: "paid" } } } };
    }
    if (url.startsWith("/v1/charge/")) {
      if (opts.cobrancaEfi instanceof Error) throw opts.cobrancaEfi;
      return { data: { data: opts.cobrancaEfi } };
    }
    throw new Error(`url inesperada ${url}`);
  });
  const post = jest.fn(async () => ({ data: { access_token: "tok" } }));
  axios.create = jest.fn(() => ({ post, get }));

  const prisma = {
    cobrancaBoleto: {
      findFirst: jest.fn().mockResolvedValue(boleto),
      findUnique: jest.fn().mockResolvedValue(boleto),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const baixaAthos = {
    executarAposPagamento: opts.baixaRejeita
      ? jest.fn().mockRejectedValue(new Error("explodiu"))
      : jest.fn().mockResolvedValue({ status: "baixado" }),
  };
  const config = {
    get: jest.fn((k: string) => (k === "EFI_CLIENT_ID" ? "id-ficticio" : k === "EFI_CLIENT_SECRET" ? "seg-ficticio" : undefined)),
  };

  const service = Object.create(CobrancaService.prototype) as CobrancaService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).prisma = prisma;
  (service as any).config = config;
  (service as any).baixaAthos = baixaAthos;
  return { service, prisma, baixaAthos, get, logger: (service as any).logger };
}

describe("CobrancaService - gancho da baixa Athos", () => {
  describe("processarNotificacaoEFI", () => {
    it("H1. paid: busca a cobranca na EFI e repassa o payload bruto (data real do pagamento)", async () => {
      const payload = { payment: { paid_at: "2026-11-05T15:00:00.000Z" } };
      const { service, baixaAthos, get } = montar({ cobrancaEfi: payload });
      await service.processarNotificacaoEFI("tok");
      expect(get.mock.calls.some((c) => (c[0] as string) === "/v1/charge/9001")).toBe(true);
      expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
      const [id, ctx] = baixaAthos.executarAposPagamento.mock.calls[0];
      expect(id).toBe(7);
      expect(ctx.origem).toBe("webhook");
      expect(ctx.payloadEfi.payment.paid_at).toBe("2026-11-05T15:00:00.000Z");
    });

    it("H1b. falha na consulta da cobranca -> gancho ainda chamado com payloadEfi indefinido", async () => {
      const { service, baixaAthos, logger } = montar({ cobrancaEfi: new Error("timeout EFI") });
      await expect(service.processarNotificacaoEFI("tok")).resolves.toBeUndefined();
      expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
      expect(baixaAthos.executarAposPagamento.mock.calls[0][1].payloadEfi).toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it("H2. baixaAthos lancando excecao -> webhook resolve e pago foi gravado 1 vez", async () => {
      const { service, prisma, logger } = montar({ cobrancaEfi: {}, baixaRejeita: true });
      await expect(service.processarNotificacaoEFI("tok")).resolves.toBeUndefined();
      expect(prisma.cobrancaBoleto.update).toHaveBeenCalledTimes(1);
      expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: "pago" } });
      expect(logger.error).toHaveBeenCalled();
    });

    it("H3. boleto ja pago ou status diferente de paid -> gancho NAO chamado", async () => {
      const a = montar({ boleto: { id: 7, status: "pago", txidEfi: "9001" }, cobrancaEfi: {} });
      await a.service.processarNotificacaoEFI("tok");
      expect(a.baixaAthos.executarAposPagamento).not.toHaveBeenCalled();
      expect(a.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();

      const b = montar({ notificacao: { charge_id: 9001, status: "waiting" }, cobrancaEfi: {} });
      await b.service.processarNotificacaoEFI("tok");
      expect(b.baixaAthos.executarAposPagamento).not.toHaveBeenCalled();
      expect(b.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    });

    it("H7. payload da EFI em array -> gancho recebe o primeiro item", async () => {
      const { service, baixaAthos } = montar({ cobrancaEfi: [{ payment: { paid_at: "2026-11-04" } }, { x: 1 }] });
      await service.processarNotificacaoEFI("tok");
      expect(baixaAthos.executarAposPagamento.mock.calls[0][1].payloadEfi).toEqual({
        payment: { paid_at: "2026-11-04" },
      });
    });
  });

  describe("verificarPagamentoBoleto", () => {
    it("H4. EFI paid -> update pago, gancho com origem reconciliacao e payload bruto; retorno inalterado", async () => {
      const payload = { status: "paid", payment: { paid_at: "2026-11-05T15:00:00.000Z" } };
      const { service, prisma, baixaAthos } = montar({ cobrancaEfi: payload });
      const r = await service.verificarPagamentoBoleto(7);
      expect(r).toEqual({ status: "pago", atualizado: true });
      expect(prisma.cobrancaBoleto.update).toHaveBeenCalledTimes(1);
      expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
      const [id, ctx] = baixaAthos.executarAposPagamento.mock.calls[0];
      expect(id).toBe(7);
      expect(ctx.origem).toBe("reconciliacao");
      expect(ctx.payloadEfi).toBe(payload);
    });

    it("H5. EFI canceled ou waiting -> gancho NAO chamado", async () => {
      const a = montar({ cobrancaEfi: { status: "canceled" } });
      expect(await a.service.verificarPagamentoBoleto(7)).toEqual({ status: "cancelado", atualizado: true });
      expect(a.baixaAthos.executarAposPagamento).not.toHaveBeenCalled();

      const b = montar({ cobrancaEfi: { status: "waiting" } });
      expect(await b.service.verificarPagamentoBoleto(7)).toEqual({ status: "pendente", atualizado: false });
      expect(b.baixaAthos.executarAposPagamento).not.toHaveBeenCalled();
    });

    it("H5b. boleto ja pago e EFI paid -> sem atualizacao e sem gancho", async () => {
      const { service, baixaAthos } = montar({
        boleto: { id: 7, status: "pago", txidEfi: "9001" },
        cobrancaEfi: { status: "paid" },
      });
      expect(await service.verificarPagamentoBoleto(7)).toEqual({ status: "pago", atualizado: false });
      expect(baixaAthos.executarAposPagamento).not.toHaveBeenCalled();
    });

    it("H6. gancho lancando excecao -> retorno inalterado e sem excecao", async () => {
      const { service } = montar({ cobrancaEfi: { status: "paid" }, baixaRejeita: true });
      await expect(service.verificarPagamentoBoleto(7)).resolves.toEqual({ status: "pago", atualizado: true });
    });

    it("H7b. payload em array na reconciliacao -> primeiro item", async () => {
      const { service, baixaAthos } = montar({ cobrancaEfi: [{ status: "paid", paid_at: "2026-11-04" }] });
      await service.verificarPagamentoBoleto(7);
      expect(baixaAthos.executarAposPagamento.mock.calls[0][1].payloadEfi).toEqual({
        status: "paid",
        paid_at: "2026-11-04",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Plano 43-03 - guardas de cancelamento/remocao e campos do painel (T-43-20, BX-07)
// ---------------------------------------------------------------------------

describe("CobrancaService - boleto baixado no Athos (plano 43-03)", () => {
  function montarGuarda(boleto: Record<string, unknown> | null) {
    const prisma = {
      cobrancaBoleto: {
        findUnique: jest.fn().mockResolvedValue(boleto),
        findMany: jest.fn().mockResolvedValue(boleto ? [boleto] : []),
        delete: jest.fn().mockResolvedValue({}),
      },
      cobrancaBoletoTitulo: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      nfseEmitidaTitulo: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const post = jest.fn(async () => ({ data: { access_token: "tok" } }));
    const put = jest.fn(async () => ({ data: { code: 200 } }));
    axios.create = jest.fn(() => ({ post, get: jest.fn(), put }));
    const service = Object.create(CobrancaService.prototype) as CobrancaService;
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = prisma;
    (service as any).config = {
      get: jest.fn((k: string) =>
        k === "EFI_CLIENT_ID" ? "id-ficticio" : k === "EFI_CLIENT_SECRET" ? "seg-ficticio" : undefined,
      ),
    };
    (service as any).athosService = {
      buscarNomesClientes: jest.fn().mockResolvedValue([{ idcliente: 2641, nome_cliente: "Cliente Teste" }]),
    };
    return { service, prisma, post, put };
  }

  const base = {
    id: 7,
    idclienteAthos: 2641,
    status: "pago",
    valor: 39.5,
    txidEfi: "9001",
    expireAt: "2026-11-30",
    linkBoleto: null,
    criadoEm: new Date("2026-11-01T00:00:00Z"),
    titulos: [{ idcontareceber: 1363 }],
  };

  it("G1. cancelarBoleto de boleto baixado -> BadRequestException, sem tocar EFI nem banco; demais status seguem o fluxo", async () => {
    const a = montarGuarda({ ...base, athosBaixaStatus: "baixado" });
    await expect(a.service.cancelarBoleto(7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(a.service.cancelarBoleto(7)).rejects.toThrow(/estorne a baixa/i);
    expect(a.post).not.toHaveBeenCalled();
    expect(a.put).not.toHaveBeenCalled();
    expect(a.prisma.cobrancaBoletoTitulo.deleteMany).not.toHaveBeenCalled();
    expect(a.prisma.cobrancaBoleto.delete).not.toHaveBeenCalled();

    for (const st of [null, undefined, "falha", "pendente", "estornado", "ja_baixado"]) {
      const b = montarGuarda({ ...base, athosBaixaStatus: st });
      await expect(b.service.cancelarBoleto(7)).resolves.toMatchObject({ ok: true });
      expect(b.prisma.cobrancaBoleto.delete).toHaveBeenCalledTimes(1);
    }
  });

  it("G2. removerBoletoBanco idem", async () => {
    const a = montarGuarda({ ...base, athosBaixaStatus: "baixado" });
    await expect(a.service.removerBoletoBanco(7)).rejects.toBeInstanceOf(BadRequestException);
    expect(a.prisma.cobrancaBoletoTitulo.deleteMany).not.toHaveBeenCalled();
    expect(a.prisma.cobrancaBoleto.delete).not.toHaveBeenCalled();

    for (const st of [null, "falha", "pendente", "estornado"]) {
      const b = montarGuarda({ ...base, athosBaixaStatus: st });
      await expect(b.service.removerBoletoBanco(7)).resolves.toEqual({ ok: true });
      expect(b.prisma.cobrancaBoleto.delete).toHaveBeenCalledTimes(1);
    }
  });

  it("G3. buscarBoletosDashboard devolve athosBaixaStatus, codigo e mensagem de erro (nulos quando ausentes)", async () => {
    const { service, prisma } = montarGuarda(null);
    prisma.cobrancaBoleto.findMany.mockResolvedValue([
      {
        ...base,
        id: 1,
        athosBaixaStatus: "falha",
        athosBaixaErroCodigo: "VALOR_DIVERGENTE",
        athosBaixaErroMensagem: "valor diverge",
      },
      { ...base, id: 2 },
    ]);
    const r = await service.buscarBoletosDashboard();
    const um = r.find((x) => x.id === 1);
    const dois = r.find((x) => x.id === 2);
    expect(um).toMatchObject({
      athosBaixaStatus: "falha",
      athosBaixaErroCodigo: "VALOR_DIVERGENTE",
      athosBaixaErroMensagem: "valor diverge",
    });
    expect(dois).toMatchObject({ athosBaixaStatus: null, athosBaixaErroCodigo: null, athosBaixaErroMensagem: null });
  });
});

// ---------------------------------------------------------------------------
// Plano 50-05 - alerta de pagamento do boleto original ja cancelado (D-15)
// ---------------------------------------------------------------------------

describe("CobrancaService - pagamento de boleto cancelado e substituido (plano 50-05, D-15)", () => {
  const CANCELADO = { id: 41, status: "cancelado", txidEfi: "9001" };

  function montarCancelado(opts: {
    sucessor?: { id: number; status: string } | null | Error;
    cobrancaEfi?: unknown;
    notificacao?: { charge_id?: number; status?: string };
  }) {
    const ctx = montar({
      boleto: CANCELADO,
      cobrancaEfi: opts.cobrancaEfi ?? { status: "paid" },
      notificacao: opts.notificacao,
    });
    const findFirst = ctx.prisma.cobrancaBoleto.findFirst as jest.Mock;
    findFirst.mockReset();
    // Webhook: 1a chamada acha o boleto pelo txid; 2a procura o sucessor ativo. Verificar: so o sucessor.
    findFirst.mockResolvedValueOnce(CANCELADO);
    if (opts.sucessor instanceof Error) findFirst.mockRejectedValueOnce(opts.sucessor);
    else findFirst.mockResolvedValueOnce(opts.sucessor === undefined ? null : opts.sucessor);
    return ctx;
  }

  function avisos(logger: Record<string, jest.Mock>): string {
    return logger.warn.mock.calls.map((c) => String(c[0])).join("\n");
  }

  it("D1. webhook paid em boleto cancelado com sucessor ativo: grava pago so no original, alerta e baixa normal", async () => {
    const { service, prisma, baixaAthos, logger } = montarCancelado({
      sucessor: { id: 42, status: "pendente" },
    });

    await service.processarNotificacaoEFI("tok");

    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledTimes(1);
    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { status: "pago" } });
    expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
    expect(baixaAthos.executarAposPagamento.mock.calls[0][0]).toBe(41);
    const warn = avisos(logger);
    expect(warn).toContain("41");
    expect(warn).toContain("42");
    expect(warn).toContain("ALERTA pagamento em dobro possivel");
    const consultaSucessor = (prisma.cobrancaBoleto.findFirst as jest.Mock).mock.calls[1][0];
    expect(consultaSucessor.where).toEqual({ boletoOrigemId: 41, status: { not: "cancelado" } });
  });

  it("D2. Verificar: status local cancelado e EFI paid -> pago, alerta emitido e gancho chamado", async () => {
    const { service, prisma, baixaAthos, logger } = montar({
      boleto: CANCELADO,
      cobrancaEfi: { status: "paid" },
    });
    (prisma.cobrancaBoleto.findFirst as jest.Mock).mockReset().mockResolvedValue({ id: 42, status: "pendente" });

    const r = await service.verificarPagamentoBoleto(41);

    expect(r).toEqual({ status: "pago", atualizado: true });
    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledTimes(1);
    expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
    expect(avisos(logger)).toContain("reconciliacao");
    expect(avisos(logger)).toContain("42");
  });

  it("D3. original cancelado pago SEM sucessor ativo: sem aviso de pagamento em dobro", async () => {
    const { service, baixaAthos, logger } = montarCancelado({ sucessor: null });

    await service.processarNotificacaoEFI("tok");

    expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
    expect(avisos(logger)).not.toContain("pagamento em dobro");
  });

  it("D3b. boleto pendente pago (caso comum) nao consulta sucessor nem alerta", async () => {
    const { service, prisma, logger } = montar({ cobrancaEfi: {} });

    await service.processarNotificacaoEFI("tok");

    expect(prisma.cobrancaBoleto.findFirst).toHaveBeenCalledTimes(1);
    expect(avisos(logger)).not.toContain("pagamento em dobro");
  });

  it("D4. consulta do sucessor rejeita: webhook resolve, pago gravado, baixa chamada e erro logado", async () => {
    const { service, prisma, baixaAthos, logger } = montarCancelado({
      sucessor: new Error("banco fora"),
    });

    await expect(service.processarNotificacaoEFI("tok")).resolves.toBeUndefined();

    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { status: "pago" } });
    expect(baixaAthos.executarAposPagamento).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
    const erro = logger.error.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(erro).toContain("41");
  });
});
