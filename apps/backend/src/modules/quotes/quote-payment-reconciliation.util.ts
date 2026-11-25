/**
 * Regras puras da reconciliacao de pagamentos PIX a vista (fase 54, D-14).
 *
 * O webhook antigo da EFI comparava o pagamento com o TOTAL cheio e ignorava o desconto de PIX a
 * vista; orcamentos como o #26809 (total 173,00, pago 164,35) ficaram gravados como
 * PAGAMENTO_PARCIAL com paymentDiscount 0. Este util decide, sem tocar em banco, o que gravar para
 * cada um. Util puro: sem Prisma, sem Nest, sem I/O. Toda a aritmetica reutiliza
 * `quote-payment.util` (centavos inteiros e tolerancia de R$ 0,02).
 *
 * Nota (achado do 54-01): `resolverSituacaoPagamentoQuote` classifica INTEGRAL/CAIXA quando
 * `paymentConfirmedAt` esta preenchido. Por isso a elegibilidade aqui NUNCA usa esse resolver nem
 * filtra por `paymentConfirmedAt`: decide so pelas transacoes PIX no txid a vista. Depois de
 * aplicado o plano (desconto gravado e paidTotal cobrindo o devido) o resolver devolve
 * INTEGRAL/PIX com teto no valor pago, que e o comportamento desejado para a trava de NFS-e.
 */

import { calcularPixAvista, calcularQuitacao, centavosParaReais, paraCentavos, TOLERANCIA_QUITACAO_CENTAVOS } from "./quote-payment.util";

/** Limite padrao de orcamentos analisados por execucao do script. */
export const LIMITE_PADRAO = 500;

/** Autor registrado no historico de status quando a reconciliacao muda o status. */
export const AUTOR_RECONCILIACAO = "Reconciliacao Fase 54";

export type MotivoIgnorado =
  | "CANCELADO"
  | "JA_RECONCILIADO"
  | "SEM_TXID_AVISTA"
  | "SEM_DESCONTO_AVISTA"
  | "SEM_TRANSACAO_AVISTA"
  | "PAGO_SEM_DESCONTO"
  | "VALOR_INCOMPATIVEL";

export type TransacaoReconciliacao = {
  id: string;
  status: string;
  method?: string | null;
  amount: unknown;
  processedAt: Date | string;
  metadata?: unknown;
};

export type QuoteReconciliacao = {
  status: string;
  total: unknown;
  paymentDiscount?: unknown;
  paymentExternalId?: string | null;
  paymentConfirmedAt?: Date | string | null;
  /** Campos abaixo nao entram na decisao; existem para aceitar a linha completa do Prisma. */
  paidTotal?: unknown;
  pendingTotal?: unknown;
  paymentAmount?: unknown;
  paymentNote?: string | null;
  paymentTransactions: TransacaoReconciliacao[];
};

export type PlanoReconciliacao = {
  paymentDiscount: number;
  paymentAmount: number;
  pendingTotal: 0;
  paymentConfirmedAt: Date;
  /** Presente somente quando o status atual e PAGAMENTO_PARCIAL; senao o status e preservado. */
  novoStatus?: "APROVADO";
  /** Ids das transacoes PIX a vista ainda PARTIAL, que passam a PAID. */
  transacoesParaPago: string[];
};

export type ResultadoReconciliacao =
  | { elegivel: true; plano: PlanoReconciliacao }
  | { elegivel: false; motivo: MotivoIgnorado };

const STATUS_TRANSACAO_VALIDOS = new Set(["PAID", "PARTIAL"]);

function txidDaTransacao(transacao: TransacaoReconciliacao): string {
  const metadata = transacao.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const txid = (metadata as Record<string, unknown>).txid;
  return typeof txid === "string" ? txid.trim() : "";
}

function ehPixAvista(transacao: TransacaoReconciliacao, txidAvista: string): boolean {
  const metodo = String(transacao.method ?? "PIX").trim().toUpperCase();
  if (metodo !== "PIX") return false;
  if (!STATUS_TRANSACAO_VALIDOS.has(String(transacao.status ?? "").trim().toUpperCase())) return false;
  return txidDaTransacao(transacao) === txidAvista;
}

