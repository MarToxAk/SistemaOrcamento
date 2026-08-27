import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Emissao automatica de NFS-e via API do Sistema Nacional (ADN/Sefin Nacional).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await backendFetch("/cobranca/nfse/emitir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
