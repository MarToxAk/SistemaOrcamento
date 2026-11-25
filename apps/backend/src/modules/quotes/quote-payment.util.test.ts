import {
  TOLERANCIA_QUITACAO_CENTAVOS,
  calcularPixAvista,
  calcularQuitacao,
  centavosParaReais,
  paraCentavos,
  resolverSituacaoPagamentoQuote,
} from "./quote-payment.util";
import {
  quoteEntrada50Pix,
  quoteIntegralSemDesconto,
  quotePagoCaixa,
  quotePagoPix26809,
  quoteSemPagamento,
} from "./__fixtures__/quote-pago.fixture";

describe("paraCentavos / centavosParaReais", () => {
  it("converte numero, string com ponto/virgula e objeto Decimal-like", () => {
    expect(paraCentavos(164.35)).toBe(16435);
    expect(paraCentavos("164,35")).toBe(16435);
    expect(paraCentavos("164.35")).toBe(16435);
    expect(paraCentavos({ toString: () => "164.35" })).toBe(16435);
  });

  it("valor invalido vira 0 centavos", () => {
    expect(paraCentavos(undefined)).toBe(0);
    expect(paraCentavos(null)).toBe(0);
    expect(paraCentavos("abc")).toBe(0);
    expect(paraCentavos(NaN)).toBe(0);
    expect(paraCentavos(Infinity)).toBe(0);
  });

  it("centavosParaReais devolve reais com 2 casas", () => {
    expect(centavosParaReais(16435)).toBe(164.35);
    expect(centavosParaReais(0)).toBe(0);
  });

  it("tolerancia fixa de 2 centavos", () => {
    expect(TOLERANCIA_QUITACAO_CENTAVOS).toBe(2);
  });
});

describe("calcularPixAvista", () => {
  it("173 -> 5%, valorFinal 164.35, desconto 8.65", () => {
    expect(calcularPixAvista(173)).toEqual({ percentual: 5, valorFinal: 164.35, desconto: 8.65 });
  });

  it("corte estritamente maior que 150", () => {
    expect(calcularPixAvista(150)).toEqual({ percentual: 0, valorFinal: 150, desconto: 0 });
    expect(calcularPixAvista(150.01).percentual).toBe(5);
  });

  it("paridade exata com a expressao original de EfiService.resolvePaymentOptions", () => {
    for (const total of [99.9, 150, 150.01, 150.1, 173, 1234.56, 400]) {
      const pct = total > 150 ? 5 : 0;
      const esperado = Number((total * (1 - pct / 100)).toFixed(2));
      const r = calcularPixAvista(total);
      expect(r.percentual).toBe(pct);
      expect(r.valorFinal).toBe(esperado);
    }
  });

  it("total invalido vira 0 sem desconto", () => {
    expect(calcularPixAvista(NaN)).toEqual({ percentual: 0, valorFinal: 0, desconto: 0 });
  });
});

describe("calcularQuitacao", () => {
  const base = { total: 173, desconto: 8.65, pagoAntes: 0 };

  it("caso #26809: 164.35 pago de 173 com desconto 8.65 quita", () => {
    expect(calcularQuitacao({ ...base, pagamento: 164.35 })).toEqual({
      devido: 164.35,
      pago: 164.35,
      pendente: 0,
      quitado: true,
    });
  });

  it("ruido de float (desconto 8.650000000000006 e pago 164.34999999999997) nao muda o resultado", () => {
    const descontoFloat = 173 - 173 * 0.95; // 8.650000000000006
    expect(descontoFloat).not.toBe(8.65);
    const r1 = calcularQuitacao({ total: 173, desconto: descontoFloat, pagoAntes: 0, pagamento: 164.35 });
    expect(r1).toEqual({ devido: 164.35, pago: 164.35, pendente: 0, quitado: true });
    const r2 = calcularQuitacao({ total: 173, desconto: 8.65, pagoAntes: 0, pagamento: 164.34999999999997 });
    expect(r2).toEqual({ devido: 164.35, pago: 164.35, pendente: 0, quitado: true });
  });

  it("fronteira: 164.33 quita, 164.32 nao quita (pendente 0.03)", () => {
    expect(calcularQuitacao({ ...base, pagamento: 164.33 }).quitado).toBe(true);
    const r = calcularQuitacao({ ...base, pagamento: 164.32 });
    expect(r.quitado).toBe(false);
    expect(r.pendente).toBe(0.03);
  });

  it("entrada 50% sem desconto e parcial", () => {
    const r = calcularQuitacao({ total: 173, desconto: 0, pagoAntes: 0, pagamento: 86.5 });
    expect(r.quitado).toBe(false);
    expect(r.pendente).toBe(86.5);
  });

  it("total 150 sem desconto: 150 e 149.98 quitam; 149.97 nao", () => {
    const b = { total: 150, desconto: 0, pagoAntes: 0 };
    expect(calcularQuitacao({ ...b, pagamento: 150 }).quitado).toBe(true);
    expect(calcularQuitacao({ ...b, pagamento: 149.98 }).quitado).toBe(true);
    expect(calcularQuitacao({ ...b, pagamento: 149.97 }).quitado).toBe(false);
  });

  it("acumulado em dois PIX", () => {
    expect(calcularQuitacao({ ...base, pagoAntes: 100, pagamento: 64.35 }).quitado).toBe(true);
    const r = calcularQuitacao({ ...base, pagoAntes: 0, pagamento: 100 });
    expect(r.quitado).toBe(false);
    expect(r.pendente).toBe(64.35);
  });

  it("teto: pagamento acima do total devolve pago = total", () => {
    const r = calcularQuitacao({ ...base, pagamento: 200 });
    expect(r.pago).toBe(173);
    expect(r.quitado).toBe(true);
    expect(r.pendente).toBe(0);
  });

  it("entradas em texto com virgula e Decimal-like", () => {
    const r = calcularQuitacao({
      total: "173,00",
      desconto: { toString: () => "8.65" },
      pagoAntes: "0",
      pagamento: "164,35",
    });
    expect(r).toEqual({ devido: 164.35, pago: 164.35, pendente: 0, quitado: true });
  });

  it("desconto maior que o total nao gera devido negativo", () => {
    const r = calcularQuitacao({ total: 10, desconto: 50, pagoAntes: 0, pagamento: 0 });
    expect(r.devido).toBe(0);
    expect(r.quitado).toBe(true);
  });
});

