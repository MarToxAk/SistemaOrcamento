import {
  cooCandidatos,
  ehVerdadeiroAthos,
  normalizarCoo,
  parseValorMonetario,
  valorMinimoSorteio,
} from "./athos-cupom-sorteio.util";

describe("normalizarCoo", () => {
  it("reduz o valor a somente digitos", () => {
    expect(normalizarCoo("  01 234-5 ")).toBe("012345");
  });

  it("rejeita valor vazio", () => {
    expect(normalizarCoo("")).toBeNull();
    expect(normalizarCoo("   ")).toBeNull();
    expect(normalizarCoo(undefined)).toBeNull();
    expect(normalizarCoo(null)).toBeNull();
  });

  it("rejeita valor com letra", () => {
    expect(normalizarCoo("ABC123")).toBeNull();
  });

  it("rejeita mais de 10 digitos", () => {
    expect(normalizarCoo("12345678901")).toBeNull();
  });

  it("rejeita numericamente zero", () => {
    expect(normalizarCoo("0")).toBeNull();
    expect(normalizarCoo("0000")).toBeNull();
  });
});

describe("cooCandidatos", () => {
  it("devolve variantes sem repeticao para um coo com zeros a esquerda", () => {
    const candidatos = cooCandidatos("012345");
    expect(candidatos).toContain("12345");
    expect(candidatos).toContain("012345");
    expect(new Set(candidatos).size).toBe(candidatos.length);
  });

  it("descarta candidatos com mais de 10 caracteres", () => {
    const coo = "1234567890"; // ja no limite de 10
    const candidatos = cooCandidatos(coo);
    for (const candidato of candidatos) {
      expect(candidato.length).toBeLessThanOrEqual(10);
    }
  });

  it("inclui as variantes zero-padded de 4, 5 e 6 digitos quando cabem", () => {
    const candidatos = cooCandidatos("42");
    expect(candidatos).toContain("42");
    expect(candidatos).toContain("0042");
    expect(candidatos).toContain("00042");
    expect(candidatos).toContain("000042");
  });
});

describe("parseValorMonetario", () => {
  it("aceita number", () => {
    expect(parseValorMonetario(50)).toBe(50);
  });

  it("aceita string com ponto decimal", () => {
    expect(parseValorMonetario("50")).toBe(50);
    expect(parseValorMonetario("50.00")).toBe(50);
    expect(parseValorMonetario("1234.56")).toBe(1234.56);
  });

  it("aceita string com virgula decimal", () => {
    expect(parseValorMonetario("1234,56")).toBe(1234.56);
  });

  it("devolve null para valores invalidos", () => {
    expect(parseValorMonetario(null)).toBeNull();
    expect(parseValorMonetario(undefined)).toBeNull();
    expect(parseValorMonetario("abc")).toBeNull();
  });
});

describe("ehVerdadeiroAthos", () => {
  it("trata variantes truthy conhecidas como verdadeiro", () => {
    expect(ehVerdadeiroAthos(true)).toBe(true);
    expect(ehVerdadeiroAthos("t")).toBe(true);
    expect(ehVerdadeiroAthos("T")).toBe(true);
    expect(ehVerdadeiroAthos("S")).toBe(true);
    expect(ehVerdadeiroAthos("s")).toBe(true);
    expect(ehVerdadeiroAthos(1)).toBe(true);
    expect(ehVerdadeiroAthos("1")).toBe(true);
    expect(ehVerdadeiroAthos("true")).toBe(true);
    expect(ehVerdadeiroAthos("sim")).toBe(true);
  });

  it("trata qualquer outra coisa como falso", () => {
    expect(ehVerdadeiroAthos(false)).toBe(false);
    expect(ehVerdadeiroAthos(null)).toBe(false);
    expect(ehVerdadeiroAthos("")).toBe(false);
    expect(ehVerdadeiroAthos("nao")).toBe(false);
    expect(ehVerdadeiroAthos(0)).toBe(false);
  });
});

describe("valorMinimoSorteio", () => {
  it("devolve 50 sem env", () => {
    expect(valorMinimoSorteio({})).toBe(50);
  });

  it("devolve o numero configurado quando positivo", () => {
    expect(valorMinimoSorteio({ SORTEIO_VALOR_MINIMO: "80" })).toBe(80);
  });

  it("volta para 50 quando a env e vazia, nao numerica ou <= 0", () => {
    expect(valorMinimoSorteio({ SORTEIO_VALOR_MINIMO: "" })).toBe(50);
    expect(valorMinimoSorteio({ SORTEIO_VALOR_MINIMO: "abc" })).toBe(50);
    expect(valorMinimoSorteio({ SORTEIO_VALOR_MINIMO: "0" })).toBe(50);
    expect(valorMinimoSorteio({ SORTEIO_VALOR_MINIMO: "-10" })).toBe(50);
  });
});
