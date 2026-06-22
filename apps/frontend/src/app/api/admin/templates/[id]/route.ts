import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Id do template nao informado." }, { status: 400 });
  }

  try {
    const res = await adminBackendFetch(`/pdf-templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
