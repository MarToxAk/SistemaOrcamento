import { backendFetch } from "@/lib/backend-client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) {
    return Response.json({ error: "Id do orçamento não informado." }, { status: 400 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  try {
    const res = await backendFetch(
      `/quotes/${encodeURIComponent(id)}/approve?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );

    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }

    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Erro interno ao processar aprovação." }, { status: 500 });
  }
}
