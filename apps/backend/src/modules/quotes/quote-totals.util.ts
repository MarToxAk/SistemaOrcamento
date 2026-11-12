/**
 * Total liquido do Quote (fase 46, D-02).
 *
 * O `valor` do cabecalho do Athos NAO tem o mesmo significado nos dois padroes de gravacao
 * (evidencia medida no clone athos-teste; para id >= 21000 `valor - descontors` e igual a
 * soma de `orcamentovalorfinalitem` em 100% dos orcamentos):
 *
 * - Padrao de RATEIO (desconto geral da compra): o cabecalho e BRUTO. Ex. 25952: valor 583,00,
 *   descontors 58,30, itens somando 524,70. O total cobrado e valor - descontors = 524,70.
 *   Usar o `valor` como vem cobraria 583,00 no PIX.
 * - Padrao de PRECO INFORMADO no Balcao: o cabecalho ja e LIQUIDO. Ex. 25822: qtd 13,
 *   valoritem 1,00, valordesconto 13,00, valor 13,00 e descontors 0.
 *
 * Quando o chamador informa `descontors` (cabecalho cru do Athos), `valor` e tratado como bruto
 * (com descontors 0 o resultado coincide com o proprio `valor`). Sem `descontors`, o cabecalho e
 * considerado bruto apenas se `valor` coincide com o bruto dos itens (qtd x valoritem) e esse
 * bruto excede o liquido dos itens; o payload da pagina /orcamento/novo envia `valor` ja liquido
 * (soma de orcamentovalorfinalitem) e por isso cai em "cabecalho-liquido".
 *
 * O acrescimo (`valoracrescimo`) e sempre somado ao total. Se `valor` existe, o cabecalho
 * prevalece (como antes) e a divergencia com os itens e denunciada pelo chamador via
 * `headerLiquido`. Util puro: sem Nest e sem I/O. Valores em reais, saida com duas casas.
 */

export type ResolveQuoteTotalParams = {
  /** Soma dos finalPrice recalculados dos itens e filhos (ja liquidos). */
  itensLiquido: number;
  /** Soma de round2(qtd x valoritem) dos itens e filhos (antes de qualquer desconto). */
  itensBruto: number;
  /** Campos do cabecalho/payload; valores nao numericos ou nao finitos sao tratados como ausentes. */
  valor?: unknown;
  descontors?: unknown;
  desconto?: unknown;
  valoracrescimo?: unknown;
};

export type ResolveQuoteTotalResult = {
  total: number;
  discount: number;
  surcharge: number;
  /** Total liquido segundo o cabecalho (null quando `valor` ausente); o create compara com os itens. */
  headerLiquido: number | null;
  origem: "cabecalho-bruto" | "cabecalho-liquido" | "itens";
};

const TOLERANCIA = 0.01;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function finito(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? round2(value) : undefined;
}

function coincide(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCIA + 1e-9;
}

export function resolveQuoteTotal(params: ResolveQuoteTotalParams): ResolveQuoteTotalResult {
  const itensLiquido = round2(params.itensLiquido);
  const itensBruto = round2(params.itensBruto);
  const valor = finito(params.valor);
  const descontors = finito(params.descontors);
  const desconto = finito(params.desconto);
  const surcharge = finito(params.valoracrescimo) ?? 0;
  const diferencaItens = round2(itensBruto - itensLiquido);

  if (valor === undefined) {
    return {
      total: round2(itensLiquido + surcharge),
      discount: descontors ?? desconto ?? 0,
      surcharge,
      headerLiquido: null,
      origem: "itens",
    };
  }

  const cabecalhoBruto = descontors !== undefined || (coincide(valor, itensBruto) && diferencaItens > TOLERANCIA);

  if (cabecalhoBruto) {
    const descontoDoCabecalho = descontors ?? desconto ?? diferencaItens;
    const headerLiquido = round2(valor - descontoDoCabecalho + surcharge);
    return {
      total: headerLiquido,
      discount: descontoDoCabecalho,
      surcharge,
      headerLiquido,
      origem: "cabecalho-bruto",
    };
  }

  const headerLiquido = round2(valor + surcharge);
  return {
    total: headerLiquido,
    discount: desconto ?? 0,
    surcharge,
    headerLiquido,
    origem: "cabecalho-liquido",
  };
}
