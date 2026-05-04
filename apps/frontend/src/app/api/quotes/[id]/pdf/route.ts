import { backendFetch } from "@/lib/backend-client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) {
    return Response.json({ error: "Id do orcamento nao informado." }, { status: 400 });
  }

  try {
    let body: unknown = undefined;
    try {
      body = await _req.json();
    } catch {
      body = undefined;
    }

    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/pdf`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
