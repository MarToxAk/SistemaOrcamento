import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function GET() {
  try {
    const res = await backendFetch("/integrations/efi/status");
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}