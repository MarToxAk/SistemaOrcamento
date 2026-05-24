import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.idcontasReceber)) {
    return NextResponse.json({ error: "idcontasReceber deve ser um array." }, { status: 400 });
  }

  try {
    const res = await backendFetch("/cobranca/nfse/titulos-em-uso", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
