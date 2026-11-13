// Funcoes puras de leitura/escrita de filtros na URL da area de contas a receber (D-04).
// Sem imports e so com sintaxe TypeScript apagavel, para o script de checagem do Node importar direto.

/** Devolve o valor se estiver na lista permitida; senao o padrao. */
export function lerOpcao<T extends string>(
  valor: string | null | undefined,
  permitidos: readonly T[],
  padrao: T,
): T {
  if (valor == null) return padrao;
  const achado = permitidos.find((p) => p === valor);
  return achado === undefined ? padrao : achado;
}

/** AAAA-MM-DD de data real; qualquer outra coisa vira "". */
export function lerData(valor: string | null | undefined): string {
  if (!valor) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return "";
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const real = d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
  return real ? valor : "";
}

/** Texto aparado e cortado em `max` caracteres. */
export function lerTexto(valor: string | null | undefined, max: number = 80): string {
  if (!valor) return "";
  return valor.trim().slice(0, max).trim();
}

/** Inteiro maior que zero; senao o padrao. */
export function lerInteiroPositivo(valor: string | null | undefined, padrao: number): number {
  if (!valor || !/^\d+$/.test(valor)) return padrao;
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : padrao;
}

/**
 * Aplica `alteracoes` sobre a query atual (com ou sem "?") e devolve a nova query sem "?".
 * Chaves com valor vazio, null ou undefined sao removidas; as demais sao mantidas.
 */
export function montarQuery(atual: string, alteracoes: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams(atual.startsWith("?") ? atual.slice(1) : atual);
  for (const chave of Object.keys(alteracoes)) {
    const valor = alteracoes[chave];
    if (valor === null || valor === undefined || valor === "") {
      params.delete(chave);
    } else {
      params.set(chave, valor);
    }
  }
  return params.toString();
}
