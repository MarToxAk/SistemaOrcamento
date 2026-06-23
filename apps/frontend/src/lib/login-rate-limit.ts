/**
 * Rate-limit em memoria para o POST de senha de /api/admin/login (T-999.1-AUTH).
 *
 * A rota de login e um route handler do Next (nao passa pelo ThrottlerGuard do
 * backend NestJS), entao sem isto um atacante poderia forcar CONFIG_PANEL_PASSWORD
 * por brute-force. Aplicamos uma janela deslizante por chave (IP): apos
 * MAX_ATTEMPTS falhas dentro de WINDOW_MS, novas tentativas sao bloqueadas
 * (429) ate a janela expirar. Tentativas bem-sucedidas zeram o contador.
 *
 * Escopo: protecao best-effort por instancia. Em deploy multi-instancia o limite
 * e por processo — suficiente para o caso single-tenant/interno desta fase. Para
 * endurecer alem disso, mover para um store compartilhado (ex: Redis).
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5; // falhas permitidas por janela

type Bucket = { count: number; firstAttemptAt: number };

const buckets = new Map<string, Bucket>();

/** Remove buckets expirados (evita crescimento ilimitado do Map). */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.firstAttemptAt >= WINDOW_MS) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Verifica se a chave pode tentar. NAO incrementa — chame registerFailure()
 * apos uma tentativa malsucedida.
 */
export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true, retryAfterSeconds: 0 };

  if (now - bucket.firstAttemptAt >= WINDOW_MS) {
    buckets.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((bucket.firstAttemptAt + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Registra uma tentativa malsucedida (incrementa o contador da janela). */
export function registerFailure(key: string, now: number = Date.now()): void {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.firstAttemptAt >= WINDOW_MS) {
    buckets.set(key, { count: 1, firstAttemptAt: now });
    return;
  }
  bucket.count += 1;
}

/** Zera o contador apos sucesso (libera tentativas futuras imediatamente). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Deriva a chave de rate-limit a partir do IP do request (best-effort). */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export const RATE_LIMIT_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const RATE_LIMIT_WINDOW_MS = WINDOW_MS;
