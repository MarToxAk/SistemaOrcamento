/**
 * Valida que uma URL usa apenas protocolo http: ou https:.
 * Previne XSS via href com javascript: ou data: URIs.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}
