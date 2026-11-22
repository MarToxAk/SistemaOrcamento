import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

/**
 * Fase 52 (plano 52-09): proxy admin do painel de resultados da pesquisa (D-25).
 *
 * - GET exige sessão de admin (`requireAdminSession`) — T-52-47.
 * - Só o parâmetro `periodo`, em lista fechada, é repassado ao backend — T-52-50.
 * - As chaves de admin e interna só existem no servidor (`adminBackendFetch`) — T-52-49.
 */

const CAMINHO_BACKEND = "/pesquisa/admin/resultados";

const PERIODOS = ["mes", "30d", "tudo"] as const;
type Periodo = (typeof PERIODOS)[number];

function unauthorized() {
  return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();

  const bruto = req.nextUrl.searchParams.get("periodo");
  const periodo: Periodo = PERIODOS.includes(bruto as Periodo) ? (bruto as Periodo) : "mes";

  try {
    const res = await adminBackendFetch(`${CAMINHO_BACKEND}?periodo=${periodo}`);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
