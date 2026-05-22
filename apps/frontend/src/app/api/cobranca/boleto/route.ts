import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Body inválido ou ausente." }, { status: 400 });
  }

  const { idclienteAthos, idcontasReceber, expireAt } = body as Record<string, unknown>;

  if (typeof idclienteAthos !== "number" || !Number.isFinite(idclienteAthos) || idclienteAthos <= 0) {
    return NextResponse.json({ error: "idclienteAthos inválido ou ausente." }, { status: 400 });
  }

  if (
    !Array.isArray(idcontasReceber) ||
    idcontasReceber.length === 0 ||
    !idcontasReceber.every((id) => typeof id === "number" && Number.isFinite(id))
  ) {
    return NextResponse.json(
      { error: "idcontasReceber deve ser um array não vazio de números." },
      { status: 400 },
    );
  }

  if (typeof expireAt !== "string" || expireAt.trim() === "") {
    return NextResponse.json({ error: "expireAt é obrigatório (YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const res = await backendFetch("/cobranca/boleto", {
      method: "POST",
      body: JSON.stringify({ idclienteAthos, idcontasReceber, expireAt }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res
      .json()
      .catch(() => ({ error: "Resposta inválida do backend." }));

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
