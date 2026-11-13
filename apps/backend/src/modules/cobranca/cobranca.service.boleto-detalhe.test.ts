import "reflect-metadata";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AdminAuthGuard } from "../security/admin-auth.guard";
import { IS_PUBLIC_KEY } from "../security/security.constants";
import { chavesBoletoEfi, extrairDadosPagamentoEfi } from "./cobranca-efi-detalhe.util";
import { CobrancaController } from "./cobranca.controller";
import { CobrancaService } from "./cobranca.service";

jest.mock("axios");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// Valores ficticios, so para provar que NUNCA aparecem em log (S6).
const LINHA = "23793.38128 60000.000003 00000.000400 1 84340000012345";
const PIX = "00020101021226870014br.gov.bcb.pix2565pix.exemplo.invalid/qr/v2/FICTICIO5204000053039865802BR";

const corpoEfi = (billet: unknown) => ({ code: 200, data: { payment: { banking_billet: billet } } });
const CORPO_OK = corpoEfi({ barcode: LINHA, pix: { qrcode: PIX } });

describe("cobranca-efi-detalhe.util (D-06)", () => {
  it("E1. caminho documentado: payment.banking_billet.barcode e pix.qrcode", () => {
    expect(extrairDadosPagamentoEfi(CORPO_OK)).toEqual({ linhaDigitavel: LINHA, pixCopiaECola: PIX });
  });

  it("E2. data como array: usa o indice 0", () => {
    const corpo = { code: 200, data: [CORPO_OK.data] };
    expect(extrairDadosPagamentoEfi(corpo)).toEqual({ linhaDigitavel: LINHA, pixCopiaECola: PIX });
  });

  it("E3. campos na raiz de data (formato da criacao one-step)", () => {
    const corpo = { data: { barcode: LINHA, pix: { qrcode: PIX } } };
    expect(extrairDadosPagamentoEfi(corpo)).toEqual({ linhaDigitavel: LINHA, pixCopiaECola: PIX });
  });

  it("E4. ausentes, numero ou so espacos viram null; chavesBoletoEfi so devolve nomes de campos", () => {
    const nulos = { linhaDigitavel: null, pixCopiaECola: null };
    expect(extrairDadosPagamentoEfi(undefined)).toEqual(nulos);
    expect(extrairDadosPagamentoEfi(null)).toEqual(nulos);
    expect(extrairDadosPagamentoEfi("texto")).toEqual(nulos);
    expect(extrairDadosPagamentoEfi({ data: {} })).toEqual(nulos);
    expect(extrairDadosPagamentoEfi(corpoEfi({ barcode: 123, pix: { qrcode: "   " } }))).toEqual(nulos);
    expect(extrairDadosPagamentoEfi(corpoEfi({ barcode: "   " }))).toEqual(nulos);

    expect(chavesBoletoEfi(corpoEfi({ barcode: LINHA, link: "x", pix: {} }))).toEqual(["barcode", "link", "pix"]);
    expect(chavesBoletoEfi({ data: {} })).toEqual([]);
    expect(chavesBoletoEfi(null)).toEqual([]);
  });

  it("E5. aparas: o texto devolvido nao tem espacos nas pontas", () => {
    const r = extrairDadosPagamentoEfi(corpoEfi({ barcode: `  ${LINHA}\n`, pix: { qrcode: ` ${PIX} ` } }));
    expect(r).toEqual({ linhaDigitavel: LINHA, pixCopiaECola: PIX });
  });
});

function montar() {
  const prisma = {
    cobrancaBoleto: { findUnique: jest.fn(), update: jest.fn() },
  };
  const config = {
    get: jest.fn((chave: string) => {
      if (chave === "EFI_CLIENT_ID") return "id-ficticio";
      if (chave === "EFI_CLIENT_SECRET") return "segredo-ficticio";
      return undefined;
    }),
  };
  const baixaAthos = {
    executarAposPagamento: jest.fn(),
    baixarManual: jest.fn(),
    estornarBaixa: jest.fn(),
    consultarStatus: jest.fn(),
  };
  const naoUsado = {} as any;
  const service = new CobrancaService(
    naoUsado,
    prisma as any,
    config as any,
    naoUsado,
    naoUsado,
    naoUsado,
    naoUsado,
    naoUsado,
    baixaAthos as any,
  );
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).logger = logger;

  const cliente = { post: jest.fn(), get: jest.fn() };
  (axios.create as jest.Mock).mockReturnValue(cliente);
  cliente.post.mockResolvedValue({ data: { access_token: "token-ficticio" } });
  cliente.get.mockResolvedValue({ data: CORPO_OK });
  return { service, prisma, baixaAthos, logger, cliente };
}

