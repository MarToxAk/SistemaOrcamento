export async function GET(_req: Request, { params }: { params: { numero: string } }) {
  const numero = params.numero?.trim();
  if (!numero) {
    return Response.json({ error: "Numero do orçamento não informado." }, { status: 400 });
  }

  const url = new URL(_req.url);
  const format = url.searchParams.get("format") === "mapped" ? "mapped" : "raw";
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000/api";

  try {
    const res = await fetch(`${backendUrl}/quotes/athos/${encodeURIComponent(numero)}?format=${format}`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));

    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }

    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
