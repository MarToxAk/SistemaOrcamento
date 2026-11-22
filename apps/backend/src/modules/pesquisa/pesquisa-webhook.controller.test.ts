/**
 * Fase 52 (plano 52-06): webhook de SAIR do Chatwoot.
 * HMAC sobre o corpo bruto, janela de timestamp, filtro de mensagem e supressao.
 * Servico real da pesquisa sobre Prisma falso; nenhum banco, nenhuma rede.
 */
import "reflect-metadata";

import { InternalServerErrorException, RequestMethod, UnauthorizedException } from "@nestjs/common";
import { createHmac } from "node:crypto";

import { JANELA_TIMESTAMP_S, extrairOptOut, verificarAssinaturaChatwoot } from "./pesquisa-webhook";
import { PesquisaWebhookController } from "./pesquisa-webhook.controller";
import { PesquisaService } from "./pesquisa.service";

const SEGREDO = "s3gr3do";
const TELEFONE = "5512996484918";

const CORPO = JSON.stringify({
  event: "message_created",
  message_type: "incoming",
  private: false,
  content: "Sair!",
  sender: { phone_number: "+5512996484918" },
});

function assinar(segredo: string, timestamp: string, corpo: string | Buffer): string {
  return "sha256=" + createHmac("sha256", segredo).update(`${timestamp}.`).update(corpo).digest("hex");
}

function payloadSaida(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: "message_created",
    message_type: "incoming",
    private: false,
    content: "Sair!",
    sender: { phone_number: "+5512996484918" },
    ...extra,
  };
}

function montarController(opcoes: { segredo?: string | undefined } = {}) {
  const pesquisa = { registrarOptOut: jest.fn(async () => undefined) };
  const config = {
    get: jest.fn((chave: string) => {
      if (chave !== "CHATWOOT_WEBHOOK_SECRET") return undefined;
      return "segredo" in opcoes ? opcoes.segredo : SEGREDO;
    }),
  };
  const controller = new PesquisaWebhookController(pesquisa as never, config as never);
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (controller as any).logger = logger;
  return { controller, pesquisa, config, logger };
}

/** Corpo bruto + headers coerentes, prontos para o handler. */
function requisicaoValida(segredo = SEGREDO, agoraS = Math.floor(Date.now() / 1000)) {
  const timestamp = String(agoraS);
  return {
    req: { rawBody: Buffer.from(CORPO) },
    assinatura: assinar(segredo, timestamp, CORPO),
    timestamp,
    payload: JSON.parse(CORPO) as Record<string, unknown>,
  };
}

function montarServico() {
  const upsert = jest.fn(async () => ({ telefone: TELEFONE }));
  const prisma = { pesquisaSupressao: { upsert } };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new PesquisaService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  (service as any).logger = logger;
  return { service, upsert, logger };
}

