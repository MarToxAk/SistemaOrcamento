import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ idcliente: string }> },
) {
  const { idcliente } = await params;
  const id = Number(idcliente);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idcliente inválido." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.idcontasReceber)) {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  // Endpoints /athos/* usam x-api-token (validateAthosToken), não x-internal-api-key
  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken
    ? { "x-api-token": athosToken }
    : {};

  try {
    const res = await backendFetch(`/athos/contas-receber/cliente/${id}/nf-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao verificar NF dos títulos." }, { status: 500 });
  }
}
