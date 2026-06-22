/**
 * quotes-pdf-storage.test.ts — Plano 03 (Wave 2)
 *
 * Cobre:
 *  - D-05: resolveTemplateSource (ativo > fallback)
 *  - D-02: compile Handlebars com knownHelpersOnly + shouldAllowRequest (função pura, sem Puppeteer)
 *  - D-07: contato de empresa via ConfigService (empresaTelefones/Email/Instagram)
 *  - D-08: templateSource explícito para preview
 */

import { ConfigService } from "@nestjs/config";
import Handlebars from "handlebars";
import { QuotesPdfStorageService, shouldAllowRequest } from "./quotes-pdf-storage.service";

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

type ConfigMap = Record<string, string | undefined>;

function makeConfigService(values: ConfigMap = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function makePdfTemplatesRepository(activeSource: string | null = null) {
  return {
    getActiveSource: jest.fn().mockResolvedValue(activeSource),
  };
}

// ---------------------------------------------------------------------------
// D-05: resolução de template ativo + fallback
// ---------------------------------------------------------------------------

describe("QuotesPdfStorageService — D-05: resolução de template", () => {
  it("usa o source do PdfTemplate ativo quando existe", async () => {
    const activeSrc = "<html>{{empresaNome}} ativo</html>";
    const repo = makePdfTemplatesRepository(activeSrc);
    const cfg = makeConfigService({ EMPRESA_NOME: "Teste" });

    const svc = new QuotesPdfStorageService(cfg, repo as any);
    const html = await svc.renderHtml({ idorcamento_interno: 1 });
    expect(html).toContain("Teste");
    expect(repo.getActiveSource).toHaveBeenCalledTimes(1);
  });

  it("sem template ativo cai no fallback (string embutida)", async () => {
    const repo = makePdfTemplatesRepository(null);
    const cfg = makeConfigService({});

    const svc = new QuotesPdfStorageService(cfg, repo as any);
    const html = await svc.renderHtml({ idorcamento_interno: 2 });
    // A string embutida tem conteúdo; não importa qual exatamente — só que retorna string
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  it("aceita templateSource explícito para preview sem consultar o repositório", async () => {
    const repo = makePdfTemplatesRepository(null);
    const cfg = makeConfigService({ EMPRESA_NOME: "Preview" });

    const svc = new QuotesPdfStorageService(cfg, repo as any);
    const previewSrc = "<html>preview-{{empresaNome}}</html>";
    const html = await svc.renderHtml({ idorcamento_interno: 3 }, previewSrc);

    expect(html).toContain("Preview");
    expect(html).toContain("preview-");
    expect(repo.getActiveSource).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D-07: variáveis de contato de empresa
// ---------------------------------------------------------------------------

describe("QuotesPdfStorageService — D-07: variáveis de contato de empresa", () => {
  it("expõe empresaTelefones/empresaEmail/empresaInstagram no contexto do template", async () => {
    const repo = makePdfTemplatesRepository(null);
    const cfg = makeConfigService({
      EMPRESA_TELEFONES: "(12) 9999-9999",
      EMPRESA_EMAIL: "contato@empresa.com",
      EMPRESA_INSTAGRAM: "@empresa",
    });

    const tpl = "<p>{{empresaTelefones}}|{{empresaEmail}}|{{empresaInstagram}}</p>";
    const svc = new QuotesPdfStorageService(cfg, repo as any);
    const html = await svc.renderHtml({ idorcamento_interno: 4 }, tpl);

    expect(html).toContain("(12) 9999-9999");
    expect(html).toContain("contato@empresa.com");
    expect(html).toContain("@empresa");
  });

  it("usa string vazia para contato quando env var ausente (não falha)", async () => {
    const repo = makePdfTemplatesRepository(null);
    const cfg = makeConfigService({});

    const tpl = "<p>T:{{empresaTelefones}}|E:{{empresaEmail}}|I:{{empresaInstagram}}</p>";
    const svc = new QuotesPdfStorageService(cfg, repo as any);
    const html = await svc.renderHtml({ idorcamento_interno: 5 }, tpl);

    expect(html).toContain("T:|E:|I:");
  });
});

// ---------------------------------------------------------------------------
// D-02: compile Handlebars com knownHelpersOnly
//
// Handlebars com knownHelpersOnly:true lança em runtime (ao chamar o template
// compilado), não em compile time. O compile() é sempre bem-sucedido; o erro
// aparece quando o template tenta invocar o helper desconhecido.
// ---------------------------------------------------------------------------

describe("QuotesPdfStorageService — D-02: compile Handlebars hardened", () => {
  it("template com helper desconhecido lança erro em runtime (knownHelpersOnly)", () => {
    const instance = Handlebars.create();
    const tpl = instance.compile("{{helperPerigoso 'xpto'}}", {
      knownHelpers: {},
      knownHelpersOnly: true,
      strict: false,
      noEscape: false,
    });
    // O erro é lançado ao chamar o template compilado, não no compile()
    expect(() => tpl({})).toThrow(/knownHelpersOnly/i);
  });

  it("compile mantém built-ins #if/#each/#unless funcionando", () => {
    const instance = Handlebars.create();
    const tpl = instance.compile("{{#if ok}}sim{{/if}}{{#each lista}}{{this}}{{/each}}", {
      knownHelpers: {},
      knownHelpersOnly: true,
      strict: false,
      noEscape: false,
    });
    expect(tpl({ ok: true, lista: ["a", "b"] })).toBe("simab");
  });
});

// ---------------------------------------------------------------------------
// D-02: shouldAllowRequest — função pura exportável (sem instanciar Puppeteer)
// ---------------------------------------------------------------------------

describe("shouldAllowRequest (D-02 — função pura anti-SSRF)", () => {
  it("retorna false para http:// externo", () => {
    expect(shouldAllowRequest("http://example.com/image.png")).toBe(false);
  });

  it("retorna false para https:// externo", () => {
    expect(shouldAllowRequest("https://fonts.googleapis.com/css2?family=Mulish")).toBe(false);
  });

  it("retorna false para file://", () => {
    expect(shouldAllowRequest("file:///etc/passwd")).toBe(false);
  });

  it("retorna false para IP de metadata AWS/EC2 (169.254.169.254)", () => {
    expect(shouldAllowRequest("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("retorna true para about:blank (documento inline inicial)", () => {
    expect(shouldAllowRequest("about:blank")).toBe(true);
  });

  it("retorna true para data: URI (inline doc)", () => {
    expect(shouldAllowRequest("data:text/html;base64,SGVsbG8=")).toBe(true);
  });
});
