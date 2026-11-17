import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

const CAMINHO_BACKEND = "/cobranca/encargos-config";

function unauthorized() {
  return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    const res = await adminBackendFetch(CAMINHO_BACKEND);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    let body: Record<string, unknown> = {};
    try {
      const lido = await req.json();
      if (lido && typeof lido === "object") body = lido as Record<string, unknown>;
    } catch {
      body = {};
    }

    const { taxaJurosMes, multaPercentual } = body;
    if (
      typeof taxaJurosMes !== "number" ||
      typeof multaPercentual !== "number" ||
      !Number.isFinite(taxaJurosMes) ||
      !Number.isFinite(multaPercentual)
    ) {
      return NextResponse.json({ error: "Informe juros e multa como números." }, { status: 400 });
    }

    // Repassa somente as duas chaves conhecidas; o backend aplica os tetos (DTO + servico).
    const res = await adminBackendFetch(CAMINHO_BACKEND, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxaJurosMes, multaPercentual }),
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
