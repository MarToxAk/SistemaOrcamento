import { CobrancaService } from "./cobranca.service";

jest.mock("axios");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

function makeService() {
  const prisma = {
    nfseEmitida: { findUnique: jest.fn(), update: jest.fn() },
  };
  const danfseNacionalPdfService = { gerar: jest.fn() };
  const nfseNacionalDistribuicaoService = { consultarXmlPorChave: jest.fn(), sincronizar: jest.fn() };
  const danfsePdfService = { gerarPdfDoXml: jest.fn() };

  const service = Object.create(CobrancaService.prototype) as CobrancaService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).prisma = prisma;
  (service as any).danfseNacionalPdfService = danfseNacionalPdfService;
  (service as any).nfseNacionalDistribuicaoService = nfseNacionalDistribuicaoService;
  (service as any).danfsePdfService = danfsePdfService;

  return { service, prisma, danfseNacionalPdfService, nfseNacionalDistribuicaoService, danfsePdfService };
}

describe("CobrancaService.baixarDanfsePdf", () => {
  beforeEach(() => {
    (axios.get as jest.Mock).mockReset();
  });

  it("1. Tier 1: xmlNacional presente -> renderiza via DanfseNacionalPdfService, sem axios/legado", async () => {
    const { service, prisma, danfseNacionalPdfService, danfsePdfService } = makeService();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: "<NFSe/>",
      chaveAcesso: "x",
      linkNfse: "http://exemplo/239",
    });
    danfseNacionalPdfService.gerar.mockResolvedValue(Buffer.from("%PDF-nac"));

    const result = await service.baixarDanfsePdf(74);

    expect(result.pdfBuffer.toString()).toBe("%PDF-nac");
    expect(result.nomeArquivo).toBe("NFSe-239.pdf");
    expect(result.xml).toBe("<NFSe/>");
    expect(result.xmlNomeArquivo).toBe("NFSe-239.xml");
    expect(danfseNacionalPdfService.gerar).toHaveBeenCalledTimes(1);
    expect(danfseNacionalPdfService.gerar).toHaveBeenCalledWith("<NFSe/>");
    expect(axios.get).not.toHaveBeenCalled();
    expect(danfsePdfService.gerarPdfDoXml).not.toHaveBeenCalled();
  });

  it("2. Tier 2: chaveAcesso presente sem xmlNacional -> consulta, persiste em cache e renderiza", async () => {
    const { service, prisma, danfseNacionalPdfService, nfseNacionalDistribuicaoService } = makeService();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      chaveAcesso: "CHV",
    });
    nfseNacionalDistribuicaoService.consultarXmlPorChave.mockResolvedValue("<NFSe>y</NFSe>");
    danfseNacionalPdfService.gerar.mockResolvedValue(Buffer.from("%PDF-2"));

    const result = await service.baixarDanfsePdf(74);

    expect(result.pdfBuffer.toString()).toBe("%PDF-2");
    expect(result.xml).toBe("<NFSe>y</NFSe>");
    expect(prisma.nfseEmitida.update).toHaveBeenCalledWith({
      where: { id: 74 },
      data: { xmlNacional: "<NFSe>y</NFSe>" },
    });
    expect(danfseNacionalPdfService.gerar).toHaveBeenCalledWith("<NFSe>y</NFSe>");
  });

  it("3. Tier 2 falha -> cai no fallback Tier 3", async () => {
    const { service, prisma, nfseNacionalDistribuicaoService, danfsePdfService } = makeService();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      chaveAcesso: "CHV",
      linkNfse: "http://x/xml",
    });
    nfseNacionalDistribuicaoService.consultarXmlPorChave.mockRejectedValue(new Error("timeout"));
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from("<NFSe>fallback</NFSe>") });
    danfsePdfService.gerarPdfDoXml.mockResolvedValue(Buffer.from("%PDF-legacy"));

    const result = await service.baixarDanfsePdf(74);

    expect(result.pdfBuffer.toString()).toBe("%PDF-legacy");
    expect(result.xml).toBe("<NFSe>fallback</NFSe>");
    expect((service as any).logger.warn).toHaveBeenCalledTimes(1);
  });

  it("4. Tier 3 %PDF passthrough (provedor iiBrasil)", async () => {
    const { service, prisma, danfsePdfService } = makeService();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      chaveAcesso: null,
      linkNfse: "http://x/pdf",
    });
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from("%PDF-1.4 provedor") });

    const result = await service.baixarDanfsePdf(74);

    expect(result.pdfBuffer.toString()).toBe("%PDF-1.4 provedor");
    expect(result.xml).toBeUndefined();
    expect(danfsePdfService.gerarPdfDoXml).not.toHaveBeenCalled();
  });

  it("5. Tier 3 sem linkNfse -> rejeita", async () => {
    const { service, prisma } = makeService();
    prisma.nfseEmitida.findUnique.mockResolvedValue({
      id: 74,
      numeroNfse: "239",
      xmlNacional: null,
      chaveAcesso: null,
      linkNfse: null,
    });

    await expect(service.baixarDanfsePdf(74)).rejects.toThrow(/não possui documento armazenado/);
  });

  it("6. NFS-e não encontrada -> rejeita", async () => {
    const { service, prisma } = makeService();
    prisma.nfseEmitida.findUnique.mockResolvedValue(null);

    await expect(service.baixarDanfsePdf(999)).rejects.toThrow(/não encontrada/);
  });

  it("7. sincronizarNfseDfe: passthrough fino p/ NfseNacionalDistribuicaoService.sincronizar", async () => {
    const { service, nfseNacionalDistribuicaoService } = makeService();
    nfseNacionalDistribuicaoService.sincronizar.mockResolvedValue({ atualizadas: 3 });

    const result = await service.sincronizarNfseDfe();

    expect(result).toEqual({ atualizadas: 3 });
    expect(nfseNacionalDistribuicaoService.sincronizar).toHaveBeenCalledTimes(1);
  });
});
