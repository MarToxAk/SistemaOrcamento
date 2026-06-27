// Tipos locais — sem imports externos (funcao pura, zero dependencias NestJS)
type RawValue = string | number | boolean | null;
type RawRow = Record<string, RawValue>;

// Constantes nomeadas exportadas (D-03, D-09 — proibido magic number inline)
export const DEFAULTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h em ms
export const DEFAULTS_MIN_SAMPLE = 5;

// Allowlists exportadas as const (D-05) — fonte de verdade unica dos campos de moda
// D-06: statusproduto e vendeproduto NAO entram nestas allowlists — default fixo da Fase 38
export const FISCAL_FIELDS = [
  "icms",
  "icmsnfe",
  "tributacao",
  "tributacaonfe",
  "codigocsosn",
  "codigocsosnnfe",
  "origem",
  "origemnfe",
  "tipoitem",
  "piscst",
  "cofinscst",
  "idcfopsaida",
  "ncm",
] as const;

export const STOCK_FIELDS = ["controlaestoque", "baixarestoque"] as const;

/**
 * Interface de retorno de getDefaults().
 * - Campos fiscais OPCIONAIS: omitidos quando sem moda (D-08)
 * - Campos de estoque OBRIGATORIOS: sempre presentes, fallback false (D-07)
 * Tipos dos campos fiscais seguem produto.types.ts:
 *   origem/origemnfe: number; demais fiscais: string.
 */
export interface ProductDefaults {
  // Campos fiscais — opcionais (omitidos quando sem moda, D-08)
  icms?: string;
  icmsnfe?: string;
  tributacao?: string;
  tributacaonfe?: string;
  codigocsosn?: string;
  codigocsosnnfe?: string;
  origem?: number;
  origemnfe?: number;
  tipoitem?: string;
  piscst?: string;
  cofinscst?: string;
  idcfopsaida?: string;
  ncm?: string;
  // Campos de estoque — sempre presentes (fallback false, D-07)
  controlaestoque: boolean;
  baixarestoque: boolean;
}

/**
 * Calcula a moda de um campo entre as linhas fornecidas.
 *
 * - Ignora null, undefined e string vazia (DEFD-02 / Pitfall 1 do RESEARCH)
 * - Requer ao menos minSample valores preenchidos para retornar moda (D-09)
 * - Em empate de frequencia, retorna o menor valor lexicografico (D-11)
 * - Nunca lanca excecao (DEFD-04)
 *
 * @param rows  Linhas brutas retornadas pelo pg
 * @param field Nome do campo a calcular a moda
 * @param minSample Minimo de valores preenchidos para a moda ser valida
 * @returns Valor da moda (tipo original preservado) ou null se amostra insuficiente
 */
export function computeModeFromRows(
  rows: RawRow[],
  field: string,
  minSample: number,
): RawValue {
  const freq = new Map<string, { value: RawValue; count: number }>();

  for (const row of rows) {
    const raw = row[field];
    // DEFD-02: excluir null, undefined e string vazia
    // string vazia NAO e null no Postgres (Pitfall 1 do RESEARCH)
    if (raw === null || raw === undefined || raw === "") continue;
    const key = String(raw);
    const entry = freq.get(key);
    if (entry) {
      entry.count++;
    } else {
      freq.set(key, { value: raw, count: 1 });
    }
  }

  // D-09: amostra insuficiente
  const totalValid = [...freq.values()].reduce((s, e) => s + e.count, 0);
  if (totalValid < minSample) return null;

  // D-11: ordenar por frequencia DESC; desempate pelo menor valor lexicografico ASC
  // Nota (Pitfall 4 do RESEARCH): para booleanos, 'false' < 'true' lexicograficamente,
  // portanto empate favorece false — comportamento esperado, coincide com D-07.
  const sorted = [...freq.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.value) < String(b.value) ? -1 : 1;
  });

  return sorted[0].value;
}

/**
 * Computa o mapa completo de defaults a partir das linhas brutas do banco.
 *
 * - Campos fiscais sem moda calculavel: omitidos do resultado (D-08)
 * - Campos de estoque sem moda: fallback false (D-07)
 * - Nunca lanca excecao (DEFD-04)
 *
 * @param rows Linhas brutas retornadas pelo SQL_ACTIVE_PRODUCTS
 * @returns ProductDefaults com os campos fiscais resolvidos e estoque sempre presente
 */
export function computeDefaults(rows: RawRow[]): ProductDefaults {
  const result: Record<string, RawValue> = {};

  // Campos fiscais: incluir somente se moda calculavel (D-08)
  for (const field of FISCAL_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    if (mode !== null) {
      result[field] = mode;
    }
    // Se null -> campo omitido do mapa de retorno (D-08)
  }

  // Campos de estoque: sempre presentes, fallback false (D-07)
  for (const field of STOCK_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    // D-07: sem moda calculavel -> false; com moda -> valor original
    result[field] = mode !== null ? (mode as boolean) : false;
  }

  return result as unknown as ProductDefaults;
}
