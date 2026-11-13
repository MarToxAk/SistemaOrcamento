import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// Detalhe do boleto (linha digitavel, PIX copia e cola e titulos), somente leitura (Fase 47, D-06).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessão de administrador necessária." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/boleto/${id}/detalhe`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 502 });
  }
}
