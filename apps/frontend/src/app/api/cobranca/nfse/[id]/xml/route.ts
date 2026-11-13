import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// XML salvo da NFS-e (Fase 47, D-11). O backend nunca gera XML: sem XML salvo responde 404 com
// "XML indisponível ..." e esta rota repassa o JSON (status e message) para a tela mostrar o motivo.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessão de administrador necessária." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const res = await backendFetch(`/cobranca/nfse/${id}/xml`, { method: "GET" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Erro ao baixar o XML da NFS-e." }));
      return NextResponse.json(data, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const contentDisposition =
      res.headers.get("content-disposition") ?? `attachment; filename="NFSe-${id}.xml"`;

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": contentDisposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 502 });
  }
}
