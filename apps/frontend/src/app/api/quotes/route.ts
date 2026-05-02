import { backendFetch } from "@/lib/backend-client";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const res = await backendFetch("/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const res = await backendFetch(`/quotes${url.search}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    if (!res.ok) return Response.json(data, { status: res.status });
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}