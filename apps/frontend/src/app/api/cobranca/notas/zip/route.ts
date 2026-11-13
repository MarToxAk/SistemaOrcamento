import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

// ZIP em lote com PDF + XML das notas (Fase 47, D-12). Espelha LIMITE_NOTAS_ZIP do backend.
const LIMITE_NOTAS_ZIP = 50;

const inteiroPositivo = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2147483647;

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessão de administrador necessária." }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return NextResponse.json({ error: "Corpo inválido ou ausente." }, { status: 400 });
  }

  // Aceita so nfseIds e nfe; qualquer outra chave e descartada.
  const repassar: { nfseIds?: number[]; nfe?: Array<{ cobrancaBoletoId: number; numero: string }> } = {};

  if (corpo.nfseIds !== undefined) {
    if (!Array.isArray(corpo.nfseIds) || !corpo.nfseIds.every(inteiroPositivo)) {
      return NextResponse.json({ error: "nfseIds deve ser uma lista de inteiros positivos." }, { status: 400 });
    }
    repassar.nfseIds = corpo.nfseIds as number[];
  }

  if (corpo.nfe !== undefined) {
    if (!Array.isArray(corpo.nfe)) {
      return NextResponse.json({ error: "nfe deve ser uma lista." }, { status: 400 });
    }
    const nfe: Array<{ cobrancaBoletoId: number; numero: string }> = [];
    for (const item of corpo.nfe as unknown[]) {
      const o = item as Record<string, unknown> | null;
      if (
        !o ||
        typeof o !== "object" ||
        !inteiroPositivo(o.cobrancaBoletoId) ||
        typeof o.numero !== "string" ||
        !/^\d{1,15}$/.test(o.numero)
      ) {
        return NextResponse.json(
          { error: "Cada NF-e precisa de cobrancaBoletoId (inteiro positivo) e numero (somente dígitos)." },
          { status: 400 },
        );
      }
      nfe.push({ cobrancaBoletoId: o.cobrancaBoletoId, numero: o.numero });
    }
    repassar.nfe = nfe;
  }

  const total = (repassar.nfseIds?.length ?? 0) + (repassar.nfe?.length ?? 0);
  if (total === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma nota." }, { status: 400 });
  }
  if (total > LIMITE_NOTAS_ZIP) {
    return NextResponse.json(
      { error: `Selecione no máximo ${LIMITE_NOTAS_ZIP} notas por arquivo ZIP.` },
      { status: 400 },
    );
  }

  try {
    const res = await backendFetch("/cobranca/notas/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(repassar),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Erro ao gerar o ZIP das notas." }));
      return NextResponse.json(data, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const contentDisposition =
      res.headers.get("content-disposition") ?? 'attachment; filename="notas-fiscais.zip"';

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 502 });
  }
}
