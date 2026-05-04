import { backendFetch } from "@/lib/backend-client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) return Response.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data);
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) return Response.json({ error: "Id do orcamento nao informado." }, { status: 400 });

  try {
    const body = await _req.text();
    const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data);
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
