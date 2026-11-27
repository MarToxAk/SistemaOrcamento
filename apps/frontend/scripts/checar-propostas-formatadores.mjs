// Checagem executavel dos formatadores e das regras de estado de tela da area de propostas (Fase 55, T-55-42).
// Requer Node >= 22.18 (type stripping de .ts). Uso: node apps/frontend/scripts/checar-propostas-formatadores.mjs
import assert from "node:assert/strict";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  console.log("SKIP: requer Node >= 22.18 (type stripping)");
  process.exit(0);
}

const f = await import(new URL("../src/app/propostas/_shared/formatadores.ts", import.meta.url).href);

function caso(nome, fn) {
  fn();
  console.log(`OK ${nome}`);
}

// formatarDinheiro
const dinheiro = [
  ["3.85", "R$ 3,85"],
  ["0", "R$ 0,00"],
  ["1234567.89", "R$ 1.234.567,89"],
  ["-3.45", "-R$ 3,45"],
  ["3.456", "R$ 3,46"],
  ["0.005", "R$ 0,01"],
  ["999.999", "R$ 1.000,00"],
  ["-0.001", "R$ 0,00"],
  ["", "—"],
  ["abc", "—"],
  ["1,5", "—"],
  ["1.2.3", "—"],
];
for (const [entrada, esperado] of dinheiro) {
  caso(`formatarDinheiro ${JSON.stringify(entrada)} = ${esperado}`, () => {
    assert.equal(f.formatarDinheiro(entrada), esperado);
  });
}
caso("formatarDinheiro null e undefined = —", () => {
  assert.equal(f.formatarDinheiro(null), "—");
  assert.equal(f.formatarDinheiro(undefined), "—");
});

// formatarQuantidade
const quantidades = [
  ["2.000", "2"],
  ["1.500", "1,5"],
  ["0.250", "0,25"],
  ["10000.000", "10.000"],
  ["0.000", "0"],
  ["", "—"],
  ["x", "—"],
];
for (const [entrada, esperado] of quantidades) {
  caso(`formatarQuantidade ${JSON.stringify(entrada)} = ${esperado}`, () => {
    assert.equal(f.formatarQuantidade(entrada), esperado);
  });
}

// formatarMargem
const margens = [
  ["66.675", "66,7%"],
  ["-3.448", "-3,4%"],
  ["0.000", "0,0%"],
  ["-0.04", "0,0%"],
  ["99.95", "100,0%"],
  [null, "—"],
  ["invalido", "—"],
  ["", "—"],
];
for (const [entrada, esperado] of margens) {
  caso(`formatarMargem ${JSON.stringify(entrada)} = ${esperado}`, () => {
    assert.equal(f.formatarMargem(entrada), esperado);
  });
}

// rotuloStatus e classeStatus
const status = [
  ["RASCUNHO", "Rascunho", "bg-secondary"],
  ["LANCANDO", "Lançando", "bg-warning text-dark"],
  ["ENVIADA", "Enviada", "bg-primary"],
  ["FECHADA", "Fechada", "bg-success"],
  ["CANCELADA", "Cancelada", "bg-danger"],
];
for (const [s, rotulo, classe] of status) {
  caso(`rotuloStatus ${s}`, () => assert.equal(f.rotuloStatus(s), rotulo));
  caso(`classeStatus ${s}`, () => assert.equal(f.classeStatus(s), classe));
}
caso("rotuloStatus desconhecido devolve o texto recebido", () => {
  assert.equal(f.rotuloStatus("OUTRO"), "OUTRO");
  assert.equal(f.rotuloStatus("constructor"), "constructor");
});
caso("classeStatus desconhecido e neutra", () => {
  assert.equal(f.classeStatus("OUTRO"), "bg-light text-dark border");
  assert.notEqual(f.classeStatus("OUTRO"), f.classeStatus("CANCELADA"));
});

// mensagemDeErro
caso("mensagemDeErro prefere mensagem", () => {
  assert.equal(f.mensagemDeErro({ mensagem: "m", error: "e" }, "p"), "m");
});
caso("mensagemDeErro usa error quando nao ha mensagem", () => {
  assert.equal(f.mensagemDeErro({ error: "e" }, "p"), "e");
});
caso("mensagemDeErro cai no padrao para nulo, texto e sem campos", () => {
  assert.equal(f.mensagemDeErro(null, "p"), "p");
  assert.equal(f.mensagemDeErro(undefined, "p"), "p");
  assert.equal(f.mensagemDeErro("texto", "p"), "p");
  assert.equal(f.mensagemDeErro({}, "p"), "p");
  assert.equal(f.mensagemDeErro({ mensagem: "" }, "p"), "p");
  assert.equal(f.mensagemDeErro({ mensagem: 42 }, "p"), "p");
});

// podeEditar (D-08): so RASCUNHO exato
caso("podeEditar aceita RASCUNHO", () => assert.equal(f.podeEditar("RASCUNHO"), true));
for (const s of ["LANCANDO", "ENVIADA", "FECHADA", "CANCELADA", "rascunho", "Rascunho", " RASCUNHO", "", null, undefined]) {
  caso(`podeEditar recusa ${JSON.stringify(s)}`, () => assert.equal(f.podeEditar(s), false));
}

