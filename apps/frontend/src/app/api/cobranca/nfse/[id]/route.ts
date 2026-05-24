import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const nfseId = Number(id);
  if (!Number.isFinite(nfseId) || nfseId <= 0) {
    return NextResponse.json({ error: "id inválido." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/nfse/${nfseId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
