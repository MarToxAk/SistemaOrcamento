import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido." }, { status: 400 });

  const { idclienteAthos, idcontasReceber } = body as Record<string, unknown>;
  if (typeof idclienteAthos !== "number" || idclienteAthos <= 0)
    return NextResponse.json({ error: "idclienteAthos inválido." }, { status: 400 });
  if (!Array.isArray(idcontasReceber) || idcontasReceber.length === 0)
    return NextResponse.json({ error: "idcontasReceber inválido." }, { status: 400 });

  try {
    const res = await backendFetch("/cobranca/boleto/preview", {
      method: "POST",
      body: JSON.stringify({ idclienteAthos, idcontasReceber }),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
