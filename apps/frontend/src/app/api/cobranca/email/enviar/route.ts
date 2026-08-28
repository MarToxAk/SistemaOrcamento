import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido ou ausente." }, { status: 400 });
  }
  const { idclienteAthos, cobrancaBoletoId, nfseEmitidaIds, destinatario } = body as Record<
    string,
    unknown
  >;
  if (typeof idclienteAthos !== "number" || !Number.isFinite(idclienteAthos) || idclienteAthos <= 0) {
    return NextResponse.json({ error: "idclienteAthos inválido ou ausente." }, { status: 400 });
  }
  const payload: Record<string, unknown> = { idclienteAthos };
  if (typeof cobrancaBoletoId === "number") payload.cobrancaBoletoId = cobrancaBoletoId;
  if (
    Array.isArray(nfseEmitidaIds) &&
    nfseEmitidaIds.length > 0 &&
    nfseEmitidaIds.every((n) => typeof n === "number")
  ) {
    payload.nfseEmitidaIds = nfseEmitidaIds;
  }
  if (typeof destinatario === "string" && destinatario.trim()) payload.destinatario = destinatario.trim();
  try {
    const res = await backendFetch("/cobranca/email/enviar", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
