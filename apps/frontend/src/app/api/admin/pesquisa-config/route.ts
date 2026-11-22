import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

/**
 * Fase 52 (plano 52-08): proxy admin da configuração da pesquisa e da recompensa.
 *
 * - GET/PUT exigem sessão de admin (`requireAdminSession`) — T-52-42.
 * - As chaves de admin e interna só existem no servidor (`adminBackendFetch`) — T-52-44.
 * - O PUT repassa SOMENTE as chaves conhecidas, com tipo conferido; nunca espalha o corpo livre.
 */

const CAMINHO_BACKEND = "/pesquisa/admin/config";

const CHAVES_NUMERO = [
  "percentualDesconto",
  "tetoDesconto",
  "compraMinima",
  "validadeCupomDias",
  "validadeLinkDias",
  "intervaloDias",
  "tetoMensal",
] as const;

const CHAVES_TEXTO = [
  "prefixoCupom",
  "varianteVisual",
  "textoFechamento",
  "textoSemRecompensa",
  "textoPosResposta",
  "textoConviteGoogle",
  "paginaTitulo",
  "paginaSubtitulo",
  "paginaObrigadoSemRecompensa",
  "paginaGoogleTitulo",
  "paginaGoogleCorpo",
] as const;

function unauthorized() {
  return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    const res = await adminBackendFetch(CAMINHO_BACKEND);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    let body: Record<string, unknown> = {};
    try {
      const lido = await req.json();
      if (lido && typeof lido === "object" && !Array.isArray(lido)) body = lido as Record<string, unknown>;
    } catch {
      body = {};
    }

    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: "Informe se a pesquisa esta ativa." }, { status: 400 });
    }
    for (const chave of CHAVES_NUMERO) {
      if (typeof body[chave] !== "number" || !Number.isFinite(body[chave])) {
        return NextResponse.json({ error: "Informe os valores numericos da configuracao." }, { status: 400 });
      }
    }
    for (const chave of CHAVES_TEXTO) {
      if (typeof body[chave] !== "string") {
        return NextResponse.json({ error: "Informe os textos da configuracao." }, { status: 400 });
      }
    }
    if (body.linkGoogle !== null && typeof body.linkGoogle !== "string") {
      return NextResponse.json({ error: "Informe um link do Google valido ou deixe vazio." }, { status: 400 });
    }

    // Monta um objeto novo apenas com as chaves conhecidas; o backend revalida com AdminOnly + validarConfig.
    const payload: Record<string, unknown> = { ativo: body.ativo, linkGoogle: body.linkGoogle };
    for (const chave of CHAVES_NUMERO) payload[chave] = body[chave];
    for (const chave of CHAVES_TEXTO) payload[chave] = body[chave];

    const res = await adminBackendFetch(CAMINHO_BACKEND, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
