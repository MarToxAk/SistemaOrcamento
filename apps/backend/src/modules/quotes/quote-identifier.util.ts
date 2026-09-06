import { Prisma, Quote } from "@prisma/client";

/**
 * Fonte UNICA da ordem de resolucao de identificador de orcamento.
 *
 * Quando `identifier` e puramente numerico (`/^\d+$/`), o primeiro candidato
 * tenta casar pelo numero do Athos (`externalQuoteId`, BigInt construido
 * diretamente da string, NUNCA via `Number`, para nao perder precisao em
 * identificadores acima de `Number.MAX_SAFE_INTEGER` — mitigacao T-iz0-02) e
 * o segundo tenta casar pelo numero interno sequencial (`internalNumber`),
 * que so e incluido quando `Number(identifier)` for um inteiro seguro.
 * Quando `identifier` nao e numerico, o unico candidato filtra pela chave
 * primaria (`id`, UUID).
 *
 * Esta ordem (externalQuoteId -> internalNumber -> id) e consumida tanto por
 * `NfseService` quanto por `QuotesService.findQuoteByIdentifier` — qualquer
 * mudanca aqui afeta os dois.
 */
export function buildQuoteIdentifierWhereCandidates(identifier: string): Prisma.QuoteWhereInput[] {
  if (/^\d+$/.test(identifier)) {
    const candidates: Prisma.QuoteWhereInput[] = [{ externalQuoteId: BigInt(identifier) }];

    const numericIdentifier = Number(identifier);
    if (Number.isSafeInteger(numericIdentifier)) {
      candidates.push({ internalNumber: numericIdentifier });
    }

    return candidates;
  }

  return [{ id: identifier }];
}

/**
 * Tipagem estrutural minima do delegate `prisma.quote` usada pelo resolver —
 * permite que os duplos de teste existentes (que ja mockam `findFirst`)
 * sirvam sem cast pesado contra o `PrismaService` completo.
 */
export type QuotePrismaDelegate = {
  quote: {
    findFirst: (args: { where: Prisma.QuoteWhereInput }) => Promise<Quote | null>;
  };
};

/**
 * Itera os candidatos de `buildQuoteIdentifierWhereCandidates` chamando
 * `findFirst` (sem `include` — quem precisa de relacoes carregadas usa outro
 * caminho, ex.: `QuotesService.findQuoteByIdentifier`) e devolve o primeiro
 * registro encontrado, ou `null` quando nenhum candidato casa.
 */
export async function findQuoteByIdentifierBasic(
  prisma: QuotePrismaDelegate,
  identifier: string,
): Promise<Quote | null> {
  const candidates = buildQuoteIdentifierWhereCandidates(identifier);

  for (const where of candidates) {
    const found = await prisma.quote.findFirst({ where });
    if (found) {
      return found;
    }
  }

  return null;
}
