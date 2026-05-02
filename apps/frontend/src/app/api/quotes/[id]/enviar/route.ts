import { backendFetch } from "@/lib/backend-client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) return Response.json({ error: "Id do orcamento nao informado." }, { status: 400 });
  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/enviar`, { method: "POST" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}