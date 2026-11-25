import {
  LIMITE_PADRAO,
  QuoteReconciliacao,
  TransacaoReconciliacao,
  interpretarArgumentos,
  planejarReconciliacao,
} from "./quote-payment-reconciliation.util";
import { resolverSituacaoPagamentoQuote } from "./quote-payment.util";
import { quoteBase, quoteEntrada50Pix, quoteIntegralSemDesconto } from "./__fixtures__/quote-pago.fixture";

const TXID_AVISTA = "txid-26809";
const TXID_ENTRADA = "txid-entrada-50";

function transacao(overrides: Partial<TransacaoReconciliacao> = {}): TransacaoReconciliacao {
  return {
    id: "tx-1",
    status: "PARTIAL",
    method: "PIX",
    amount: "164.35",
    processedAt: new Date("2026-11-19T14:00:00.000Z"),
    metadata: { txid: TXID_AVISTA, signature: null },
    ...overrides,
  };
}

/** #26809 como o webhook antigo gravou: parcial, sem desconto, sem confirmacao. */
function quoteLegado(
  overrides: Partial<QuoteReconciliacao> = {},
  transacoes: TransacaoReconciliacao[] = [transacao()],
): QuoteReconciliacao {
  return {
    ...quoteBase({
      status: "PAGAMENTO_PARCIAL",
      paidTotal: "164.35",
      pendingTotal: "8.65",
      paymentDiscount: "0.00",
      paymentAmount: null,
    }),
    paymentTransactions: transacoes,
    ...overrides,
  };
}

