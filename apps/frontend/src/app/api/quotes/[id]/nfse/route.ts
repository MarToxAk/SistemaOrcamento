import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const body = await _req.text();
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
