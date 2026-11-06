import { BaixaAthosError } from "../integrations/athos/athos-conta-receber-baixa.service";
import {
  CobrancaBaixaAthosService,
  extrairDadosPagamentoEfi,
  resolverConfigBaixaAthos,
} from "./cobranca-baixa-athos.service";

// Servico de baixa mockado por completo: nenhum pg, nenhuma rede (D-07).

function montar(env: Record<string, string | undefined> = {}, boleto?: unknown) {
  const boletoPadrao =
    boleto === undefined
      ? {
          id: 7,
          status: "pago",
          idclienteAthos: 2641,
          titulos: [
            { idcontareceber: 1363, valor: "29.00" },
            { idcontareceber: 1364, valor: "10.50" },
          ],
        }
      : boleto;
  const prisma = { cobrancaBoleto: { findUnique: jest.fn().mockResolvedValue(boletoPadrao) } };
  const baixaService = {
    baixarTitulos: jest.fn().mockResolvedValue({
      simulado: false,
      resultado: "baixado",
      retroativa: false,
      dataPagamento: "2026-11-06",
      titulos: [],
      valorTotal: 39.5,
    }),
  };
  const config = { get: jest.fn((k: string) => env[k]) };
  const service = new CobrancaBaixaAthosService(prisma as any, baixaService as any, config as any);
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).logger = logger;
  return { service, prisma, baixaService, config, logger };
}

