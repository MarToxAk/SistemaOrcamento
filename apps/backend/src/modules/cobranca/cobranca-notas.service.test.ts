import { BadGatewayException, NotFoundException, RequestMethod } from "@nestjs/common";

import { IS_PUBLIC_KEY } from "../security/security.constants";
import { CobrancaNotasController } from "./cobranca-notas.controller";
import { CobrancaNotasService } from "./cobranca-notas.service";

jest.mock("axios");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// Colaboradores falsos: nenhuma rede, nenhum Prisma, nenhum Athos (Fase 47, plano 01, D-11).
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

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

async function mensagemDeRejeicao(promessa: Promise<unknown>): Promise<{ erro: unknown; mensagem: string }> {
  try {
    await promessa;
  } catch (erro) {
    return { erro, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
  throw new Error("Era esperada uma rejeicao, mas a promessa resolveu.");
}

describe("CobrancaNotasService.baixarNfseXml (D-11)", () => {
  beforeEach(() => {
    (axios.get as jest.Mock).mockReset();
  });

  it("X1. xmlNacional presente: devolve os mesmos bytes e nao chama axios", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: "<NFSe>a</NFSe>",
      linkNfse: "http://exemplo/239",
    });

    const r = await service.baixarNfseXml(74);

    expect(r.xml.toString("utf8")).toBe("<NFSe>a</NFSe>");
    expect(r.nomeArquivo).toBe("NFSe-239.xml");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("X2. so linkNfse com XML: devolve bytes exatamente como vieram e usa limites de timeout/tamanho", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      linkNfse: "https://minio.exemplo/nfse/239.xml",
    });
    const bytes = Buffer.concat([BOM, Buffer.from('  \n<?xml version="1.0"?><NFSe/>', "utf8")]);
    (axios.get as jest.Mock).mockResolvedValue({ data: bytes });

    const r = await service.baixarNfseXml(74);

    expect(Buffer.compare(r.xml, bytes)).toBe(0);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(
      "https://minio.exemplo/nfse/239.xml",
      expect.objectContaining({ responseType: "arraybuffer", timeout: 15000, maxContentLength: 5242880 }),
    );
  });

  it("X3. linkNfse devolve PDF (iiBrasil): NotFoundException 'XML indisponível' com o numero", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      linkNfse: "http://exemplo/239",
    });
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from("%PDF-1.4 conteudo") });

    const { erro, mensagem } = await mensagemDeRejeicao(service.baixarNfseXml(74));

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(mensagem).toContain("XML indisponível");
    expect(mensagem).toContain("239");
  });

  it("X4. linkNfse devolve pagina HTML: NotFoundException 'XML indisponível'", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      linkNfse: "http://exemplo/239",
    });
    (axios.get as jest.Mock).mockResolvedValue({
      data: Buffer.from("  <!DOCTYPE html><html><body>erro</body></html>"),
    });

    const { erro, mensagem } = await mensagemDeRejeicao(service.baixarNfseXml(74));

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(mensagem).toContain("XML indisponível");
  });

  it("X4b. HTML em minusculas e conteudo que nao comeca por '<' tambem sao recusados", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      linkNfse: "http://exemplo/239",
    });
    (axios.get as jest.Mock).mockResolvedValueOnce({ data: Buffer.from("<html lang='pt'></html>") });
    (axios.get as jest.Mock).mockResolvedValueOnce({ data: Buffer.from("texto qualquer") });

    await expect(service.baixarNfseXml(74)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.baixarNfseXml(74)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("X5. sem xmlNacional e sem linkNfse: 'XML indisponível' e 'nenhum XML salvo'", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      linkNfse: null,
    });

    const { erro, mensagem } = await mensagemDeRejeicao(service.baixarNfseXml(74));

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(mensagem).toContain("XML indisponível");
    expect(mensagem).toContain("nenhum XML salvo");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("X6. id inexistente: NotFoundException 'não encontrada'", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue(null);

    const { erro, mensagem } = await mensagemDeRejeicao(service.baixarNfseXml(999));

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(mensagem).toContain("não encontrada");
  });

  it("X7. protocolo diferente de http/https: recusa sem requisicao de rede", async () => {
    const { service, prisma } = montar();
    for (const link of ["file:///etc/passwd", "ftp://x/y", "isto nao e url"]) {
      prisma.nfseEmitida.findUnique.mockResolvedValue({
        id: 74,
        numeroNfse: "239",
        xmlNacional: null,
        linkNfse: link,
      });
      await expect(service.baixarNfseXml(74)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("X8. axios 404/410: NotFound; erro de rede ou 500: BadGateway (502) com log sem conteudo", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      linkNfse: "http://exemplo/239",
    });

    (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 404 }, message: "Request failed" });
    const a = await mensagemDeRejeicao(service.baixarNfseXml(74));
    expect(a.erro).toBeInstanceOf(NotFoundException);
    expect(a.mensagem).toContain("XML indisponível");

    (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 410 }, message: "Gone" });
    await expect(service.baixarNfseXml(74)).rejects.toBeInstanceOf(NotFoundException);

    (axios.get as jest.Mock).mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(service.baixarNfseXml(74)).rejects.toBeInstanceOf(BadGatewayException);

    (axios.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500 }, message: "boom" });
    await expect(service.baixarNfseXml(74)).rejects.toBeInstanceOf(BadGatewayException);
    expect((service as any).logger.warn).toHaveBeenCalled();
  });

  it("X9. nome do arquivo: numero nulo usa o id; caracteres fora de [A-Za-z0-9_-] viram '_'", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findUnique.mockResolvedValueOnce({
      id: 74,
      numeroNfse: null,
      xmlNacional: "<a/>",
      linkNfse: null,
    });
    expect((await service.baixarNfseXml(74)).nomeArquivo).toBe("NFSe-74.xml");

    prisma.nfseEmitida.findUnique.mockResolvedValueOnce({
      id: 74,
      numeroNfse: "12/3",
      xmlNacional: "<a/>",
      linkNfse: null,
    });
    expect((await service.baixarNfseXml(74)).nomeArquivo).toBe("NFSe-12_3.xml");
  });
});

describe("CobrancaNotasController.baixarXml (D-11)", () => {
  it("C1. rota GET nfse/:id/xml; grava headers e envia o Buffer", async () => {
    const proto = CobrancaNotasController.prototype;
    expect(Reflect.getMetadata("path", proto.baixarXml)).toBe("nfse/:id/xml");
    expect(Reflect.getMetadata("method", proto.baixarXml)).toBe(RequestMethod.GET);

    const xml = Buffer.from("<NFSe/>");
    const notas = { baixarNfseXml: jest.fn().mockResolvedValue({ xml, nomeArquivo: "NFSe-239.xml" }) };
    const controller = new CobrancaNotasController(notas as any);
    const res = { setHeader: jest.fn(), send: jest.fn() };

    await controller.baixarXml(74, res);

    expect(notas.baixarNfseXml).toHaveBeenCalledWith(74);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/xml; charset=utf-8");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="NFSe-239.xml"');
    expect(res.send).toHaveBeenCalledWith(xml);
  });

  it("C2. nenhum handler do controller e @Public (guard global autentica)", () => {
    const proto = CobrancaNotasController.prototype as unknown as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(proto).filter(
      (nome) => nome !== "constructor" && typeof proto[nome] === "function",
    );
    expect(handlers.length).toBeGreaterThan(0);
    for (const nome of handlers) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto[nome] as object)).toBeUndefined();
    }
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CobrancaNotasController)).toBeUndefined();
  });
});
