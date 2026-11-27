import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";
import { familiaTemplateValida } from "@/lib/propostas-rotas";

function unauthorized() {
  return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    // Fase 55 (D-22, T-55-46): repassa a familia somente se for ORCAMENTO ou PROPOSTA; outro valor e descartado.
    const familia = familiaTemplateValida(req.nextUrl.searchParams.get("familia"));
    const caminho = familia ? `/pdf-templates?familia=${familia}` : "/pdf-templates";
    const res = await adminBackendFetch(caminho);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    let body: unknown = undefined;
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }

    const res = await adminBackendFetch("/pdf-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
