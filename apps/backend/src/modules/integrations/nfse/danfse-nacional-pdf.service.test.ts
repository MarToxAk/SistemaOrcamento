import { DanfseNacionalPdfService } from "./danfse-nacional-pdf.service";

jest.mock("nfse-node/danfse", () => ({ gerarDanfse: jest.fn() }), { virtual: true });
jest.mock("axios");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { gerarDanfse } = require("nfse-node/danfse") as { gerarDanfse: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

function makeService(configOverride: Record<string, string> = {}) {
  const config = { EMPRESA_LOGO_URL: "", ...configOverride };
  const service = Object.create(DanfseNacionalPdfService.prototype) as DanfseNacionalPdfService;
  (service as any).config = { get: (k: string) => (config as Record<string, string>)[k] };
  (service as any).logger = { warn: jest.fn() };
  (service as any).logoCache = new Map<string, Buffer>();
  return service;
}

describe("DanfseNacionalPdfService.gerar", () => {
  beforeEach(() => {
    gerarDanfse.mockReset();
    (axios.get as jest.Mock | undefined)?.mockReset?.();
  });

  it("1. delega para gerarDanfse e retorna o Buffer produzido", async () => {
    gerarDanfse.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
    const service = makeService();

    const buf = await service.gerar("<NFSe/>");

    expect(buf.toString()).toBe("%PDF-1.4 fake");
    expect(gerarDanfse).toHaveBeenCalledTimes(1);
    expect(gerarDanfse).toHaveBeenCalledWith("<NFSe/>", expect.objectContaining({ incluirCanhoto: true }));
  });

  it("2. EMPRESA_LOGO_URL vazia -> opcoes sem logomarca e sem situacaoEspecial", async () => {
    gerarDanfse.mockResolvedValue(Buffer.from("%PDF"));
    const service = makeService({ EMPRESA_LOGO_URL: "" });

    await service.gerar("<NFSe/>");

    const opts = gerarDanfse.mock.calls[0][1];
    expect(opts.logomarca).toBeUndefined();
    expect(opts.situacaoEspecial).toBeUndefined();
  });

  it("3. gerarDanfse rejeita -> gerar() rejeita com a mesma mensagem", async () => {
    gerarDanfse.mockRejectedValue(new Error("boom"));
    const service = makeService();

    await expect(service.gerar("<NFSe/>")).rejects.toThrow(/boom/);
  });

  it("4. EMPRESA_LOGO_URL valida + content-type image/* -> opcoes.logomarca e Buffer", async () => {
    gerarDanfse.mockResolvedValue(Buffer.from("%PDF"));
    (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
      data: Buffer.from("fake-png-bytes"),
      headers: { "content-type": "image/png" },
    });
    const service = makeService({ EMPRESA_LOGO_URL: "https://example.com/logo.png" });

    await service.gerar("<NFSe/>");

    const opts = gerarDanfse.mock.calls[0][1];
    expect(Buffer.isBuffer(opts.logomarca)).toBe(true);
    expect(opts.logomarca.toString()).toBe("fake-png-bytes");
  });

  it("5. axios.get lanca -> opcoes.logomarca undefined + logger.warn chamado", async () => {
    gerarDanfse.mockResolvedValue(Buffer.from("%PDF"));
    (axios.get as jest.Mock) = jest.fn().mockRejectedValue(new Error("network fail"));
    const service = makeService({ EMPRESA_LOGO_URL: "https://example.com/logo.png" });

    await service.gerar("<NFSe/>");

    const opts = gerarDanfse.mock.calls[0][1];
    expect(opts.logomarca).toBeUndefined();
    expect((service as any).logger.warn).toHaveBeenCalled();
  });
});
