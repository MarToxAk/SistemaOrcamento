import {
  computeModeFromRows,
  computeDefaults,
  FISCAL_FIELDS,
  STOCK_FIELDS,
  DEFAULTS_CACHE_TTL_MS,
  DEFAULTS_MIN_SAMPLE,
} from "./athos-defaults.util";

describe("computeModeFromRows", () => {
  it("retorna o valor mais frequente (DEFD-01)", () => {
    const rows = [{ icms: "12" }, { icms: "12" }, { icms: "7" }];
    expect(computeModeFromRows(rows, "icms", 3)).toBe("12");
  });

  it("ignora null e string vazia na contagem (DEFD-02)", () => {
    const rows = [
      { icms: null },
      { icms: "" },
      { icms: "7" },
      { icms: "7" },
      { icms: "7" },
    ];
    expect(computeModeFromRows(rows, "icms", 3)).toBe("7");
  });

  it("ignora undefined na contagem (DEFD-02)", () => {
    const rows = [
      { icms: undefined as unknown as null },
      { icms: "7" },
      { icms: "7" },
      { icms: "7" },
    ];
    expect(computeModeFromRows(rows, "icms", 3)).toBe("7");
  });

  it("retorna null quando total de valores preenchidos < minSample (D-09)", () => {
    const rows = [
      { icms: "12" },
      { icms: "7" },
      { icms: "12" },
      { icms: "7" },
    ];
    expect(computeModeFromRows(rows, "icms", 5)).toBeNull();
  });

  it("retorna null para rows vazias (D-09)", () => {
    expect(computeModeFromRows([], "icms", 5)).toBeNull();
  });

  it("retorna o valor quando total == minSample (borda inferior)", () => {
    const rows = [{ icms: "12" }, { icms: "12" }, { icms: "12" }, { icms: "12" }, { icms: "7" }];
    expect(computeModeFromRows(rows, "icms", 5)).toBe("12");
  });

  it("em empate de frequencia retorna o menor valor lexicografico (D-11)", () => {
    // '12' e '7' empatam em freq=2; '1' < '7' lexicograficamente => '12' vence
    const rows = [
      { icms: "12" },
      { icms: "12" },
      { icms: "7" },
      { icms: "7" },
      { icms: "9" },
    ];
    expect(computeModeFromRows(rows, "icms", 5)).toBe("12");
  });

  it("em empate estrito retorna menor valor (D-11) — S vs T", () => {
    const rows = [
      { tributacao: "S" },
      { tributacao: "T" },
      { tributacao: "S" },
      { tributacao: "T" },
      { tributacao: "X" },
    ];
    // S e T empatam em freq=2; 'S' < 'T' => 'S' vence
    expect(computeModeFromRows(rows, "tributacao", 5)).toBe("S");
  });

  it("campo com valores numericos retorna o mais frequente (origem — number)", () => {
    const rows = [{ origem: 0 }, { origem: 0 }, { origem: 1 }, { origem: 0 }, { origem: 1 }];
    expect(computeModeFromRows(rows, "origem", 5)).toBe(0);
  });

  it("campo booleano: empate false vs true retorna false por menor valor lexicografico (D-11/D-07)", () => {
    const rows = [
      { controlaestoque: true },
      { controlaestoque: false },
      { controlaestoque: true },
      { controlaestoque: false },
      { controlaestoque: true },
    ];
    // true freq=3 > false freq=2 => true vence
    expect(computeModeFromRows(rows, "controlaestoque", 5)).toBe(true);
  });

  it("campo booleano empate: false vence por menor valor lexicografico ('false' < 'true')", () => {
    const rows = [
      { controlaestoque: true },
      { controlaestoque: false },
      { controlaestoque: true },
      { controlaestoque: false },
      { controlaestoque: null },
    ];
    // true freq=2, false freq=2 => empate; 'false' < 'true' => false vence
    expect(computeModeFromRows(rows, "controlaestoque", 4)).toBe(false);
  });
});

