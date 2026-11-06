import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from "@nestjs/common";
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
  const prisma = {
    cobrancaBoleto: {
      findUnique: jest.fn().mockResolvedValue(boletoPadrao),
      update: jest.fn().mockResolvedValue({}),
    },
    cobrancaBaixaAthosLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const baixaService = {
    baixarTitulos: jest.fn().mockResolvedValue({
      simulado: false,
      resultado: "baixado",
      retroativa: false,
      dataPagamento: "2026-11-06",
      titulos: [],
      valorTotal: 39.5,
    }),
    estornarBaixa: jest.fn().mockResolvedValue({
      simulado: false,
      titulos: [{ idcontareceber: 1363, idcontarecebida: 501, principal: 29, valorPago: 29, statusFinal: "AVC" }],
      valorTotal: 29,
    }),
  };
  const config = { get: jest.fn((k: string) => env[k]) };
  const service = new CobrancaBaixaAthosService(prisma as any, baixaService as any, config as any);
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).logger = logger;
  return { service, prisma, baixaService, config, logger };
}

describe("CobrancaBaixaAthosService.executarAposPagamento", () => {
  it("1. ATHOS_BAIXA_AUTO=false -> desligado e baixarTitulos nunca chamado (boleto fica pendente, ver R4)", async () => {
    const { service, baixaService } = montar({ ATHOS_BAIXA_AUTO: "false" });
    const r = await service.executarAposPagamento(7, { origem: "webhook" });
    expect(r.status).toBe("desligado");
    expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// Plano 43-03 - registro duravel (R), baixa manual (M) e status
// ---------------------------------------------------------------------------

const DETALHE_OK = {
  simulado: false,
  resultado: "baixado" as const,
  modo: "nominal",
  retroativa: false,
  dataPagamento: "2026-11-05",
  valorTotal: 39.5,
  titulos: [
    { idcontareceber: 1363, acao: "baixado", idcontarecebida: 9001, principal: 29, juros: 0, multa: 0, atraso: 0, valorPago: 29 },
    { idcontareceber: 1364, acao: "baixado", idcontarecebida: 9002, principal: 10.5, juros: 0, multa: 0, atraso: 0, valorPago: 10.5 },
  ],
};

function boletoPago(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    status: "pago",
    idclienteAthos: 2641,
    athosBaixaStatus: null,
    athosBaixaDataPagamento: null,
    athosBaixaValorPagoEfi: null,
    titulos: [
      { idcontareceber: 1363, valor: "29.00" },
      { idcontareceber: 1364, valor: "10.50" },
    ],
    ...extra,
  };
}

function chamadasUpdate(prisma: any) {
  return prisma.cobrancaBoleto.update.mock.calls.map((c: any[]) => c[0].data);
}

describe("CobrancaBaixaAthosService - registro duravel (BX-07)", () => {
  it("R1. sucesso: status baixado, tentativa +1, erro limpo, log com titulos e idcontarecebida", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    const r = await service.executarAposPagamento(7, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: "2026-11-05", paid_value: 3950 } },
    });
    expect(r.status).toBe("baixado");

    const datas = chamadasUpdate(prisma);
    const final = datas[datas.length - 1];
    expect(final).toMatchObject({
      athosBaixaStatus: "baixado",
      athosBaixaErroCodigo: null,
      athosBaixaErroMensagem: null,
      athosBaixaTentativas: { increment: 1 },
    });
    expect(final.athosBaixaUltimaEm).toBeInstanceOf(Date);

    expect(prisma.cobrancaBaixaAthosLog.create).toHaveBeenCalledTimes(1);
    const log = prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({
      cobrancaBoletoId: 7,
      operacao: "baixa",
      origem: "webhook",
      resultado: "baixado",
      dataPagamento: "2026-11-05",
      valorTotal: 39.5,
      codigoErro: null,
    });
    expect(log.titulos).toEqual([
      { idcontareceber: 1363, idcontarecebida: 9001, principal: 29, juros: 0, multa: 0, atraso: 0, valorPago: 29 },
      { idcontareceber: 1364, idcontarecebida: 9002, principal: 10.5, juros: 0, multa: 0, atraso: 0, valorPago: 10.5 },
    ]);
  });

  it("R2. todos ja REC: status e log ja_baixado", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockResolvedValue({ ...DETALHE_OK, resultado: "ja_baixado" });
    const r = await service.executarAposPagamento(7, { origem: "reconciliacao" });
    expect(r.status).toBe("ja_baixado");
    const datas = chamadasUpdate(prisma);
    expect(datas[datas.length - 1].athosBaixaStatus).toBe("ja_baixado");
    expect(prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data.resultado).toBe("ja_baixado");
  });

  it("R3. VALOR_DIVERGENTE: status falha com codigo, mensagem truncada em 300, sem excecao", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    const longa = "x".repeat(500);
    baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError("VALOR_DIVERGENTE", longa));
    const r = await service.executarAposPagamento(7, { origem: "webhook" });
    expect(r.status).toBe("falha");
    expect(r.codigo).toBe("VALOR_DIVERGENTE");
    const datas = chamadasUpdate(prisma);
    const final = datas[datas.length - 1];
    expect(final.athosBaixaStatus).toBe("falha");
    expect(final.athosBaixaErroCodigo).toBe("VALOR_DIVERGENTE");
    expect(final.athosBaixaErroMensagem).toHaveLength(300);
    expect(final.athosBaixaTentativas).toEqual({ increment: 1 });
    const log = prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ resultado: "falha", codigoErro: "VALOR_DIVERGENTE" });
    expect(log.mensagem).toHaveLength(300);
  });

  it("R4. ATHOS_BAIXA_AUTO=false: pendente com data/valor guardados, Athos nao chamado, tentativa nao incrementada", async () => {
    const { service, prisma, baixaService } = montar({ ATHOS_BAIXA_AUTO: "false" }, boletoPago());
    const r = await service.executarAposPagamento(7, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: "2026-11-04", paid_value: 3950 } },
    });
    expect(r.status).toBe("desligado");
    expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
    const datas = chamadasUpdate(prisma);
    expect(datas[0]).toEqual({ athosBaixaDataPagamento: "2026-11-04", athosBaixaValorPagoEfi: 39.5 });
    const final = datas[datas.length - 1];
    expect(final.athosBaixaStatus).toBe("pendente");
    expect(final.athosBaixaTentativas).toBeUndefined();
    expect(prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data.resultado).toBe("pendente");
  });

  it("R5. 1a tentativa grava data/valor ANTES do Athos; 2a reutiliza os guardados ignorando outro payload", async () => {
    const a = montar({}, boletoPago());
    const ordem: string[] = [];
    a.prisma.cobrancaBoleto.update.mockImplementation(async (arg: any) => {
      if ("athosBaixaDataPagamento" in arg.data) ordem.push("persistiu-dados");
      return {};
    });
    a.baixaService.baixarTitulos.mockImplementation(async () => {
      ordem.push("athos");
      return DETALHE_OK;
    });
    await a.service.executarAposPagamento(7, {
      origem: "webhook",
      payloadEfi: { payment: { paid_at: "2026-11-03", paid_value: 3950 } },
    });
    expect(ordem).toEqual(["persistiu-dados", "athos"]);

    const b = montar(
      {},
      boletoPago({ athosBaixaStatus: "falha", athosBaixaDataPagamento: "2026-11-03", athosBaixaValorPagoEfi: "39.50" }),
    );
    await b.service.executarAposPagamento(7, {
      origem: "retentativa",
      payloadEfi: { payment: { paid_at: "2026-11-30", paid_value: 99900 } },
    });
    const entrada = b.baixaService.baixarTitulos.mock.calls[0][0];
    expect(entrada.dataPagamento).toBe("2026-11-03");
    expect(entrada.valorPagoEfi).toBe(39.5);
    expect(chamadasUpdate(b.prisma).some((d: any) => "athosBaixaDataPagamento" in d)).toBe(false);
  });

  it("R6. athosBaixaStatus baixado ou ja_baixado: ignorado JA_REGISTRADO, Athos nao chamado", async () => {
    for (const st of ["baixado", "ja_baixado"]) {
      const { service, baixaService, prisma } = montar({}, boletoPago({ athosBaixaStatus: st }));
      const r = await service.executarAposPagamento(7, { origem: "retentativa" });
      expect(r).toEqual({ status: "ignorado", codigo: "JA_REGISTRADO" });
      expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
      expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    }
  });

  it("R7. falha ao persistir (update rejeita): resolve sem lancar e registra logger.error", async () => {
    const { service, prisma, baixaService, logger } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    prisma.cobrancaBoleto.update.mockRejectedValue(new Error("db fora"));
    prisma.cobrancaBaixaAthosLog.create.mockRejectedValue(new Error("db fora"));
    await expect(service.executarAposPagamento(7, { origem: "webhook" })).resolves.toMatchObject({
      status: "baixado",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("R8. erro nao tipado: falha ERRO_INESPERADO com mensagem generica (sem o texto original)", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockRejectedValue(new Error("senha=abc123 host=10.0.0.1"));
    const r = await service.executarAposPagamento(7, { origem: "webhook" });
    expect(r.codigo).toBe("ERRO_INESPERADO");
    const datas = chamadasUpdate(prisma);
    const final = datas[datas.length - 1];
    expect(final.athosBaixaErroCodigo).toBe("ERRO_INESPERADO");
    expect(final.athosBaixaErroMensagem).not.toContain("senha");
    const log = prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(log)).not.toContain("abc123");
  });
});

