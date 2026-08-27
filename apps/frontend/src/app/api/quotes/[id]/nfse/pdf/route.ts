import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse/pdf`, { method: "GET" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Erro ao baixar PDF da NFS-e." }));
      return NextResponse.json(data, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const contentDisposition = res.headers.get("content-disposition") ?? `attachment; filename="NFSe-${id}.pdf"`;

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao baixar o PDF da NFS-e." }, { status: 500 });
  }
}
