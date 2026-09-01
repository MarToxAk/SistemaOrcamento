import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Emissão automática de NFS-e (SOAP) foi descontinuada pela prefeitura.
// A nota agora é emitida manualmente e o XML é anexado aqui.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const formData = await req.formData();
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, { method: "DELETE" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
