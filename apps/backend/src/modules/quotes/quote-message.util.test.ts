import { calcularResumoValores, formatarBRL, formatarLinhaItem, montarLinhasTotal } from "./quote-message.util";

const norm = (texto: string) => texto.replace(/ /g, " ");

describe("quote-message.util (fase 46)", () => {
  it("U1: formatarBRL(1234.5) -> R$ 1.234,50", () => {
    expect(norm(formatarBRL(1234.5))).toBe("R$ 1.234,50");
  });

  it("U2: linha do item sem desconto, com desconto e bonificado", () => {
    expect(norm(formatarLinhaItem({ descricao: "Caneta", quantidade: 2, total: 20 }))).toBe("• Caneta (2x) — R$ 20,00");
    expect(norm(formatarLinhaItem({ descricao: "Caneta", quantidade: 2, total: 20, desconto: 0 }))).toBe("• Caneta (2x) — R$ 20,00");
    expect(norm(formatarLinhaItem({ descricao: "Caneta", quantidade: 200, total: 130, desconto: 60 }))).toBe(
      "• Caneta (200x) — ~R$ 190,00~ R$ 130,00",
    );
    expect(norm(formatarLinhaItem({ descricao: "Brinde", quantidade: 10, total: 0, desconto: 12 }))).toBe(
      "• Brinde (10x) — ~R$ 12,00~ R$ 0,00",
    );
  });

  it("U3: resumo do 25877", () => {
    expect(calcularResumoValores({ itens: [{ total: 130, desconto: 60 }], total: 130 })).toEqual({
      subtotal: 190,
      desconto: 60,
      acrescimo: 0,
      total: 130,
      temAjuste: true,
      divergente: false,
    });
  });

  it("U4: resumo do 25952 (desconto geral rateado)", () => {
    const r = calcularResumoValores({ itens: [{ total: 524.7, desconto: 58.3 }], total: 524.7 });
    expect(r.subtotal).toBe(583);
    expect(r.desconto).toBe(58.3);
    expect(r.total).toBe(524.7);
    expect(r.divergente).toBe(false);
  });

  it("U5: sem ajuste (25900, aumento de preco)", () => {
    const r = calcularResumoValores({ itens: [{ total: 5, desconto: 0 }], total: 5 });
    expect(r.temAjuste).toBe(false);
    expect(r.divergente).toBe(false);
  });

  it("U6: acrescimo", () => {
    const r = calcularResumoValores({ itens: [{ total: 100 }], total: 107.5, acrescimo: 7.5 });
    expect(r).toMatchObject({ subtotal: 100, desconto: 0, acrescimo: 7.5, temAjuste: true, divergente: false });
  });

  it("U7: divergencia entre total e itens", () => {
    const r = calcularResumoValores({ itens: [{ total: 130, desconto: 60 }], total: 100 });
    expect(r.divergente).toBe(true);
    expect(r.desconto).toBe(90);
    expect(r.subtotal).toBe(190);
  });

  it("U8: subtotal - desconto + acrescimo fecha sempre com o total quando ha ajuste", () => {
    const entradas = [
      { itens: [{ total: 130, desconto: 60 }], total: 130, acrescimo: 0 },
      { itens: [{ total: 524.7, desconto: 58.3 }], total: 524.7, acrescimo: 0 },
      { itens: [{ total: 100 }], total: 107.5, acrescimo: 7.5 },
      { itens: [{ total: 130, desconto: 60 }], total: 100, acrescimo: 0 },
      { itens: [{ total: 130, desconto: 60 }], total: 137.5, acrescimo: 7.5 },
      { itens: [{ total: 0, desconto: 12 }, { total: 20 }], total: 20, acrescimo: 0 },
    ];
    for (const e of entradas) {
      const r = calcularResumoValores(e);
      expect(r.temAjuste).toBe(true);
      expect(Math.abs(r.subtotal - r.desconto + r.acrescimo - r.total)).toBeLessThanOrEqual(0.01);
    }
  });

  it("U9: linhas do bloco de total", () => {
    const sem = calcularResumoValores({ itens: [{ total: 5, desconto: 0 }], total: 5 });
    expect(montarLinhasTotal(sem).map(norm)).toEqual(["💰 *Total: R$ 5,00*"]);

    const com = calcularResumoValores({ itens: [{ total: 130, desconto: 60 }], total: 130 });
    expect(montarLinhasTotal(com).map(norm)).toEqual(["Subtotal: R$ 190,00", "Desconto: -R$ 60,00", "💰 *Total: R$ 130,00*"]);

    const ambos = calcularResumoValores({ itens: [{ total: 130, desconto: 60 }], total: 137.5, acrescimo: 7.5 });
    expect(montarLinhasTotal(ambos).map(norm)).toEqual([
      "Subtotal: R$ 190,00",
      "Desconto: -R$ 60,00",
      "Acréscimo: +R$ 7,50",
      "💰 *Total: R$ 137,50*",
    ]);

    const soAcrescimo = calcularResumoValores({ itens: [{ total: 100 }], total: 107.5, acrescimo: 7.5 });
    const linhas = montarLinhasTotal(soAcrescimo).map(norm);
    expect(linhas).toEqual(["Subtotal: R$ 100,00", "Acréscimo: +R$ 7,50", "💰 *Total: R$ 107,50*"]);
    expect(linhas.some((l) => l.startsWith("Desconto"))).toBe(false);
  });

  it("U10: arredondamento com ruido de ponto flutuante sai com duas casas", () => {
    const r = calcularResumoValores({
      itens: [
        { total: 0.1 + 0.2, desconto: 0.1 + 0.2 },
        { total: 524.7000000000001, desconto: 58.300000000000004 },
      ],
      total: 0.1 + 0.2 + 524.7000000000001,
    });
    expect(r.subtotal).toBe(583.6);
    expect(r.desconto).toBe(58.6);
    expect(r.total).toBe(525);
    expect(norm(formatarLinhaItem({ descricao: "X", quantidade: 1, total: 524.7000000000001, desconto: 58.300000000000004 }))).toBe(
      "• X (1x) — ~R$ 583,00~ R$ 524,70",
    );
  });

  it("acrescimo negativo ou invalido vira 0", () => {
    expect(calcularResumoValores({ itens: [{ total: 10 }], total: 10, acrescimo: -5 }).acrescimo).toBe(0);
    expect(calcularResumoValores({ itens: [{ total: 10 }], total: 10, acrescimo: Number.NaN }).acrescimo).toBe(0);
  });
});
