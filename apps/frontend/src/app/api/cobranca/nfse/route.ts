import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Body inválido ou ausente." }, { status: 400 });
  }

  const { idclienteAthos, idcontasReceber, valor, descricaoServico, servicoCodigo } =
    body as Record<string, unknown>;

  if (
    typeof idclienteAthos !== "number" ||
    !Number.isFinite(idclienteAthos) ||
    idclienteAthos <= 0
  ) {
    return NextResponse.json(
      { error: "idclienteAthos inválido ou ausente." },
      { status: 400 },
    );
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

  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json(
      { error: "valor deve ser um número positivo." },
      { status: 400 },
    );
  }

  try {
    const res = await backendFetch("/cobranca/nfse", {
      method: "POST",
      body: JSON.stringify({ idclienteAthos, idcontasReceber, valor, descricaoServico, servicoCodigo }),
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
