import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idcliente: string }> },
) {
  const { idcliente } = await params;
  const id = Number(idcliente);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idcliente inválido." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/nfse/cliente/${id}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
