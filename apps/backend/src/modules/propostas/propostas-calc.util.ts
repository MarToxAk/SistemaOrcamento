/**
 * Aritmetica de preco da proposta comercial (Fase 55).
 *
 * Modulo PURO: sem Nest, sem Prisma, sem pg, sem I/O. Todo dinheiro e calculado em inteiros (BigInt):
 *  - preco-base e custo em MILESIMOS (3 casas, como numeric(9,3) do Athos);
 *  - preco final da proposta, linhas e totais em CENTAVOS;
 *  - percentual em MILESIMOS de percentual (10% = 10000n).
 * Preco, total do PDF e `orcamento.valor` do Athos vem destas mesmas funcoes, entao nunca divergem.
 * Nenhuma conta de preco usa funcao de arredondamento do JS (D-23): o ceil e feito em BigInt.
 */

import {
  CalcOrcamentoError,
  LIMITE_LINHA_CENTAVOS,
  centavosParaTexto,
  linhaCentavos,
  paraCentavos,
} from "../integrations/athos/athos-orcamento-calc.util";

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
    /** Indice zero-based do item, quando o erro e especifico de uma linha. */
    public readonly indice?: number,
  ) {
    super(message);
    this.name = "CalcPropostaError";
  }
}

/** "valor" e o percentual (tipo PERCENTUAL) ou o NOVO preco unitario final em R$ (tipo VALOR, D-02a). */
export type AjustePreco = { tipo: "PERCENTUAL" | "VALOR"; valor: number | string };

/** Percentual aceito: maior que -100% e menor ou igual a 1000% (em milesimos de percentual). */
const PCT_MIN_EXCLUSIVO_MILLI = -100000n;
const PCT_MAX_MILLI = 1000000n;
const LIMITE_NUMERO_JS = 1e6;

/**
 * Preco-base em milesimos para centavos, com teto: qualquer sub-centavo sobe (D-23), tambem sem ajuste.
 * 3456n -> 346n; 3450n -> 345n.
 */
export function precoBaseParaCentavos(precoMilli: bigint): bigint {
  return (precoMilli + 9n) / 10n;
}

/**
 * Aplica `pctMilli` (milesimos de percentual) ao preco-base exato em milesimos e devolve centavos com
 * teto. Um unico ceil, sobre o preco-base exato (nao sobre o preco ja arredondado). Somente BigInt:
 * 3,50 +10% = 3,85 (o float ingenuo daria 3,86).
 */
export function ajustarPrecoCentavos(precoMilli: bigint, pctMilli: bigint): bigint {
  const fator = 100000n + pctMilli;
  if (fator <= 0n) {
    throw new CalcPropostaError("PERCENTUAL_INVALIDO", "Percentual de ajuste deve ser maior que -100%.");
  }
  if (precoMilli < 0n) {
    throw new CalcPropostaError("PRECO_INVALIDO", "Preco base negativo nao e aceito.");
  }
  return (precoMilli * fator + 999999n) / 1000000n;
}

function percentualInvalido(detalhe: string): CalcPropostaError {
  return new CalcPropostaError("PERCENTUAL_INVALIDO", `Percentual invalido: ${detalhe}.`);
}

/**
 * Converte percentual (numero ou texto com ponto, ate 3 casas) em milesimos de percentual.
 * Intervalo permitido: maior que -100 e menor ou igual a 1000.
 */