describe("planejarReconciliacao", () => {
  it("#26809 legado: devolve o plano completo e promove PAGAMENTO_PARCIAL para APROVADO", () => {
    const resultado = planejarReconciliacao(quoteLegado());

    expect(resultado).toEqual({
      elegivel: true,
      plano: {
        paymentDiscount: 8.65,
        paymentAmount: 164.35,
        pendingTotal: 0,
        paymentConfirmedAt: new Date("2026-11-19T14:00:00.000Z"),
        novoStatus: "APROVADO",
        transacoesParaPago: ["tx-1"],
      },
    });
  });

  it("aceita paidTotal 164.33 (tolerancia de R$ 0,02) e grava o valor efetivamente pago", () => {
    const resultado = planejarReconciliacao(
      quoteLegado({}, [transacao({ amount: "164.33" })]),
    );

    expect(resultado.elegivel).toBe(true);
    if (resultado.elegivel) {
      expect(resultado.plano.paymentDiscount).toBe(8.65);
      expect(resultado.plano.paymentAmount).toBe(164.33);
      expect(resultado.plano.pendingTotal).toBe(0);
    }
  });

  it("ignora paidTotal 164.30 com VALOR_INCOMPATIVEL", () => {
    const resultado = planejarReconciliacao(
      quoteLegado({}, [transacao({ amount: "164.30" })]),
    );

    expect(resultado).toEqual({ elegivel: false, motivo: "VALOR_INCOMPATIVEL" });
  });

  it("status EM_PRODUCAO e elegivel, preserva o status e preenche paymentConfirmedAt", () => {
    const resultado = planejarReconciliacao(quoteLegado({ status: "EM_PRODUCAO" }));

    expect(resultado.elegivel).toBe(true);
    if (resultado.elegivel) {
      expect(resultado.plano.novoStatus).toBeUndefined();
      expect("novoStatus" in resultado.plano).toBe(false);
      expect(resultado.plano.paymentConfirmedAt).toEqual(new Date("2026-11-19T14:00:00.000Z"));
    }
  });

  it("preserva paymentConfirmedAt ja existente (nao sobrescreve e nao e filtro de elegibilidade)", () => {
    const existente = new Date("2026-11-10T10:00:00.000Z");
    const resultado = planejarReconciliacao(quoteLegado({ paymentConfirmedAt: existente }));

    expect(resultado.elegivel).toBe(true);
    if (resultado.elegivel) {
      expect(resultado.plano.paymentConfirmedAt).toEqual(existente);
      expect(resultado.plano.novoStatus).toBe("APROVADO");
    }
  });

  it("ignora CANCELADO com motivo CANCELADO", () => {
    expect(planejarReconciliacao(quoteLegado({ status: "CANCELADO" }))).toEqual({
      elegivel: false,
      motivo: "CANCELADO",
    });
  });

  it("ignora paymentDiscount maior que zero com JA_RECONCILIADO", () => {
    expect(planejarReconciliacao(quoteLegado({ paymentDiscount: "8.65" }))).toEqual({
      elegivel: false,
      motivo: "JA_RECONCILIADO",
    });
  });

  it("e idempotente: planejar o resultado de uma aplicacao nao produz novo plano", () => {
    const original = quoteLegado();
    const primeiro = planejarReconciliacao(original);
    expect(primeiro.elegivel).toBe(true);
    if (!primeiro.elegivel) return;

    const { plano } = primeiro;
    const aposAplicar: QuoteReconciliacao = {
      ...original,
      status: plano.novoStatus ?? original.status,
      paymentDiscount: plano.paymentDiscount.toFixed(2),
      paymentAmount: plano.paymentAmount.toFixed(2),
      pendingTotal: plano.pendingTotal.toFixed(2),
      paymentConfirmedAt: plano.paymentConfirmedAt,
      paymentTransactions: original.paymentTransactions.map((t) =>
        plano.transacoesParaPago.includes(t.id) ? { ...t, status: "PAID" } : t,
      ),
    };

    expect(planejarReconciliacao(aposAplicar)).toEqual({ elegivel: false, motivo: "JA_RECONCILIADO" });
  });

  it("apos aplicar, a situacao do orcamento passa a INTEGRAL via PIX com teto no valor pago (achado 54-01)", () => {
    const original = quoteLegado();
    const resultado = planejarReconciliacao(original);
    expect(resultado.elegivel).toBe(true);
    if (!resultado.elegivel) return;

    const { plano } = resultado;
    const situacao = resolverSituacaoPagamentoQuote({
      total: original.total,
      paymentDiscount: plano.paymentDiscount,
      paidTotal: original.paidTotal,
      paymentConfirmedAt: plano.paymentConfirmedAt,
      paymentNote: original.paymentNote,
    });

    expect(situacao.situacao).toBe("INTEGRAL");
    expect(situacao.origem).toBe("PIX");
    expect(situacao.valorMaximoNota).toBe(164.35);
  });

  it("ignora total 150.00 ou menor com SEM_DESCONTO_AVISTA", () => {
    const resultado = planejarReconciliacao(
      quoteLegado({ total: "150.00", paidTotal: "150.00" }, [transacao({ amount: "150.00" })]),
    );

    expect(resultado).toEqual({ elegivel: false, motivo: "SEM_DESCONTO_AVISTA" });
  });

  it("ignora quem so tem transacao no txid da entrada 50% com SEM_TRANSACAO_AVISTA", () => {
    const quote: QuoteReconciliacao = {
      ...quoteEntrada50Pix({ secondInstallmentExternalId: TXID_ENTRADA }),
      paymentTransactions: [transacao({ amount: "86.50", metadata: { txid: TXID_ENTRADA } })],
    };

    expect(planejarReconciliacao(quote)).toEqual({ elegivel: false, motivo: "SEM_TRANSACAO_AVISTA" });
  });

  it("ignora transacao que nao e PIX ou que falhou", () => {
    expect(planejarReconciliacao(quoteLegado({}, [transacao({ method: "CARD" })]))).toEqual({
      elegivel: false,
      motivo: "SEM_TRANSACAO_AVISTA",
    });
    expect(planejarReconciliacao(quoteLegado({}, [transacao({ status: "FAILED" })]))).toEqual({
      elegivel: false,
      motivo: "SEM_TRANSACAO_AVISTA",
    });
  });

  it("ignora pago integral sem desconto (173.00 no txid a vista) com PAGO_SEM_DESCONTO", () => {
    const quote: QuoteReconciliacao = {
      ...quoteIntegralSemDesconto(173, { paymentConfirmedAt: null, status: "PAGAMENTO_PARCIAL" }),
      paymentTransactions: [transacao({ amount: "173.00", status: "PAID" })],
    };

    expect(planejarReconciliacao(quote)).toEqual({ elegivel: false, motivo: "PAGO_SEM_DESCONTO" });
  });

  it("soma duas transacoes a vista (100.00 e 64.35) e marca ambas PARTIAL como PAID", () => {
    const resultado = planejarReconciliacao(
      quoteLegado({}, [
        transacao({ id: "tx-a", amount: "100.00", processedAt: new Date("2026-11-19T14:00:00.000Z") }),
        transacao({
          id: "tx-b",
          amount: "64.35",
          processedAt: new Date("2026-11-19T15:30:00.000Z"),
          metadata: { txid: TXID_AVISTA },
        }),
      ]),
    );

    expect(resultado.elegivel).toBe(true);
    if (resultado.elegivel) {
      expect(resultado.plano.paymentAmount).toBe(164.35);
      expect(resultado.plano.transacoesParaPago).toEqual(["tx-a", "tx-b"]);
      expect(resultado.plano.paymentConfirmedAt).toEqual(new Date("2026-11-19T15:30:00.000Z"));
    }
  });

  it("nao inclui em transacoesParaPago a transacao a vista que ja esta PAID", () => {
    const resultado = planejarReconciliacao(
      quoteLegado({}, [
        transacao({ id: "tx-a", amount: "100.00", status: "PAID" }),
        transacao({ id: "tx-b", amount: "64.35" }),
      ]),
    );

    expect(resultado.elegivel).toBe(true);
    if (resultado.elegivel) {
      expect(resultado.plano.transacoesParaPago).toEqual(["tx-b"]);
    }
  });

  it("ignora quote sem paymentExternalId com SEM_TXID_AVISTA", () => {
    expect(planejarReconciliacao(quoteLegado({ paymentExternalId: null }))).toEqual({
      elegivel: false,
      motivo: "SEM_TXID_AVISTA",
    });
  });

  it("ignora quote sem transacoes", () => {
    expect(planejarReconciliacao(quoteLegado({}, []))).toEqual({
      elegivel: false,
      motivo: "SEM_TRANSACAO_AVISTA",
    });
  });

  it("aceita metadata ausente ou invalida sem lancar (transacao nao conta)", () => {
    expect(planejarReconciliacao(quoteLegado({}, [transacao({ metadata: null })]))).toEqual({
      elegivel: false,
      motivo: "SEM_TRANSACAO_AVISTA",
    });
    expect(planejarReconciliacao(quoteLegado({}, [transacao({ metadata: "texto" })]))).toEqual({
      elegivel: false,
      motivo: "SEM_TRANSACAO_AVISTA",
    });
  });
});

