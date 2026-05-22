import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/boleto/${numId}/pdf`, { method: "GET" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Erro ao baixar PDF." }));
      return NextResponse.json(data, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const contentDisposition = res.headers.get("content-disposition") ?? `attachment; filename="boleto-${numId}.pdf"`;

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao baixar o boleto." }, { status: 500 });
  }
}
