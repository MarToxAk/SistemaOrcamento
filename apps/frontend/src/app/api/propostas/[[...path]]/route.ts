import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";
import { decidirAcessoProxy } from "@/lib/propostas-rotas";

/**
 * Proxy admin unico para /propostas/* (Fase 55, T-55-39 e T-55-40).
 *
 * A decisao de acesso (401 sem sessao, 404 fora da lista permitida, caminho montado so de segmentos
 * validados) e a funcao pura `decidirAcessoProxy` de `lib/propostas-rotas.ts`, provada por
 * `scripts/checar-propostas-rotas.mjs`. Os quatro metodos delegam a UMA funcao `encaminhar`.
 * As chaves interna e admin so existem no servidor (adminBackendFetch); cabecalhos do navegador
 * nunca sao repassados.
 */

type Contexto = { params: Promise<{ path?: string[] }> };

async function encaminhar(metodo: string, req: NextRequest, contexto: Contexto): Promise<NextResponse> {
  const { path } = await contexto.params;
  const decisao = decidirAcessoProxy({
    temSessao: requireAdminSession(req),
    metodo,
    segmentos: path ?? [],
    search: req.nextUrl.search,
  });
  if (!decisao.ok) {
    return NextResponse.json({ error: decisao.mensagem }, { status: decisao.status });
  }

  try {
    const corpo = metodo === "GET" || metodo === "DELETE" ? "" : await req.text();
    const init: RequestInit = { method: metodo };
    if (corpo) {
      init.body = corpo;
      init.headers = { "Content-Type": "application/json" };
    }

    const res = await adminBackendFetch(decisao.caminho, init);

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      const buffer = await res.arrayBuffer();
      const headers: Record<string, string> = { "Content-Type": contentType };
      const disposition = res.headers.get("content-disposition");
      if (disposition) headers["Content-Disposition"] = disposition;
      return new NextResponse(buffer, { status: res.status, headers });
    }

    const texto = await res.text();
    if (!texto) return new NextResponse(null, { status: res.status });
    try {
      return NextResponse.json(JSON.parse(texto), { status: res.status });
    } catch {
      return NextResponse.json({ error: "Resposta invalida do backend." }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return encaminhar("GET", req, contexto);
}

export async function POST(req: NextRequest, contexto: Contexto) {
  return encaminhar("POST", req, contexto);
}

export async function PATCH(req: NextRequest, contexto: Contexto) {
  return encaminhar("PATCH", req, contexto);
}

export async function DELETE(req: NextRequest, contexto: Contexto) {
  return encaminhar("DELETE", req, contexto);
}