describe("CobrancaBaixaAthosService.baixarManual (BX-08)", () => {
  it("M1. boleto inexistente ou nao pago -> BadRequestException e nada chamado", async () => {
    const a = montar({}, null);
    await expect(a.service.baixarManual(7, {})).rejects.toBeInstanceOf(BadRequestException);
    const b = montar({}, boletoPago({ status: "pendente" }));
    await expect(b.service.baixarManual(7, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(a.baixaService.baixarTitulos).not.toHaveBeenCalled();
    expect(b.baixaService.baixarTitulos).not.toHaveBeenCalled();
    expect(b.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });

  it("M2. athosBaixaStatus baixado -> ConflictException", async () => {
    const { service, baixaService } = montar({}, boletoPago({ athosBaixaStatus: "baixado" }));
    await expect(service.baixarManual(7, {})).rejects.toBeInstanceOf(ConflictException);
    expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
  });

  it("M3. simular=true: baixarTitulos com simular, nenhum update e nenhum log, retorna simulado", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockResolvedValue({ ...DETALHE_OK, simulado: true });
    const r = await service.baixarManual(7, { simular: true });
    expect(baixaService.baixarTitulos.mock.calls[0][0].simular).toBe(true);
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    expect(prisma.cobrancaBaixaAthosLog.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ simulado: true, status: "baixado" });
    expect(r.detalhe.valorTotal).toBe(39.5);
  });

  it("M3b. simulacao que falha tambem nao grava estado local", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError("VALOR_DIVERGENTE", "valor diverge"));
    await expect(service.baixarManual(7, { simular: true })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    expect(prisma.cobrancaBaixaAthosLog.create).not.toHaveBeenCalled();
  });

  it("M4. baixa real: persiste como R1 com origem manual, mesmo com ATHOS_BAIXA_AUTO=false", async () => {
    const { service, prisma, baixaService } = montar(
      { ATHOS_BAIXA_AUTO: "false" },
      boletoPago({ athosBaixaStatus: "pendente" }),
    );
    baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    const r = await service.baixarManual(7, {});
    expect(r).toMatchObject({ simulado: false, status: "baixado" });
    expect(baixaService.baixarTitulos).toHaveBeenCalledTimes(1);
    expect(baixaService.baixarTitulos.mock.calls[0][0].simular).toBeUndefined();
    const datas = chamadasUpdate(prisma);
    expect(datas[datas.length - 1]).toMatchObject({
      athosBaixaStatus: "baixado",
      athosBaixaTentativas: { increment: 1 },
    });
    expect(prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data).toMatchObject({
      origem: "manual",
      resultado: "baixado",
    });
  });

  it("M4b. baixa manual ignora o limite de tentativas (boleto com 9 tentativas)", async () => {
    const { service, baixaService } = montar({}, boletoPago({ athosBaixaStatus: "falha", athosBaixaTentativas: 9 }));
    baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    await expect(service.baixarManual(7, {})).resolves.toMatchObject({ status: "baixado" });
  });

  it("M5. dataPagamento do body sobrepoe a guardada e passa a ser persistida; sem body usa guardada; sem guardada usa hoje", async () => {
    const a = montar({}, boletoPago({ athosBaixaDataPagamento: "2026-11-01" }));
    a.baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    await a.service.baixarManual(7, { dataPagamento: "2026-11-04" });
    expect(a.baixaService.baixarTitulos.mock.calls[0][0].dataPagamento).toBe("2026-11-04");
    expect(chamadasUpdate(a.prisma)).toContainEqual({ athosBaixaDataPagamento: "2026-11-04" });

    const b = montar({}, boletoPago({ athosBaixaDataPagamento: "2026-11-01" }));
    b.baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    await b.service.baixarManual(7, {});
    expect(b.baixaService.baixarTitulos.mock.calls[0][0].dataPagamento).toBe("2026-11-01");

    const c = montar({}, boletoPago());
    c.baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    await c.service.baixarManual(7, {});
    expect(c.baixaService.baixarTitulos.mock.calls[0][0].dataPagamento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("M5b. data recusada pelo Athos (futura) nao e persistida como guardada", async () => {
    const { service, prisma, baixaService } = montar({}, boletoPago());
    baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError("DATA_PAGAMENTO_FUTURA", "data futura"));
    await expect(service.baixarManual(7, { dataPagamento: "2099-01-01" })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(chamadasUpdate(prisma).some((d: any) => "athosBaixaDataPagamento" in d)).toBe(false);
  });

  it("M6. ignorarValorEfi=true -> baixarTitulos recebe valorPagoEfi null", async () => {
    const { service, baixaService } = montar({}, boletoPago({ athosBaixaValorPagoEfi: "39.50" }));
    baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    await service.baixarManual(7, { ignorarValorEfi: true });
    expect(baixaService.baixarTitulos.mock.calls[0][0].valorPagoEfi).toBeNull();

    const b = montar({}, boletoPago({ athosBaixaValorPagoEfi: "39.50" }));
    b.baixaService.baixarTitulos.mockResolvedValue(DETALHE_OK);
    await b.service.baixarManual(7, {});
    expect(b.baixaService.baixarTitulos.mock.calls[0][0].valorPagoEfi).toBe(39.5);
  });

  it("M7. negocio -> 422 com codigo; infra -> 500; em baixa real a falha e persistida, em simulacao nao", async () => {
    for (const codigo of ["VALOR_DIVERGENTE", "VALOR_INCOMPATIVEL", "STATUS_INVALIDO"] as const) {
      const { service, prisma, baixaService } = montar({}, boletoPago());
      baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError(codigo, "regra de negocio"));
      const erro: any = await service.baixarManual(7, {}).catch((e) => e);
      expect(erro).toBeInstanceOf(UnprocessableEntityException);
      expect(erro.getResponse()).toMatchObject({ codigo, message: "regra de negocio" });
      const datas = chamadasUpdate(prisma);
      expect(datas[datas.length - 1]).toMatchObject({ athosBaixaStatus: "falha", athosBaixaErroCodigo: codigo });
    }
    for (const codigo of ["PERMISSAO_NEGADA", "ERRO_BANCO", "CONFIG_INVALIDA", "CONFIG_ATHOS_INCOMPLETA"] as const) {
      const { service, prisma, baixaService } = montar({}, boletoPago());
      baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError(codigo, "detalhe tecnico interno"));
      const erro: any = await service.baixarManual(7, {}).catch((e) => e);
      expect(erro).toBeInstanceOf(InternalServerErrorException);
      expect(JSON.stringify(erro.getResponse())).not.toContain("detalhe tecnico interno");
      const datas = chamadasUpdate(prisma);
      expect(datas[datas.length - 1]).toMatchObject({ athosBaixaStatus: "falha", athosBaixaErroCodigo: codigo });
    }
    const s = montar({}, boletoPago());
    s.baixaService.baixarTitulos.mockRejectedValue(new BaixaAthosError("PERMISSAO_NEGADA", "x"));
    await expect(s.service.baixarManual(7, { simular: true })).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(s.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });

  it("M7b. config invalida em baixa real -> 500 e falha persistida; sem chamar o Athos", async () => {
    const { service, prisma, baixaService } = montar({ ATHOS_BAIXA_ID_FUNCIONARIO: "abc" }, boletoPago());
    await expect(service.baixarManual(7, {})).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(baixaService.baixarTitulos).not.toHaveBeenCalled();
    expect(chamadasUpdate(prisma)[0]).toMatchObject({
      athosBaixaStatus: "falha",
      athosBaixaErroCodigo: "CONFIG_INVALIDA",
    });
  });

  it("M8. consultarStatus devolve campos do boleto e historico (max 20, mais recente primeiro); inexistente -> BadRequest", async () => {
    const { service, prisma } = montar();
    const criadoEm = new Date("2026-11-06T10:00:00Z");
    prisma.cobrancaBoleto.findUnique.mockResolvedValue({
      athosBaixaStatus: "falha",
      athosBaixaErroCodigo: "ERRO_BANCO",
      athosBaixaErroMensagem: "msg",
      athosBaixaTentativas: 2,
      athosBaixaUltimaEm: criadoEm,
    });
    prisma.cobrancaBaixaAthosLog.findMany.mockResolvedValue([
      {
        id: 5,
        operacao: "baixa",
        origem: "retentativa",
        resultado: "falha",
        codigoErro: "ERRO_BANCO",
        mensagem: "msg",
        criadoEm,
      },
    ]);
    const r = await service.consultarStatus(7);
    expect(r).toMatchObject({
      athosBaixaStatus: "falha",
      athosBaixaErroCodigo: "ERRO_BANCO",
      athosBaixaTentativas: 2,
      athosBaixaUltimaEm: criadoEm,
    });
    expect(r.historico).toHaveLength(1);
    const args = prisma.cobrancaBaixaAthosLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.where).toEqual({ cobrancaBoletoId: 7 });
    expect(args.orderBy).toEqual([{ criadoEm: "desc" }, { id: "desc" }]);

    prisma.cobrancaBoleto.findUnique.mockResolvedValue(null);
    await expect(service.consultarStatus(99)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("CobrancaBaixaAthosService.estornarBaixa (plano 43-04)", () => {
  const boletoBaixado = {
    id: 7,
    status: "pago",
    idclienteAthos: 2641,
    athosBaixaStatus: "baixado",
    titulos: [],
  };

  function montarEstorno(
    env: Record<string, string | undefined> = {},
    opcoes: { boleto?: unknown; trilha?: unknown } = {},
  ) {
    const m = montar(env, opcoes.boleto === undefined ? boletoBaixado : opcoes.boleto);
    const trilha =
      opcoes.trilha === undefined
        ? {
            id: 31,
            titulos: [
              { idcontareceber: 1363, idcontarecebida: 501, principal: 29 },
              { idcontareceber: 1364, idcontarecebida: null, principal: 0 }, // ja_baixado
              { idcontareceber: 1365, idcontarecebida: 503, principal: 10.5 },
            ],
          }
        : opcoes.trilha;
    m.prisma.cobrancaBaixaAthosLog.findFirst.mockResolvedValue(trilha as never);
    return m;
  }

  it("X1. boleto inexistente -> BadRequest; status diferente de baixado -> Conflict; Athos nao chamado", async () => {
    const a = montarEstorno({}, { boleto: null });
    await expect(a.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(a.baixaService.estornarBaixa).not.toHaveBeenCalled();

    for (const status of [null, "falha", "pendente", "ja_baixado", "estornado"]) {
      const m = montarEstorno({}, { boleto: { ...boletoBaixado, athosBaixaStatus: status } });
      await expect(m.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(ConflictException);
      expect(m.baixaService.estornarBaixa).not.toHaveBeenCalled();
    }
  });

  it("X2. sem confirmar=true e sem simular -> BadRequest e Athos nao chamado", async () => {
    for (const input of [{}, { confirmar: false }, { simular: false }]) {
      const { service, baixaService, prisma } = montarEstorno();
      await expect(service.estornarBaixa(7, input)).rejects.toBeInstanceOf(BadRequestException);
      expect(baixaService.estornarBaixa).not.toHaveBeenCalled();
      expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    }
  });

  it("X3. sem linha de baixa na trilha ou sem idcontarecebida numerico -> BadRequest", async () => {
    const a = montarEstorno({}, { trilha: null });
    await expect(a.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(BadRequestException);

    const b = montarEstorno({}, { trilha: { id: 1, titulos: [{ idcontareceber: 1, idcontarecebida: null }] } });
    await expect(b.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(BadRequestException);

    const c = montarEstorno({}, { trilha: { id: 1, titulos: null } });
    await expect(c.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(BadRequestException);
    for (const m of [a, b, c]) expect(m.baixaService.estornarBaixa).not.toHaveBeenCalled();
  });

  it("X4. so os pares com idcontarecebida numerico da ultima baixa 'baixado' vao ao servico Athos", async () => {
    const { service, baixaService, prisma } = montarEstorno({ ATHOS_BAIXA_ID_FUNCIONARIO: "3" });
    await service.estornarBaixa(7, { confirmar: true });
    expect(prisma.cobrancaBaixaAthosLog.findFirst).toHaveBeenCalledWith({
      where: { cobrancaBoletoId: 7, operacao: "baixa", resultado: "baixado" },
      orderBy: { id: "desc" },
    });
    expect(baixaService.estornarBaixa).toHaveBeenCalledTimes(1);
    expect(baixaService.estornarBaixa).toHaveBeenCalledWith({
      idclienteAthos: 2641,
      titulos: [
        { idcontareceber: 1363, idcontarecebida: 501 },
        { idcontareceber: 1365, idcontarecebida: 503 },
      ],
      idFuncionario: 3,
      simular: false,
    });
  });

  it("X5. simular=true dispensa confirmar e nao persiste nada", async () => {
    const { service, baixaService, prisma } = montarEstorno();
    baixaService.estornarBaixa.mockResolvedValue({ simulado: true, titulos: [], valorTotal: 39.5 });
    const r = await service.estornarBaixa(7, { simular: true });
    expect(r).toMatchObject({ simulado: true, status: "estornado" });
    expect(baixaService.estornarBaixa.mock.calls[0][0]).toMatchObject({ simular: true });
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    expect(prisma.cobrancaBaixaAthosLog.create).not.toHaveBeenCalled();
  });

  it("X5b. simulacao que falha tambem nao persiste e vira excecao HTTP", async () => {
    const { service, baixaService, prisma } = montarEstorno();
    baixaService.estornarBaixa.mockRejectedValue(new BaixaAthosError("RECEBIMENTO_DIVERGENTE", "divergente"));
    await expect(service.estornarBaixa(7, { simular: true })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    expect(prisma.cobrancaBaixaAthosLog.create).not.toHaveBeenCalled();
  });

  it("X6. sucesso real: status estornado, trilha 'estorno', CobrancaBoleto.status intacto", async () => {
    const { service, baixaService, prisma } = montarEstorno();
    baixaService.estornarBaixa.mockResolvedValue({
      simulado: false,
      titulos: [
        { idcontareceber: 1363, idcontarecebida: 501, principal: 29, valorPago: 29, statusFinal: "VEN" },
        { idcontareceber: 1365, idcontarecebida: 503, principal: 10.5, valorPago: 10.5, statusFinal: "AVC" },
      ],
      valorTotal: 39.5,
    });
    const r = await service.estornarBaixa(7, { confirmar: true });
    expect(r.status).toBe("estornado");
    expect(r.simulado).toBe(false);

    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledTimes(1);
    const upd = prisma.cobrancaBoleto.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 7 });
    expect(upd.data).toMatchObject({
      athosBaixaStatus: "estornado",
      athosBaixaErroCodigo: null,
      athosBaixaErroMensagem: null,
    });
    expect(upd.data.athosBaixaUltimaEm).toBeInstanceOf(Date);
    expect(Object.keys(upd.data)).not.toContain("status");

    expect(prisma.cobrancaBaixaAthosLog.create).toHaveBeenCalledTimes(1);
    const log = prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({
      cobrancaBoletoId: 7,
      operacao: "estorno",
      origem: "manual",
      resultado: "estornado",
      valorTotal: 39.5,
    });
    expect(log.titulos).toEqual([
      { idcontareceber: 1363, idcontarecebida: 501, principal: 29, valorPago: 29, statusFinal: "VEN" },
      { idcontareceber: 1365, idcontarecebida: 503, principal: 10.5, valorPago: 10.5, statusFinal: "AVC" },
    ]);
  });

  it("X7. falha real: status continua baixado, trilha 'falha', 422 para negocio e 500 para infra", async () => {
    const negocio = montarEstorno();
    negocio.baixaService.estornarBaixa.mockRejectedValue(new BaixaAthosError("RECEBIMENTO_DIVERGENTE", "divergente"));
    await expect(negocio.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(negocio.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    const log = negocio.prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ operacao: "estorno", resultado: "falha", codigoErro: "RECEBIMENTO_DIVERGENTE" });

    const infra = montarEstorno();
    infra.baixaService.estornarBaixa.mockRejectedValue(new BaixaAthosError("PERMISSAO_NEGADA", "sem GRANT DELETE"));
    await expect(infra.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(infra.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    expect(infra.prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data).toMatchObject({
      resultado: "falha",
      codigoErro: "PERMISSAO_NEGADA",
    });

    const inesperado = montarEstorno();
    inesperado.baixaService.estornarBaixa.mockRejectedValue(new Error("detalhe interno com SQL"));
    await expect(inesperado.service.estornarBaixa(7, { confirmar: true })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    const dados = inesperado.prisma.cobrancaBaixaAthosLog.create.mock.calls[0][0].data;
    expect(dados.codigoErro).toBe("ERRO_INESPERADO");
    expect(String(dados.mensagem)).not.toContain("SQL");
  });

  it("X7b. falha ao persistir apos estorno bem-sucedido so gera log e o resultado e devolvido", async () => {
    const { service, prisma, logger } = montarEstorno();
    prisma.cobrancaBoleto.update.mockRejectedValue(new Error("banco fora"));
    prisma.cobrancaBaixaAthosLog.create.mockRejectedValue(new Error("banco fora"));
    const r = await service.estornarBaixa(7, { confirmar: true });
    expect(r.status).toBe("estornado");
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("X8. depois de estornado, baixarManual volta a aceitar o boleto", async () => {
    const { service, baixaService } = montarEstorno({}, { boleto: { ...boletoBaixado, athosBaixaStatus: "estornado", titulos: [{ idcontareceber: 1363, valor: "29.00" }] } });
    const r = await service.baixarManual(7, {});
    expect(r.status).toBe("baixado");
    expect(baixaService.baixarTitulos).toHaveBeenCalledTimes(1);
  });
});
