export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) {
    return Response.json({ error: "Id do orcamento nao informado." }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000/api";

  try {
    const res = await fetch(`${backendUrl}/quotes/${encodeURIComponent(id)}/enviar`, {
      method: "POST",
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
