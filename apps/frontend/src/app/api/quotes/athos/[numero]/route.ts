import { backendFetch } from "@/lib/backend-client";

export async function GET(_req: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero: rawNumero } = await params;
  const numero = rawNumero?.trim();
  if (!numero) {
    return Response.json({ error: "Numero do orçamento não informado." }, { status: 400 });
  }

  const url = new URL(_req.url);
  const format = url.searchParams.get("format") === "mapped" ? "mapped" : "raw";

  try {
    const res = await backendFetch(`/quotes/athos/${encodeURIComponent(numero)}?format=${format}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