describe("interpretarArgumentos", () => {
  it("sem argumentos: dry-run, limite padrao 500, sem quote, sem ajuda", () => {
    expect(interpretarArgumentos([])).toEqual({ aplicar: false, limite: LIMITE_PADRAO, ajuda: false });
    expect(LIMITE_PADRAO).toBe(500);
  });

  it("--aplicar liga a escrita", () => {
    expect(interpretarArgumentos(["--aplicar"]).aplicar).toBe(true);
  });

  it("--quote captura o identificador (com espaco ou sinal de igual)", () => {
    expect(interpretarArgumentos(["--quote", "26809"]).quote).toBe("26809");
    expect(interpretarArgumentos(["--quote=26809"]).quote).toBe("26809");
  });

  it("--limite muda o limite", () => {
    expect(interpretarArgumentos(["--limite", "10"]).limite).toBe(10);
    expect(interpretarArgumentos(["--limite=25"]).limite).toBe(25);
  });

  it("--limite invalido devolve erro", () => {
    expect(interpretarArgumentos(["--limite", "abc"]).erro).toBeDefined();
    expect(interpretarArgumentos(["--limite", "0"]).erro).toBeDefined();
    expect(interpretarArgumentos(["--limite", "-3"]).erro).toBeDefined();
    expect(interpretarArgumentos(["--limite", "2.5"]).erro).toBeDefined();
    expect(interpretarArgumentos(["--limite"]).erro).toBeDefined();
  });

  it("--quote sem valor devolve erro", () => {
    expect(interpretarArgumentos(["--quote"]).erro).toBeDefined();
    expect(interpretarArgumentos(["--quote", "--aplicar"]).erro).toBeDefined();
  });

  it("flag desconhecida devolve erro", () => {
    expect(interpretarArgumentos(["--forcar"]).erro).toMatch(/--forcar/);
    expect(interpretarArgumentos(["26809"]).erro).toBeDefined();
  });

  it("--ajuda liga a ajuda e nunca liga a escrita sozinha", () => {
    const argumentos = interpretarArgumentos(["--ajuda"]);
    expect(argumentos.ajuda).toBe(true);
    expect(argumentos.aplicar).toBe(false);
    expect(argumentos.erro).toBeUndefined();
  });
});
