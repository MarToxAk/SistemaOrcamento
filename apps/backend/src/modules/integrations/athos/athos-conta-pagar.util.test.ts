import {
  buildContaPagarInsertParts,
  buildContaPagarUpdateParts,
  mapContaPagarRow,
  resolveContaPagarIdColumn,
} from "./athos-conta-pagar.util";

describe("resolveContaPagarIdColumn", () => {
  it("deve retornar idcontapagar quando presente", () => {
    const columns = new Set(["idcontapagar", "descricaoconta"]);
    expect(resolveContaPagarIdColumn(columns)).toBe("idcontapagar");
  });

  it("deve retornar id_contapagar como fallback", () => {
    const columns = new Set(["id_contapagar", "descricaoconta"]);
    expect(resolveContaPagarIdColumn(columns)).toBe("id_contapagar");
  });

  it("deve retornar id como ultimo fallback", () => {
    const columns = new Set(["id", "descricaoconta"]);
    expect(resolveContaPagarIdColumn(columns)).toBe("id");
  });

  it("deve retornar null quando nenhuma coluna identificadora presente", () => {
    const columns = new Set(["descricaoconta", "datavencimento"]);
    expect(resolveContaPagarIdColumn(columns)).toBeNull();
  });
});

describe("mapContaPagarRow", () => {
  it("deve mapear campos basicos corretamente", () => {
    const row = {
      idcontapagar: 15,
      descricaoconta: "Aluguel",
      datavencimento: "2026-06-30",
      valorconta: 4500,
      statusconta: "ABE",
    };
    const result = mapContaPagarRow(row);
    expect(result.idcontapagar).toBe(15);
    expect(result.descricaoconta).toBe("Aluguel");
    expect(result.datavencimento).toBe("2026-06-30");
    expect(result.valorconta).toBe(4500);
    expect(result.statusconta).toBe("ABE");
  });

  it("deve mapear novos campos: historicocontabil, agruparconta, idloja, idbudget", () => {
    const row = {
      idcontapagar: 20,
      descricaoconta: "Suzano",
      datavencimento: "2026-07-15",
      valorconta: 8200,
      historicocontabil: "Conta Suzano - papel couche",
      agruparconta: true,
      idloja: 1,
      idbudget: 2026,
    };
    const result = mapContaPagarRow(row);
    expect(result.historicocontabil).toBe("Conta Suzano - papel couche");
    expect(result.agruparconta).toBe(true);
    expect(result.idloja).toBe(1);
    expect(result.idbudget).toBe(2026);
  });

  it("deve mapear novos campos: recorrenciafornecedor, exibemsgrecorrencia, numeronota", () => {
    const row = {
      idcontapagar: 30,
      descricaoconta: "Papel A4",
      datavencimento: "2026-08-01",
      valorconta: 350,
      recorrenciafornecedor: true,
      exibemsgrecorrencia: false,
      numeronota: "NF-99887",
    };
    const result = mapContaPagarRow(row);
    expect(result.recorrenciafornecedor).toBe(true);
    expect(result.exibemsgrecorrencia).toBe(false);
    expect(result.numeronota).toBe("NF-99887");
  });

  it("deve retornar null para campos ausentes na row", () => {
    const row = { idcontapagar: 5, descricaoconta: "Teste", datavencimento: "2026-06-01", valorconta: 100 };
    const result = mapContaPagarRow(row);
    expect(result.historicocontabil).toBeNull();
    expect(result.idbudget).toBeNull();
    expect(result.recorrenciafornecedor).toBeNull();
    expect(result.numeronota).toBeNull();
  });

  it("deve normalizar boolean a partir de string '1'", () => {
    const row = { idcontapagar: 7, descricaoconta: "X", datavencimento: "2026-01-01", valorconta: 1, agruparconta: "1" };
    expect(mapContaPagarRow(row).agruparconta).toBe(true);
  });

  it("deve normalizar boolean a partir de string 'false'", () => {
    const row = { idcontapagar: 8, descricaoconta: "X", datavencimento: "2026-01-01", valorconta: 1, recorrenciafornecedor: "false" };
    expect(mapContaPagarRow(row).recorrenciafornecedor).toBe(false);
  });

  it("deve converter Date para ISO string em datavencimento", () => {
    const row = {
      idcontapagar: 9,
      descricaoconta: "X",
      datavencimento: new Date("2026-06-30T00:00:00.000Z"),
      valorconta: 100,
    };
    expect(String(mapContaPagarRow(row).datavencimento)).toBe("2026-06-30");
  });

  it("deve retornar idcontapagar como inteiro mesmo quando fornecido como string", () => {
    const row = { idcontapagar: "42", descricaoconta: "X", datavencimento: "2026-01-01", valorconta: "100.50" };
    const result = mapContaPagarRow(row);
    expect(result.idcontapagar).toBe(42);
    expect(result.valorconta).toBe(100.5);
  });
});

