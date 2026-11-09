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

// ---------------------------------------------------------------------------
// Rateio, percentual e calculo completo do orcamento
// ---------------------------------------------------------------------------

/**
 * Rateia `descontoC` (centavos) proporcionalmente aos liquidos das linhas, pelo metodo do maior resto.
 * Cota base = piso(desconto x liquido / soma); os centavos que sobram vao, um a um, para as linhas de
 * maior resto fracionario (restos comparados como inteiros). Em empate vence a linha de maior indice
 * (ajuste de centavos nas linhas mais ao fim, D-02). Cada cota nunca excede o liquido da linha.
 */
export function ratear(descontoC: bigint, liquidosC: bigint[]): bigint[] {
  if (descontoC < 0n) {
    throw new CalcOrcamentoError("VALOR_INVALIDO", `Desconto negativo (${centavosParaTexto(descontoC)}) nao e aceito.`);
  }
  if (descontoC === 0n) return liquidosC.map(() => 0n);

  const soma = liquidosC.reduce((acc, l) => acc + l, 0n);
  if (soma <= 0n || descontoC > soma) {
    throw new CalcOrcamentoError(
      "DESCONTO_ACIMA_LIMITE",
      `Desconto de ${centavosParaTexto(descontoC)} maior que o total liquido dos itens (${centavosParaTexto(soma)}).`,
    );
  }

  const cotas = liquidosC.map((l) => (descontoC * l) / soma);
  const restos = liquidosC.map((l) => (descontoC * l) % soma);
  const sobra = descontoC - cotas.reduce((acc, c) => acc + c, 0n);

  const ordem = liquidosC
    .map((_, i) => i)
    .sort((a, b) => {
      if (restos[a] !== restos[b]) return restos[a] > restos[b] ? -1 : 1;
      return b - a; // empate: indice maior primeiro
    });
  for (let k = 0; BigInt(k) < sobra; k++) cotas[ordem[k]] += 1n;
  return cotas;
}

/** round(desconto / bruto x 100, 3) half-up, em milesimos de percentual. 4/17704 -> 23 ("0.023"). */
export function percentualMilli(descontoC: bigint, brutoC: bigint): bigint {
  if (brutoC <= 0n) {
    throw new CalcOrcamentoError("VALOR_FORA_DO_LIMITE", "Valor bruto do orcamento deve ser maior que zero.");
  }
  return (descontoC * 100000n + brutoC / 2n) / brutoC;
}

/** 35059n -> "35.059" */
export function percentualTexto(pMilli: bigint): string {
  return milliParaTexto(pMilli);
}

export interface LinhaCalcEntrada {
  qMilli: bigint;
  precoMilli: bigint;
  /** Preco informado pelo chamador. Abaixo do preco vira desconto; acima e gravado como valor do item. */
  valorUnitarioMilli?: bigint;
  /** Desconto explicito da linha, em centavos. */
  descontoItemC?: bigint;
}

export interface LinhaCalcSaida {
  /** Valor unitario gravado em orcamento_item.valoritem (milesimos). */
  valorItemMilli: bigint;
  /** round2(quantidade x valorItem), em centavos. */
  totalC: bigint;
  /** Desconto total da linha: implicito + explicito + cota do desconto global. */
  descontoC: bigint;
  /** totalC - descontoC (orcamentovalorfinalitem). */
  finalC: bigint;
}

export interface TotaisOrcamento {
  linhas: LinhaCalcSaida[];
  brutoC: bigint;
  descontoC: bigint;
  liquidoC: bigint;
  percentualMilli: bigint;
}

/**
 * Calcula linhas, rateio e totais do orcamento em inteiros (D-02, D-04).
 * `limitePercentualMilli` vem de conf_vendas.permitedescontode (100% = 100000n); `descontomaximo`
 * do produto NAO participa (so informativo).
 */
