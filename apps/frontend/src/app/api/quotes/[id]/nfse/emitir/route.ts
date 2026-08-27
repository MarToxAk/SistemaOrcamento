import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Emissao automatica de NFS-e via API do Sistema Nacional (ADN/Sefin Nacional).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const body = await req.json();
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse/emitir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
