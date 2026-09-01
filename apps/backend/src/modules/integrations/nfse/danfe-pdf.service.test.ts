import { EventEmitter } from "node:events";

import { DanfePdfService } from "./danfe-pdf.service";

jest.mock("nfe-danfe-pdf");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { gerarPDF } = require("nfe-danfe-pdf") as { gerarPDF: jest.Mock };

function fakeDoc(chunks: string[]): EventEmitter {
  const ev = new EventEmitter();
  process.nextTick(() => {
    for (const c of chunks) ev.emit("data", Buffer.from(c));
    ev.emit("end");
  });
  return ev;
}

function makeService(configOverride: Record<string, string> = {}) {
  const config = { EMPRESA_LOGO_URL: "", ...configOverride };
  const service = Object.create(DanfePdfService.prototype) as DanfePdfService;
  (service as any).config = { get: (k: string) => (config as Record<string, string>)[k] };
  (service as any).logger = { warn: jest.fn() };
  (service as any).logoPathCache = new Map<string, string>();
  return service;
}

describe("DanfePdfService.gerarDanfe", () => {
  beforeEach(() => {
    gerarPDF.mockReset();
  });

  it("1. coleta o stream em Buffer (%PDF) e concatena os chunks", async () => {
    gerarPDF.mockImplementation(async () => fakeDoc(["%PDF-1.4", "rest"]));
    const service = makeService();

    const buf = await service.gerarDanfe({ xml: "<x/>" });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.toString()).toBe("%PDF-1.4rest");
    expect(buf.length).toBe(12);
    expect(gerarPDF).toHaveBeenCalledWith("<x/>", expect.objectContaining({ cancelada: false }));
  });

  it("2. repassa cancelada: true nas opcoes", async () => {
    gerarPDF.mockImplementation(async () => fakeDoc(["%PDF"]));
    const service = makeService();

    await service.gerarDanfe({ xml: "<x/>", cancelada: true });

    const opts = gerarPDF.mock.calls[0][1];
    expect(opts.cancelada).toBe(true);
  });

  it("3. EMPRESA_LOGO_URL vazia -> opcoes sem pathLogo", async () => {
    gerarPDF.mockImplementation(async () => fakeDoc(["%PDF"]));
    const service = makeService({ EMPRESA_LOGO_URL: "" });

    await service.gerarDanfe({ xml: "<x/>" });

    const opts = gerarPDF.mock.calls[0][1];
    expect(opts.pathLogo).toBeUndefined();
  });

  it("4. doc emite error -> gerarDanfe rejeita", async () => {
    gerarPDF.mockImplementation(async () => {
      const ev = new EventEmitter();
      process.nextTick(() => ev.emit("error", new Error("render boom")));
      return ev;
    });
    const service = makeService();

    await expect(service.gerarDanfe({ xml: "<x/>" })).rejects.toThrow("render boom");
  });

  it("5. timeout de seguranca -> rejeita com /timeout/i", async () => {
    jest.useFakeTimers();
    gerarPDF.mockImplementation(async () => new EventEmitter()); // nunca emite end
    const service = makeService();

    const p = service.gerarDanfe({ xml: "<x/>" }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(20_000);
    const err = await p;

    expect(String(err)).toMatch(/timeout/i);
    jest.useRealTimers();
  });
});
