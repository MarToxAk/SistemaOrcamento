import { backendFetch } from "@/lib/backend-client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();

  const athosToken = process.env.ATHOS_API_TOKEN ?? "";
  const extraHeaders: Record<string, string> = athosToken
    ? { "x-api-token": athosToken }
    : {};

  try {
    const res = await backendFetch(`/athos/clientes${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: extraHeaders,
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data);
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
