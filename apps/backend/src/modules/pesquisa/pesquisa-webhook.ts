/**
 * Fase 52 (plano 52-06): regras puras do webhook de opt-out do Chatwoot (D-36, D-49).
 *
 * O Chatwoot assina o webhook de conta com `X-Chatwoot-Signature: sha256=` + HMAC-SHA256(segredo,
 * "<X-Chatwoot-Timestamp>.<corpo bruto>"). A verificacao SEMPRE usa o corpo bruto (`rawBody`): o
 * Chatwoot assina o texto exato que enviou, entao reserializar o objeto interpretado invalida a prova.
 *
 * Sem Nest e sem Prisma: tudo aqui e testavel sem infraestrutura.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { ehOptOut, normalizarTelefone } from "./pesquisa-regras";

/** D-36/T-52-37: janela de tolerancia do timestamp, em segundos. */
export const JANELA_TIMESTAMP_S = 300;

/** Timestamp do header: so digitos (pode ser negativo em relogio errado; a janela recusa). */
const REGEX_TIMESTAMP = /^-?\d+$/;

function paraBuffer(corpo: Buffer | string): Buffer {
  return Buffer.isBuffer(corpo) ? corpo : Buffer.from(String(corpo), "utf8");
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * D-36/T-52-36: verdadeiro somente quando a assinatura confere com o corpo BRUTO, o timestamp e
 * numerico e esta dentro da janela e a comparacao e em tempo constante.
 */
export function verificarAssinaturaChatwoot(entrada: {
  rawBody: Buffer | string | undefined;
  timestamp: string | undefined;
  assinatura: string | undefined;
  segredo: string;
  agoraS?: number;
}): boolean {
  const { rawBody, timestamp, assinatura, segredo } = entrada;
  if (rawBody === undefined || rawBody === null || !segredo) return false;
  if (typeof timestamp !== "string" || !REGEX_TIMESTAMP.test(timestamp)) return false;
  if (typeof assinatura !== "string" || assinatura.length === 0) return false;

  const enviadoEm = Number(timestamp);
  if (!Number.isFinite(enviadoEm)) return false;
  const agora = entrada.agoraS ?? Math.floor(Date.now() / 1000);
  if (Math.abs(agora - enviadoEm) > JANELA_TIMESTAMP_S) return false;

  const corpo = paraBuffer(rawBody);
  const esperado = "sha256=" + createHmac("sha256", segredo).update(`${timestamp}.`).update(corpo).digest("hex");

  // T-52-36: comparacao em tempo constante; tamanho diferente ja e recusado antes.
  const fornecido = Buffer.from(assinatura, "utf8");
  const esperadoBuffer = Buffer.from(esperado, "utf8");
  if (fornecido.length !== esperadoBuffer.length) return false;
  return timingSafeEqual(fornecido, esperadoBuffer);
}

/**
 * D-49: extrai o telefone apenas de `message_created` de ENTRADA, publica, cujo texto normalizado seja
 * exatamente SAIR. Aceita `unknown` e nunca lanca. Telefone: `sender.phone_number` (mensagem) ou
 * `conversation.meta.sender.phone_number` (contato da conversa), normalizado para 55 + DDD + numero.
 */
export function extrairOptOut(payload: unknown): { telefone: string } | null {
  if (!ehObjeto(payload)) return null;
  if (payload.event !== "message_created") return null;

  const tipo = payload.message_type;
  if (tipo !== "incoming" && tipo !== 0) return null;
  if (payload.private === true) return null;
  if (!ehOptOut(String(payload.content ?? ""))) return null;

  const sender = ehObjeto(payload.sender) ? payload.sender : undefined;
  const conversation = ehObjeto(payload.conversation) ? payload.conversation : undefined;
  const meta = conversation && ehObjeto(conversation.meta) ? conversation.meta : undefined;
  const contato = meta && ehObjeto(meta.sender) ? meta.sender : undefined;

  const bruto = typeof sender?.phone_number === "string" ? sender.phone_number : undefined;
  const brutoConversa = typeof contato?.phone_number === "string" ? contato.phone_number : undefined;
  const telefone = normalizarTelefone(bruto ?? brutoConversa);
  return telefone ? { telefone } : null;
}
