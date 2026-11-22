/**
 * Fase 52 (plano 52-06): trava entre processos para os crons da pesquisa (T-52-73).
 *
 * A guarda `running` dos jobs so vale dentro de UM processo. Com duas replicas (ou um reinicio em que
 * o ciclo antigo ainda roda), os dois ciclos podem se sobrepor e duplicar envios/anonymizacao. Cada
 * execucao passa por `pg_try_advisory_xact_lock` dentro de uma transacao; sem a trava o ciclo e pulado.
 *
 * Escolha: trava de TRANSACAO (nao de sessao). O pool do Prisma nao garante a mesma conexao entre
 * travar e destravar, mas a trava de transacao e liberada sozinha no fim ou na queda da conexao. O
 * custo aceito e a transacao ficar aberta (sem consultas nela) durante o ciclo, com `timeout` de 15
 * minutos e `maxWait` de 10 s — os ciclos sao curtos e o pool tem varias conexoes.
 *
 * Chaves fixas, distintas da 520001 do resgate: retry 520101, retencao 520102.
 */
export const CHAVE_TRAVA_RETRY = 520101;
export const CHAVE_TRAVA_RETENCAO = 520102;

/** Timeout do ciclo dentro da transacao (15 min) e espera por conexao do pool (10 s). */
const OPCOES_TRANSACAO = { timeout: 15 * 60_000, maxWait: 10_000 };

type Transacao = { $queryRaw: (...args: unknown[]) => Promise<unknown> };

export type ResultadoTrava<T> = { executou: true; resultado: T } | { executou: false };

type PrismaComTransacao = { $transaction: Function };

function travaObtida(linhas: unknown): boolean {
  if (!Array.isArray(linhas) || linhas.length === 0) return false;
  const primeira = linhas[0];
  if (primeira === null || typeof primeira !== "object") return false;
  return (primeira as { trava?: unknown }).trava === true;
}

/**
 * Executa `fn` somente com a trava advisory obtida; sem ela devolve `{ executou: false }` sem chamar
 * `fn`. Erros de `fn` ou da transacao propagam (a transacao e revertida e a trava cai com ela).
 */
export async function comTravaAdvisory<T>(
  prisma: PrismaComTransacao,
  chave: number,
  fn: () => Promise<T>,
): Promise<ResultadoTrava<T>> {
  const transacionar = prisma.$transaction as (
    callback: (tx: Transacao) => Promise<ResultadoTrava<T>>,
    opcoes: typeof OPCOES_TRANSACAO,
  ) => Promise<ResultadoTrava<T>>;

  return transacionar(async (tx) => {
    const linhas = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${chave}) AS trava`;
    if (!travaObtida(linhas)) return { executou: false as const };
    return { executou: true as const, resultado: await fn() };
  }, OPCOES_TRANSACAO);
}
