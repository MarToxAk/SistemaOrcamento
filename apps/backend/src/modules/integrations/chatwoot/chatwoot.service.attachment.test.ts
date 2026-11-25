/**
 * Fase 54 (plano 54-03): ChatwootService.sendAttachment com opts { private, content },
 * sanitizacao de nome/content-type e timeout. axios sempre falso.
 */
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

import axios from "axios";
import { ChatwootService } from "./chatwoot.service";

const axiosPost = (axios as unknown as { post: jest.Mock }).post;

const criarService = (valores: Record<string, string | undefined>) =>
  new ChatwootService({ get: (chave: string) => valores[chave] } as any);

const configCompleta = {
  CHATWOOT_BASE_URL: "https://chat.exemplo.test",
  CHATWOOT_ACCOUNT_ID: "7",
  CHATWOOT_API_TOKEN: "token-secreto-xyz",
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const corpoEnviado = (): string => (axiosPost.mock.calls[0][1] as Buffer).toString("utf8");

describe("ChatwootService.sendAttachment (Fase 54)", () => {
  beforeEach(() => {
    axiosPost.mockReset();
    axiosPost.mockResolvedValue({ data: { id: 1 } });
  });

  it("com opts private true e content envia as partes private=true e content em UTF-8", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "c.png", "image/png", {
      private: true,
      content: "Pagamento PIX R$ 164,35 - açúcar",
    });

    const corpo = corpoEnviado();
    expect(corpo).toMatch(/name="private"\r\n\r\ntrue\r\n/);
    expect(corpo).toMatch(/name="content"\r\n\r\nPagamento PIX R\$ 164,35 - açúcar\r\n/);
  });

  it("sem o quinto argumento mantem private=false e nao envia content", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "c.png", "image/png");

    const corpo = corpoEnviado();
    expect(corpo).toMatch(/name="private"\r\n\r\nfalse\r\n/);
    expect(corpo).not.toContain('name="content"');
  });

  it("opts private false sem content nao envia parte content", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "c.png", "image/png", { private: false });

    const corpo = corpoEnviado();
    expect(corpo).toMatch(/name="private"\r\n\r\nfalse\r\n/);
    expect(corpo).not.toContain('name="content"');
  });

  it("content vazio (so espacos) nao envia parte content", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "c.png", "image/png", { private: true, content: "   " });

    expect(corpoEnviado()).not.toContain('name="content"');
  });

  it("sanitiza fileName com aspas, CR/LF e barras", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, 'a"b\r\nX-Evil: 1/../c.png', "image/png");

    const corpo = corpoEnviado();
    const linha = corpo.split("\r\n").find((l) => l.includes('name="attachments[]"'))!;
    expect(linha).toBe('Content-Disposition: form-data; name="attachments[]"; filename="a_b__X-Evil__1_.._c.png"');
    expect(corpo).not.toContain("X-Evil: 1");
  });

  it("limita fileName a 100 caracteres e usa fallback arquivo quando vazio", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "a".repeat(300) + ".png", "image/png");
    expect(corpoEnviado()).toContain(`filename="${"a".repeat(100)}"`);

    axiosPost.mockClear();
    await criarService(configCompleta).sendAttachment("42", PNG, "", "image/png");
    expect(corpoEnviado()).toContain('filename="arquivo"');
  });

  it("contentType invalido vira application/octet-stream; validos passam intactos", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "a.bin", "text/plain\r\nX-Evil: 1");
    expect(corpoEnviado()).toContain("Content-Type: application/octet-stream\r\n");

    axiosPost.mockClear();
    await criarService(configCompleta).sendAttachment("42", PNG, "a.png", "image/png");
    expect(corpoEnviado()).toContain("Content-Type: image/png\r\n");

    axiosPost.mockClear();
    await criarService(configCompleta).sendAttachment("42", PNG, "a.pdf", "application/pdf");
    expect(corpoEnviado()).toContain("Content-Type: application/pdf\r\n");
  });

  it("chama axios.post com timeout 30000, boundary coerente e api_access_token", async () => {
    await criarService(configCompleta).sendAttachment("42", PNG, "c.png", "image/png");

    const [url, , config] = axiosPost.mock.calls[0];
    expect(url).toBe("https://chat.exemplo.test/api/v1/accounts/7/conversations/42/messages");
    expect(config.timeout).toBe(30000);
    expect(config.headers.api_access_token).toBe("token-secreto-xyz");
    const boundary = String(config.headers["Content-Type"]).split("boundary=")[1];
    expect(boundary).toBeTruthy();
    expect(corpoEnviado()).toContain(`--${boundary}--`);
  });

  it("sem configuracao devolve enabled false sem chamar axios", async () => {
    const r = await criarService({ ...configCompleta, CHATWOOT_API_TOKEN: undefined }).sendAttachment(
      "42",
      PNG,
      "c.png",
      "image/png",
    );

    expect(r).toEqual({ enabled: false, message: expect.any(String) });
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
