import { type NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// Baixa manual (ou simulada) do boleto pago no Athos - Fase 43. Exige sessao de admin; o backend
// exige x-admin-api-key (AdminOnly), injetada aqui no servidor por adminBackendFetch.
const CHAVES_PERMITIDAS = ["dataPagamento", "simular", "ignorarValorEfi"] as const;

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
    const res = await adminBackendFetch(`/cobranca/boleto/${id}/baixar-athos`, {
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