export function calcularOrcamento(
  linhas: LinhaCalcEntrada[],
  descontoTotalC: bigint,
  limitePercentualMilli: bigint,
): TotaisOrcamento {
  if (linhas.length === 0) {
    throw new CalcOrcamentoError("VALOR_INVALIDO", "Informe ao menos um item para calcular o orcamento.");
  }
  if (descontoTotalC < 0n) {
    throw new CalcOrcamentoError(
      "VALOR_INVALIDO",
      `Desconto total negativo (${centavosParaTexto(descontoTotalC)}) nao e aceito.`,
    );
  }

  const parciais = linhas.map((l, indice) => {
    const numero = indice + 1;
    const vu = l.valorUnitarioMilli ?? l.precoMilli;
    const extraC = l.descontoItemC ?? 0n;
    if (vu < 0n || extraC < 0n || l.qMilli <= 0n || l.precoMilli < 0n) {
      throw new CalcOrcamentoError("VALOR_INVALIDO", `Valores negativos ou zerados no item ${numero}.`, indice);
    }

    const valorItemMilli = vu > l.precoMilli ? vu : l.precoMilli;
    const totalC = linhaCentavos(l.qMilli, valorItemMilli);
    if (totalC <= 0n || totalC >= LIMITE_LINHA_CENTAVOS) {
      throw new CalcOrcamentoError(
        "VALOR_FORA_DO_LIMITE",
        `Total do item ${numero} (${centavosParaTexto(totalC)}) fora do limite aceito: deve ser maior que zero e menor que ${centavosParaTexto(LIMITE_LINHA_CENTAVOS)}.`,
        indice,
      );
    }

    // Preco abaixo do cadastro e desconto, nao erro (D-04).
    const implicitoC = vu < l.precoMilli ? linhaCentavos(l.qMilli, l.precoMilli) - linhaCentavos(l.qMilli, vu) : 0n;
    const descontoItemC = implicitoC + extraC;
    if (descontoItemC > totalC) {
      throw new CalcOrcamentoError(
        "DESCONTO_ACIMA_LIMITE",
        `Desconto do item ${numero} (${centavosParaTexto(descontoItemC)}) maior que o total da linha (${centavosParaTexto(totalC)}).`,
        indice,
      );
    }
    return { valorItemMilli, totalC, descontoItemC };
  });

  const liquidos = parciais.map((p) => p.totalC - p.descontoItemC);
  const somaLiquidos = liquidos.reduce((acc, v) => acc + v, 0n);
  if (descontoTotalC > somaLiquidos) {
    throw new CalcOrcamentoError(
      "DESCONTO_ACIMA_LIMITE",
      `Desconto total de ${centavosParaTexto(descontoTotalC)} maior que o total liquido dos itens (${centavosParaTexto(somaLiquidos)}).`,
    );
  }
  const cotas = ratear(descontoTotalC, liquidos);

  const saida: LinhaCalcSaida[] = parciais.map((p, i) => {
    const descontoC = p.descontoItemC + cotas[i];
    return { valorItemMilli: p.valorItemMilli, totalC: p.totalC, descontoC, finalC: p.totalC - descontoC };
  });

  const brutoC = saida.reduce((acc, l) => acc + l.totalC, 0n);
  const descontoC = saida.reduce((acc, l) => acc + l.descontoC, 0n);
  const pMilli = percentualMilli(descontoC, brutoC);

  // Comparacao exata em inteiros: descontoC/brutoC x 100 <= limite% <=> descontoC x 100000 <= limiteMilli x brutoC
  if (descontoC * 100000n > limitePercentualMilli * brutoC) {
    throw new CalcOrcamentoError(
      "DESCONTO_ACIMA_LIMITE",
      `Desconto total de ${percentualTexto(pMilli)}% ultrapassa o limite permitido de ${percentualTexto(limitePercentualMilli)}%.`,
    );
  }

  return { linhas: saida, brutoC, descontoC, liquidoC: brutoC - descontoC, percentualMilli: pMilli };
}
