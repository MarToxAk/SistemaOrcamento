/**
 * Testes unitarios do CobrancaBoletoAtualizadoService (Fase 50, plano 50-03): recusas, idempotencia,
 * mutex por boleto, compensacao e traducao do 4600210. Prisma, Athos, CobrancaService e EFI sao falsos;
 * o objeto Prisma falso nao tem nenhuma funcao de remocao.
 */
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { CobrancaBoletoAtualizadoService } from "./cobranca-boleto-atualizado.service";

const original = () => ({
  id: 41,
  txidEfi: "9001",
  idclienteAthos: 2641,
  valor: 1000,
  status: "pendente",
  expireAt: "2026-11-12",
  athosBaixaStatus: null as string | null,
  titulos: [{ idcontareceber: 1363, valor: 1000 }],
});

const tituloAthos = (extra: Record<string, unknown> = {}) => ({
  idcontareceber: 1363,
  numerotitulo: "1363/1",
  datavencimento: "2026-11-10",
  valor: 1000,
  observacao: null,
  idvenda: 555,
  dataemissao: "2026-10-10",
  numeroordem: null,
  ...extra,
});

const sucessor42 = {
  id: 42,
  status: "pendente",
  txidEfi: "9002",
  valor: 1022.64,
  valorPrincipal: 1000,
  valorJuros: 2.64,
  valorMulta: 20,
  expireAt: "2026-11-18",
  linkBoleto: "https://download.sejaefi.com.br/x.pdf",
};

