import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// DANFE (PDF) de uma NF-e vinculada a um boleto (Fase 47, D-10). Reaproveita a rota existente
// GET cobranca/nfe/danfe do backend; aqui so validamos os parametros antes de repassar.
export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessão de administrador necessária." }, { status: 401 });
  }

  const cobrancaBoletoId = req.nextUrl.searchParams.get("cobrancaBoletoId") ?? "";
  const numero = req.nextUrl.searchParams.get("numero") ?? "";
  if (!/^\d+$/.test(cobrancaBoletoId) || !/^\d{1,15}$/.test(numero)) {
    return NextResponse.json(
      { error: "Informe cobrancaBoletoId (somente dígitos) e numero da NF-e (até 15 dígitos)." },
      { status: 400 },
    );
  }

  try {
    const res = await backendFetch(
      `/cobranca/nfe/danfe?cobrancaBoletoId=${cobrancaBoletoId}&numero=${numero}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Erro ao baixar o DANFE da NF-e." }));
      return NextResponse.json(data, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const contentDisposition =
      res.headers.get("content-disposition") ?? `inline; filename="NF-e-${numero}.pdf"`;

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 502 });
  }
}
