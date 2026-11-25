/**
 * Regras puras de pagamento do orcamento (fase 54, D-01/D-03/D-06/D-07/D-12/D-15).
 *
 * Fonte unica de quitacao usada pelo webhook EFI, pela reconciliacao e pela trava de NFS-e.
 * Toda a decisao quitado/pendente e feita em CENTAVOS INTEIROS (nunca em float de reais), com
 * tolerancia fixa de R$ 0,02. Util puro: sem Nest, sem Prisma, sem I/O.
 */

/** Tolerancia de quitacao: R$ 0,02 (D-01). Constante unica reutilizada por webhook e trava. */
export const TOLERANCIA_QUITACAO_CENTAVOS = 2;

/**
 * Converte reais (number, string com ponto ou virgula, ou objeto com toString como o Decimal do
 * Prisma) em centavos inteiros. Valor nao finito/invalido vira 0.
 */
export function paraCentavos(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  let texto = typeof valor === "number" ? String(valor) : String(valor).trim();
  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }
  const numero = Number(texto);
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * 100);
}

/** Centavos inteiros para reais com duas casas. */
export function centavosParaReais(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export type PixAvista = { percentual: number; valorFinal: number; desconto: number };

/**
 * Desconto de PIX a vista: 5% quando o total e estritamente maior que R$ 150,00.
 * A expressao de calculo e a MESMA de `EfiService.resolvePaymentOptions` (identica por construcao).
 */
export function calcularPixAvista(total: number): PixAvista {
  const value = Number.isFinite(total) ? total : 0;
  const percentual = value > 150 ? 5 : 0;
  const valorFinal = Number((value * (1 - percentual / 100)).toFixed(2));
  const desconto = centavosParaReais(paraCentavos(value) - paraCentavos(valorFinal));
  return { percentual, valorFinal, desconto };
}

export type EntradaQuitacao = {
  total: unknown;
  desconto: unknown;
  pagoAntes: unknown;
  pagamento: unknown;
};

export type ResultadoQuitacao = {
  devido: number;
  pago: number;
  pendente: number;
  quitado: boolean;
};

/**
 * Calcula a quitacao em centavos: devido = total - desconto (nunca negativo); pago = minimo entre
 * o total e (pagoAntes + pagamento); quitado quando a falta e menor ou igual a tolerancia.
 */
export function calcularQuitacao(entrada: EntradaQuitacao): ResultadoQuitacao {
  const total = Math.max(paraCentavos(entrada.total), 0);
  const desconto = Math.max(paraCentavos(entrada.desconto), 0);
  const devido = Math.max(total - desconto, 0);
  const pago = Math.min(total, Math.max(paraCentavos(entrada.pagoAntes) + paraCentavos(entrada.pagamento), 0));
  const falta = Math.max(devido - pago, 0);
  const quitado = falta <= TOLERANCIA_QUITACAO_CENTAVOS;
  return {
    devido: centavosParaReais(devido),
    pago: centavosParaReais(pago),
    pendente: quitado ? 0 : centavosParaReais(falta),
    quitado,
  };
}
