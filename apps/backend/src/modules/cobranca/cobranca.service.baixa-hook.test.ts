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
