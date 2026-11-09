/**
 * Aritmetica monetaria PURA do orcamento Athos (Fase 44).
 *
 * Sem Nest, sem pg, sem I/O. Todo dinheiro e calculado em inteiros (BigInt):
 *  - preco e quantidade em MILESIMOS (3 casas, como numeric(9,3) do Athos);
 *  - linhas e totais em CENTAVOS.
 * O Balcao arredonda cada linha a centavos (half-up) e `orcamento.valor` e a soma das
 * linhas arredondadas (44-RESEARCH, "Invariantes de dinheiro do Balcao").
 */

export type CalcOrcamentoCodigo = "DESCONTO_ACIMA_LIMITE" | "VALOR_FORA_DO_LIMITE" | "VALOR_INVALIDO";

export class CalcOrcamentoError extends Error {
  constructor(
    public readonly codigo: CalcOrcamentoCodigo,
    message: string,
    public readonly indice?: number,
  ) {
    super(message);
    this.name = "CalcOrcamentoError";
  }
}

/**
 * orcamentodesconto e orcamentovalorfinalitem sao numeric(9,3): maximo 999.999,999 por linha.
 * Em centavos, qualquer linha >= 1.000.000,00 (100_000_000) e recusada.
 */
export const LIMITE_LINHA_CENTAVOS = 100_000_000n;

/** Maior numero JS aceito na conversao (evita notacao exponencial em toFixed). */
const LIMITE_NUMERO_JS = 1e12;

function converter(v: number | string, casas: number): bigint {
  const fator = 10n ** BigInt(casas);
  let texto: string;

  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0 || v > LIMITE_NUMERO_JS) {
      throw new CalcOrcamentoError("VALOR_INVALIDO", `Valor numerico invalido: ${String(v)}.`);
    }
    texto = v.toFixed(casas);
    // Recusa numeros com mais casas do que o permitido (ex.: 1.2345 com 3 casas).
    if (Math.abs(Number(texto) - v) >= 1e-9) {
      throw new CalcOrcamentoError("VALOR_INVALIDO", `Valor ${String(v)} tem mais de ${casas} casas decimais.`);
    }
  } else {
    const bruto = String(v).trim();
    if (!/^\d+(\.\d+)?$/.test(bruto)) {
      throw new CalcOrcamentoError("VALOR_INVALIDO", `Valor invalido: "${bruto}".`);
    }
    const [inteiroTxt, fracTxt = ""] = bruto.split(".");
    // O driver pg devolve numeric com zeros a direita (ex.: "33.07500000"): aceitar enquanto so houver zeros alem do limite.
    const excedente = fracTxt.slice(casas);
    if (/[1-9]/.test(excedente)) {
      throw new CalcOrcamentoError("VALOR_INVALIDO", `Valor "${bruto}" tem mais de ${casas} casas decimais.`);
    }
    texto = `${inteiroTxt}.${fracTxt.slice(0, casas).padEnd(casas, "0")}`;
  }

  const [inteiro, frac = ""] = texto.split(".");
  return BigInt(inteiro) * fator + BigInt(frac.padEnd(casas, "0").slice(0, casas) || "0");
}

/** Milesimos (3 casas). Negativo, NaN, nao numerico ou com mais de 3 casas -> VALOR_INVALIDO. */
export function paraMilli(v: number | string): bigint {
  return converter(v, 3);
}

/** Centavos (2 casas). Negativo, NaN, nao numerico ou com mais de 2 casas -> VALOR_INVALIDO. */
export function paraCentavos(v: number | string): bigint {
  return converter(v, 2);
}

function formatar(valor: bigint, casas: number): string {
  const fator = 10n ** BigInt(casas);
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const inteiro = abs / fator;
  const frac = (abs % fator).toString().padStart(casas, "0");
  return `${negativo ? "-" : ""}${inteiro.toString()}.${frac}`;
}

/** 1162n -> "1.162" */
export function milliParaTexto(m: bigint): string {
  return formatar(m, 3);
}

/** 4850n -> "48.50" */
export function centavosParaTexto(c: bigint): string {
  return formatar(c, 2);
}

/** round2(qtd x valor) em centavos, half-up. Ex.: 1.162 x 41.740 = 48.50188 -> 4850. */
export function linhaCentavos(qMilli: bigint, vMilli: bigint): bigint {
  return (qMilli * vMilli + 5000n) / 10000n;
}
