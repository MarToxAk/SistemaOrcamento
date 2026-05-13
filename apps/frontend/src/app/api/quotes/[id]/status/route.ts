import { backendFetch } from "@/lib/backend-client";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) {
    return Response.json({ error: "Id do orçamento não informado." }, { status: 400 });
  }

  try {
    const payload = await req.json();
    const response = await backendFetch(`/quotes/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!response.ok) return Response.json(data, { status: response.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
