import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

/**
 * Fase 52 (plano 52-10): proxy admin do resgate de um cupom (D-17/D-30).
 *
 * - Exige sessão de admin (`requireAdminSession`) — T-52-53.
 * - Normaliza e valida o código antes de chamar o backend (404 local) e repassa SOMENTE
 *   `{ valorCompra }` (número finito maior que zero) — T-52-52.
 * - Devolve status e corpo do backend sem alterar: 409 (`codigo: "JA_USADO"`) e 422
 *   (`ABAIXO_DO_MINIMO`, `VENCIDO`, `CANCELADO`, `TETO_MENSAL` com `liberadoEm`) precisam chegar à tela.
 */

const MSG_NAO_ENCONTRADO = "Cupom não encontrado. Confira se digitou o código completo.";
const MSG_VALOR = "Informe o valor da compra.";
const REGEX_CODIGO = /^[A-Z0-9]{1,6}-[A-Z0-9]{6}$/;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function unauthorized() {
  return NextResponse.json(
    { error: "Sessao expirada ou nao autenticada." },
    { status: 401, headers: NO_STORE },
  );
}

function normalizarCodigo(texto: string): string {
  return String(texto ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  if (!requireAdminSession(req)) return unauthorized();

  const { codigo } = await params;
  const normalizado = normalizarCodigo(codigo);
  if (!REGEX_CODIGO.test(normalizado)) {
    return NextResponse.json({ error: MSG_NAO_ENCONTRADO }, { status: 404, headers: NO_STORE });
  }

  let body: Record<string, unknown> = {};
  try {
    const lido = await req.json();
    if (lido && typeof lido === "object" && !Array.isArray(lido)) body = lido as Record<string, unknown>;
  } catch {
    body = {};
  }

  const valorCompra = body.valorCompra;
  if (typeof valorCompra !== "number" || !Number.isFinite(valorCompra) || valorCompra <= 0) {
    return NextResponse.json({ error: MSG_VALOR }, { status: 400, headers: NO_STORE });
  }

  try {
    const res = await adminBackendFetch(
      `/pesquisa/admin/cupons/${encodeURIComponent(normalizado)}/resgate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorCompra }),
      },
    );
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status, headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Falha ao conectar no backend." },
      { status: 500, headers: NO_STORE },
    );
  }
}
