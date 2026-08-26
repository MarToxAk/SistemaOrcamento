import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Emissão automática de NFS-e (SOAP) foi descontinuada pela prefeitura.
// A nota agora é emitida manualmente e o XML é anexado aqui.
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido ou ausente." }, { status: 400 });
  }

  try {
    const res = await backendFetch("/cobranca/nfse", {
      method: "POST",
      body: formData,
    });

    const data = await res
      .json()
      .catch(() => ({ error: "Resposta inválida do backend." }));

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
