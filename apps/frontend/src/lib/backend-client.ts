const BACKEND_URL = () => process.env.BACKEND_URL ?? "http://localhost:4000/api";

function internalHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY ?? "";
  return { "x-internal-api-key": key, ...extra };
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BACKEND_URL()}${path}`;
  const headers = internalHeaders(init?.headers as Record<string, string> | undefined);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