export function parsePercentualMilli(v: number | string): bigint {
  let texto: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v > LIMITE_NUMERO_JS || v < -LIMITE_NUMERO_JS) {
      throw percentualInvalido(String(v));
    }
    texto = v.toFixed(3);
    // Recusa numeros com mais casas do que o permitido (ex.: 10.5555).
    const diferenca = Number(texto) - v;
    if (diferenca >= 1e-9 || diferenca <= -1e-9) {
      throw percentualInvalido(`${String(v)} tem mais de 3 casas decimais`);
    }
  } else {
    texto = String(v).trim();
  }

  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!m) throw percentualInvalido(`"${texto}"`);

  const [, sinal, inteiroTxt, fracTxt = ""] = m;
  // Zeros alem da 3a casa sao aceitos (ex.: "10.5000"); qualquer digito significativo e recusado.
  if (/[1-9]/.test(fracTxt.slice(3))) {
    throw percentualInvalido(`"${texto}" tem mais de 3 casas decimais`);
  }
  const modulo = BigInt(inteiroTxt) * 1000n + BigInt(fracTxt.slice(0, 3).padEnd(3, "0"));
  const milli = sinal ? -modulo : modulo;

  if (milli <= PCT_MIN_EXCLUSIVO_MILLI || milli > PCT_MAX_MILLI) {
    throw percentualInvalido(`"${texto}" fora do intervalo permitido (maior que -100 e ate 1000)`);
  }
  return milli;
}

/** Preco unitario digitado (R$, ate 2 casas) em centavos; deve ser maior que zero. */
export function parsePrecoDigitadoCentavos(v: number | string): bigint {
  let centavos: bigint;
  try {
    centavos = paraCentavos(v);
  } catch (err) {
    if (err instanceof CalcOrcamentoError) {
      throw new CalcPropostaError("PRECO_INVALIDO", `Preco digitado invalido: ${err.message}`);
    }
    throw err;
  }
  if (centavos <= 0n) {
    throw new CalcPropostaError("PRECO_INVALIDO", "Preco digitado deve ser maior que zero.");
  }
  return centavos;
}

/**
 * Resolve o preco unitario final da proposta em centavos.
 *  - sem ajuste: preco-base com ceil no centavo (D-23);
 *  - PERCENTUAL: ajuste com ceil exato (D-02);
 *  - VALOR: o valor digitado SUBSTITUI o preco-base (novo preco unitario final, nao acrescimo, D-02a).
 * Resultado menor ou igual a zero e recusado.
 */
export function resolverPrecoUnitarioCentavos(entrada: { precoBaseMilli: bigint; ajuste?: AjustePreco | null }): bigint {
  const { precoBaseMilli, ajuste } = entrada;
  let centavos: bigint;

  if (!ajuste) {
    centavos = precoBaseParaCentavos(precoBaseMilli);
  } else if (ajuste.tipo === "PERCENTUAL") {
    centavos = ajustarPrecoCentavos(precoBaseMilli, parsePercentualMilli(ajuste.valor));
  } else if (ajuste.tipo === "VALOR") {
    centavos = parsePrecoDigitadoCentavos(ajuste.valor);
  } else {
    throw new CalcPropostaError("PRECO_INVALIDO", `Tipo de ajuste desconhecido: "${String((ajuste as AjustePreco).tipo)}".`);
  }

  if (centavos <= 0n) {
    throw new CalcPropostaError("PRECO_INVALIDO", "Preco unitario final deve ser maior que zero.");
  }
  return centavos;
}

// ---------------------------------------------------------------------------
// Linhas, total, custo e margem
// ---------------------------------------------------------------------------

/** Mesmo teto da Fase 44. */
export const MAX_LINHAS_PROPOSTA = 200;

/** Quantidade aceita por linha: 0,001 a 10.000,000 (em milesimos). */
const QTD_MAX_MILLI = 10_000_000n;

export type LinhaPropostaEntrada = { qMilli: bigint; precoCentavos: bigint };

/** Mesmos nomes de campo de `LinhaCalcSaida` (Fase 44), para o lancamento no Athos reaproveitar a leitura. */
export type LinhaPropostaSaida = { valorItemMilli: bigint; totalC: bigint; descontoC: bigint; finalC: bigint };

export type TotaisProposta = {
  linhas: LinhaPropostaSaida[];
  brutoC: bigint;
  descontoC: bigint;
  liquidoC: bigint;
  percentualMilli: bigint;
};

/**
 * Linhas e total da proposta SEM desconto (D-03): o preco final do item e o valorItem gravado, o total
 * e a soma das linhas arredondadas half-up em centavos. Diferente de `calcularOrcamento` (Fase 44), nao
 * transforma preco abaixo do cadastro em desconto, nao rateia e nao consulta permitedescontode.
 */
