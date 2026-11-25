/**
 * Fixtures compartilhadas de orcamento pago (fase 54).
 *
 * Imitam a linha do Prisma usada nos testes existentes: campos Decimal como string com 2 casas.
 * Cada fabrica devolve um objeto NOVO a cada chamada (sem estado compartilhado). Reutilizadas
 * pelos testes do webhook EFI (54-02), da NFS-e (54-06) e da reconciliacao (54-10); manter o
 * nome dos exports estavel.
 */

export type QuoteFixture = {
  id: string;
  externalQuoteId: number;
  internalNumber: number | null;
  conversationId: bigint;
  status: string;
  total: string;
  paidTotal: string;
  pendingTotal: string;
  paymentDiscount: string;
  paymentAmount: string | null;
  paymentExternalId: string | null;
  secondInstallmentExternalId: string | null;
  paymentConfirmedAt: Date | null;
  paymentNote: string | null;
  nfseNumero: string | null;
};

const PAYMENT_NOTE_CAIXA = "Pagamento feito no caixa";

/** Orcamento base: total 173,00 sem nenhum pagamento. */
export function quoteBase(overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  return {
    id: "quote-26809",
    externalQuoteId: 26809,
    internalNumber: null,
    conversationId: BigInt(999),
    status: "PENDENTE",
    total: "173.00",
    paidTotal: "0.00",
    pendingTotal: "173.00",
    paymentDiscount: "0.00",
    paymentAmount: null,
    paymentExternalId: "txid-26809",
    secondInstallmentExternalId: null,
    paymentConfirmedAt: null,
    paymentNote: null,
    nfseNumero: null,
    ...overrides,
  };
}

/** #26809 ja quitado: total 173,00, desconto PIX a vista 8,65, pago 164,35. */
export function quotePagoPix26809(overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  return quoteBase({
    status: "APROVADO",
    paidTotal: "164.35",
    pendingTotal: "0.00",
    paymentDiscount: "8.65",
    paymentAmount: "164.35",
    paymentConfirmedAt: new Date("2026-11-20T15:00:00.000Z"),
    ...overrides,
  });
}

/** Entrada de 50% por PIX (86,50 de 173,00), sem desconto e sem confirmacao. */
export function quoteEntrada50Pix(overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  return quoteBase({
    status: "PAGAMENTO_PARCIAL",
    paidTotal: "86.50",
    pendingTotal: "86.50",
    paymentAmount: "86.50",
    ...overrides,
  });
}

/** Orcamento sem nenhum pagamento. */
export function quoteSemPagamento(overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  return quoteBase(overrides);
}

/** Pagamento confirmado no caixa do Athos (paymentNote), sem paidTotal. */
export function quotePagoCaixa(overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  return quoteBase({
    status: "APROVADO",
    paymentNote: PAYMENT_NOTE_CAIXA,
    paymentExternalId: null,
    ...overrides,
  });
}

/** Orcamento integral sem desconto (total <= 150 ou pago sem desconto): total == paidTotal. */
export function quoteIntegralSemDesconto(total: number = 250, overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  const valor = total.toFixed(2);
  return quoteBase({
    id: "quote-integral",
    externalQuoteId: 30001,
    status: "APROVADO",
    total: valor,
    paidTotal: valor,
    pendingTotal: "0.00",
    paymentDiscount: "0.00",
    paymentAmount: valor,
    paymentConfirmedAt: new Date("2026-11-20T15:00:00.000Z"),
    ...overrides,
  });
}
