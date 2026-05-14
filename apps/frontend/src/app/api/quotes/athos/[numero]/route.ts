import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const { numero: rawNumero } = await params;
  const numero = rawNumero?.trim();
  if (!numero) {
    return NextResponse.json({ error: "Numero do orçamento não informado." }, { status: 400 });
  }

  const url = new URL(_req.url);
  const format = url.searchParams.get("format") === "mapped" ? "mapped" : "raw";

  try {
    const res = await backendFetch(`/quotes/athos/${encodeURIComponent(numero)}?format=${format}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
