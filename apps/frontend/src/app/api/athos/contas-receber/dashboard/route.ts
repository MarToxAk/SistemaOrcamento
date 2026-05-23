import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(req: NextRequest) {
  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken
    ? { "x-api-token": athosToken }
    : {};

  const status = req.nextUrl.searchParams.get("status");
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";

  try {
    const res = await backendFetch(`/athos/contas-receber/dashboard${qs}`, {
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