describe("resolverSituacaoPagamentoQuote", () => {
  it("#26809 pago por PIX: INTEGRAL, origem PIX, sem senha", () => {
    const r = resolverSituacaoPagamentoQuote(quotePagoPix26809());
    expect(r).toMatchObject({
      situacao: "INTEGRAL",
      origem: "PIX",
      valorTotal: 173,
      valorPago: 164.35,
      desconto: 8.65,
      valorDevido: 164.35,
      pendente: 0,
      valorSugeridoNota: 164.35,
      valorMaximoNota: 164.35,
      exigeSenha: false,
    });
  });

  it("#26809 no estado legado (desconto 0, sem confirmacao): PARCIAL, pendente 8.65, exige senha", () => {
    const r = resolverSituacaoPagamentoQuote(
      quotePagoPix26809({ paymentDiscount: "0.00", paymentConfirmedAt: null }),
    );
    expect(r.situacao).toBe("PARCIAL");
    expect(r.pendente).toBe(8.65);
    expect(r.exigeSenha).toBe(true);
  });

  it("entrada 50%: PARCIAL, pendente 86.5, exige senha, sugerido 173", () => {
    const r = resolverSituacaoPagamentoQuote(quoteEntrada50Pix());
    expect(r.situacao).toBe("PARCIAL");
    expect(r.origem).toBe("PIX");
    expect(r.pendente).toBe(86.5);
    expect(r.exigeSenha).toBe(true);
    expect(r.valorSugeridoNota).toBe(173);
  });

  it("sem pagamento: SEM_PAGAMENTO, origem NENHUMA, exige senha", () => {
    const r = resolverSituacaoPagamentoQuote(quoteSemPagamento());
    expect(r.situacao).toBe("SEM_PAGAMENTO");
    expect(r.origem).toBe("NENHUMA");
    expect(r.valorPago).toBe(0);
    expect(r.pendente).toBe(173);
    expect(r.exigeSenha).toBe(true);
  });

  it("caixa do Athos (paymentNote, paidTotal 0): INTEGRAL, origem CAIXA, sem senha", () => {
    const r = resolverSituacaoPagamentoQuote(quotePagoCaixa());
    expect(r.situacao).toBe("INTEGRAL");
    expect(r.origem).toBe("CAIXA");
    expect(r.valorSugeridoNota).toBe(173);
    expect(r.valorMaximoNota).toBe(173);
    expect(r.exigeSenha).toBe(false);
  });

  it("entrada 50% por PIX mais restante no caixa: INTEGRAL, origem CAIXA, valorPago 86.5", () => {
    const r = resolverSituacaoPagamentoQuote(quoteEntrada50Pix({ paymentNote: "Pagamento feito no caixa" }));
    expect(r.situacao).toBe("INTEGRAL");
    expect(r.origem).toBe("CAIXA");
    expect(r.valorPago).toBe(86.5);
    expect(r.valorSugeridoNota).toBe(173);
    expect(r.exigeSenha).toBe(false);
  });

  it("integral sem desconto (250 pago 250): INTEGRAL PIX, valorMaximoNota 250", () => {
    const r = resolverSituacaoPagamentoQuote(quoteIntegralSemDesconto(250));
    expect(r.situacao).toBe("INTEGRAL");
    expect(r.origem).toBe("PIX");
    expect(r.valorMaximoNota).toBe(250);
  });

  it("fronteira: paidTotal 164.32 e PARCIAL; 164.33 e INTEGRAL", () => {
    expect(resolverSituacaoPagamentoQuote(quotePagoPix26809({ paidTotal: "164.32" })).situacao).toBe("PARCIAL");
    expect(resolverSituacaoPagamentoQuote(quotePagoPix26809({ paidTotal: "164.33" })).situacao).toBe("INTEGRAL");
  });

  it("desconto maior que o total nao produz devido negativo", () => {
    const r = resolverSituacaoPagamentoQuote({ total: "10.00", paymentDiscount: "50.00", paidTotal: "0.00" });
    expect(r.valorDevido).toBe(0);
  });

  it("campos ausentes sao tratados como zero/ausentes sem lancar", () => {
    const r = resolverSituacaoPagamentoQuote({
      total: "100.00",
      paymentDiscount: undefined,
      paidTotal: null,
      paymentConfirmedAt: null,
      paymentNote: null,
    });
    expect(r.situacao).toBe("SEM_PAGAMENTO");
    expect(r.valorPago).toBe(0);
  });
});