function emData(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

/**
 * Decide se um orcamento gravado pelo webhook antigo deve ser reconciliado e o que gravar (D-14).
 * Idempotente: depois de aplicado o plano, `paymentDiscount` fica maior que zero e o orcamento passa
 * a ser ignorado com JA_RECONCILIADO.
 */
export function planejarReconciliacao(quote: QuoteReconciliacao): ResultadoReconciliacao {
  if (String(quote.status).toUpperCase() === "CANCELADO") {
    return { elegivel: false, motivo: "CANCELADO" };
  }

  if (paraCentavos(quote.paymentDiscount) > 0) {
    return { elegivel: false, motivo: "JA_RECONCILIADO" };
  }

  const txidAvista = String(quote.paymentExternalId ?? "").trim();
  if (!txidAvista) {
    return { elegivel: false, motivo: "SEM_TXID_AVISTA" };
  }

  // Mesma expressao do webhook e da cobranca: 5% somente quando o total e maior que R$ 150,00.
  const pixAvista = calcularPixAvista(centavosParaReais(paraCentavos(quote.total)));
  const descontoAvistaCent = paraCentavos(pixAvista.desconto);
  if (descontoAvistaCent <= 0) {
    return { elegivel: false, motivo: "SEM_DESCONTO_AVISTA" };
  }

  const transacoesAvista = (quote.paymentTransactions ?? []).filter((t) => ehPixAvista(t, txidAvista));
  if (transacoesAvista.length === 0) {
    return { elegivel: false, motivo: "SEM_TRANSACAO_AVISTA" };
  }

  const totalCent = Math.max(paraCentavos(quote.total), 0);
  const pagoAvistaCent = transacoesAvista.reduce((soma, t) => soma + Math.max(paraCentavos(t.amount), 0), 0);

  // Pago o total cheio no txid a vista: nao ha vao a reconciliar (nao houve desconto).
  if (totalCent - pagoAvistaCent <= TOLERANCIA_QUITACAO_CENTAVOS) {
    return { elegivel: false, motivo: "PAGO_SEM_DESCONTO" };
  }

  // O pago precisa cobrir o devido com desconto (tolerancia de 2 centavos) e nao passar dele.
  const quitacao = calcularQuitacao({
    total: quote.total,
    desconto: pixAvista.desconto,
    pagoAntes: 0,
    pagamento: centavosParaReais(pagoAvistaCent),
  });
  const devidoCent = totalCent - descontoAvistaCent;
  if (!quitacao.quitado || Math.abs(pagoAvistaCent - devidoCent) > TOLERANCIA_QUITACAO_CENTAVOS) {
    return { elegivel: false, motivo: "VALOR_INCOMPATIVEL" };
  }

  const ultimaTransacao = transacoesAvista.reduce((a, b) =>
    emData(b.processedAt).getTime() >= emData(a.processedAt).getTime() ? b : a,
  );
  const confirmadoEm = quote.paymentConfirmedAt ? emData(quote.paymentConfirmedAt) : emData(ultimaTransacao.processedAt);

  const plano: PlanoReconciliacao = {
    paymentDiscount: pixAvista.desconto,
    paymentAmount: centavosParaReais(pagoAvistaCent),
    pendingTotal: 0,
    paymentConfirmedAt: confirmadoEm,
    transacoesParaPago: transacoesAvista
      .filter((t) => String(t.status).trim().toUpperCase() === "PARTIAL")
      .map((t) => t.id),
  };
  if (String(quote.status).toUpperCase() === "PAGAMENTO_PARCIAL") {
    plano.novoStatus = "APROVADO";
  }

  return { elegivel: true, plano };
}

export type ArgumentosReconciliacao = {
  aplicar: boolean;
  quote?: string;
  limite: number;
  ajuda: boolean;
  erro?: string;
};

/** Interpreta os argumentos do script. Dry-run e o padrao; escrita somente com --aplicar. */
export function interpretarArgumentos(argv: string[]): ArgumentosReconciliacao {
  const resultado: ArgumentosReconciliacao = { aplicar: false, limite: LIMITE_PADRAO, ajuda: false };

  for (let i = 0; i < argv.length; i += 1) {
    const argumento = argv[i];
    const [flag, valorInline] = argumento.startsWith("--") && argumento.includes("=")
      ? [argumento.slice(0, argumento.indexOf("=")), argumento.slice(argumento.indexOf("=") + 1)]
      : [argumento, undefined];

    if (flag === "--aplicar" && valorInline === undefined) {
      resultado.aplicar = true;
    } else if (flag === "--ajuda" && valorInline === undefined) {
      resultado.ajuda = true;
    } else if (flag === "--quote" || flag === "--limite") {
      let valor = valorInline;
      if (valor === undefined) {
        const proximo = argv[i + 1];
        if (proximo !== undefined && !proximo.startsWith("--")) {
          valor = proximo;
          i += 1;
        }
      }
      if (valor === undefined || valor.trim() === "") {
        return { ...resultado, erro: `A flag ${flag} exige um valor.` };
      }
      if (flag === "--quote") {
        resultado.quote = valor.trim();
      } else {
        if (!/^\d+$/.test(valor.trim()) || Number(valor) <= 0) {
          return { ...resultado, erro: `Valor invalido para --limite: "${valor}" (informe um inteiro maior que zero).` };
        }
        resultado.limite = Number(valor);
      }
    } else {
      return { ...resultado, erro: `Argumento desconhecido: ${argumento}` };
    }
  }

  return resultado;
}
