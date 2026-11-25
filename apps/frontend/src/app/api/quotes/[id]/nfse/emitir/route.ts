import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { ipDoCliente } from "@/lib/ip-cliente";

const MAX_USER_AGENT = 200;

// Emissao automatica de NFS-e via API do Sistema Nacional (ADN/Sefin Nacional).
// Fase 54 (D-09): o corpo pode carregar senhaLiberacao/liberadoPor. O proxy repassa o corpo
// sem le-lo nem logar (a senha nunca vai para log) e anexa a origem do operador
// (IP real e user-agent) para a auditoria e o limitador de forca bruta do backend.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) return NextResponse.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const body = await req.json();

    // T-54-21: o IP vem so de x-real-ip/x-forwarded-for (nginx) via ipDoCliente; um
    // x-client-ip enviado pelo navegador e ignorado (nunca lido).
    const ip = ipDoCliente(req.headers);
    const userAgent = req.headers.get("user-agent")?.trim().slice(0, MAX_USER_AGENT);

    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse/emitir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ip ? { "x-client-ip": ip } : {}),
        ...(userAgent ? { "x-client-user-agent": userAgent } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
