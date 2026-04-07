export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000/api";

  try {
    const payload = await req.json();
    const res = await fetch(`${backendUrl}/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
