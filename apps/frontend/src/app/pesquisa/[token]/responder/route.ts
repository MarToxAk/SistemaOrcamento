import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { ipDoCliente } from "@/lib/ip-cliente";

// D-43/T-52-71: proxy PUBLICO de envio, FORA do prefixo de API. O nginx de deploy roteia
// tudo sob /api/ direto ao backend :4000, entao este proxy vive ao lado da pagina (mesmo
// padrao de /cobranca/confirmar/[token]). Sem guarda de sessao de admin (rota publica).
// Repassa ao backend SOMENTE nota e comentario (lista explicita, nunca o corpo inteiro).
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const entrada = (corpo ?? {}) as { nota?: unknown; comentario?: unknown };
  const { nota, comentario } = entrada;

  if (typeof nota !== "number" || !Number.isInteger(nota) || nota < 1 || nota > 5) {
    return NextResponse.json(
      { erro: "A nota deve ser um inteiro de 1 a 5." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (comentario !== undefined && (typeof comentario !== "string" || comentario.length > 500)) {
    return NextResponse.json(
      { erro: "O comentario deve ter no maximo 500 caracteres." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const corpoLimpo: { nota: number; comentario?: string } = { nota };
  if (typeof comentario === "string" && comentario.trim()) {
    corpoLimpo.comentario = comentario.trim();
  }

  const ip = ipDoCliente(request.headers);

  try {
    const res = await backendFetch(`/pesquisa/publica/${encodeURIComponent(token)}/resposta`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ip ? { "x-client-ip": ip } : {}) },
      body: JSON.stringify(corpoLimpo),
    });
    const data = await res.json().catch(() => ({ erro: "resposta-invalida" }));
    return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ erro: "indisponivel" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