// linhaEstado (D-13): so traduz a flag do servidor
caso("linhaEstado flag verdadeira destaca", () => {
  assert.deepEqual(f.linhaEstado({ abaixoDoCusto: true }), { classe: "table-danger", alerta: "Preço abaixo do custo" });
});
caso("linhaEstado flag falsa nao destaca", () => {
  assert.deepEqual(f.linhaEstado({ abaixoDoCusto: false }), { classe: "", alerta: null });
});
caso("linhaEstado flag nula nao destaca", () => {
  assert.deepEqual(f.linhaEstado({ abaixoDoCusto: null }), { classe: "", alerta: null });
});
caso("linhaEstado flag ausente nao destaca", () => {
  assert.deepEqual(f.linhaEstado({}), { classe: "", alerta: null });
});
caso("linhaEstado preco igual ao custo (margem 0, flag falsa) nao destaca", () => {
  const item = { abaixoDoCusto: false, precoUnitario: "2.00", custoUnitario: "2.00", margemPercentual: "0.000" };
  assert.deepEqual(f.linhaEstado(item), { classe: "", alerta: null });
});
caso("linhaEstado nao recalcula: preco menor que custo com flag falsa nao destaca", () => {
  const item = { abaixoDoCusto: false, precoUnitario: "1.00", custoUnitario: "2.00", margemPercentual: "-100.000" };
  assert.deepEqual(f.linhaEstado(item), { classe: "", alerta: null });
});
caso("linhaEstado nunca devolve indicador de bloqueio", () => {
  const r = f.linhaEstado({ abaixoDoCusto: true });
  assert.deepEqual(Object.keys(r).sort(), ["alerta", "classe"]);
});

// podeGerar (D-07): ciencia + assinante preenchido + nenhuma chamada pendente
caso("podeGerar com ciencia, assinante e sem chamada pendente habilita", () => {
  assert.equal(f.podeGerar({ ciencia: true, assinanteNome: "Maria", pendente: false }), true);
});
caso("podeGerar sem ciencia nao habilita", () => {
  assert.equal(f.podeGerar({ ciencia: false, assinanteNome: "Maria", pendente: false }), false);
});
caso("podeGerar com assinante vazio nao habilita", () => {
  assert.equal(f.podeGerar({ ciencia: true, assinanteNome: "", pendente: false }), false);
});
caso("podeGerar com assinante so de espacos nao habilita", () => {
  assert.equal(f.podeGerar({ ciencia: true, assinanteNome: "   ", pendente: false }), false);
});
caso("podeGerar com chamada pendente nao habilita", () => {
  assert.equal(f.podeGerar({ ciencia: true, assinanteNome: "Maria", pendente: true }), false);
});
caso("podeGerar com assinante nao textual nao habilita", () => {
  assert.equal(f.podeGerar({ ciencia: true, assinanteNome: undefined, pendente: false }), false);
});

// acoesDisponiveis: a acao one-way "gerar" so existe em RASCUNHO
caso("acoesDisponiveis RASCUNHO", () => {
  assert.deepEqual(f.acoesDisponiveis("RASCUNHO", false), ["previa", "gerar", "cancelar"]);
  assert.deepEqual(f.acoesDisponiveis("RASCUNHO", true), ["previa", "gerar", "cancelar"]);
});
caso("acoesDisponiveis LANCANDO", () => {
  assert.deepEqual(f.acoesDisponiveis("LANCANDO", false), ["recuperar"]);
  assert.deepEqual(f.acoesDisponiveis("LANCANDO", true), ["recuperar"]);
});
caso("acoesDisponiveis ENVIADA com PDF", () => {
  assert.deepEqual(f.acoesDisponiveis("ENVIADA", true), ["pdf", "duplicar", "fechar", "cancelar"]);
});
caso("acoesDisponiveis ENVIADA sem PDF omite pdf", () => {
  assert.deepEqual(f.acoesDisponiveis("ENVIADA", false), ["duplicar", "fechar", "cancelar"]);
});
for (const s of ["FECHADA", "CANCELADA"]) {
  caso(`acoesDisponiveis ${s} com PDF`, () => assert.deepEqual(f.acoesDisponiveis(s, true), ["pdf", "duplicar"]));
  caso(`acoesDisponiveis ${s} sem PDF omite pdf`, () => assert.deepEqual(f.acoesDisponiveis(s, false), ["duplicar"]));
}
for (const s of ["OUTRO", "", null, undefined, "rascunho", "Rascunho", " RASCUNHO"]) {
  caso(`acoesDisponiveis status desconhecido ${JSON.stringify(s)} = lista vazia`, () => {
    assert.deepEqual(f.acoesDisponiveis(s, true), []);
    assert.deepEqual(f.acoesDisponiveis(s, false), []);
  });
}
caso("acoesDisponiveis: gerar nao esta em nenhum status alem de RASCUNHO", () => {
  for (const s of ["LANCANDO", "ENVIADA", "FECHADA", "CANCELADA", "OUTRO", "", null, undefined, "rascunho"]) {
    for (const pdf of [true, false]) {
      assert.equal(f.acoesDisponiveis(s, pdf).includes("gerar"), false, `gerar em ${JSON.stringify(s)}`);
    }
  }
  assert.equal(f.acoesDisponiveis("RASCUNHO", false).includes("gerar"), true);
});