describe("CobrancaBaixaAthosService.executarAposPagamento", () => {
  it("1. ATHOS_BAIXA_AUTO=false -> desligado e baixarTitulos nunca chamado", async () => {
    const { service, baixaService, prisma } = montar({ ATHOS_BAIXA_AUTO: "false" });
    const r = await service.executarAposPagamento(7, { origem: "webhook" });
    expect(r.status).toBe("desligado");
    expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
    expect(prisma.cobrancaBoleto.findUnique).not.toHaveBeenCalled();
  });

  it("2. qualquer outro valor de ATHOS_BAIXA_AUTO (vazio, true, ausente) -> ligado", async () => {
    for (const valor of ["", "true", undefined, "FALSE", "0"]) {
      const { service, baixaService } = montar({ ATHOS_BAIXA_AUTO: valor });
      const r = await service.executarAposPagamento(7, { origem: "webhook" });
      expect(r.status).toBe("baixado");
      expect(baixaService.baixarTitulos).toHaveBeenCalledTimes(1);
    }
  });

  it("3. boleto inexistente ou nao pago -> ignorado", async () => {
    const a = montar({}, null);
    expect((await a.service.executarAposPagamento(7, { origem: "webhook" })).status).toBe("ignorado");
    expect(a.baixaService.baixarTitulos).not.toHaveBeenCalled();

    const b = montar({}, { id: 7, status: "pendente", idclienteAthos: 1, titulos: [] });
    expect((await b.service.executarAposPagamento(7, { origem: "webhook" })).status).toBe("ignorado");
    expect(b.baixaService.baixarTitulos).not.toHaveBeenCalled();
  });

  it("4. baixarTitulos lanca BaixaAthosError -> falha, codigo preservado, logger.error, sem relancar", async () => {
    const { service, baixaService, logger } = montar();
    baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError("PERMISSAO_NEGADA", "sem GRANT"));
    const r = await service.executarAposPagamento(7, { origem: "reconciliacao" });
    expect(r.status).toBe("falha");
    expect(r.codigo).toBe("PERMISSAO_NEGADA");
    expect(logger.error).toHaveBeenCalledTimes(1);
    const msg = logger.error.mock.calls[0][0] as string;
    expect(msg).toContain("cobrancaId=7");
    expect(msg).toContain("1363,1364");
    expect(msg).toContain("PERMISSAO_NEGADA");
    expect(msg).toContain("reconciliacao");
  });

  it("5. erro inesperado (Error generico, Prisma indisponivel) -> falha e nao lanca", async () => {
    const { service, prisma, baixaService } = montar();
    prisma.cobrancaBoleto.findUnique.mockRejectedValue(new Error("prisma fora do ar"));
    await expect(service.executarAposPagamento(7, { origem: "webhook" })).resolves.toMatchObject({
      status: "falha",
      codigo: "ERRO_INESPERADO",
    });

    baixaService.baixarTitulos.mockRejectedValue(new Error("boom"));
    prisma.cobrancaBoleto.findUnique.mockResolvedValue({ id: 7, status: "pago", idclienteAthos: 1, titulos: [] });
    await expect(service.executarAposPagamento(7, { origem: "webhook" })).resolves.toMatchObject({
      status: "falha",
    });
  });

  it("6. payloadEfi com payment.paid_at valido -> baixarTitulos recebe essa data; sem data -> hoje", async () => {
    const a = montar();
    await a.service.executarAposPagamento(7, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: "2026-11-05 14:20:00" } },
    });
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].dataPagamento).toBe("2026-11-05");
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].titulos).toEqual([
      { idcontareceber: 1363, valorEsperado: 29 },
      { idcontareceber: 1364, valorEsperado: 10.5 },
    ]);
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].idclienteAthos).toBe(2641);

    const b = montar();
    await b.service.executarAposPagamento(7, { origem: "webhook" });
    expect(b.baixaService.baixarTitulos.mock.calls[0][0].dataPagamento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("7. env invalida (ATHOS_BAIXA_ID_LIVRO_REGISTRO=abc) -> falha CONFIG_INVALIDA sem chamar baixarTitulos", async () => {
    const { service, baixaService } = montar({ ATHOS_BAIXA_ID_LIVRO_REGISTRO: "abc" });
    const r = await service.executarAposPagamento(7, { origem: "webhook" });
    expect(r.status).toBe("falha");
    expect(r.codigo).toBe("CONFIG_INVALIDA");
    expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
  });

  it("7b. constantes padrao 10/2/1 e custom por env chegam ao servico", async () => {
    const a = montar();
    await a.service.executarAposPagamento(7, { origem: "webhook" });
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].constantes).toEqual({
      idFormaPagamento: 10,
      idLivroRegistro: 2,
      idFuncionario: 1,
      percentualMulta: 2,
    });
    const b = montar({
      ATHOS_BAIXA_ID_FORMA_PAGAMENTO: "12",
      ATHOS_BAIXA_ID_LIVRO_REGISTRO: "1",
      ATHOS_BAIXA_ID_FUNCIONARIO: "3",
    });
    await b.service.executarAposPagamento(7, { origem: "webhook" });
    expect(b.baixaService.baixarTitulos.mock.calls[0][0].constantes).toEqual({
      idFormaPagamento: 12,
      idLivroRegistro: 1,
      idFuncionario: 3,
      percentualMulta: 2,
    });
  });

  it("7c. ATHOS_BAIXA_MULTA_PERCENTUAL configura a multa; invalida -> CONFIG_INVALIDA", async () => {
    const a = montar({ ATHOS_BAIXA_MULTA_PERCENTUAL: "3,5" });
    await a.service.executarAposPagamento(7, { origem: "webhook" });
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].constantes.percentualMulta).toBe(3.5);
    for (const v of ["abc", "-1", "101", "2%"]) {
      const b = montar({ ATHOS_BAIXA_MULTA_PERCENTUAL: v });
      const r = await b.service.executarAposPagamento(7, { origem: "webhook" });
      expect(r.codigo).toBe("CONFIG_INVALIDA");
      expect(b.baixaService.baixarTitulos).not.toHaveBeenCalled();
    }
  });

  it("10. executarAposPagamento repassa valorPagoEfi (centavos -> reais) ao baixarTitulos; sem payload repassa null", async () => {
    const a = montar();
    await a.service.executarAposPagamento(7, { origem: "webhook", payloadEfi: { payment: { paid_value: 46765 } } });
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].valorPagoEfi).toBe(467.65);

    const b = montar();
    await b.service.executarAposPagamento(7, { origem: "reconciliacao" });
    expect(b.baixaService.baixarTitulos.mock.calls[0][0].valorPagoEfi).toBeNull();
  });

  it("11. log de sucesso contem fonteData e fonteValor e nao contem nome de cliente", async () => {
    const { service, logger } = montar();
    await service.executarAposPagamento(7, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: "2026-11-05", paid_value: 3950 }, customer: { name: "FULANO DE TAL" } },
    });
    const msg = logger.log.mock.calls.map((c: unknown[]) => c[0] as string).join(" ");
    expect(msg).toContain("fonteData=payment.paid_at");
    expect(msg).toContain("fonteValor=payment.paid_value");
    expect(msg).not.toContain("FULANO");
  });
});

describe("resolverConfigBaixaAthos", () => {
  it("valores nao inteiros positivos lancam CONFIG_INVALIDA", () => {
    for (const v of ["0", "-1", "1.5", "abc", "10x"]) {
      expect(() => resolverConfigBaixaAthos((k) => (k === "ATHOS_BAIXA_ID_FUNCIONARIO" ? v : undefined))).toThrow(
        BaixaAthosError,
      );
    }
  });
});

