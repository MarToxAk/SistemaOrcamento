import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EfiService } from "./efi.service";
import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

// Fase 54 (plano 54-04, D-04): comprovante oficial da EFI (GET /v2/gn/pix/comprovantes).
describe("EfiService - buscarComprovanteOficial", () => {
  let service: EfiService;
  let getMock: jest.Mock;
  let warnSpy: jest.SpyInstance;

  const E2E = "E12345678202611250000abcdef12345";
  const TOKEN_SECRETO = "token-super-secreto-123";

  function corpo(bytes: number[], tamanho = 64): Buffer {
    const b = Buffer.alloc(tamanho, 0x20);
    Buffer.from(bytes).copy(b, 0);
    return b;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EfiService,
        { provide: PrismaService, useValue: {} },
        { provide: QuotesService, useValue: {} },
        { provide: ChatwootService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();
    service = module.get<EfiService>(EfiService);

    getMock = jest.fn();
    jest.spyOn(service as any, "getHttpClient").mockReturnValue({ get: getMock });
    jest.spyOn(service as any, "getAccessToken").mockResolvedValue(TOKEN_SECRETO);
    warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("aceita corpo PNG e devolve image/png com extensao png", async () => {
    const png = corpo([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    getMock.mockResolvedValue({ status: 200, data: png, headers: { "content-type": "application/json" } });

    const r = await service.buscarComprovanteOficial(E2E);

    expect(r).not.toBeNull();
    expect(r!.contentType).toBe("image/png");
    expect(r!.extensao).toBe("png");
    expect(Buffer.compare(r!.buffer, png)).toBe(0);
  });

  it("aceita JPEG (FF D8 FF) e devolve image/jpeg com extensao jpg", async () => {
    getMock.mockResolvedValue({ status: 200, data: corpo([0xff, 0xd8, 0xff, 0xe0]) });
    const r = await service.buscarComprovanteOficial(E2E);
    expect(r).toEqual(expect.objectContaining({ contentType: "image/jpeg", extensao: "jpg" }));
  });

  it("aceita %PDF e devolve application/pdf com extensao pdf", async () => {
    getMock.mockResolvedValue({ status: 200, data: corpo([0x25, 0x50, 0x44, 0x46, 0x2d]) });
    const r = await service.buscarComprovanteOficial(E2E);
    expect(r).toEqual(expect.objectContaining({ contentType: "application/pdf", extensao: "pdf" }));
  });

  it("aceita ArrayBuffer como corpo (responseType arraybuffer)", async () => {
    const png = corpo([0x89, 0x50, 0x4e, 0x47]);
    const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
    getMock.mockResolvedValue({ status: 200, data: ab });
    const r = await service.buscarComprovanteOficial(E2E);
    expect(r?.contentType).toBe("image/png");
  });

  it("devolve null para JSON, HTML e corpo vazio", async () => {
    for (const data of [
      Buffer.from('{"erro":"escopo"}'),
      Buffer.from("<html><body>erro</body></html>"),
      Buffer.alloc(0),
      undefined,
      "texto puro",
    ]) {
      getMock.mockResolvedValueOnce({ status: 200, data });
      await expect(service.buscarComprovanteOficial(E2E)).resolves.toBeNull();
    }
  });

  it("devolve null em erro HTTP (403, 404, 500) e registra warn so com status", async () => {
    for (const status of [403, 404, 500]) {
      getMock.mockRejectedValueOnce({
        message: "Request failed",
        response: { status, data: Buffer.from('{"corpo":"da-resposta-nao-pode-vazar"}') },
      });
      await expect(service.buscarComprovanteOficial(E2E)).resolves.toBeNull();
    }
    const logs = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logs).toContain("403");
    expect(logs).toContain(E2E);
    expect(logs).not.toContain("da-resposta-nao-pode-vazar");
    expect(logs).not.toContain(TOKEN_SECRETO);
  });

  it("devolve null em timeout/erro de rede sem propagar", async () => {
    getMock.mockRejectedValue(new Error("timeout of 8000ms exceeded"));
    await expect(service.buscarComprovanteOficial(E2E)).resolves.toBeNull();
    const logs = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logs).toContain("timeout");
    expect(logs).not.toContain(TOKEN_SECRETO);
  });

  it("devolve null quando getHttpClient lanca (certificado nao configurado)", async () => {
    (service as any).getHttpClient.mockImplementation(() => {
      throw new Error("Certificado e chave da EFI nao configurados");
    });
    await expect(service.buscarComprovanteOficial(E2E)).resolves.toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("devolve null quando getAccessToken rejeita", async () => {
    (service as any).getAccessToken.mockRejectedValue(new Error("sem token"));
    await expect(service.buscarComprovanteOficial(E2E)).resolves.toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("chama GET /v2/gn/pix/comprovantes com e2eId, arraybuffer, timeout 8000 e Bearer", async () => {
    getMock.mockResolvedValue({ status: 200, data: corpo([0x89, 0x50, 0x4e, 0x47]) });
    await service.buscarComprovanteOficial(E2E);

    expect(getMock).toHaveBeenCalledTimes(1);
    const [url, cfg] = getMock.mock.calls[0];
    expect(url).toBe("/v2/gn/pix/comprovantes");
    expect(cfg.params).toEqual({ e2eId: E2E });
    expect(cfg.responseType).toBe("arraybuffer");
    expect(cfg.timeout).toBe(8000);
    expect(cfg.headers.Authorization).toBe(`Bearer ${TOKEN_SECRETO}`);
  });

  it("e2eId vazio devolve null sem chamar a EFI", async () => {
    await expect(service.buscarComprovanteOficial("")).resolves.toBeNull();
    await expect(service.buscarComprovanteOficial("   ")).resolves.toBeNull();
    expect((service as any).getHttpClient).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });
});
