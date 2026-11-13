import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// Lista geral de notas fiscais (NFS-e + NF-e dos boletos), somente leitura (Fase 47, D-09).
// Lista branca: so idclienteAthos (digitos), de e ate (AAAA-MM-DD) seguem para o backend.
export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessão de administrador necessária." }, { status: 401 });
  }

  const origem = req.nextUrl.searchParams;
  const destino = new URLSearchParams();

  const idcliente = origem.get("idclienteAthos");
  if (idcliente && /^\d{1,10}$/.test(idcliente)) destino.set("idclienteAthos", idcliente);
  for (const chave of ["de", "ate"] as const) {
    const valor = origem.get(chave);
    if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) destino.set(chave, valor);
  }

  const query = destino.toString();
  try {
    const res = await backendFetch(`/cobranca/notas${query ? `?${query}` : ""}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 502 });
  }
}
