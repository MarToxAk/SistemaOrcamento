import {
  CalcOrcamentoError,
  LIMITE_LINHA_CENTAVOS,
  LinhaCalcEntrada,
  calcularOrcamento,
  centavosParaTexto,
  linhaCentavos,
  milliParaTexto,
  paraCentavos,
  paraMilli,
  percentualMilli,
  percentualTexto,
  ratear,
} from "./athos-orcamento-calc.util";

/** Gerador deterministico (LCG) para testes com semente fixa; nunca usa Math.random. */
function gerador(semente: number) {
  let estado = semente >>> 0;
  return (min: number, max: number): number => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return min + (estado % (max - min + 1));
  };
}

function codigoDe(fn: () => unknown): { codigo?: string; indice?: number } {
  try {
    fn();
  } catch (err) {
    if (err instanceof CalcOrcamentoError) return { codigo: err.codigo, indice: err.indice };
    throw err;
  }
  return {};
}

describe("athos-orcamento-calc.util", () => {
  describe("conversao", () => {
    it("paraMilli converte texto e numero para milesimos inteiros", () => {
      expect(paraMilli("2.500")).toBe(2500n);
      expect(paraMilli("2")).toBe(2000n);
      expect(paraMilli(41.74)).toBe(41740n);
      expect(paraMilli(0.1 + 0.2)).toBe(300n);
      expect(paraMilli("33.07500000")).toBe(33075n);
    });

    it("paraMilli recusa mais de 3 casas, negativo, NaN e texto nao numerico", () => {
      for (const ruim of ["1.2345", -1, "abc", Number.NaN, 1.2345, Number.POSITIVE_INFINITY, "-2", ""]) {
        expect(codigoDe(() => paraMilli(ruim as number | string)).codigo).toBe("VALOR_INVALIDO");
      }
    });

    it("paraCentavos converte com ate 2 casas e recusa fracao de centavo", () => {
      expect(paraCentavos("2.98")).toBe(298n);
      expect(paraCentavos(12)).toBe(1200n);
      expect(codigoDe(() => paraCentavos(0.015)).codigo).toBe("VALOR_INVALIDO");
      expect(codigoDe(() => paraCentavos("1.005")).codigo).toBe("VALOR_INVALIDO");
    });

    it("formata milesimos e centavos como texto de casas fixas", () => {
      expect(milliParaTexto(1162n)).toBe("1.162");
      expect(milliParaTexto(0n)).toBe("0.000");
      expect(centavosParaTexto(5n)).toBe("0.05");
      expect(centavosParaTexto(4850n)).toBe("48.50");
    });
  });

  describe("linhaCentavos (half-up)", () => {
    it.each([
      [1162n, 41740n, 4850n],
      [1350n, 41740n, 5635n],
      [2340n, 41740n, 9767n],
      [2505n, 3000n, 752n],
      [6000n, 8390n, 5034n],
    ])("q=%s x v=%s -> %s centavos", (q, v, esperado) => {
      expect(linhaCentavos(q, v)).toBe(esperado);
    });
  });

  describe("ratear (maior resto)", () => {
    it("orcamento 25378: 2.98 sobre 6.50 e 2.00 -> 2.28 e 0.70", () => {
      expect(ratear(298n, [650n, 200n])).toEqual([228n, 70n]);
    });

    it("orcamento 25483: 0.04 em 4 linhas -> 0.01 cada", () => {
      expect(ratear(4n, [5000n, 5000n, 5000n, 2704n])).toEqual([1n, 1n, 1n, 1n]);
    });

    it("empate de resto vai para as linhas mais ao fim", () => {
      expect(ratear(2n, [50n, 50n, 50n, 50n])).toEqual([0n, 0n, 1n, 1n]);
    });

    it("desconto zero devolve zeros", () => {
      expect(ratear(0n, [10n, 20n])).toEqual([0n, 0n]);
    });

    it("desconto maior que a soma dos liquidos lanca DESCONTO_ACIMA_LIMITE", () => {
      expect(codigoDe(() => ratear(31n, [10n, 20n])).codigo).toBe("DESCONTO_ACIMA_LIMITE");
      expect(ratear(30n, [10n, 20n])).toEqual([10n, 20n]);
    });

    it("50 combinacoes deterministicas: soma exata e cota nunca excede o liquido", () => {
      const sorteio = gerador(20261109);
      for (let i = 0; i < 50; i++) {
        const n = sorteio(1, 6);
        const liquidos = Array.from({ length: n }, () => BigInt(sorteio(1, 100000)));
        const soma = liquidos.reduce((a, b) => a + b, 0n);
        const desconto = BigInt(sorteio(0, Number(soma)));
        const cotas = ratear(desconto, liquidos);
        expect(cotas).toHaveLength(n);
        expect(cotas.reduce((a, b) => a + b, 0n)).toBe(desconto);
        cotas.forEach((c, k) => expect(c <= liquidos[k]).toBe(true));
      }
    });
  });

  describe("percentual", () => {
    it("orcamento 25483: 0.04 de 177.04 = 0.023%", () => {
      expect(percentualMilli(4n, 17704n)).toBe(23n);
      expect(percentualTexto(23n)).toBe("0.023");
    });

    it("orcamento 25378: 2.98 de 8.50 = 35.059%", () => {
      expect(percentualMilli(298n, 850n)).toBe(35059n);
      expect(percentualTexto(35059n)).toBe("35.059");
    });

    it("10% exato e bruto zero", () => {
      expect(percentualMilli(125n, 1250n)).toBe(10000n);
      expect(percentualTexto(10000n)).toBe("10.000");
      expect(codigoDe(() => percentualMilli(1n, 0n)).codigo).toBe("VALOR_FORA_DO_LIMITE");
    });
  });

  describe("calcularOrcamento", () => {
    const L = (q: bigint, p: bigint, extra: Partial<LinhaCalcEntrada> = {}): LinhaCalcEntrada => ({
      qMilli: q,
      precoMilli: p,
      ...extra,
    });

    it("sem desconto: 2 x 2.000 e 1 x 3.300", () => {
      const r = calcularOrcamento([L(2000n, 2000n), L(1000n, 3300n)], 0n, 100000n);
      expect(r.brutoC).toBe(730n);
      expect(r.descontoC).toBe(0n);
      expect(r.liquidoC).toBe(730n);
      expect(r.percentualMilli).toBe(0n);
      r.linhas.forEach((l) => expect(l.finalC).toBe(l.totalC));
    });

    it("desconto global do orcamento 25378", () => {
      const r = calcularOrcamento([L(1000n, 6500n), L(1000n, 2000n)], 298n, 100000n);
      expect(r.linhas.map((l) => l.descontoC)).toEqual([228n, 70n]);
      expect(r.linhas.map((l) => l.finalC)).toEqual([422n, 130n]);
      expect(r.brutoC).toBe(850n);
      expect(r.liquidoC).toBe(552n);
      expect(r.percentualMilli).toBe(35059n);
    });

    it("desconto por item: 6 x 8.390 com 0.01 de desconto", () => {
      const r = calcularOrcamento([L(6000n, 8390n, { descontoItemC: 1n })], 0n, 100000n);
      expect(r.linhas[0].totalC).toBe(5034n);
      expect(r.linhas[0].descontoC).toBe(1n);
      expect(r.linhas[0].finalC).toBe(5033n);
    });

    it("valorUnitario abaixo do preco vira desconto (D-04)", () => {
      const r = calcularOrcamento([L(3000n, 10000n, { valorUnitarioMilli: 9000n })], 0n, 100000n);
      expect(r.linhas[0].valorItemMilli).toBe(10000n);
      expect(r.linhas[0].totalC).toBe(3000n);
      expect(r.linhas[0].descontoC).toBe(300n);
      expect(r.linhas[0].finalC).toBe(2700n);

      const r2 = calcularOrcamento(
        [L(3000n, 10000n, { valorUnitarioMilli: 9000n, descontoItemC: 50n })],
        0n,
        100000n,
      );
      expect(r2.linhas[0].descontoC).toBe(350n);
      expect(r2.linhas[0].finalC).toBe(2650n);
    });

    it("valorUnitario acima do preco e gravado como valor do item, sem desconto", () => {
      const r = calcularOrcamento([L(3000n, 10000n, { valorUnitarioMilli: 12000n })], 0n, 100000n);
      expect(r.linhas[0].valorItemMilli).toBe(12000n);
      expect(r.linhas[0].totalC).toBe(3600n);
      expect(r.linhas[0].descontoC).toBe(0n);
    });

    it("limites: desconto da linha e global nunca excedem o total/liquido", () => {
      const estouro = codigoDe(() => calcularOrcamento([L(1000n, 2000n), L(1000n, 3000n, { descontoItemC: 301n })], 0n, 100000n));
      expect(estouro).toEqual({ codigo: "DESCONTO_ACIMA_LIMITE", indice: 1 });

      const igual = calcularOrcamento([L(1000n, 3000n, { descontoItemC: 300n })], 0n, 100000n);
      expect(igual.linhas[0].finalC).toBe(0n);

      expect(
        codigoDe(() => calcularOrcamento([L(1000n, 2000n), L(1000n, 3000n)], 501n, 100000n)).codigo,
      ).toBe("DESCONTO_ACIMA_LIMITE");
    });

    it("teto percentual: 10,01% recusa e 10% exato passa (comparacao em inteiros)", () => {
      const linha = [L(1000n, 100000n)]; // bruto 100.00 = 10000 centavos
      expect(codigoDe(() => calcularOrcamento(linha, 1001n, 10000n)).codigo).toBe("DESCONTO_ACIMA_LIMITE");
      const ok = calcularOrcamento(linha, 1000n, 10000n);
      expect(ok.percentualMilli).toBe(10000n);
    });

    it("valores fora do dominio: linha zerada e linha >= LIMITE_LINHA_CENTAVOS", () => {
      expect(codigoDe(() => calcularOrcamento([L(1n, 1n)], 0n, 100000n))).toEqual({
        codigo: "VALOR_FORA_DO_LIMITE",
        indice: 0,
      });
      const grande = calcularOrcamento([L(1000n, 999_990_000n)], 0n, 100000n);
      expect(grande.linhas[0].totalC < LIMITE_LINHA_CENTAVOS).toBe(true);
      expect(codigoDe(() => calcularOrcamento([L(1000n, 1_000_000_000n)], 0n, 100000n))).toEqual({
        codigo: "VALOR_FORA_DO_LIMITE",
        indice: 0,
      });
    });

    it("mensagem de erro e legivel, em portugues e cita a linha", () => {
      try {
        calcularOrcamento([L(1000n, 2000n), L(1000n, 3000n, { descontoItemC: 999n })], 0n, 100000n);
        throw new Error("deveria lancar");
      } catch (err) {
        expect(err).toBeInstanceOf(CalcOrcamentoError);
        expect((err as Error).message).toContain("item 2");
        expect((err as Error).message).toContain("9.99");
      }
    });

    it("entradas invalidas: sem linhas e desconto negativo", () => {
      expect(codigoDe(() => calcularOrcamento([], 0n, 100000n)).codigo).toBe("VALOR_INVALIDO");
      expect(codigoDe(() => calcularOrcamento([L(1000n, 2000n)], -1n, 100000n)).codigo).toBe("VALOR_INVALIDO");
    });

    it("invariantes em 30 orcamentos deterministicos", () => {
      const sorteio = gerador(44);
      for (let i = 0; i < 30; i++) {
        const n = sorteio(1, 6);
        const linhas: LinhaCalcEntrada[] = Array.from({ length: n }, () => {
          const q = BigInt(sorteio(100, 9999));
          const p = BigInt(sorteio(1000, 99999));
          const total = linhaCentavos(q, p);
          return { qMilli: q, precoMilli: p, descontoItemC: BigInt(sorteio(0, Number(total / 3n))) };
        });
        const somaLiquidos = linhas.reduce((a, l) => a + linhaCentavos(l.qMilli, l.precoMilli) - (l.descontoItemC ?? 0n), 0n);
        const globalC = BigInt(sorteio(0, Number(somaLiquidos / 2n)));

        const r = calcularOrcamento(linhas, globalC, 100000n);
        const somaDesc = r.linhas.reduce((a, l) => a + l.descontoC, 0n);
        const somaFinal = r.linhas.reduce((a, l) => a + l.finalC, 0n);
        expect(r.descontoC).toBe(somaDesc);
        expect(r.brutoC - r.descontoC).toBe(somaFinal);
        expect(r.liquidoC).toBe(somaFinal);
        expect(r.percentualMilli).toBe(percentualMilli(r.descontoC, r.brutoC));
        r.linhas.forEach((l) => expect(l.finalC >= 0n).toBe(true));
      }
    });
  });
});
