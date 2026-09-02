import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

const GIF_1X1_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";

// Proxy do pixel de rastreamento (1x1) embutido no e-mail de cobranca: mesma
// regra do link de confirmacao — o cliente final (e o cliente de e-mail dele)
// nunca deve buscar recursos direto do dominio/porta do backend.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
  };

  try {
    const res = await backendFetch(`/cobranca/email/${encodeURIComponent(token)}/pixel.gif`);
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, { status: 200, headers });
  } catch {
    // Nunca falhar visivelmente no cliente de e-mail — sempre devolve o gif 1x1.
    return new NextResponse(Buffer.from(GIF_1X1_BASE64, "base64"), { status: 200, headers });
  }
}