function montar(hoje = "2026-11-17") {
  const efi = { post: jest.fn(), put: jest.fn(), get: jest.fn() };
  const prisma = {
    cobrancaBoleto: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const athos = { buscarTitulosClienteContasReceber: jest.fn() };
  const cobrancaService = {
    verificarPagamentoBoleto: jest.fn(),
    montarItensEfiPorVendaItem: jest.fn(),
    prepararEmissaoEfi: jest.fn(),
  };
  const encargosConfig = { obter: jest.fn() };

  prisma.cobrancaBoleto.findUnique.mockResolvedValue(original());
  prisma.cobrancaBoleto.findFirst.mockResolvedValue(null);
  prisma.cobrancaBoleto.create.mockResolvedValue({ id: 42 });
  prisma.cobrancaBoleto.update.mockResolvedValue({});
  athos.buscarTitulosClienteContasReceber.mockResolvedValue([tituloAthos()]);
  cobrancaService.verificarPagamentoBoleto.mockResolvedValue({ status: "pendente", atualizado: false });
  cobrancaService.montarItensEfiPorVendaItem.mockResolvedValue(
    new Map([["NF-e-440", { name: "NF-e #440", valueCentavos: 100000, amount: 1 }]]),
  );
  cobrancaService.prepararEmissaoEfi.mockResolvedValue({
    cli: efi,
    token: "tok",
    customer: { name: "ACME LTDA", cpf: "12345678909" },
    nomeCliente: "ACME LTDA",
    notificationUrl: undefined,
  });
  encargosConfig.obter.mockResolvedValue({ taxaJurosMes: 0.99, multaPercentual: 2, atualizadoEm: null });
  efi.post.mockResolvedValue({
    data: { code: 200, data: { charge_id: 9002, pdf: { charge: "https://download.sejaefi.com.br/x.pdf" }, barcode: "34191" } },
  });
  efi.put.mockResolvedValue({ data: { code: 200 } });

  const svc = new CobrancaBoletoAtualizadoService(
    prisma as never,
    athos as never,
    cobrancaService as never,
    encargosConfig as never,
  );
  jest.spyOn(svc, "hoje").mockReturnValue(hoje);
  return { svc, efi, prisma, athos, cobrancaService, encargosConfig };
}

describe("CobrancaBoletoAtualizadoService (Fase 50-03)", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  function semEfi(m: ReturnType<typeof montar>) {
    expect(m.cobrancaService.prepararEmissaoEfi).not.toHaveBeenCalled();
    expect(m.efi.post).not.toHaveBeenCalled();
    expect(m.efi.put).not.toHaveBeenCalled();
    expect(m.prisma.cobrancaBoleto.create).not.toHaveBeenCalled();
  }

  it("S1 boleto inexistente -> NotFoundException; nada na EFI", async () => {
    const m = montar();
    m.prisma.cobrancaBoleto.findUnique.mockResolvedValue(null);
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(m.svc.previa(41, {})).rejects.toBeInstanceOf(NotFoundException);
    semEfi(m);
  });

  it("S2 pago -> Conflict; cancelado cita o boleto atualizado ativo", async () => {
    const m = montar();
    m.prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...original(), status: "pago" });
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(ConflictException);

    m.prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...original(), status: "cancelado" });
    m.prisma.cobrancaBoleto.findFirst.mockResolvedValue(sucessor42);
    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String(erro.message)).toContain("42");
    semEfi(m);
  });

  it("S3 baixado no Athos (baixado ou ja_baixado) -> Conflict", async () => {
    const m = montar();
    for (const athosBaixaStatus of ["baixado", "ja_baixado"]) {
      m.prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...original(), athosBaixaStatus });
      await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(ConflictException);
    }
    semEfi(m);
  });

  it("S4 sem txidEfi -> BadRequest", async () => {
    const m = montar();
    m.prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...original(), txidEfi: null });
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(BadRequestException);
    semEfi(m);
  });

  it("S5 data fora de [hoje, proximo dia util]: de sexta so valem sexta e segunda", async () => {
    const m = montar("2026-11-20");
    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-21" }).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("20/11/2026");
    expect(String(erro.message)).toContain("23/11/2026");
    semEfi(m);
    m.athos.buscarTitulosClienteContasReceber.mockResolvedValue([tituloAthos()]);
    const ok = await m.svc.gerar(41, { novoVencimento: "2026-11-23" });
    expect(ok.expireAt).toBe("2026-11-23");
  });

  it("S6 taxa acima do teto em chamada direta (alem do DTO) -> BadRequest", async () => {
    const m = montar();
    await expect(
      m.svc.gerar(41, { novoVencimento: "2026-11-18", taxaJurosMes: 1.01 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.svc.previa(41, { multaPercentual: 2.01 })).rejects.toBeInstanceOf(BadRequestException);
    semEfi(m);
  });

  it("S7 titulo fora da lista do Athos -> BadRequest 'nao esta mais em aberto'", async () => {
    const m = montar();
    m.athos.buscarTitulosClienteContasReceber.mockResolvedValue([]);
    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("não está mais em aberto");
    semEfi(m);
  });

  it("S8 valor do titulo no Athos difere do boleto -> BadRequest 'mudou no Athos'", async () => {
    const m = montar();
    m.athos.buscarTitulosClienteContasReceber.mockResolvedValue([tituloAthos({ valor: 1000.02 })]);
    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("mudou no Athos");
    semEfi(m);
  });

  it("S9 nenhum titulo vencido -> UnprocessableEntity", async () => {
    const m = montar();
    m.athos.buscarTitulosClienteContasReceber.mockResolvedValue([tituloAthos({ datavencimento: "2026-11-20" })]);
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    semEfi(m);
  });

  it("S10 EFI informa pago ou cancelado -> Conflict e nada criado", async () => {
    const m = montar();
    for (const status of ["pago", "cancelado"]) {
      m.cobrancaService.verificarPagamentoBoleto.mockResolvedValue({ status, atualizado: true });
      await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(ConflictException);
    }
    expect(m.prisma.cobrancaBoleto.create).not.toHaveBeenCalled();
    expect(m.efi.post).not.toHaveBeenCalled();
  });

  it("S11 EFI 4600210 -> BadRequest amigavel; nada gravado nem cancelado", async () => {
    const m = montar();
    m.efi.post.mockRejectedValue({ response: { status: 400, data: { code: "4600210" } } });
    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("A EFI bloqueou a emissão");
    expect(m.prisma.cobrancaBoleto.create).not.toHaveBeenCalled();
    expect(m.efi.put).not.toHaveBeenCalled();
    expect(m.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });

  it("S12 falha ao gravar o novo -> cancela o boleto NOVO na EFI, 500 e original intocado", async () => {
    const m = montar();
    m.prisma.cobrancaBoleto.create.mockRejectedValue(new Error("db fora"));
    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro).toBeInstanceOf(InternalServerErrorException);
    expect(m.efi.put).toHaveBeenCalledTimes(1);
    expect(m.efi.put.mock.calls[0][0]).toBe("/v1/charge/9002/cancel");
    expect(m.efi.put).not.toHaveBeenCalledWith("/v1/charge/9001/cancel", expect.anything(), expect.anything());
    expect(m.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();

    // compensacao tambem falha: o erro cita o charge para cancelamento manual
    const m2 = montar();
    m2.prisma.cobrancaBoleto.create.mockRejectedValue(new Error("db fora"));
    m2.efi.put.mockRejectedValue(new Error("EFI fora"));
    const erro2 = await m2.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro2).toBeInstanceOf(InternalServerErrorException);
    expect(String(erro2.message)).toContain("9002");
    expect(m2.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });

  it("S13 cancelamento do original sem code 200 -> falhou com aviso e original nao atualizado", async () => {
    const m = montar();
    m.efi.put.mockResolvedValue({ data: { code: 400 } });
    const r = await m.svc.gerar(41, { novoVencimento: "2026-11-18" });
    expect(r.cancelamentoOriginal).toBe("falhou");
    expect(r.aviso).toContain("41");
    expect(r.reaproveitado).toBe(false);
    expect(m.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });

  describe("S14 retentativa com boleto atualizado ativo (D-14, D-15)", () => {
    it("repete so o cancelamento estrito, sem criar outro boleto", async () => {
      const m = montar();
      m.prisma.cobrancaBoleto.findFirst.mockResolvedValue(sucessor42);
      const r = await m.svc.gerar(41, { novoVencimento: "2026-11-18" });
      expect(m.efi.post).not.toHaveBeenCalled();
      expect(m.prisma.cobrancaBoleto.create).not.toHaveBeenCalled();
      expect(m.cobrancaService.verificarPagamentoBoleto).toHaveBeenCalledWith(41);
      expect(m.efi.put).toHaveBeenCalledWith("/v1/charge/9001/cancel", {}, expect.anything());
      expect(m.prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { status: "cancelado" } });
      expect(r).toMatchObject({ cobrancaId: 42, reaproveitado: true, cancelamentoOriginal: "ok", chargeId: 9002 });
    });

    it("EFI ja informa o original cancelado -> sem put, resultado ok", async () => {
      const m = montar();
      m.prisma.cobrancaBoleto.findFirst.mockResolvedValue(sucessor42);
      m.cobrancaService.verificarPagamentoBoleto.mockResolvedValue({ status: "cancelado", atualizado: true });
      const r = await m.svc.gerar(41, { novoVencimento: "2026-11-18" });
      expect(m.efi.put).not.toHaveBeenCalled();
      expect(r).toMatchObject({ cobrancaId: 42, reaproveitado: true, cancelamentoOriginal: "ok" });
    });

    it("EFI informa o original pago -> Conflict (pagamento em dobro) e nada cancelado", async () => {
      const m = montar();
      m.prisma.cobrancaBoleto.findFirst.mockResolvedValue(sucessor42);
      m.cobrancaService.verificarPagamentoBoleto.mockResolvedValue({ status: "pago", atualizado: true });
      const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
      expect(erro).toBeInstanceOf(ConflictException);
      expect(String(erro.message)).toContain("dobro");
      expect(m.efi.put).not.toHaveBeenCalled();
      expect(m.efi.post).not.toHaveBeenCalled();
      expect(m.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    });
  });

  it("S15 mutex: segunda geracao simultanea recebe Conflict 'em andamento'; depois libera", async () => {
    const m = montar();
    let liberar: (v: unknown) => void = () => undefined;
    m.efi.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          liberar = resolve;
        }),
    );
    const primeira = m.svc.gerar(41, { novoVencimento: "2026-11-18" });
    // deixa a primeira chegar ao post pendente
    for (let i = 0; i < 50 && m.efi.post.mock.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(m.efi.post).toHaveBeenCalledTimes(1);

    const erro = await m.svc.gerar(41, { novoVencimento: "2026-11-18" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String(erro.message)).toContain("em andamento");

    liberar({
      data: { code: 200, data: { charge_id: 9002, pdf: { charge: "https://download.sejaefi.com.br/x.pdf" }, barcode: "1" } },
    });
    await expect(primeira).resolves.toMatchObject({ cobrancaId: 42 });

    // liberado: nova chamada aceita (agora como retentativa, ja que o sucessor existe)
    m.prisma.cobrancaBoleto.findFirst.mockResolvedValue(sucessor42);
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).resolves.toMatchObject({ reaproveitado: true });
  });

  it("S15b mutex liberado tambem quando a geracao falha", async () => {
    const m = montar();
    m.efi.post.mockRejectedValueOnce(new Error("EFI fora"));
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(m.svc.gerar(41, { novoVencimento: "2026-11-18" })).resolves.toMatchObject({ cobrancaId: 42 });
  });

  it("S16 taxas editadas: snapshot aplicado diferente do pos-vencimento; configurations e mensagem usam o padrao", async () => {
    const m = montar();
    await m.svc.gerar(41, { novoVencimento: "2026-11-18", taxaJurosMes: 0.5, multaPercentual: 1 });
    const { data } = m.prisma.cobrancaBoleto.create.mock.calls[0][0];
    expect(data).toMatchObject({
      taxaJurosMesAplicada: 0.5,
      multaPercentualAplicada: 1,
      taxaJurosMesPosVencimento: 0.99,
      multaPercentualPosVencimento: 2,
    });
    const billet = m.efi.post.mock.calls[0][1].payment.banking_billet;
    expect(billet.configurations).toEqual({ fine: 200, interest: 33 });
  });

  it("previa nunca chama EFI nem grava, e informa o sucessor ativo", async () => {
    const m = montar();
    m.prisma.cobrancaBoleto.findFirst.mockResolvedValue(sucessor42);
    const p = await m.svc.previa(41, {});
    expect(p.sucessorAtivoId).toBe(42);
    semEfi(m);
    expect(m.cobrancaService.verificarPagamentoBoleto).not.toHaveBeenCalled();
    expect(m.prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });
});