export function calcularLinhasProposta(linhas: LinhaPropostaEntrada[]): TotaisProposta {
  if (linhas.length === 0) {
    throw new CalcPropostaError("QUANTIDADE_INVALIDA", "Informe ao menos um item na proposta.");
  }
  if (linhas.length > MAX_LINHAS_PROPOSTA) {
    throw new CalcPropostaError(
      "LIMITE_ITENS",
      `A proposta aceita no maximo ${MAX_LINHAS_PROPOSTA} itens (recebidos ${linhas.length}).`,
    );
  }

  const saida = linhas.map((l, indice): LinhaPropostaSaida => {
    const numero = indice + 1;
    if (l.qMilli < 1n || l.qMilli > QTD_MAX_MILLI) {
      throw new CalcPropostaError(
        "QUANTIDADE_INVALIDA",
        `Quantidade do item ${numero} fora do intervalo aceito (0.001 a 10000.000).`,
        indice,
      );
    }
    if (l.precoCentavos <= 0n) {
      throw new CalcPropostaError("PRECO_INVALIDO", `Preco do item ${numero} deve ser maior que zero.`, indice);
    }
    const valorItemMilli = l.precoCentavos * 10n;
    const totalC = linhaCentavos(l.qMilli, valorItemMilli);
    if (totalC <= 0n || totalC >= LIMITE_LINHA_CENTAVOS) {
      throw new CalcPropostaError(
        "VALOR_FORA_DO_LIMITE",
        `Total do item ${numero} (${centavosParaTexto(totalC)}) fora do limite aceito: deve ser maior que zero e menor que ${centavosParaTexto(LIMITE_LINHA_CENTAVOS)}.`,
        indice,
      );
    }
    return { valorItemMilli, totalC, descontoC: 0n, finalC: totalC };
  });

  const brutoC = saida.reduce((acc, l) => acc + l.totalC, 0n);
  return { linhas: saida, brutoC, descontoC: 0n, liquidoC: brutoC, percentualMilli: 0n };
}

/**
 * Margem liquida (preco - custo) / preco em milesimos de percentual (D-27), half-up afastando de zero
 * (tambem para margem negativa). `abaixoDoCusto` so quando preco < custo; igual nao destaca (D-13).
 * O preco e sempre positivo, entao nao ha divisao por zero.
 */
export function calcularMargem(entrada: { precoCentavos: bigint; custoMilli: bigint }): {
  margemMilli: bigint;
  abaixoDoCusto: boolean;
} {
  const precoMilli = entrada.precoCentavos * 10n;
  if (precoMilli <= 0n) {
    throw new CalcPropostaError("PRECO_INVALIDO", "Preco deve ser maior que zero para calcular a margem.");
  }
  const numerador = (precoMilli - entrada.custoMilli) * 100000n;
  const negativo = numerador < 0n;
  const modulo = negativo ? -numerador : numerador;
  const arredondado = (modulo * 2n + precoMilli) / (precoMilli * 2n);
  return { margemMilli: negativo ? -arredondado : arredondado, abaixoDoCusto: precoMilli < entrada.custoMilli };
}

/**
 * Ponto de entrada do servico de propostas: recalcula o item no servidor (nunca confia em preco do
 * navegador) compondo preco resolvido, total da linha e margem.
 */
export function calcularItemProposta(entrada: {
  precoBaseMilli: bigint;
  ajuste?: AjustePreco | null;
  qMilli: bigint;
  custoMilli: bigint;
}): { precoCentavos: bigint; totalC: bigint; margemMilli: bigint; abaixoDoCusto: boolean } {
  const precoCentavos = resolverPrecoUnitarioCentavos({ precoBaseMilli: entrada.precoBaseMilli, ajuste: entrada.ajuste });
  const { linhas } = calcularLinhasProposta([{ qMilli: entrada.qMilli, precoCentavos }]);
  const { margemMilli, abaixoDoCusto } = calcularMargem({ precoCentavos, custoMilli: entrada.custoMilli });
  return { precoCentavos, totalC: linhas[0].totalC, margemMilli, abaixoDoCusto };
}
