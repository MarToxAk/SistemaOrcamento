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

describe("CobrancaService.buscarTitulosComBoletoAtivo - boleto atualizado (Fase 50-05, D-15)", () => {
  let service: CobrancaService;

  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      cobrancaBoletoTitulo: { findMany: jest.fn() },
    };
  });

  function linhaAtualizada(
    idcontareceber: number,
    cobrancaBoleto: Partial<Record<string, unknown>> = {},
    titulo: Partial<Record<string, unknown>> = {},
  ) {
    return {
      idcontareceber,
      juros: "2.64",
      multa: "20.00",
      diasAtraso: 8,
      ...titulo,
      cobrancaBoleto: {
        id: 42,
        status: "pendente",
        linkBoleto: "http://example.com/boleto",
        nomeArquivo: "boleto.pdf",
        expireAt: "2026-11-18",
        athosBaixaDataPagamento: null,
        emailEnvios: [],
        valor: "1022.64",
        boletoOrigemId: 41,
        valorJuros: "2.64",
        valorMulta: "20.00",
        boletoOrigem: { id: 41, status: "cancelado" },
        boletosAtualizados: [],
        ...cobrancaBoleto,
      },
    };
  }

  it("T1 findMany ordena por boleto (mais novo por ultimo) e mantem o where", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([]);

    await service.buscarTitulosComBoletoAtivo([1, 2]);

    const args = (service as any).prisma.cobrancaBoletoTitulo.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ cobrancaBoletoId: "asc" });
    expect(args.where).toEqual({
      idcontareceber: { in: [1, 2] },
      cobrancaBoleto: { status: { in: ["pendente", "pago"] } },
    });
    expect(args.select.juros).toBe(true);
    expect(args.select.multa).toBe(true);
    expect(args.select.diasAtraso).toBe(true);
    expect(args.select.cobrancaBoleto.select.boletosAtualizados.where).toEqual({ status: { not: "cancelado" } });
  });

  it("T2 boleto atualizado: total, vinculo, juros/multa do boleto e do titulo, sem alerta", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([linhaAtualizada(5)]);

    const [r] = await service.buscarTitulosComBoletoAtivo([5]);

    expect(r).toEqual(
      expect.objectContaining({
        valorBoleto: 1022.64,
        boletoOrigemId: 41,
        valorJuros: 2.64,
        valorMulta: 20,
        jurosTitulo: 2.64,
        multaTitulo: 20,
        diasAtrasoTitulo: 8,
        alertaPagamentoDuplicado: false,
        boletoRelacionadoId: null,
      }),
    );
  });

  it("T3 boleto atualizado cujo original foi pago: alerta com o id do original", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([
      linhaAtualizada(5, { boletoOrigem: { id: 41, status: "pago" } }),
    ]);

    const [r] = await service.buscarTitulosComBoletoAtivo([5]);

    expect(r.alertaPagamentoDuplicado).toBe(true);
    expect(r.boletoRelacionadoId).toBe(41);
  });

  it("T4 original pago com sucessor ativo: alerta com o id do sucessor", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([
      linhaAtualizada(5, {
        id: 41,
        status: "pago",
        valor: "1000.00",
        boletoOrigemId: null,
        valorJuros: null,
        valorMulta: null,
        boletoOrigem: null,
        boletosAtualizados: [{ id: 42, status: "pendente" }],
      }, { juros: null, multa: null, diasAtraso: null }),
    ]);

    const [r] = await service.buscarTitulosComBoletoAtivo([5]);

    expect(r.alertaPagamentoDuplicado).toBe(true);
    expect(r.boletoRelacionadoId).toBe(42);
    expect(r.valorBoleto).toBe(1000);
    expect(r.boletoOrigemId).toBeNull();
    expect(r.jurosTitulo).toBeNull();
  });

  it("T5 linha antiga sem nenhum campo novo: nulos, alerta false e nenhum NaN", async () => {
    (service as any).prisma.cobrancaBoletoTitulo.findMany.mockResolvedValue([
      {
        idcontareceber: 9,
        cobrancaBoleto: {
          id: 109,
          status: "pendente",
          linkBoleto: "http://example.com/boleto",
          nomeArquivo: "boleto.pdf",
          expireAt: "2026-11-20",
          athosBaixaDataPagamento: null,
          emailEnvios: [],
        },
      },
    ]);

    const [r] = await service.buscarTitulosComBoletoAtivo([9]);

    expect(r.valorBoleto).toBeNull();
    expect(r.boletoOrigemId).toBeNull();
    expect(r.valorJuros).toBeNull();
    expect(r.valorMulta).toBeNull();
    expect(r.jurosTitulo).toBeNull();
    expect(r.multaTitulo).toBeNull();
    expect(r.diasAtrasoTitulo).toBeNull();
    expect(r.boletoRelacionadoId).toBeNull();
    expect(r.alertaPagamentoDuplicado).toBe(false);
    expect(JSON.stringify(r)).not.toContain("NaN");
  });
});
