export async function GET() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000/api";

  try {
    const res = await fetch(`${backendUrl}/integrations/efi/status`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