const BOLETO = {
  id: 5,
  status: "pendente",
  txidEfi: "9988",
  titulos: [{ idcontareceber: 1363, valor: { toString: () => "150.00" } }],
};

function textoDosLogs(logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock }): string {
  return JSON.stringify([...logger.log.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls]);
}

describe("CobrancaService.buscarDetalheBoleto (D-06, D-03: somente leitura)", () => {
  beforeEach(() => {
    (axios.create as jest.Mock).mockReset();
  });

  it("S1. boleto inexistente: NotFoundException 'não encontrada'", async () => {
    const { service, prisma } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(null);

    const erro = await service.buscarDetalheBoleto(5).catch((e) => e);

    expect(erro).toBeInstanceOf(NotFoundException);
    expect((erro as Error).message).toContain("não encontrada");
  });

  it("S2. sem txidEfi: sem_charge, aviso preenchido, EFI nao chamada e valor dos titulos como numero", async () => {
    const { service, prisma } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...BOLETO, txidEfi: null });

    const r = await service.buscarDetalheBoleto(5);

    expect(r).toEqual({
      id: 5,
      status: "pendente",
      linhaDigitavel: null,
      pixCopiaECola: null,
      consultaEfi: "sem_charge",
      avisoEfi: "Boleto sem identificador da EFI; linha digitável indisponível.",
      titulos: [{ idcontareceber: 1363, valor: 150 }],
    });
    expect(axios.create).not.toHaveBeenCalled();
    expect(prisma.cobrancaBoleto.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      include: { titulos: { select: { idcontareceber: true, valor: true } } },
    });
  });

  it("S3. EFI ok: devolve linha e PIX, consulta GET /v1/charge/9988 e nao grava nada", async () => {
    const { service, prisma, baixaAthos, cliente } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);

    const r = await service.buscarDetalheBoleto(5);

    expect(r).toEqual({
      id: 5,
      status: "pendente",
      linhaDigitavel: LINHA,
      pixCopiaECola: PIX,
      consultaEfi: "ok",
      avisoEfi: null,
      titulos: [{ idcontareceber: 1363, valor: 150 }],
    });
    expect(cliente.get).toHaveBeenCalledTimes(1);
    expect(cliente.get).toHaveBeenCalledWith("/v1/charge/9988", expect.anything());
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }));
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    for (const fn of Object.values(baixaAthos)) expect(fn).not.toHaveBeenCalled();
  });

  it("S3b. EFI ok mesmo com status pago na EFI: nao atualiza status nem dispara baixa", async () => {
    const { service, prisma, baixaAthos, cliente } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);
    cliente.get.mockResolvedValue({
      data: { code: 200, data: { status: "paid", payment: { banking_billet: { barcode: LINHA } } } },
    });

    const r = await service.buscarDetalheBoleto(5);

    expect(r.status).toBe("pendente");
    expect(prisma.cobrancaBoleto.update).not.toHaveBeenCalled();
    expect(baixaAthos.executarAposPagamento).not.toHaveBeenCalled();
  });

  it("S4. EFI ok sem barcode: linha null, aviso proprio e log so com as chaves de banking_billet", async () => {
    const { service, prisma, cliente, logger } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);
    cliente.get.mockResolvedValue({ data: corpoEfi({ link: "https://exemplo.invalid/x", pix: { qrcode: PIX } }) });

    const r = await service.buscarDetalheBoleto(5);

    expect(r.linhaDigitavel).toBeNull();
    expect(r.pixCopiaECola).toBe(PIX);
    expect(r.consultaEfi).toBe("ok");
    expect(r.avisoEfi).toBe("A EFI não devolveu a linha digitável deste boleto.");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const aviso = String(logger.warn.mock.calls[0][0]);
    expect(aviso).toContain("link");
    expect(aviso).toContain("pix");
    expect(aviso).not.toContain(PIX);
  });

  it("S5. authorize rejeita: consultaEfi 'falha' com aviso, sem lancar", async () => {
    const { service, prisma, cliente } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);
    cliente.post.mockRejectedValue(new Error("timeout de 15000ms"));

    const r = await service.buscarDetalheBoleto(5);

    expect(r.consultaEfi).toBe("falha");
    expect(r.avisoEfi).toBe("Não foi possível consultar a EFI agora. Tente novamente.");
    expect(r.linhaDigitavel).toBeNull();
    expect(r.pixCopiaECola).toBeNull();
    expect(r.titulos).toEqual([{ idcontareceber: 1363, valor: 150 }]);
  });

  it("S5b. variavel de ambiente da EFI ausente: tambem vira 'falha', nunca 500", async () => {
    const { service, prisma } = montar();
    (service as any).config = { get: jest.fn().mockReturnValue(undefined) };
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);

    const r = await service.buscarDetalheBoleto(5);

    expect(r.consultaEfi).toBe("falha");
  });

  it("S6. nenhum log (sucesso, sem barcode ou falha) contem a linha digitavel nem o PIX", async () => {
    const { service, prisma, cliente, logger } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);

    await service.buscarDetalheBoleto(5);
    cliente.get.mockResolvedValue({ data: corpoEfi({ pix: { qrcode: PIX } }) });
    await service.buscarDetalheBoleto(6);
    cliente.post.mockRejectedValue(new Error("erro generico"));
    await service.buscarDetalheBoleto(7);

    const logs = textoDosLogs(logger);
    expect(logs).not.toContain(LINHA);
    expect(logs).not.toContain(PIX);
  });

  describe("S7. cache de 60 s (so quando a EFI trouxe a linha digitavel)", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("duas leituras seguidas fazem uma unica chamada GET /v1/charge; apos 60 s consulta de novo", async () => {
      const { service, prisma, cliente } = montar();
      prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);

      const a = await service.buscarDetalheBoleto(5);
      const b = await service.buscarDetalheBoleto(5);
      expect(cliente.get).toHaveBeenCalledTimes(1);
      expect(b).toEqual(a);

      jest.advanceTimersByTime(59_000);
      await service.buscarDetalheBoleto(5);
      expect(cliente.get).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(2_000);
      await service.buscarDetalheBoleto(5);
      expect(cliente.get).toHaveBeenCalledTimes(2);
    });

    it("o cache guarda so os dados da EFI: status e titulos vem sempre do banco", async () => {
      const { service, prisma } = montar();
      prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);
      await service.buscarDetalheBoleto(5);

      prisma.cobrancaBoleto.findUnique.mockResolvedValue({ ...BOLETO, status: "pago" });
      const r = await service.buscarDetalheBoleto(5);

      expect(r.status).toBe("pago");
      expect(r.linhaDigitavel).toBe(LINHA);
    });

    it("boletos diferentes nao compartilham cache", async () => {
      const { service, prisma, cliente } = montar();
      prisma.cobrancaBoleto.findUnique
        .mockResolvedValueOnce(BOLETO)
        .mockResolvedValueOnce({ ...BOLETO, id: 6, txidEfi: "7766" });

      await service.buscarDetalheBoleto(5);
      await service.buscarDetalheBoleto(6);

      expect(cliente.get).toHaveBeenCalledTimes(2);
      expect(cliente.get).toHaveBeenLastCalledWith("/v1/charge/7766", expect.anything());
    });

    it("falha da EFI nao e cacheada: a leitura seguinte consulta de novo", async () => {
      const { service, prisma, cliente } = montar();
      prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);
      cliente.get.mockRejectedValueOnce(new Error("503"));

      const falha = await service.buscarDetalheBoleto(5);
      const ok = await service.buscarDetalheBoleto(5);

      expect(falha.consultaEfi).toBe("falha");
      expect(ok.consultaEfi).toBe("ok");
      expect(cliente.get).toHaveBeenCalledTimes(2);
    });

    it("sem_charge e resposta sem linha digitavel nao sao cacheados", async () => {
      const { service, prisma, cliente } = montar();
      prisma.cobrancaBoleto.findUnique.mockResolvedValue(BOLETO);
      cliente.get.mockResolvedValueOnce({ data: corpoEfi({}) });

      const semLinha = await service.buscarDetalheBoleto(5);
      const comLinha = await service.buscarDetalheBoleto(5);

      expect(semLinha.linhaDigitavel).toBeNull();
      expect(comLinha.linhaDigitavel).toBe(LINHA);
      expect(cliente.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe("CobrancaController.detalheBoleto (C4)", () => {
  it("C4. GET boleto/:id/detalhe, sem AdminAuthGuard e sem @Public, delega para buscarDetalheBoleto", async () => {
    const handler = CobrancaController.prototype.detalheBoleto;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("boleto/:id/detalhe");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    const guards: unknown[] = Reflect.getMetadata("__guards__", handler) ?? [];
    expect(guards).not.toContain(AdminAuthGuard);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();

    const cobranca = { buscarDetalheBoleto: jest.fn().mockResolvedValue({ id: 5 }) };
    const controller = new CobrancaController(cobranca as any, {} as any, {} as any);

    await expect(controller.detalheBoleto(5)).resolves.toEqual({ id: 5 });
    expect(cobranca.buscarDetalheBoleto).toHaveBeenCalledWith(5);
  });
});