describe("buildContaPagarInsertParts", () => {
  it("deve construir partes de INSERT para campos basicos", () => {
    const columns = new Set(["descricaoconta", "datavencimento", "valorconta"]);
    const payload = { descricaoconta: "Aluguel", datavencimento: "2026-06-30", valorconta: 4500 };
    const { insertColumns, valueExpressions, params } = buildContaPagarInsertParts(columns, payload);
    expect(insertColumns).toContain('"descricaoconta"');
    expect(insertColumns).toContain('"datavencimento"');
    expect(insertColumns).toContain('"valorconta"');
    expect(params).toContain("Aluguel");
    expect(params).toContain(4500);
    expect(valueExpressions.some((e) => e.includes("CAST"))).toBe(true);
  });

  it("deve incluir historicocontabil quando coluna presente na tabela", () => {
    const columns = new Set(["descricaoconta", "datavencimento", "valorconta", "historicocontabil"]);
    const payload = {
      descricaoconta: "Suzano",
      datavencimento: "2026-07-01",
      valorconta: 8200,
      historicocontabil: "Conta Suzano - papel couche",
    };
    const { insertColumns, params } = buildContaPagarInsertParts(columns, payload);
    expect(insertColumns).toContain('"historicocontabil"');
    expect(params).toContain("Conta Suzano - papel couche");
  });

  it("deve omitir historicocontabil quando coluna nao existe na tabela", () => {
    const columns = new Set(["descricaoconta", "datavencimento", "valorconta"]);
    const payload = { descricaoconta: "X", datavencimento: "2026-07-01", valorconta: 100, historicocontabil: "Y" };
    const { insertColumns } = buildContaPagarInsertParts(columns, payload);
    expect(insertColumns).not.toContain('"historicocontabil"');
  });

  it("deve incluir idbudget e recorrenciafornecedor quando colunas presentes", () => {
    const columns = new Set(["descricaoconta", "datavencimento", "valorconta", "idbudget", "recorrenciafornecedor"]);
    const payload = {
      descricaoconta: "Papel",
      datavencimento: "2026-08-01",
      valorconta: 350,
      idbudget: 2026,
      recorrenciafornecedor: true,
    };
    const { insertColumns, params } = buildContaPagarInsertParts(columns, payload);
    expect(insertColumns).toContain('"idbudget"');
    expect(insertColumns).toContain('"recorrenciafornecedor"');
    expect(params).toContain(2026);
    expect(params).toContain(true);
  });

  it("deve retornar partes vazias quando nenhum campo do payload corresponde a colunas", () => {
    const columns = new Set(["campoinexistente"]);
    const payload = { descricaoconta: "X", datavencimento: "2026-01-01", valorconta: 1 };
    const { insertColumns, params } = buildContaPagarInsertParts(columns, payload);
    expect(insertColumns).toHaveLength(0);
    expect(params).toHaveLength(0);
  });

  it("deve omitir campo idcontapagar do INSERT (e de insertColumns)", () => {
    const columns = new Set(["idcontapagar", "descricaoconta", "datavencimento", "valorconta"]);
    const payload = { idcontapagar: 99, descricaoconta: "X", datavencimento: "2026-01-01", valorconta: 1 };
    const { insertColumns } = buildContaPagarInsertParts(columns, payload);
    expect(insertColumns).not.toContain('"idcontapagar"');
  });
});

describe("buildContaPagarUpdateParts", () => {
  it("deve construir assignments para campos basicos", () => {
    const columns = new Set(["statusconta", "valorpago", "datapagamento"]);
    const payload = { statusconta: "PAG", valorpago: 600, datapagamento: "2026-05-11" };
    const { assignments, params } = buildContaPagarUpdateParts(columns, payload);
    expect(assignments.some((a) => a.includes('"statusconta"'))).toBe(true);
    expect(assignments.some((a) => a.includes('"valorpago"'))).toBe(true);
    expect(params).toContain("PAG");
    expect(params).toContain(600);
  });

  it("deve construir assignments para novos campos agruparconta e idloja", () => {
    const columns = new Set(["agruparconta", "idloja", "idbudget", "recorrenciafornecedor"]);
    const payload = { agruparconta: false, idloja: 1, idbudget: 2026, recorrenciafornecedor: true };
    const { assignments, params } = buildContaPagarUpdateParts(columns, payload);
    expect(assignments.some((a) => a.includes('"agruparconta"'))).toBe(true);
    expect(assignments.some((a) => a.includes('"idloja"'))).toBe(true);
    expect(assignments.some((a) => a.includes('"recorrenciafornecedor"'))).toBe(true);
    expect(params).toContain(false);
    expect(params).toContain(1);
    expect(params).toContain(2026);
  });

  it("deve omitir campos do payload que nao existem na tabela", () => {
    const columns = new Set(["statusconta"]);
    const payload = { statusconta: "PAG", idbudget: 2026, historicocontabil: "X" };
    const { assignments } = buildContaPagarUpdateParts(columns, payload);
    expect(assignments.some((a) => a.includes('"statusconta"'))).toBe(true);
    expect(assignments.some((a) => a.includes('"idbudget"'))).toBe(false);
    expect(assignments.some((a) => a.includes('"historicocontabil"'))).toBe(false);
  });

  it("deve retornar assignments vazios quando nenhum campo corresponde", () => {
    const columns = new Set(["campoinexistente"]);
    const payload = { statusconta: "PAG" };
    const { assignments, params } = buildContaPagarUpdateParts(columns, payload);
    expect(assignments).toHaveLength(0);
    expect(params).toHaveLength(0);
  });

  it("deve omitir idcontapagar de assignments (nao pode ser atualizado)", () => {
    const columns = new Set(["idcontapagar", "statusconta"]);
    const payload = { idcontapagar: 99, statusconta: "PAG" };
    const { assignments } = buildContaPagarUpdateParts(columns, payload);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).not.toContain('"idcontapagar"');
  });

  it("deve gerar parametro com CAST para campos date", () => {
    const columns = new Set(["datapagamento"]);
    const payload = { datapagamento: "2026-05-11" };
    const { assignments } = buildContaPagarUpdateParts(columns, payload);
    expect(assignments[0]).toContain("CAST");
    expect(assignments[0]).toContain("AS date");
  });
});
