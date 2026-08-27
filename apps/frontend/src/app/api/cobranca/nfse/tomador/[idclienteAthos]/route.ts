import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ idclienteAthos: string }> }) {
  const { idclienteAthos } = await params;
  const numId = Number(idclienteAthos);
  if (!Number.isFinite(numId) || numId <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/nfse/tomador/${numId}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
