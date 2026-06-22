import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";

export async function POST(req: NextRequest) {
  try {
    let body: unknown = undefined;
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }

    const res = await adminBackendFetch("/pdf-templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
      return NextResponse.json(data, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
