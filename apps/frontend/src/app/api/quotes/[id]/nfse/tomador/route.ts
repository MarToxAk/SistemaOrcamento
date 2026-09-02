import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Resolve CPF/CNPJ, nome e endereco do tomador via cliente Athos vinculado ao
// orcamento, para pre-preencher o formulario de emissao automatica de NFS-e.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse/tomador`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