describe("verificarAssinaturaChatwoot (hmac)", () => {
  const agoraS = 1_800_000_000;

  it("hmac: aceita a assinatura sha256 calculada sobre o corpo bruto", () => {
    const timestamp = String(agoraS);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: Buffer.from(CORPO),
        timestamp,
        assinatura: assinar(SEGREDO, timestamp, CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(true);
  });

  it("hmac: recusa assinatura feita com outro segredo", () => {
    const timestamp = String(agoraS);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp,
        assinatura: assinar("outro", timestamp, CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa quando o corpo muda em 1 byte", () => {
    const timestamp = String(agoraS);
    const assinatura = assinar(SEGREDO, timestamp, CORPO);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO.replace("Sair!", "Sair?"),
        timestamp,
        assinatura,
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa assinatura sem o prefixo sha256=", () => {
    const timestamp = String(agoraS);
    const semPrefixo = assinar(SEGREDO, timestamp, CORPO).replace("sha256=", "");
    expect(
      verificarAssinaturaChatwoot({ rawBody: CORPO, timestamp, assinatura: semPrefixo, segredo: SEGREDO, agoraS }),
    ).toBe(false);
  });

  it("hmac: recusa assinatura de tamanho diferente", () => {
    const timestamp = String(agoraS);
    expect(
      verificarAssinaturaChatwoot({ rawBody: CORPO, timestamp, assinatura: "sha256=abc", segredo: SEGREDO, agoraS }),
    ).toBe(false);
  });

  it("hmac: recusa assinatura ausente", () => {
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp: String(agoraS),
        assinatura: undefined,
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa timestamp ausente", () => {
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp: undefined,
        assinatura: assinar(SEGREDO, String(agoraS), CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa timestamp nao numerico", () => {
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp: "agora",
        assinatura: assinar(SEGREDO, "agora", CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa corpo ausente", () => {
    const timestamp = String(agoraS);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: undefined,
        timestamp,
        assinatura: assinar(SEGREDO, timestamp, ""),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa timestamp 301 s no passado", () => {
    const timestamp = String(agoraS - 301);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp,
        assinatura: assinar(SEGREDO, timestamp, CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: recusa timestamp 301 s no futuro", () => {
    const timestamp = String(agoraS + 301);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp,
        assinatura: assinar(SEGREDO, timestamp, CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });

  it("hmac: aceita timestamp 299 s no passado", () => {
    const timestamp = String(agoraS - 299);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp,
        assinatura: assinar(SEGREDO, timestamp, CORPO),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(true);
  });

  it("hmac: a janela de timestamp e de 300 s", () => {
    expect(JANELA_TIMESTAMP_S).toBe(300);
  });

  it("hmac: recusa assinatura sobre o JSON reserializado do objeto interpretado", () => {
    const timestamp = String(agoraS);
    const reserializado = JSON.stringify(JSON.parse(CORPO), null, 2);
    expect(reserializado).not.toBe(CORPO);
    expect(
      verificarAssinaturaChatwoot({
        rawBody: CORPO,
        timestamp,
        assinatura: assinar(SEGREDO, timestamp, reserializado),
        segredo: SEGREDO,
        agoraS,
      }),
    ).toBe(false);
  });
});

describe("PesquisaWebhookController (hmac no handler)", () => {
  it("hmac: sem CHATWOOT_WEBHOOK_SECRET responde 500", async () => {
    const { controller, pesquisa } = montarController({ segredo: undefined });
    const { req, assinatura, timestamp, payload } = requisicaoValida();
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });

  it("hmac: assinatura invalida responde 401 sem tocar o servico", async () => {
    const { controller, pesquisa } = montarController();
    const { req, timestamp, payload } = requisicaoValida();
    await expect(controller.webhook(req as never, "sha256=deadbeef", timestamp, payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });

  it("hmac: timestamp fora da janela responde 401 mesmo com assinatura correta", async () => {
    const { controller, pesquisa } = montarController();
    const antigo = Math.floor(Date.now() / 1000) - 400;
    const { req, assinatura, payload } = requisicaoValida(SEGREDO, antigo);
    await expect(controller.webhook(req as never, assinatura, String(antigo), payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });

  it("hmac: assinatura valida responde 200 com processed e optOut verdadeiros", async () => {
    const { controller, pesquisa } = montarController();
    const { req, assinatura, timestamp, payload } = requisicaoValida();
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).resolves.toEqual({
      processed: true,
      optOut: true,
    });
    expect(pesquisa.registrarOptOut).toHaveBeenCalledWith(TELEFONE);
  });

  it("hmac: corpo bruto diferente do assinado responde 401", async () => {
    const { controller, pesquisa } = montarController();
    const { assinatura, timestamp, payload } = requisicaoValida();
    await expect(
      controller.webhook({ rawBody: Buffer.from(CORPO.replace("Sair!", "Sair?")) } as never, assinatura, timestamp, payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });
});

describe("extrairOptOut e filtro de mensagem", () => {
  it("optout: extrai o telefone normalizado de uma mensagem SAIR de entrada", () => {
    expect(extrairOptOut(payloadSaida())).toEqual({ telefone: TELEFONE });
  });

  it('optout: aceita " SAIR " com espacos e caixa indiferente', () => {
    expect(extrairOptOut(payloadSaida({ content: " SAIR " }))).toEqual({ telefone: TELEFONE });
  });

  it('optout: aceita "sair" minusculo', () => {
    expect(extrairOptOut(payloadSaida({ content: "sair" }))).toEqual({ telefone: TELEFONE });
  });

  it("optout: telefone vem de conversation.meta.sender.phone_number quando sender nao tem", () => {
    const payload = payloadSaida({
      sender: {},
      conversation: { meta: { sender: { phone_number: "+5512996484918" } } },
    });
    expect(extrairOptOut(payload)).toEqual({ telefone: TELEFONE });
  });

  it('filtro: "Sair por favor" nao e opt-out', () => {
    expect(extrairOptOut(payloadSaida({ content: "Sair por favor" }))).toBeNull();
  });

  it('filtro: "quero sair" nao e opt-out', () => {
    expect(extrairOptOut(payloadSaida({ content: "quero sair" }))).toBeNull();
  });

  it("filtro: content vazio nao e opt-out", () => {
    expect(extrairOptOut(payloadSaida({ content: "" }))).toBeNull();
  });

  it("filtro: mensagem de saida (outgoing) nao tem efeito", () => {
    expect(extrairOptOut(payloadSaida({ message_type: "outgoing" }))).toBeNull();
  });

  it("filtro: mensagem de template nao tem efeito", () => {
    expect(extrairOptOut(payloadSaida({ message_type: "template" }))).toBeNull();
  });

  it("filtro: mensagem de saida numerica (1) nao tem efeito", () => {
    expect(extrairOptOut(payloadSaida({ message_type: 1 }))).toBeNull();
  });

  it("filtro: mensagem de entrada numerica (0) e aceita", () => {
    expect(extrairOptOut(payloadSaida({ message_type: 0 }))).toEqual({ telefone: TELEFONE });
  });

  it("filtro: mensagem privada (input_csat e notas) nao tem efeito", () => {
    expect(extrairOptOut(payloadSaida({ private: true }))).toBeNull();
  });

  it("filtro: event conversation_status_changed devolve processed false", async () => {
    const { controller } = montarController();
    const { req, assinatura, timestamp } = requisicaoValida();
    const payload = payloadSaida({ event: "conversation_status_changed" });
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).resolves.toEqual({
      processed: false,
      optOut: false,
    });
  });

  it("filtro: event message_updated devolve processed false", async () => {
    const { controller, pesquisa } = montarController();
    const { req, assinatura, timestamp } = requisicaoValida();
    const payload = payloadSaida({ event: "message_updated" });
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).resolves.toEqual({
      processed: false,
      optOut: false,
    });
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });

  it("filtro: telefone ausente nao tem efeito e o log nao traz numero", async () => {
    const { controller, pesquisa, logger } = montarController();
    const { req, assinatura, timestamp } = requisicaoValida();
    const payload = payloadSaida({ sender: {} });
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).resolves.toEqual({
      processed: true,
      optOut: false,
    });
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
    const textos = [...logger.log.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls]
      .map((c) => String(c[0]))
      .join("\n");
    expect(textos).not.toContain(TELEFONE);
  });

  it("filtro: telefone invalido nao tem efeito", async () => {
    const { controller, pesquisa } = montarController();
    const { req, assinatura, timestamp } = requisicaoValida();
    const payload = payloadSaida({ sender: { phone_number: "123" } });
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).resolves.toEqual({
      processed: true,
      optOut: false,
    });
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });

  it("filtro: corpo nao objeto devolve 200 sem efeito", async () => {
    const { controller, pesquisa } = montarController();
    const { req, assinatura, timestamp } = requisicaoValida();
    const reqNull = { rawBody: Buffer.from("null") };
    const assinaturaNull = assinar(SEGREDO, timestamp, "null");
    await expect(controller.webhook(reqNull as never, assinaturaNull, timestamp, null)).resolves.toEqual({
      processed: false,
      optOut: false,
    });
    await expect(controller.webhook(req as never, assinatura, timestamp, "texto")).resolves.toEqual({
      processed: false,
      optOut: false,
    });
    expect(pesquisa.registrarOptOut).not.toHaveBeenCalled();
  });

  it("filtro: erro inesperado do servico vira 200 sem telefone no log", async () => {
    const { controller, pesquisa, logger } = montarController();
    pesquisa.registrarOptOut.mockRejectedValueOnce(new Error(`falhou ${TELEFONE}`));
    const { req, assinatura, timestamp, payload } = requisicaoValida();
    await expect(controller.webhook(req as never, assinatura, timestamp, payload)).resolves.toEqual({
      processed: true,
      optOut: false,
    });
    const textos = logger.error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(textos).not.toContain(TELEFONE);
  });
});

describe("PesquisaService.registrarOptOut (supressao)", () => {
  it("supressao: faz upsert com o telefone e a origem SAIR", async () => {
    const { service, upsert } = montarServico();
    await service.registrarOptOut(TELEFONE);
    expect(upsert).toHaveBeenCalledWith({
      where: { telefone: TELEFONE },
      create: { telefone: TELEFONE, origem: "SAIR" },
      update: {},
    });
  });

  it("supressao: duas chamadas sao idempotentes e nao lancam", async () => {
    const { service, upsert } = montarServico();
    await expect(service.registrarOptOut(TELEFONE)).resolves.toBeUndefined();
    await expect(service.registrarOptOut(TELEFONE)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("supressao: o log traz o telefone mascarado e nunca o numero completo", async () => {
    const { service, logger } = montarServico();
    await service.registrarOptOut(TELEFONE);
    const textos = logger.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(textos).toContain("(12) *****-4918");
    expect(textos).not.toContain(TELEFONE);
  });
});

describe("PesquisaWebhookController (limite)", () => {
  const handler = PesquisaWebhookController.prototype.webhook;

  it("limite: tem throttle proprio de 600 por 60000 ms", () => {
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(600);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60_000);
  });

  it("limite: nao usa SkipThrottle", () => {
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", handler)).toBeUndefined();
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", PesquisaWebhookController)).toBeUndefined();
  });

  it("limite: a rota e publica", () => {
    const noHandler = Reflect.getMetadata("isPublic", handler);
    const naClasse = Reflect.getMetadata("isPublic", PesquisaWebhookController);
    expect(Boolean(noHandler ?? naClasse)).toBe(true);
  });

  it("limite: caminho da classe, caminho do handler e metodo POST", () => {
    expect(Reflect.getMetadata("path", PesquisaWebhookController)).toBe("integrations/chatwoot/pesquisa");
    expect(Reflect.getMetadata("path", handler)).toBe("webhook");
    expect(Reflect.getMetadata("method", handler)).toBe(RequestMethod.POST);
  });
});
