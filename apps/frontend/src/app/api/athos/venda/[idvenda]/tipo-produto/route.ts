import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idvenda: string }> },
) {
  const { idvenda } = await params;
  const id = Number(idvenda);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idvenda inválido." }, { status: 400 });
  }

  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken
    ? { "x-api-token": athosToken }
    : {};

  try {
    const res = await backendFetch(`/athos/venda/${id}/tipo-produto`, {
      method: "GET",
      headers: extraHeaders,
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
