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

// ---- Notas e clientes (Tarefa 2) ----

function nota(id, extra = {}) {
  return { id, tipo: "NFS-e", numero: String(id), nomeCliente: "Cliente", dataEmissao: "2026-11-01", ...extra };
}

caso("ordenarNotas data desc: mais recente primeiro e sem data por ultimo", () => {
  const lista = [
    nota(1, { tipo: "NFS-e", dataEmissao: "2026-11-10T15:00:00.000Z" }),
    nota(2, { tipo: "NF-e", dataEmissao: "2026-11-12" }),
    nota(3, { tipo: "NFS-e", dataEmissao: "2026-10-01T12:00:00.000Z" }),
    nota(4, { tipo: "NF-e", dataEmissao: null }),
  ];
  assert.deepEqual(ids(o.ordenarNotas(lista, { ordem: "data", dir: "desc" })), [2, 1, 3, 4]);
  assert.deepEqual(ids(o.ordenarNotas(lista, { ordem: "data", dir: "asc" })), [3, 1, 2, 4]);
});

caso("ordenarNotas nome asc sem acento e empate pela emissao mais recente", () => {
  const lista = [
    nota(1, { nomeCliente: "Fabio" }),
    nota(2, { nomeCliente: "Élcio", dataEmissao: "2026-10-01" }),
    nota(3, { nomeCliente: "Danilo" }),
    nota(4, { nomeCliente: "elcio", dataEmissao: "2026-11-05" }),
  ];
  assert.deepEqual(ids(o.ordenarNotas(lista, { ordem: "nome", dir: "asc" })), [3, 4, 2, 1]);
  assert.deepEqual(ids(o.ordenarNotas(lista, { ordem: "nome", dir: "desc" })), [1, 4, 2, 3]);
});

caso("ordenarNotas nao altera a lista de entrada", () => {
  const lista = [nota(2, { dataEmissao: "2026-11-02" }), nota(1, { dataEmissao: "2026-11-01" })];
  o.ordenarNotas(lista, { ordem: "data", dir: "asc" });
  assert.deepEqual(ids(lista), [2, 1]);
});

caso("notas nao tem pago nem nome na tela do cliente", () => {
  assert.deepEqual(o.lerOrdenacao("pago", null, o.CONFIG_NOTAS), { ordem: "data", dir: "desc" });
  assert.deepEqual(o.lerOrdenacao("nome", "asc", o.CONFIG_NOTAS_CLIENTE), { ordem: "data", dir: "desc" });
  assert.deepEqual(o.lerOrdenacao("nome", null, o.CONFIG_NOTAS), { ordem: "nome", dir: "asc" });
});

function cliente(idcliente, extra = {}) {
  return { idcliente, nome_cliente: `Cliente ${idcliente}`, total_devido: 0, total_atrasado: 0, total_pago: null, ...extra };
}

const idc = (lista) => lista.map((c) => c.idcliente);

caso("ordenarClientes padrao atrasado desc reproduz a ordem do backend", () => {
  const lista = [
    cliente(1, { total_atrasado: 200, total_devido: 300 }),
    cliente(2, { total_atrasado: 0, total_devido: 50 }),
    cliente(3, { total_atrasado: 200, total_devido: 900 }),
  ];
  assert.deepEqual(idc(o.ordenarClientes(lista, o.CONFIG_CLIENTES.padrao)), [3, 1, 2]);
});

caso("ordenarClientes devido desempata por atrasado decrescente", () => {
  const lista = [
    cliente(1, { total_devido: 100, total_atrasado: 10 }),
    cliente(2, { total_devido: 100, total_atrasado: 40 }),
    cliente(3, { total_devido: 500, total_atrasado: 0 }),
  ];
  assert.deepEqual(idc(o.ordenarClientes(lista, { ordem: "devido", dir: "desc" })), [3, 2, 1]);
  assert.deepEqual(idc(o.ordenarClientes(lista, { ordem: "devido", dir: "asc" })), [2, 1, 3]);
});

caso("ordenarClientes pago: quem pagou mais/menos, nulos por ultimo", () => {
  const lista = [
    cliente(1, { nome_cliente: "Beto", total_pago: 500 }),
    cliente(2, { nome_cliente: "Ana", total_pago: null }),
    cliente(3, { nome_cliente: "Caio", total_pago: 1200 }),
    cliente(4, { nome_cliente: "Abel", total_pago: undefined }),
  ];
  assert.deepEqual(idc(o.ordenarClientes(lista, { ordem: "pago", dir: "desc" })), [3, 1, 4, 2]);
  assert.deepEqual(idc(o.ordenarClientes(lista, { ordem: "pago", dir: "asc" })), [1, 3, 4, 2]);
});

caso("ordenarClientes nome ignora acento e maiuscula, empate por idcliente", () => {
  const lista = [
    cliente(5, { nome_cliente: "Zeca" }),
    cliente(4, { nome_cliente: "álvaro" }),
    cliente(2, { nome_cliente: "ALVARO" }),
    cliente(3, { nome_cliente: "Bruno" }),
  ];
  assert.deepEqual(idc(o.ordenarClientes(lista, { ordem: "nome", dir: "asc" })), [2, 4, 3, 5]);
  assert.deepEqual(idc(o.ordenarClientes(lista, { ordem: "nome", dir: "desc" })), [5, 3, 2, 4]);
});

caso("ordenarClientes nao altera a lista de entrada", () => {
  const lista = [cliente(2, { total_atrasado: 1 }), cliente(1, { total_atrasado: 9 })];
  o.ordenarClientes(lista, { ordem: "atrasado", dir: "desc" });
  assert.deepEqual(idc(lista), [2, 1]);
});

caso("toda config tem rotulos e padrao coerentes", () => {
  const configs = [o.CONFIG_BOLETOS, o.CONFIG_BOLETOS_CLIENTE, o.CONFIG_NOTAS, o.CONFIG_NOTAS_CLIENTE, o.CONFIG_CLIENTES];
  for (const c of configs) {
    assert.ok(c.permitidas.includes(c.padrao.ordem));
    for (const ordem of c.permitidas) {
      assert.ok(c.rotulos[ordem], `rotulo de ${ordem}`);
      assert.ok(c.rotulosDirecao[ordem].asc && c.rotulosDirecao[ordem].desc, `direcoes de ${ordem}`);
      assert.ok(c.direcaoInicial[ordem] === "asc" || c.direcaoInicial[ordem] === "desc");
    }
  }
});
