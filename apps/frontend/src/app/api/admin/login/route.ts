import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  isCorrectPassword,
  issueSessionToken,
  isValidSessionToken,
} from "@/lib/admin-session";
import {
  checkRateLimit,
  clientKeyFromHeaders,
  registerFailure,
  resetRateLimit,
} from "@/lib/login-rate-limit";

/**
 * GET — informa se a sessao atual ja esta autenticada (a tela usa para
 * decidir entre mostrar o prompt de senha ou o gerenciador).
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const configured = Boolean(process.env.CONFIG_PANEL_PASSWORD);
  return NextResponse.json({ authenticated: isValidSessionToken(token), configured });
}

/**
 * POST — recebe { password }, compara server-side com CONFIG_PANEL_PASSWORD
 * e, se correto, seta o cookie de sessao httpOnly. A senha nunca e devolvida
 * ao browser.
 */
export async function POST(req: NextRequest) {
  // Sem senha configurada no servidor: nao ha o que validar. Falha fechada.
  if (!process.env.CONFIG_PANEL_PASSWORD) {
    return NextResponse.json(
      { error: "Painel de configuracoes sem senha definida no servidor (CONFIG_PANEL_PASSWORD)." },
      { status: 503 },
    );
  }

  // Rate-limit anti-brute-force (T-999.1-AUTH): bloqueia apos N falhas por IP.
  const clientKey = clientKeyFromHeaders(req.headers);
  const limit = checkRateLimit(clientKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { password?: string } = {};
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    body = {};
  }

  if (!isCorrectPassword(body.password)) {
    registerFailure(clientKey);
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  // Sucesso: zera o contador de tentativas para este IP.
  resetRateLimit(clientKey);

  const res = NextResponse.json({ authenticated: true });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: issueSessionToken(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

/**
 * DELETE — logout: limpa o cookie de sessao.
 */
export async function DELETE() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
