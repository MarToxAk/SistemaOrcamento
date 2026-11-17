/**
 * Teste HTTP (tracer) da rota POST /api/cobranca/boleto/:id/atualizar (Fase 50, plano 50-01).
 *
 * Guard global real (InternalAuthGuard) e ValidationPipe igual ao main.ts. Servico e config reais;
 * Prisma, Athos, CobrancaService (helpers EFI) e EFI sao falsos: nenhum banco, nenhum Athos, nenhuma EFI real.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { InternalAuthGuard } from "../security/internal-auth.guard";
import { CobrancaBoletoAtualizadoController } from "./cobranca-boleto-atualizado.controller";
import { CobrancaBoletoAtualizadoService } from "./cobranca-boleto-atualizado.service";
import { CobrancaEncargosConfigService } from "./cobranca-encargos-config.service";
import { CobrancaService } from "./cobranca.service";

const CHAVE_INTERNA = "chave-interna-teste-50";

describe("CobrancaBoletoAtualizadoController POST boleto/:id/atualizar (HTTP)", () => {
  let app: INestApplication;
  let base = "";
  let envAnterior: string | undefined;
  let ordem: string[] = [];

  const efi = { post: jest.fn(), put: jest.fn(), get: jest.fn() };
  const prisma = {
    cobrancaBoleto: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    cobrancaEncargosConfig: { findUnique: jest.fn(), create: jest.fn() },
  };
  const athos = { buscarTitulosClienteContasReceber: jest.fn() };
  const cobrancaService = {
    verificarPagamentoBoleto: jest.fn(),
    montarItensEfiPorVendaItem: jest.fn(),
    prepararEmissaoEfi: jest.fn(),
  };

  const original = {
    id: 41,
    txidEfi: "9001",
    idclienteAthos: 2641,
    valor: 1000,
    status: "pendente",
    expireAt: "2026-11-12",
    athosBaixaStatus: null,
    titulos: [{ idcontareceber: 1363, valor: 1000 }],
  };

  const titulosAthos = [
    {
      idcontareceber: 1363,
      numerotitulo: "1363/1",
      datavencimento: "2026-11-10",
      valor: 1000,
      observacao: null,
      idvenda: 555,
      dataemissao: "2026-10-10",
      numeroordem: null,
    },
  ];

  async function post(corpo: unknown, chaveInterna: string | null = CHAVE_INTERNA, id = 41) {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (chaveInterna) h["x-internal-api-key"] = chaveInterna;
    const res = await fetch(`${base}/api/cobranca/boleto/${id}/atualizar`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(corpo),
    });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  beforeAll(async () => {
    envAnterior = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    const modulo = await Test.createTestingModule({
      controllers: [CobrancaBoletoAtualizadoController],
      providers: [
        CobrancaBoletoAtualizadoService,
        CobrancaEncargosConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: AthosService, useValue: athos },
        { provide: CobrancaService, useValue: cobrancaService },
        { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    jest.spyOn(app.get(CobrancaBoletoAtualizadoService), "hoje").mockReturnValue("2026-11-17");
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  });

  afterAll(async () => {
    if (app) await app.close();
    if (envAnterior === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = envAnterior;
  });

  beforeEach(() => {
    ordem = [];
    for (const m of [
      efi.post,
      efi.put,
      efi.get,
      prisma.cobrancaBoleto.findUnique,
      prisma.cobrancaBoleto.findFirst,
      prisma.cobrancaBoleto.create,
      prisma.cobrancaBoleto.update,
      prisma.cobrancaEncargosConfig.findUnique,
      prisma.cobrancaEncargosConfig.create,
      athos.buscarTitulosClienteContasReceber,
      cobrancaService.verificarPagamentoBoleto,
      cobrancaService.montarItensEfiPorVendaItem,
      cobrancaService.prepararEmissaoEfi,
    ]) {
      m.mockReset();
    }
    prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...original });
    prisma.cobrancaBoleto.findFirst.mockResolvedValue(null);
    prisma.cobrancaBoleto.create.mockImplementation(async () => {
      ordem.push("create");
      return { id: 42 };
    });
    prisma.cobrancaBoleto.update.mockImplementation(async (arg: any) => {
      if (arg?.data?.status === "cancelado") ordem.push("cancelado");
      return {};
    });
    prisma.cobrancaEncargosConfig.findUnique.mockResolvedValue(null);
    prisma.cobrancaEncargosConfig.create.mockResolvedValue({
      id: "default",
      taxaJurosMes: "0.99",
      multaPercentual: "2",
      atualizadoEm: new Date(),
    });
    athos.buscarTitulosClienteContasReceber.mockResolvedValue(titulosAthos);
    cobrancaService.verificarPagamentoBoleto.mockResolvedValue({ status: "pendente", atualizado: false });
    cobrancaService.montarItensEfiPorVendaItem.mockResolvedValue(
      new Map([["NF-e-440", { name: "NF-e #440", valueCentavos: 100000, amount: 1 }]]),
    );
    cobrancaService.prepararEmissaoEfi.mockResolvedValue({
      cli: efi,
      token: "tok",
      customer: { name: "ACME LTDA", cpf: "12345678909" },
      nomeCliente: "ACME LTDA",
      notificationUrl: "https://api.exemplo.com/api/cobranca/boleto/notificacao",
    });
    efi.post.mockImplementation(async () => {
      ordem.push("one-step");
      return {
        data: {
          code: 200,
          data: { charge_id: 9002, pdf: { charge: "https://download.sejaefi.com.br/x.pdf" }, barcode: "34191.79001" },
        },
      };
    });
    efi.put.mockImplementation(async () => {
      ordem.push("cancel");
      return { data: { code: 200 } };
    });
  });

  it("H1 caminho feliz: cria o novo, persiste, cancela o original e marca cancelado (nessa ordem)", async () => {
    const { status, json } = await post({ novoVencimento: "2026-11-18" });
    expect(status).toBe(201);
    expect(json).toMatchObject({
      cobrancaId: 42,
      cobrancaIdOriginal: 41,
      chargeId: 9002,
      valor: 1022.64,
      principal: 1000,
      juros: 2.64,
      multa: 20,
      expireAt: "2026-11-18",
      cancelamentoOriginal: "ok",
      aviso: null,
      reaproveitado: false,
    });
    expect(ordem).toEqual(["one-step", "create", "cancel", "cancelado"]);
  });

  it("H2 corpo EFI: itens + juros + multa, configurations e mensagem de ate 4 linhas ASCII", async () => {
    await post({ novoVencimento: "2026-11-18" });
    expect(efi.post).toHaveBeenCalledTimes(1);
    const [url, body] = efi.post.mock.calls[0];
    expect(url).toBe("/v1/charge/one-step");
    expect(body.items).toEqual([
      { name: "NF-e #440", value: 100000, amount: 1 },
      { name: "Juros de mora", value: 264, amount: 1 },
      { name: "Multa por atraso", value: 2000, amount: 1 },
    ]);
    expect(body.items.reduce((s: number, i: any) => s + i.value * i.amount, 0)).toBe(102264);
    const billet = body.payment.banking_billet;
    expect(billet.expire_at).toBe("2026-11-18");
    expect(billet.configurations).toEqual({ fine: 200, interest: 33 });
    const linhas = String(billet.message).split("\n");
    expect(linhas.length).toBeGreaterThanOrEqual(1);
    expect(linhas.length).toBeLessThanOrEqual(4);
    for (const l of linhas) expect(l.length).toBeLessThanOrEqual(100);
    expect(String(billet.message)).toMatch(/^[\x20-\x7E\n]+$/);
    for (const trecho of ["2,64", "20,00", "10/11/2026", "18/11/2026", "0,99%", "2%"]) {
      expect(String(billet.message)).toContain(trecho);
    }
    expect(cobrancaService.montarItensEfiPorVendaItem).toHaveBeenCalledWith(
      [{ idcontareceber: 1363, idvenda: 555, valor: 1000 }],
      1000,
    );
  });

  it("H3 persistencia: vinculo, snapshot por titulo, cancelamento estrito e update cancelado", async () => {
    await post({ novoVencimento: "2026-11-18" });
    expect(prisma.cobrancaBoleto.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.cobrancaBoleto.create.mock.calls[0][0];
    const mensagem = efi.post.mock.calls[0][1].payment.banking_billet.message;
    expect(data).toMatchObject({
      txidEfi: "9002",
      idclienteAthos: 2641,
      valor: 1022.64,
      status: "pendente",
      expireAt: "2026-11-18",
      boletoOrigemId: 41,
      valorPrincipal: 1000,
      valorJuros: 2.64,
      valorMulta: 20,
      taxaJurosMesAplicada: 0.99,
      multaPercentualAplicada: 2,
      taxaJurosMesPosVencimento: 0.99,
      multaPercentualPosVencimento: 2,
      mensagemAtualizacao: mensagem,
    });
    expect(data.titulos.createMany.data).toEqual([
      { idcontareceber: 1363, valor: 1000, juros: 2.64, multa: 20, diasAtraso: 8, vencimentoOriginal: "2026-11-10" },
    ]);
    expect(efi.put).toHaveBeenCalledWith("/v1/charge/9001/cancel", {}, expect.anything());
    expect(prisma.cobrancaBoleto.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { status: "cancelado" } });
  });

  it("H4 sem chave interna -> 401 e EFI nunca chamada", async () => {
    const { status } = await post({ novoVencimento: "2026-11-18" }, null);
    expect(status).toBe(401);
    expect(efi.post).not.toHaveBeenCalled();
  });

  it("H5 data fora de [hoje, proximo dia util] -> 400 citando as datas permitidas, sem EFI", async () => {
    for (const novoVencimento of ["2026-11-20", "2026-11-16"]) {
      const { status, json } = await post({ novoVencimento });
      expect(status).toBe(400);
      expect(String(json.message)).toContain("17/11/2026");
      expect(String(json.message)).toContain("18/11/2026");
    }
    expect(efi.post).not.toHaveBeenCalled();
  });

  it("H6 teto e campos desconhecidos -> 400 (DTO), sem EFI", async () => {
    expect((await post({ novoVencimento: "2026-11-18", multaPercentual: 2.5 })).status).toBe(400);
    expect((await post({ novoVencimento: "2026-11-18", taxaJurosMes: 1.2 })).status).toBe(400);
    expect((await post({ novoVencimento: "2026-11-18", total: 5 })).status).toBe(400);
    expect(efi.post).not.toHaveBeenCalled();
  });

  it("H7 falha ao cancelar o original (code 500 ou excecao) -> 201 com aviso, novo gravado, original pendente", async () => {
    efi.put.mockResolvedValueOnce({ data: { code: 500 } });
    const r1 = await post({ novoVencimento: "2026-11-18" });
    expect(r1.status).toBe(201);
    expect(r1.json.cancelamentoOriginal).toBe("falhou");
    expect(String(r1.json.aviso)).toContain("41");
    expect(prisma.cobrancaBoleto.create).toHaveBeenCalledTimes(1);
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();

    prisma.cobrancaBoleto.create.mockClear();
    efi.put.mockRejectedValueOnce(new Error("timeout"));
    const r2 = await post({ novoVencimento: "2026-11-18" });
    expect(r2.status).toBe(201);
    expect(r2.json.cancelamentoOriginal).toBe("falhou");
    expect(r2.json.aviso).not.toBeNull();
    expect(prisma.cobrancaBoleto.create).toHaveBeenCalledTimes(1);
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });

  it("H8 falha da EFI ao criar o boleto -> 500 e nada gravado nem cancelado", async () => {
    efi.post.mockRejectedValueOnce(new Error("EFI fora do ar"));
    const { status } = await post({ novoVencimento: "2026-11-18" });
    expect(status).toBe(500);
    expect(prisma.cobrancaBoleto.create).not.toHaveBeenCalled();
    expect(efi.put).not.toHaveBeenCalled();
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
  });
});
