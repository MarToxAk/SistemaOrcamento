import { type NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// Estorno da baixa no Athos - Fase 43 (D-06). Acao destrutiva: exige sessao de admin aqui e x-admin-api-key
// (AdminOnly) no backend. O backend ainda exige confirmar=true (ou simular=true).
const CHAVES_PERMITIDAS = ["confirmar", "simular"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Identificador de cobranca invalido." }, { status: 400 });
  }

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
  const repassar: Record<string, unknown> = {};
  for (const chave of CHAVES_PERMITIDAS) {
    if (corpo && typeof corpo === "object" && chave in corpo) repassar[chave] = corpo[chave];
  }

  try {
    const res = await adminBackendFetch(`/cobranca/boleto/${id}/estornar-baixa-athos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(repassar),
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
