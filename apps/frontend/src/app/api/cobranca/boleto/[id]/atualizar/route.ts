import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// Geracao do boleto atualizado com juros e multa (Fase 50). Cria cobranca real na EFI e cancela o
// original, entao exige sessao de admin. Repassa so novoVencimento e as taxas; o backend recalcula tudo.
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
  if (typeof repassar.novoVencimento !== "string") {
    return NextResponse.json({ error: "Informe o novo vencimento." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/boleto/${id}/atualizar`, {
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
