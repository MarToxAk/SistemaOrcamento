import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

type Ctx = { params: Promise<{ idclienteAthos: string }> };

// Lista fixa de CC por cliente (Fase 42, D-06). A lista decide para onde vao documentos fiscais
// em envios futuros, entao as duas rotas exigem sessao admin antes de qualquer chamada ao backend.

async function lerIdCliente(params: Ctx["params"]): Promise<number | null> {
  const { idclienteAthos } = await params;
  const numId = Number(idclienteAthos);
  return Number.isInteger(numId) && numId > 0 ? numId : null;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  const numId = await lerIdCliente(params);
  if (numId === null) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    const res = await backendFetch(`/cobranca/email/cc-padrao/${numId}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  const numId = await lerIdCliente(params);
  if (numId === null) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { emails?: unknown } | null;
  const emails = body?.emails;
  if (!Array.isArray(emails) || !emails.every((e) => typeof e === "string")) {
    return NextResponse.json({ error: "emails deve ser uma lista de e-mails." }, { status: 400 });
  }
  const lista = (emails as string[]).map((e) => e.trim()).filter(Boolean);
  try {
    const res = await backendFetch(`/cobranca/email/cc-padrao/${numId}`, {
      method: "PUT",
      body: JSON.stringify({ emails: lista }),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
