import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Fase 54 (D-08): pagamento identificado do orcamento (situacao, valor pago, desconto,
// E2E, origem) para a tela de emissao de NFS-e. A situacao muda com o webhook da EFI,
// entao a resposta nunca e cacheada.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse/pagamento`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