describe("extrairDadosPagamentoEfi", () => {
  const HOJE = "2026-11-06";
  const SEM_VALOR = { valorPago: null, fonteValor: "nao_informado" };

  it("8a. payment.paid_at ISO com Z converte para America/Sao_Paulo", () => {
    expect(extrairDadosPagamentoEfi({ payment: { paid_at: "2026-11-05T02:30:00.000Z" } }, HOJE)).toEqual({
      dataPagamento: "2026-11-04",
      fonteData: "payment.paid_at",
      ...SEM_VALOR,
    });
  });

  it("8b. payment.received_by_bank_at sem fuso usa a parte de data", () => {
    expect(extrairDadosPagamentoEfi({ payment: { received_by_bank_at: "2026-11-05 20:24:20" } }, HOJE)).toEqual({
      dataPagamento: "2026-11-05",
      fonteData: "payment.received_by_bank_at",
      ...SEM_VALOR,
    });
  });

  it("8c. paid_at na raiz funciona e aceita array (primeiro item)", () => {
    expect(extrairDadosPagamentoEfi({ paid_at: "2026-11-03" }, HOJE)).toEqual({
      dataPagamento: "2026-11-03",
      fonteData: "paid_at",
      ...SEM_VALOR,
    });
    expect(extrairDadosPagamentoEfi([{ payment: { paid_at: "2026-11-02T15:00:00-03:00" } }], HOJE)).toEqual({
      dataPagamento: "2026-11-02",
      fonteData: "payment.paid_at",
      ...SEM_VALOR,
    });
  });

  it("8d. ausente, lixo ou null -> fallback_hoje", () => {
    const fallback = { dataPagamento: null, fonteData: "fallback_hoje", ...SEM_VALOR };
    expect(extrairDadosPagamentoEfi(undefined, HOJE)).toEqual(fallback);
    expect(extrairDadosPagamentoEfi(null, HOJE)).toEqual(fallback);
    expect(extrairDadosPagamentoEfi("texto", HOJE)).toEqual(fallback);
    expect(extrairDadosPagamentoEfi([], HOJE)).toEqual(fallback);
    expect(extrairDadosPagamentoEfi({ payment: { paid_at: "lixo" } }, HOJE)).toEqual(fallback);
    expect(extrairDadosPagamentoEfi({ payment: { paid_at: 12345 } }, HOJE)).toEqual(fallback);
    expect(extrairDadosPagamentoEfi({ payment: { paid_at: "2026-13-45" } }, HOJE)).toEqual(fallback);
  });

  it("8e. data futura e limitada a hoje", () => {
    expect(extrairDadosPagamentoEfi({ payment: { paid_at: "2026-12-25" } }, HOJE)).toEqual({
      dataPagamento: HOJE,
      fonteData: "payment.paid_at",
      ...SEM_VALOR,
    });
  });

  it("8f. paid_at invalido cai para a proxima fonte valida", () => {
    expect(
      extrairDadosPagamentoEfi({ payment: { paid_at: "lixo", received_by_bank_at: "2026-11-04 10:00:00" } }, HOJE),
    ).toEqual({ dataPagamento: "2026-11-04", fonteData: "payment.received_by_bank_at", ...SEM_VALOR });
  });

  it("9. payment.paid_value em centavos -> reais; ausente, zero, negativo, texto ou nao inteiro -> null", () => {
    const com = extrairDadosPagamentoEfi({ payment: { paid_at: "2026-11-05", paid_value: 45700 } }, HOJE);
    expect(com).toEqual({
      dataPagamento: "2026-11-05",
      fonteData: "payment.paid_at",
      valorPago: 457,
      fonteValor: "payment.paid_value",
    });
    // valor sem data ainda e extraido
    expect(extrairDadosPagamentoEfi({ payment: { paid_value: 25882 } }, HOJE)).toEqual({
      dataPagamento: null,
      fonteData: "fallback_hoje",
      valorPago: 258.82,
      fonteValor: "payment.paid_value",
    });
    for (const ruim of [undefined, 0, -100, "45700", "abc", 457.5, Number.NaN, null]) {
      const r = extrairDadosPagamentoEfi({ payment: { paid_at: "2026-11-05", paid_value: ruim } }, HOJE);
      expect(r.valorPago).toBeNull();
      expect(r.fonteValor).toBe("nao_informado");
    }
  });
});
