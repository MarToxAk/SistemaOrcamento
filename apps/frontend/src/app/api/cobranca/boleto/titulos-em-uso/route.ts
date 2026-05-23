import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.idcontasReceber)) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const res = await backendFetch("/cobranca/boleto/titulos-em-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json([], { status: 200 }); // silently return empty on error
  }
}
