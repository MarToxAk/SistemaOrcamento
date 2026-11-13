import { BadRequestException, NotFoundException, RequestMethod, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";

import { CobrancaNotasController } from "./cobranca-notas.controller";
import { CobrancaNotasService } from "./cobranca-notas.service";
import { BaixarNotasZipDto } from "./dto/baixar-notas-zip.dto";
import * as zipStore from "./zip-store.util";

// So hojeSaoPaulo e substituida; o resto do modulo segue real (Z12).
jest.mock("../integrations/athos/athos-conta-receber-baixa.service", () => ({
  ...jest.requireActual("../integrations/athos/athos-conta-receber-baixa.service"),
  hojeSaoPaulo: jest.fn(() => "2026-11-13"),
}));

// Colaboradores falsos: nenhuma rede, nenhum Prisma, nenhum Athos, nenhum renderizador de PDF (Fase 47, D-12).
function montar() {
  const prisma = {
    nfseEmitida: { findUnique: jest.fn() },
    cobrancaBoleto: { findUnique: jest.fn() },
  };
  const cobrancaService = { baixarDanfsePdf: jest.fn() };
  const athos = { buscarNotasFiscaisXmlPorTitulos: jest.fn() };
  const danfe = { gerarDanfe: jest.fn() };
  const service = new CobrancaNotasService(prisma as any, cobrancaService as any, athos as any, danfe as any);
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { service, prisma, cobrancaService, athos, danfe };
}

function nfsePdfXml(numero: string) {
  return {
    pdfBuffer: Buffer.from(`%PDF-nfse-${numero}`),
    nomeArquivo: `NFSe-${numero}.pdf`,
    xml: `<NFSe n="${numero}"/>`,
    xmlNomeArquivo: `NFSe-${numero}.xml`,
  };
}

function nomesDasEntradas(spy: jest.SpyInstance): string[] {
  const entradas = spy.mock.calls[spy.mock.calls.length - 1][0] as Array<{ nome: string }>;
  return entradas.map((e) => e.nome);
}

function conteudoDe(spy: jest.SpyInstance, nome: string): string {
  const entradas = spy.mock.calls[spy.mock.calls.length - 1][0] as Array<{ nome: string; conteudo: Buffer }>;
  const achada = entradas.find((e) => e.nome === nome);
  if (!achada) throw new Error(`Entrada ${nome} ausente`);
  return achada.conteudo.toString("utf8");
}

describe("CobrancaNotasService.gerarZipNotas (D-12)", () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(zipStore, "criarZipStore");
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("Z1. NFS-e com PDF e XML: so os dois arquivos, sem LEIA-ME, nome NFSe-239.zip", async () => {
    const { service, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockResolvedValue(nfsePdfXml("239"));

    const r = await service.gerarZipNotas({ nfseIds: [74] });

    expect(nomesDasEntradas(spy)).toEqual(["NFSe-239.pdf", "NFSe-239.xml"]);
    expect(r.nomeArquivo).toBe("NFSe-239.zip");
    expect(r.zip.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("Z2. NFS-e iiBrasil (sem xml): PDF + LEIA-ME com 'XML indisponível' e o numero; nenhum .xml", async () => {
    const { service, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockResolvedValue({
      pdfBuffer: Buffer.from("%PDF-ii"),
      nomeArquivo: "NFSe-239.pdf",
    });

    await service.gerarZipNotas({ nfseIds: [74] });

    const nomes = nomesDasEntradas(spy);
    expect(nomes).toEqual(["NFSe-239.pdf", "LEIA-ME.txt"]);
    expect(nomes.some((n) => n.endsWith(".xml"))).toBe(false);
    const leia = conteudoDe(spy, "LEIA-ME.txt");
    expect(leia).toContain("XML indisponível");
    expect(leia).toContain("239");
    expect(leia).toContain("Itens não incluídos neste arquivo");
  });

  it("Z3. NF-e: PDF (DANFE) + XML do Athos, nome NF-e-4521.zip", async () => {
    const { service, prisma, athos, danfe } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue({ id: 45, titulos: [{ idcontareceber: 1363 }] });
    athos.buscarNotasFiscaisXmlPorTitulos.mockResolvedValue([
      { numero: "4521", xml: "<nfeProc/>", cancelada: false },
    ]);
    danfe.gerarDanfe.mockResolvedValue(Buffer.from("%PDF-danfe"));

    const r = await service.gerarZipNotas({ nfe: [{ cobrancaBoletoId: 45, numero: "4521" }] });

    expect(athos.buscarNotasFiscaisXmlPorTitulos).toHaveBeenCalledWith([1363]);
    expect(danfe.gerarDanfe).toHaveBeenCalledWith({ xml: "<nfeProc/>", cancelada: false });
    expect(nomesDasEntradas(spy)).toEqual(["NF-e-4521.pdf", "NF-e-4521.xml"]);
    expect(conteudoDe(spy, "NF-e-4521.xml")).toBe("<nfeProc/>");
    expect(r.nomeArquivo).toBe("NF-e-4521.zip");
  });

  it("Z4. gerarDanfe falha: XML + LEIA-ME dizendo que o PDF nao pôde ser gerado", async () => {
    const { service, prisma, athos, danfe } = montar();
    prisma.cobrancaBoleto.findUnique.mockResolvedValue({ id: 45, titulos: [{ idcontareceber: 1363 }] });
    athos.buscarNotasFiscaisXmlPorTitulos.mockResolvedValue([
      { numero: "4521", xml: "<nfeProc/>", cancelada: false },
    ]);
    danfe.gerarDanfe.mockRejectedValue(new Error("puppeteer caiu"));

    await service.gerarZipNotas({ nfe: [{ cobrancaBoletoId: 45, numero: "4521" }] });

    expect(nomesDasEntradas(spy)).toEqual(["NF-e-4521.xml", "LEIA-ME.txt"]);
    expect(conteudoDe(spy, "LEIA-ME.txt")).toContain("PDF não pôde ser gerado");
  });

  it("Z5. boleto inexistente ou numero fora das notas: so LEIA-ME para o item; os demais entram", async () => {
    const { service, prisma, athos, danfe, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockResolvedValue(nfsePdfXml("239"));
    prisma.cobrancaBoleto.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) =>
      where.id === 45 ? { id: 45, titulos: [{ idcontareceber: 1363 }] } : null,
    );
    athos.buscarNotasFiscaisXmlPorTitulos.mockResolvedValue([
      { numero: "4521", xml: "<nfeProc/>", cancelada: false },
    ]);
    danfe.gerarDanfe.mockResolvedValue(Buffer.from("%PDF-danfe"));

    await service.gerarZipNotas({
      nfseIds: [74],
      nfe: [
        { cobrancaBoletoId: 999, numero: "1111" },
        { cobrancaBoletoId: 45, numero: "9999" },
      ],
    });

    const nomes = nomesDasEntradas(spy);
    expect(nomes).toEqual(["NFSe-239.pdf", "NFSe-239.xml", "LEIA-ME.txt"]);
    const leia = conteudoDe(spy, "LEIA-ME.txt");
    expect(leia).toContain("1111");
    expect(leia).toContain("9999");
  });

  it("Z6. duas NFS-e com o mesmo numero: sufixo -2 no PDF e no XML", async () => {
    const { service, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockResolvedValue(nfsePdfXml("239"));

    await service.gerarZipNotas({ nfseIds: [74, 75] });

    expect(nomesDasEntradas(spy)).toEqual([
      "NFSe-239.pdf",
      "NFSe-239.xml",
      "NFSe-239-2.pdf",
      "NFSe-239-2.xml",
    ]);
  });

  it("Z7. baixarDanfsePdf lanca para um id: LEIA-ME com a mensagem; chamadas uma por vez, na ordem", async () => {
    const { service, cobrancaService } = montar();
    const ordem: number[] = [];
    let emAndamento = 0;
    let maximoSimultaneo = 0;
    cobrancaService.baixarDanfsePdf.mockImplementation(async (id: number) => {
      ordem.push(id);
      emAndamento++;
      maximoSimultaneo = Math.max(maximoSimultaneo, emAndamento);
      await new Promise((resolve) => setImmediate(resolve));
      emAndamento--;
      if (id === 99) throw new BadRequestException("NFS-e 99 não encontrada.");
      return nfsePdfXml(String(id));
    });

    await service.gerarZipNotas({ nfseIds: [10, 99, 20] });

    expect(ordem).toEqual([10, 99, 20]);
    expect(maximoSimultaneo).toBe(1);
    expect(nomesDasEntradas(spy)).toEqual([
      "NFSe-10.pdf",
      "NFSe-10.xml",
      "NFSe-20.pdf",
      "NFSe-20.xml",
      "LEIA-ME.txt",
    ]);
    expect(conteudoDe(spy, "LEIA-ME.txt")).toContain("NFS-e 99 não encontrada.");
  });

  it("Z8. nenhum arquivo produzido: NotFoundException 'Nenhum arquivo disponível'", async () => {
    const { service, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockRejectedValue(new BadRequestException("NFS-e 99 não encontrada."));

    const promessa = service.gerarZipNotas({ nfseIds: [99] });
    await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
    await expect(promessa).rejects.toThrow("Nenhum arquivo disponível");
  });

  it("Z9. lote vazio: BadRequest; 51 itens somando nfseIds e nfe: BadRequest com '50'", async () => {
    const { service } = montar();
    await expect(service.gerarZipNotas({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.gerarZipNotas({ nfseIds: [], nfe: [] })).rejects.toBeInstanceOf(BadRequestException);

    const nfseIds = Array.from({ length: 30 }, (_, i) => i + 1);
    const nfe = Array.from({ length: 21 }, (_, i) => ({ cobrancaBoletoId: i + 1, numero: String(1000 + i) }));
    const promessa = service.gerarZipNotas({ nfseIds, nfe });
    await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
    await expect(promessa).rejects.toThrow("50");
  });

  it("Z9b. duplicatas contam uma vez so (ids repetidos nao estouram o limite)", async () => {
    const { service, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockResolvedValue(nfsePdfXml("239"));

    await service.gerarZipNotas({ nfseIds: Array.from({ length: 60 }, () => 74) });

    expect(cobrancaService.baixarDanfsePdf).toHaveBeenCalledTimes(1);
  });

  it("Z12. varios itens: nome notas-fiscais-<AAAA-MM-DD>.zip via hojeSaoPaulo()", async () => {
    const { service, cobrancaService } = montar();
    cobrancaService.baixarDanfsePdf.mockImplementation(async (id: number) => nfsePdfXml(String(id)));

    const r = await service.gerarZipNotas({ nfseIds: [10, 20] });

    expect(r.nomeArquivo).toBe("notas-fiscais-2026-11-13.zip");
  });
});

describe("BaixarNotasZipDto (Z10)", () => {
  // Mesma configuracao do ValidationPipe global de apps/backend/src/main.ts
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const meta: ArgumentMetadata = { type: "body", metatype: BaixarNotasZipDto, data: "" };

  it("aceita corpo valido e converte para as classes", async () => {
    const r = (await pipe.transform(
      { nfseIds: [1, 2], nfe: [{ cobrancaBoletoId: 45, numero: "4521" }] },
      meta,
    )) as BaixarNotasZipDto;
    expect(r.nfseIds).toEqual([1, 2]);
    expect(r.nfe?.[0].numero).toBe("4521");
  });

  it("rejeita numero '12a', nfseIds textual, cobrancaBoletoId 0, campo desconhecido e 51 ids", async () => {
    await expect(pipe.transform({ nfe: [{ cobrancaBoletoId: 1, numero: "12a" }] }, meta)).rejects.toBeDefined();
    await expect(pipe.transform({ nfseIds: ["1"] }, meta)).rejects.toBeDefined();
    await expect(pipe.transform({ nfe: [{ cobrancaBoletoId: 0, numero: "1" }] }, meta)).rejects.toBeDefined();
    await expect(pipe.transform({ nfseIds: [1], extra: true }, meta)).rejects.toBeDefined();
    await expect(
      pipe.transform({ nfseIds: Array.from({ length: 51 }, (_, i) => i + 1) }, meta),
    ).rejects.toBeDefined();
  });
});

describe("CobrancaNotasController.gerarZip (Z11)", () => {
  it("rota POST notas/zip com HTTP 200; grava headers do ZIP e envia o Buffer", async () => {
    const proto = CobrancaNotasController.prototype;
    expect(Reflect.getMetadata("path", proto.gerarZip)).toBe("notas/zip");
    expect(Reflect.getMetadata("method", proto.gerarZip)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata("__httpCode__", proto.gerarZip)).toBe(200);

    const zip = Buffer.from("PK-fake");
    const notas = { gerarZipNotas: jest.fn().mockResolvedValue({ zip, nomeArquivo: "notas-fiscais-2026-11-13.zip" }) };
    const controller = new CobrancaNotasController(notas as any);
    const res = { setHeader: jest.fn(), send: jest.fn() };
    const dto = { nfseIds: [1] } as BaixarNotasZipDto;

    await controller.gerarZip(dto, res);

    expect(notas.gerarZipNotas).toHaveBeenCalledWith(dto);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/zip");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="notas-fiscais-2026-11-13.zip"',
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Length", zip.length);
    expect(res.send).toHaveBeenCalledWith(zip);
  });
});
