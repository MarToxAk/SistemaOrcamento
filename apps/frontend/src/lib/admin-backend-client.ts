const BACKEND_URL = () => process.env.BACKEND_URL ?? "http://localhost:4000/api";

/**
 * Cabecalhos server-side para os endpoints protegidos por admin (pdf-templates).
 * Injeta `x-internal-api-key` (auth global ja existente) E `x-admin-api-key`
 * (credencial dedicada do AdminAuthGuard — Plano 02). Ambas as chaves SO existem
 * aqui no servidor — nunca prefixadas com NEXT_PUBLIC_ (Pitfall 5 / T-999.1-18).
 */
function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  const internalKey = process.env.INTERNAL_API_KEY ?? "";
  const adminKey = process.env.ADMIN_API_KEY ?? "";
  return {
    "x-internal-api-key": internalKey,
    "x-admin-api-key": adminKey,
    ...extra,
  };
}

/**
 * Fetch para os endpoints administrativos do backend (`/pdf-templates/*`).
 * Estende o padrao de `backendFetch` (lib/backend-client.ts) adicionando a
 * chave de admin. O browser nunca recebe nenhuma das duas chaves — esta
 * funcao so e chamada dentro de route handlers (runtime server).
 */
export async function adminBackendFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BACKEND_URL()}${path}`;
  const headers = adminHeaders(init?.headers as Record<string, string> | undefined);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
