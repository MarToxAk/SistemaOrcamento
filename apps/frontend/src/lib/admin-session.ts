import { createHmac, timingSafeEqual } from "crypto";

import type { NextRequest } from "next/server";

/**
 * Sessao de admin para a tela de configuracoes (D-03 + opcao "a": prompt de
 * senha na entrada da tela). NAO ha sistema de login/perfis no app — esta e
 * uma protecao leve para impedir que qualquer pessoa que chegue na URL
 * /configuracoes/* troque o layout do PDF.
 *
 * Modelo: o usuario digita a senha numa rota server-side (/api/admin/login)
 * que compara com CONFIG_PANEL_PASSWORD (env var SERVER-SIDE, nunca
 * NEXT_PUBLIC_). Se bater, setamos um cookie httpOnly assinado por HMAC. As
 * rotas proxy de admin exigem esse cookie. A senha real e a chave de admin
 * do backend nunca chegam ao browser.
 */

export const ADMIN_SESSION_COOKIE = "bomcusto_admin_session";

// Validade da sessao (8 horas) — expediente tipico sem precisar relogar.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sessionSecret(): string {
  // Reusa a chave de admin como segredo de assinatura do cookie quando uma
  // dedicada nao foi definida — evita exigir mais uma env var. CONFIG_PANEL_
  // SESSION_SECRET pode ser definida para isolar os segredos.
  return (
    process.env.CONFIG_PANEL_SESSION_SECRET ??
    process.env.ADMIN_API_KEY ??
    process.env.INTERNAL_API_KEY ??
    ""
  );
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

/** Gera o valor do cookie: "<expiraEm>.<assinatura>". */
export function issueSessionToken(now: number = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

/** Valida o cookie: assinatura correta E ainda nao expirado. */
export function isValidSessionToken(token: string | undefined, now: number = Date.now()): boolean {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expected = sign(expiresAtRaw);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return false;
  return now < expiresAt;
}

/**
 * Compara a senha enviada com CONFIG_PANEL_PASSWORD usando timingSafeEqual.
 * Retorna false se a env nao estiver configurada (nunca libera por omissao).
 */
export function isCorrectPassword(candidate: string | undefined): boolean {
  const expected = process.env.CONFIG_PANEL_PASSWORD ?? "";
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/**
 * Guarda para as rotas proxy de admin. Quando CONFIG_PANEL_PASSWORD esta
 * definida, exige um cookie de sessao valido — caso contrario a rota
 * retorna 401 (a tela mostra o prompt de senha). Quando a senha NAO esta
 * configurada, a guarda fica inativa (preserva o modelo "deploy interno"
 * original — D-03), e o acesso depende apenas da chave de admin server-side.
 */
export function requireAdminSession(req: NextRequest): boolean {
  if (!process.env.CONFIG_PANEL_PASSWORD) return true;
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidSessionToken(token);
}
