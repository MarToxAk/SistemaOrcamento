import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

/**
 * Fase 52 (plano 52-10): proxy admin do detalhe de um cupom (D-17/UI-D09).
 *
 * - Exige sessão de admin (`requireAdminSession`) — T-52-53.
 * - Normaliza o código (trim e maiúsculas), valida o formato antes de chamar o backend e usa
 *   `encodeURIComponent` no caminho — T-52-52. Código inválido responde 404 local, sem tocar no backend.
 */

const MSG_NAO_ENCONTRADO = "Cupom não encontrado. Confira se digitou o código completo.";
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  if (!requireAdminSession(req)) return unauthorized();

  const { codigo } = await params;
  const normalizado = normalizarCodigo(codigo);
  if (!REGEX_CODIGO.test(normalizado)) {
    return NextResponse.json({ error: MSG_NAO_ENCONTRADO }, { status: 404, headers: NO_STORE });
  }

  try {
    const res = await adminBackendFetch(`/pesquisa/admin/cupons/${encodeURIComponent(normalizado)}`);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status, headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Falha ao conectar no backend." },
      { status: 500, headers: NO_STORE },
    );
  }
}
