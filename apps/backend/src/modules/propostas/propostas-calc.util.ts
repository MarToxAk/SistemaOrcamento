/**
 * Aritmetica de preco da proposta comercial (Fase 55). SKELETON da fase RED: nada implementado.
 */

export type CalcPropostaCodigo =
  | "PRECO_INVALIDO"
  | "PERCENTUAL_INVALIDO"
  | "QUANTIDADE_INVALIDA"
  | "VALOR_FORA_DO_LIMITE"
  | "LIMITE_ITENS";

export class CalcPropostaError extends Error {
  constructor(
    public readonly codigo: CalcPropostaCodigo,
    message: string,
    public readonly indice?: number,
  ) {
    super(message);
    this.name = "CalcPropostaError";
  }
}

export type AjustePreco = { tipo: "PERCENTUAL" | "VALOR"; valor: number | string };

const NAO_IMPLEMENTADO = "NAO_IMPLEMENTADO";

export function precoBaseParaCentavos(_precoMilli: bigint): bigint {
  throw new Error(NAO_IMPLEMENTADO);
}

export function ajustarPrecoCentavos(_precoMilli: bigint, _pctMilli: bigint): bigint {
  throw new Error(NAO_IMPLEMENTADO);
}

export function parsePercentualMilli(_v: number | string): bigint {
  throw new Error(NAO_IMPLEMENTADO);
}

export function parsePrecoDigitadoCentavos(_v: number | string): bigint {
  throw new Error(NAO_IMPLEMENTADO);
}

export function resolverPrecoUnitarioCentavos(_entrada: { precoBaseMilli: bigint; ajuste?: AjustePreco | null }): bigint {
  throw new Error(NAO_IMPLEMENTADO);
}
