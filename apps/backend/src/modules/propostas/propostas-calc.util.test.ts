import {
  CalcPropostaError,
  ajustarPrecoCentavos,
  parsePercentualMilli,
  parsePrecoDigitadoCentavos,
  precoBaseParaCentavos,
  resolverPrecoUnitarioCentavos,
} from "./propostas-calc.util";

function codigoDe(fn: () => unknown): { codigo?: string; indice?: number } {
  try {
    fn();
  } catch (err) {
    if (err instanceof CalcPropostaError) return { codigo: err.codigo, indice: err.indice };
    throw err;
  }
  return {};
}

describe("propostas-calc.util", () => {
  describe("precoBaseParaCentavos (D-23)", () => {
    it("mantem preco com ate 2 casas exatas", () => {
      expect(precoBaseParaCentavos(3500n)).toBe(350n);
      expect(precoBaseParaCentavos(3450n)).toBe(345n);
    });

    it("arredonda PARA CIMA no centavo quando ha sub-centavo, mesmo sem ajuste", () => {
      expect(precoBaseParaCentavos(3456n)).toBe(346n);
      expect(precoBaseParaCentavos(3451n)).toBe(346n);
      expect(precoBaseParaCentavos(1n)).toBe(1n);
    });
  });

  describe("ajustarPrecoCentavos (D-02)", () => {
    it("aplica percentual com ceil exato no centavo", () => {
      expect(ajustarPrecoCentavos(3500n, 10000n)).toBe(385n);
      expect(ajustarPrecoCentavos(2900n, 15000n)).toBe(334n);
      expect(ajustarPrecoCentavos(1100n, 10000n)).toBe(121n);
      expect(ajustarPrecoCentavos(4100n, 20000n)).toBe(492n);
      expect(ajustarPrecoCentavos(7700n, 30000n)).toBe(1001n);
    });

    it("sem ajuste (0%) ainda arredonda o sub-centavo para cima", () => {
      expect(ajustarPrecoCentavos(3456n, 0n)).toBe(346n);
    });

    it("percentual negativo tambem arredonda para cima", () => {
      expect(ajustarPrecoCentavos(3300n, -10000n)).toBe(297n);
      expect(ajustarPrecoCentavos(3350n, -10000n)).toBe(302n);
    });

    it("recusa percentual menor ou igual a -100%", () => {
      expect(codigoDe(() => ajustarPrecoCentavos(3500n, -100000n)).codigo).toBe("PERCENTUAL_INVALIDO");
      expect(codigoDe(() => ajustarPrecoCentavos(3500n, -150000n)).codigo).toBe("PERCENTUAL_INVALIDO");
    });

    it("prova anti-float: 3,50 +10% e 3,85 (o float ingenuo daria 3,86)", () => {
      const ingenuo = 3.5 * 1.1 * 100; // 385.00000000000006
      expect(ingenuo).not.toBe(385);
      expect(Math.ceil(ingenuo)).toBe(386);
      expect(ajustarPrecoCentavos(3500n, 10000n)).toBe(385n);
    });
  });

  describe("parsePercentualMilli", () => {
    it("converte numero ou texto com ponto em milesimos de percentual", () => {
      expect(parsePercentualMilli("10")).toBe(10000n);
      expect(parsePercentualMilli(12.5)).toBe(12500n);
      expect(parsePercentualMilli("-10")).toBe(-10000n);
      expect(parsePercentualMilli("0")).toBe(0n);
      expect(parsePercentualMilli("1000")).toBe(1000000n);
      expect(parsePercentualMilli("-99.999")).toBe(-99999n);
    });

    it("recusa formato invalido, casas demais e fora do intervalo", () => {
      const ruins: Array<number | string> = [
        "10.5555",
        "abc",
        "",
        Number.NaN,
        "1e2",
        "1000.001",
        1001,
        "-100",
        -100,
        -150,
        Number.POSITIVE_INFINITY,
        "10,5",
      ];
      for (const ruim of ruins) {
        expect(codigoDe(() => parsePercentualMilli(ruim)).codigo).toBe("PERCENTUAL_INVALIDO");
      }
    });
  });

  describe("parsePrecoDigitadoCentavos", () => {
    it("converte para centavos", () => {
      expect(parsePrecoDigitadoCentavos("2.90")).toBe(290n);
      expect(parsePrecoDigitadoCentavos(2.9)).toBe(290n);
    });

    it("recusa fracao de centavo, zero, negativo e texto invalido", () => {
      const ruins: Array<number | string> = ["2.905", 0, "0.00", -1, "-2.00", "abc", "1e3", Number.NaN];
      for (const ruim of ruins) {
        expect(codigoDe(() => parsePrecoDigitadoCentavos(ruim)).codigo).toBe("PRECO_INVALIDO");
      }
    });
  });

  describe("resolverPrecoUnitarioCentavos (D-02, D-02a)", () => {
    it("sem ajuste devolve o preco base com ceil", () => {
      expect(resolverPrecoUnitarioCentavos({ precoBaseMilli: 3456n })).toBe(346n);
      expect(resolverPrecoUnitarioCentavos({ precoBaseMilli: 3500n, ajuste: null })).toBe(350n);
      expect(resolverPrecoUnitarioCentavos({ precoBaseMilli: 3500n, ajuste: undefined })).toBe(350n);
    });

    it("ajuste PERCENTUAL aplica o ceil exato", () => {
      expect(
        resolverPrecoUnitarioCentavos({ precoBaseMilli: 3500n, ajuste: { tipo: "PERCENTUAL", valor: 10 } }),
      ).toBe(385n);
      expect(
        resolverPrecoUnitarioCentavos({ precoBaseMilli: 3300n, ajuste: { tipo: "PERCENTUAL", valor: "-10" } }),
      ).toBe(297n);
    });

    it("ajuste VALOR SUBSTITUI o preco base (nao e acrescimo em R$)", () => {
      expect(resolverPrecoUnitarioCentavos({ precoBaseMilli: 2000n, ajuste: { tipo: "VALOR", valor: "2.90" } })).toBe(
        290n,
      );
      expect(resolverPrecoUnitarioCentavos({ precoBaseMilli: 2000n, ajuste: { tipo: "VALOR", valor: "2.90" } })).not.toBe(
        490n,
      );
      expect(resolverPrecoUnitarioCentavos({ precoBaseMilli: 3500n, ajuste: { tipo: "VALOR", valor: "2.90" } })).toBe(
        290n,
      );
    });

    it("recusa resultado menor ou igual a zero", () => {
      expect(codigoDe(() => resolverPrecoUnitarioCentavos({ precoBaseMilli: 0n })).codigo).toBe("PRECO_INVALIDO");
      expect(
        codigoDe(() => resolverPrecoUnitarioCentavos({ precoBaseMilli: 0n, ajuste: { tipo: "PERCENTUAL", valor: 10 } }))
          .codigo,
      ).toBe("PRECO_INVALIDO");
      expect(
        codigoDe(() => resolverPrecoUnitarioCentavos({ precoBaseMilli: 3500n, ajuste: { tipo: "VALOR", valor: 0 } }))
          .codigo,
      ).toBe("PRECO_INVALIDO");
    });

    it("propaga percentual invalido com codigo tipado", () => {
      expect(
        codigoDe(() =>
          resolverPrecoUnitarioCentavos({ precoBaseMilli: 3500n, ajuste: { tipo: "PERCENTUAL", valor: -100 } }),
        ).codigo,
      ).toBe("PERCENTUAL_INVALIDO");
    });
  });
});
