import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";

/**
 * Fase 52 (plano 52-10): proxy admin da lista paginada de cupons (D-17).
 *
 * - SEM senha: balcão/atendente usa direto. A chave de admin do backend é injetada aqui no servidor
 *   (`adminBackendFetch`), nunca vai ao navegador.
 * - Só repassa as chaves conhecidas: `status` em lista fechada, `cursor` curto e `limite` de 1 a 100.
 *   Qualquer outro parâmetro é descartado; as chaves de admin/interna ficam no servidor (`adminBackendFetch`).
 */

const CAMINHO_BACKEND = "/pesquisa/admin/cupons";

const STATUS_VALIDOS = new Set(["disponiveis", "usados", "vencidos", "cancelados"]);
const REGEX_CURSOR = /^[A-Za-z0-9-]{1,64}$/;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  try {
    const params = new URLSearchParams();

    const status = req.nextUrl.searchParams.get("status");
    if (status && STATUS_VALIDOS.has(status)) params.set("status", status);

    const cursor = req.nextUrl.searchParams.get("cursor");
    if (cursor && REGEX_CURSOR.test(cursor)) params.set("cursor", cursor);

    const limiteBruto = req.nextUrl.searchParams.get("limite");
    if (limiteBruto !== null) {
      const limite = Number(limiteBruto);
      if (Number.isInteger(limite) && limite >= 1 && limite <= 100) {
        params.set("limite", String(limite));
      }
    }

    const query = params.toString();
    const res = await adminBackendFetch(`${CAMINHO_BACKEND}${query ? `?${query}` : ""}`);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status, headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Falha ao conectar no backend." },
      { status: 500, headers: NO_STORE },
    );
  }
}
