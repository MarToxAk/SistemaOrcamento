import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// Previa do boleto atualizado (Fase 50, D-06). Exige sessao de admin; repassa so a data e as taxas.
// Datas e valores sao sempre calculados e validados no backend (D-01/D-16).
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
  if (corpo && typeof corpo === "object") {
    if (typeof corpo.novoVencimento === "string") repassar.novoVencimento = corpo.novoVencimento;
    for (const chave of ["taxaJurosMes", "multaPercentual"] as const) {
      const v = corpo[chave];
      if (typeof v === "number" && Number.isFinite(v)) repassar[chave] = v;
    }
  }

  try {
    const res = await backendFetch(`/cobranca/boleto/${id}/atualizacao/previa`, {
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
