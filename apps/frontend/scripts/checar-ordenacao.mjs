// Checagem executavel da ordenacao das listas de contas a receber (Fase 48, D-01..D-08).
// Requer Node >= 22.18 (type stripping de .ts). Uso: node apps/frontend/scripts/checar-ordenacao.mjs
import assert from "node:assert/strict";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  console.log("SKIP: requer Node >= 22.18 (type stripping)");
  process.exit(0);
}

const o = await import(new URL("../src/app/contas-receber/_shared/ordenacao.ts", import.meta.url).href);

function caso(nome, fn) {
  fn();
  console.log(`OK ${nome}`);
}

const ids = (lista) => lista.map((x) => x.id);

function boleto(id, extra = {}) {
  return { id, status: "pendente", expireAt: "2026-11-15", nomeCliente: "Cliente", ...extra };
}

caso("lerOrdenacao valida, invalida e padrao", () => {
  assert.deepEqual(o.lerOrdenacao("data", "desc", o.CONFIG_BOLETOS), { ordem: "data", dir: "desc" });
  assert.deepEqual(o.lerOrdenacao("valor", "asc", o.CONFIG_BOLETOS), { ordem: "data", dir: "asc" });
  assert.deepEqual(o.lerOrdenacao("nome", "xyz", o.CONFIG_BOLETOS), { ordem: "nome", dir: "asc" });
  assert.deepEqual(o.lerOrdenacao(null, null, o.CONFIG_BOLETOS), { ordem: "data", dir: "asc" });
  assert.deepEqual(o.lerOrdenacao("pago", null, o.CONFIG_BOLETOS), { ordem: "pago", dir: "desc" });
  assert.deepEqual(o.lerOrdenacao("nome", null, o.CONFIG_BOLETOS_CLIENTE), { ordem: "data", dir: "asc" });
});

caso("ordenacaoParaUrl limpa o padrao e grava o resto", () => {
  assert.deepEqual(o.ordenacaoParaUrl({ ordem: "data", dir: "asc" }, o.CONFIG_BOLETOS), { ordem: null, dir: null });
  assert.deepEqual(o.ordenacaoParaUrl({ ordem: "nome", dir: "asc" }, o.CONFIG_BOLETOS), { ordem: "nome", dir: "asc" });
  assert.deepEqual(o.ordenacaoParaUrl({ ordem: "data", dir: "desc" }, o.CONFIG_BOLETOS), { ordem: "data", dir: "desc" });
});

caso("proximaOrdenacao inverte o mesmo criterio e usa a direcao inicial do outro", () => {
  const atual = { ordem: "data", dir: "asc" };
  assert.deepEqual(o.proximaOrdenacao(atual, "data", o.CONFIG_BOLETOS), { ordem: "data", dir: "desc" });
  assert.deepEqual(o.proximaOrdenacao(atual, "pago", o.CONFIG_BOLETOS), { ordem: "pago", dir: "desc" });
  assert.deepEqual(o.proximaOrdenacao(atual, "nome", o.CONFIG_BOLETOS), { ordem: "nome", dir: "asc" });
});

caso("compararTexto ignora acento e maiuscula", () => {
  assert.equal(o.compararTexto("água", "AGUA"), 0);
  const nomes = ["Zebra", "água", "Abacate", "Élcio"];
  assert.deepEqual([...nomes].sort(o.compararTexto), ["Abacate", "água", "Élcio", "Zebra"]);
});

const venc = [
  boleto(1, { expireAt: "2026-12-01" }),
  boleto(2, { expireAt: null }),
  boleto(3, { expireAt: "2026-10-01" }),
  boleto(4, { expireAt: "2026-11-14" }),
];

caso("ordenarBoletos data asc com atrasado no topo e sem vencimento por ultimo", () => {
  assert.deepEqual(ids(o.ordenarBoletos(venc, { ordem: "data", dir: "asc" })), [3, 4, 1, 2]);
});

caso("ordenarBoletos data desc mantem sem vencimento por ultimo", () => {
  assert.deepEqual(ids(o.ordenarBoletos(venc, { ordem: "data", dir: "desc" })), [1, 4, 3, 2]);
});

const nomes = [
  boleto(1, { nomeCliente: "Zebra" }),
  boleto(2, { nomeCliente: "água" }),
  boleto(3, { nomeCliente: "Abacate" }),
  boleto(4, { nomeCliente: "Élcio" }),
];

caso("ordenarBoletos nome asc e desc sem diferenciar acento", () => {
  assert.deepEqual(ids(o.ordenarBoletos(nomes, { ordem: "nome", dir: "asc" })), [3, 2, 4, 1]);
  assert.deepEqual(ids(o.ordenarBoletos(nomes, { ordem: "nome", dir: "desc" })), [1, 4, 2, 3]);
});

caso("ordenarBoletos nome desempata por vencimento crescente", () => {
  const lista = [
    boleto(1, { nomeCliente: "ÁGUA", expireAt: "2026-12-01" }),
    boleto(2, { nomeCliente: "agua", expireAt: "2026-11-01" }),
    boleto(3, { nomeCliente: "agua", expireAt: null }),
  ];
  assert.deepEqual(ids(o.ordenarBoletos(lista, { ordem: "nome", dir: "asc" })), [2, 1, 3]);
  assert.deepEqual(ids(o.ordenarBoletos(lista, { ordem: "nome", dir: "desc" })), [2, 1, 3]);
});

const situacao = [
  boleto(1, { status: "pendente", expireAt: "2026-11-20" }),
  boleto(2, { status: "pago", dataPagamento: "2026-11-01" }),
  boleto(3, { status: "pago", dataPagamento: null }),
  boleto(4, { status: "pendente", expireAt: "2026-10-05" }),
  boleto(5, { status: "pago", dataPagamento: "2026-11-10" }),
];

caso("ordenarBoletos pago desc: pagos (mais recente primeiro, sem data no fim) e depois pendentes", () => {
  assert.deepEqual(ids(o.ordenarBoletos(situacao, { ordem: "pago", dir: "desc" })), [5, 2, 3, 4, 1]);
});

caso("ordenarBoletos pago asc: pendentes por vencimento e depois pagos (mais antigo primeiro, sem data no fim)", () => {
  assert.deepEqual(ids(o.ordenarBoletos(situacao, { ordem: "pago", dir: "asc" })), [4, 1, 2, 5, 3]);
});

caso("ordenarBoletos nao altera a lista de entrada", () => {
  const antes = ids(situacao);
  o.ordenarBoletos(situacao, { ordem: "pago", dir: "desc" });
  o.ordenarBoletos(situacao, { ordem: "data", dir: "desc" });
  assert.deepEqual(ids(situacao), antes);
});
