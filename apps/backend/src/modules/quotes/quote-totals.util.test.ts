import { resolveQuoteTotal } from "./quote-totals.util";

// Fase 46 (46-01): total liquido do Quote. Valores em reais com duas casas.
describe("resolveQuoteTotal", () => {
  it("Q1 cabecalho BRUTO do Athos (25952): valor 583,00 e descontors 58,30 -> total 524,70", () => {
    const r = resolveQuoteTotal({ itensLiquido: 524.7, itensBruto: 583, valor: 583, descontors: 58.3 });
    expect(r.total).toBe(524.7);
    expect(r.discount).toBe(58.3);
    expect(r.origem).toBe("cabecalho-bruto");
  });

  it("Q2 payload da pagina (25952): valor ja liquido (524,70) e desconto 58,30 -> total 524,70", () => {
    const r = resolveQuoteTotal({ itensLiquido: 524.7, itensBruto: 583, valor: 524.7, desconto: 58.3 });
    expect(r.total).toBe(524.7);
    expect(r.discount).toBe(58.3);
    expect(r.origem).toBe("cabecalho-liquido");
  });

  it("Q3 bruto sem descontors: valor coincide com o bruto dos itens -> subtrai a diferenca e deduz o desconto", () => {
    const r = resolveQuoteTotal({ itensLiquido: 524.7, itensBruto: 583, valor: 583 });
    expect(r.total).toBe(524.7);
    expect(r.discount).toBe(58.3);
    expect(r.origem).toBe("cabecalho-bruto");
  });

  it("Q4 25822 (Balcao com preco informado): descontors 0 explicito = cabecalho ja liquido", () => {
    const r = resolveQuoteTotal({ itensLiquido: 13, itensBruto: 26, valor: 13, descontors: 0 });
    expect(r.total).toBe(13);
    expect(r.discount).toBe(0);
  });

  it("Q5 acrescimo: valor 100,00 + valoracrescimo 7,50 -> total 107,50 e surcharge 7,50", () => {
    const r = resolveQuoteTotal({ itensLiquido: 100, itensBruto: 100, valor: 100, descontors: 0, valoracrescimo: 7.5 });
    expect(r.total).toBe(107.5);
    expect(r.surcharge).toBe(7.5);
  });

  it("Q6 sem valor de cabecalho: total = itens (+ acrescimo); o desconto do payload nao e subtraido de novo", () => {
    const sem = resolveQuoteTotal({ itensLiquido: 130, itensBruto: 190 });
    expect(sem.total).toBe(130);
    expect(sem.origem).toBe("itens");
    expect(sem.headerLiquido).toBeNull();

    const com = resolveQuoteTotal({ itensLiquido: 130, itensBruto: 190, valoracrescimo: 7.5 });
    expect(com.total).toBe(137.5);

    const comDesconto = resolveQuoteTotal({ itensLiquido: 130, itensBruto: 190, desconto: 60 });
    expect(comDesconto.total).toBe(130);
    expect(comDesconto.discount).toBe(60);
  });

  it("Q7 25900 sem desconto: total 5,00, desconto 0, origem cabecalho-liquido", () => {
    const r = resolveQuoteTotal({ itensLiquido: 5, itensBruto: 5, valor: 5 });
    expect(r.total).toBe(5);
    expect(r.discount).toBe(0);
    expect(r.origem).toBe("cabecalho-liquido");
  });

  it("Q8 arredondamento: ruido de ponto flutuante sai com no maximo duas casas", () => {
    const r = resolveQuoteTotal({
      itensLiquido: 524.7000000000001,
      itensBruto: 583.0000000000001,
      valor: 583.0000000000001,
      descontors: 58.30000000000001,
      valoracrescimo: 0.1 + 0.2,
    });
    expect(r.total).toBe(525);
    for (const campo of [r.total, r.discount, r.surcharge, r.headerLiquido as number]) {
      expect(Number(campo.toFixed(2))).toBe(campo);
    }
    expect(r.discount).toBe(58.3);
    expect(r.surcharge).toBe(0.3);
  });

  it("Q9 entradas invalidas (NaN, Infinity, string, null) sao tratadas como ausentes", () => {
    const r = resolveQuoteTotal({
      itensLiquido: 100,
      itensBruto: 100,
      valor: "abc",
      descontors: Number.NaN,
      desconto: Number.POSITIVE_INFINITY,
      valoracrescimo: null,
    });
    expect(r.total).toBe(100);
    expect(r.discount).toBe(0);
    expect(r.surcharge).toBe(0);
    expect(r.origem).toBe("itens");

    const comString = resolveQuoteTotal({ itensLiquido: 100, itensBruto: 100, valor: 100, valoracrescimo: "7.5" });
    expect(comString.surcharge).toBe(0);
    expect(comString.total).toBe(100);
  });

  it("Q10 divergencia: o cabecalho prevalece (como hoje) e headerLiquido e devolvido para o create registrar o erro", () => {
    const r = resolveQuoteTotal({ itensLiquido: 524.7, itensBruto: 583, valor: 500, descontors: 0 });
    expect(r.total).toBe(500);
    expect(r.headerLiquido).toBe(500);
  });
});
