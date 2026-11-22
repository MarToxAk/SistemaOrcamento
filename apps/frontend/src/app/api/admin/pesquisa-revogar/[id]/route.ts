import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

/**
 * Fase 52 (plano 52-09): proxy admin da revogação de uma pesquisa (D-02 e a decisão de revogação).
 *
 * - POST exige sessão de admin (`requireAdminSession`) — T-52-62.
 * - O `id` é validado como UUID antes de qualquer acesso ao backend: um id inválido responde 404
 *   localmente, sem chamar o backend (e sem revelar nada).
 * - Nenhum corpo é repassado: a revogação não tem payload.
 * - As chaves de admin e interna só existem no servidor (`adminBackendFetch`).
 */

const REGEX_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const MSG_NAO_ENCONTRADA = "Pesquisa não encontrada. Atualize os resultados.";

function unauthorized() {
  return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminSession(req)) return unauthorized();

  const { id } = await params;
  if (!REGEX_UUID.test(id)) {
    return NextResponse.json({ error: MSG_NAO_ENCONTRADA }, { status: 404 });
  }

  try {
    const res = await adminBackendFetch(`/pesquisa/admin/pesquisas/${encodeURIComponent(id)}/revogar`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
