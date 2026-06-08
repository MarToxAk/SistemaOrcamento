import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ idcliente: string }> },
) {
  const { idcliente } = await params;
  const id = Number(idcliente);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idcliente inválido." }, { status: 400 });
  }

  const numero = req.nextUrl.searchParams.get("numero");

  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken
    ? { "x-api-token": athosToken }
    : {};

  let url = `/athos/clientes/${id}/notas-fiscais`;
  if (numero && numero.trim() !== "") {
    url += `?numero=${encodeURIComponent(numero.trim())}`;
  }

  try {
    const res = await backendFetch(url, {
      method: "GET",
      headers: extraHeaders,
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
