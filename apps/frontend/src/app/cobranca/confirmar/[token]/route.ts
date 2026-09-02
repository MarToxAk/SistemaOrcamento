import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Proxy do link "Confirmar recebimento" enviado no e-mail de cobranca: o
// cliente final nunca deve ver ou acessar o dominio/porta do backend
// diretamente, so o dominio publico do frontend (APP_BASE_URL).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const res = await backendFetch(`/cobranca/email/${encodeURIComponent(token)}/confirmar`);
    const html = await res.text();
    return new NextResponse(html, {
      status: res.status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(
      "<!doctype html><meta charset=utf-8><title>Erro</title>" +
        "<div style='font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center'>" +
        "<h1>Erro ao confirmar recebimento</h1><p>Tente novamente mais tarde.</p></div>",
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