describe("computeDefaults", () => {
  it("retorna moda correta de campos fiscais e de estoque com amostra suficiente (DEFD-01)", () => {
    const rows = Array(5).fill({
      icms: "12",
      icmsnfe: "12",
      tributacao: "T",
      tributacaonfe: "T",
      codigocsosn: "400",
      codigocsosnnfe: "400",
      origem: 0,
      origemnfe: 0,
      tipoitem: "00",
      piscst: "07",
      cofinscst: "07",
      idcfopsaida: "5102",
      ncm: "48025590",
      controlaestoque: true,
      baixarestoque: true,
    });
    const result = computeDefaults(rows);
    expect(result.icms).toBe("12");
    expect(result.tributacao).toBe("T");
    expect(result.origem).toBe(0);
    expect(result.controlaestoque).toBe(true);
    expect(result.baixarestoque).toBe(true);
  });

  it("campos fiscais sem amostra suficiente sao omitidos do resultado (D-08)", () => {
    // Apenas 3 rows com icms preenchido — abaixo do minSample=5
    const rows = [
      { icms: "12", controlaestoque: true, baixarestoque: true },
      { icms: "12", controlaestoque: true, baixarestoque: true },
      { icms: "7", controlaestoque: true, baixarestoque: true },
    ];
    const result = computeDefaults(rows);
    expect(result).not.toHaveProperty("icms");
    // Estoque: 3 valores < 5 => fallback false
    expect(result.controlaestoque).toBe(false);
    expect(result.baixarestoque).toBe(false);
  });

  it("campos de estoque sem amostra recebem fallback false (D-07)", () => {
    const result = computeDefaults([]);
    expect(result.controlaestoque).toBe(false);
    expect(result.baixarestoque).toBe(false);
  });

  it("campos de estoque sem moda (rows com null) recebem fallback false (D-07)", () => {
    const rows = Array(3).fill({ icms: null, controlaestoque: null, baixarestoque: null });
    const result = computeDefaults(rows);
    expect(result).not.toHaveProperty("icms");
    expect(result.controlaestoque).toBe(false);
    expect(result.baixarestoque).toBe(false);
  });

  it("nao inclui statusproduto nem vendeproduto no resultado (D-06)", () => {
    const rows = Array(5).fill({
      statusproduto: true,
      vendeproduto: true,
      icms: "12",
      controlaestoque: true,
      baixarestoque: true,
    });
    const result = computeDefaults(rows);
    expect(result).not.toHaveProperty("statusproduto");
    expect(result).not.toHaveProperty("vendeproduto");
  });

  it("nunca lanca excecao com rows de qualquer forma (DEFD-04)", () => {
    expect(() => computeDefaults([])).not.toThrow();
    expect(() => computeDefaults([{ icms: null, controlaestoque: null }])).not.toThrow();
    expect(() => computeDefaults([{ icms: "", controlaestoque: undefined as unknown as null }])).not.toThrow();
  });
});

describe("constantes e allowlists exportadas", () => {
  it("DEFAULTS_CACHE_TTL_MS e igual a 24h em ms", () => {
    expect(DEFAULTS_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("DEFAULTS_MIN_SAMPLE e igual a 5", () => {
    expect(DEFAULTS_MIN_SAMPLE).toBe(5);
  });

  it("FISCAL_FIELDS tem exatamente 13 campos", () => {
    expect(FISCAL_FIELDS).toHaveLength(13);
  });

  it("STOCK_FIELDS tem exatamente 2 campos", () => {
    expect(STOCK_FIELDS).toHaveLength(2);
  });

  it("FISCAL_FIELDS nao contem statusproduto nem vendeproduto (D-06)", () => {
    expect(FISCAL_FIELDS).not.toContain("statusproduto");
    expect(FISCAL_FIELDS).not.toContain("vendeproduto");
  });

  it("STOCK_FIELDS nao contem statusproduto nem vendeproduto (D-06)", () => {
    expect(STOCK_FIELDS).not.toContain("statusproduto");
    expect(STOCK_FIELDS).not.toContain("vendeproduto");
  });

  it("FISCAL_FIELDS contem os 13 campos esperados", () => {
    const expected = [
      "icms", "icmsnfe", "tributacao", "tributacaonfe",
      "codigocsosn", "codigocsosnnfe", "origem", "origemnfe",
      "tipoitem", "piscst", "cofinscst", "idcfopsaida", "ncm",
    ];
    expected.forEach((f) => expect(FISCAL_FIELDS).toContain(f));
  });

  it("STOCK_FIELDS contem controlaestoque e baixarestoque", () => {
    expect(STOCK_FIELDS).toContain("controlaestoque");
    expect(STOCK_FIELDS).toContain("baixarestoque");
  });
});
