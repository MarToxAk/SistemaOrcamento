/**
 * Fase 54 (plano 54-03): PixComprovanteService - HTML escapado, Puppeteer hardened e PNG real (smoke opcional).
 */
jest.mock("puppeteer", () => ({ __esModule: true, default: { launch: jest.fn() } }));

import puppeteer from "puppeteer";
import { PixComprovanteService } from "./pix-comprovante.service";
import { DadosComprovantePix } from "./pix-comprovante.util";

const launch = (puppeteer as unknown as { launch: jest.Mock }).launch;

const dados: DadosComprovantePix = {
  numeroOrcamento: "26809",
  valorPago: 164.35,
  desconto: 8.65,
  totalOrcamento: 173,
  totalPagoAcumulado: 164.35,
  pendente: 0,
  quitado: true,
  e2eId: "E1803615022211340s08793XPJ",
  txid: "txid26809abcdef",
  horario: "2026-11-25T14:40:00.000Z",
};

const criar = () => new PixComprovanteService({ get: () => undefined } as any);

describe("PixComprovanteService.renderizarHtml", () => {
  it("contem numero, valor, desconto, total, E2E, txid e data/hora", () => {
    const html = criar().renderizarHtml(dados);

    expect(html).toContain("26809");
    expect(html).toContain("R$ 164,35");
    expect(html).toContain("R$ 8,65");
    expect(html).toContain("R$ 173,00");
    expect(html).toContain("E1803615022211340s08793XPJ");
    expect(html).toContain("txid26809abcdef");
    expect(html).toContain("25/11/2026 11:40");
  });

  it("omite a linha de desconto quando e zero", () => {
    const html = criar().renderizarHtml({ ...dados, desconto: 0 });
    expect(html).not.toContain("Desconto PIX");
  });

  it("escapa texto do pagador (nada de tag script no HTML)", () => {
    const html = criar().renderizarHtml({
      ...dados,
      pagadorNome: "<script>alert(1)</script>",
      infoPagador: '"><img src=x onerror=alert(1)>',
    });

    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("onerror=alert(1)>");
  });

  it("nome com tag aparece escapado (&lt;) ou neutralizado, nunca como tag", () => {
    const html = criar().renderizarHtml({ ...dados, pagadorNome: "Ana <b>X</b>" });
    expect(html).not.toContain("<b>X</b>");
  });
});

describe("PixComprovanteService.gerarPng (puppeteer mockado)", () => {
  const montarBrowser = (overrides?: { setContent?: jest.Mock }) => {
    const handlers: Record<string, (req: any) => void> = {};
    const page = {
      setViewport: jest.fn().mockResolvedValue(undefined),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn((evento: string, fn: (req: any) => void) => {
        handlers[evento] = fn;
      }),
      setContent: overrides?.setContent ?? jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    };
    const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined) };
    launch.mockResolvedValue(browser);
    return { browser, page, handlers };
  };

  beforeEach(() => launch.mockReset());

  it("lanca com headless true e args seguros, intercepta rede, fotografa png fullPage e fecha o browser", async () => {
    const { browser, page } = montarBrowser();

    const png = await criar().gerarPng(dados);

    expect(launch).toHaveBeenCalledWith({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(page.setContent).toHaveBeenCalledWith(expect.any(String), { waitUntil: "load", timeout: 30000 });
    expect(page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: true });
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("fecha o browser mesmo quando setContent lanca e propaga o erro", async () => {
    const { browser } = montarBrowser({ setContent: jest.fn().mockRejectedValue(new Error("timeout")) });

    await expect(criar().gerarPng(dados)).rejects.toThrow("timeout");
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("propaga erro do launch como excecao", async () => {
    launch.mockRejectedValue(new Error("sem chromium"));
    await expect(criar().gerarPng(dados)).rejects.toThrow("sem chromium");
  });

  it("bloqueia requests que nao sejam about:blank nem data:", async () => {
    const { handlers } = montarBrowser();
    await criar().gerarPng(dados);

    const mk = (url: string) => ({ url: () => url, continue: jest.fn(), abort: jest.fn() });
    const bloqueada = mk("https://evil.example/x.png");
    const blank = mk("about:blank");
    const data = mk("data:image/png;base64,AAAA");
    const file = mk("file:///etc/passwd");

    handlers["request"](bloqueada);
    handlers["request"](blank);
    handlers["request"](data);
    handlers["request"](file);

    expect(bloqueada.abort).toHaveBeenCalled();
    expect(bloqueada.continue).not.toHaveBeenCalled();
    expect(file.abort).toHaveBeenCalled();
    expect(blank.continue).toHaveBeenCalled();
    expect(data.continue).toHaveBeenCalled();
  });
});

const smoke = process.env.RUN_PUPPETEER_SMOKE === "1" ? describe : describe.skip;

smoke("PixComprovanteService.gerarPng (smoke real com Chromium)", () => {
  jest.setTimeout(30000);

  it("gera PNG valido para o orcamento #26809", async () => {
    const real = jest.requireActual("puppeteer").default ?? jest.requireActual("puppeteer");
    launch.mockImplementation((opts: unknown) => real.launch(opts));

    const png = await criar().gerarPng(dados);

    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(png.length).toBeGreaterThan(2000);
  });
});
