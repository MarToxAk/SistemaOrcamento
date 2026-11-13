// Checagem executavel dos filtros da pagina de boletos consolidados (Fase 47, D-08).
// Requer Node >= 22.18 (type stripping de .ts). Uso: node apps/frontend/scripts/checar-filtros-boletos.mjs
import assert from "node:assert/strict";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  console.log("SKIP: requer Node >= 22.18 (type stripping)");
  process.exit(0);
}

const f = await import(new URL("../src/app/contas-receber/_shared/filtros-boletos.ts", import.meta.url).href);

function caso(nome, fn) {
  fn();
  console.log(`OK ${nome}`);
}

const vazio = { status: "", situacao: "", de: "", ate: "", busca: "" };

function boleto(id, extra = {}) {
  return {
    id,
    status: "pendente",
    diasParaVencer: 5,
    expireAt: "2026-11-15",
    nomeCliente: "Cliente Teste",
    idclienteAthos: 1000 + id,
    ...extra,
  };
}

const ids = (lista) => lista.map((b) => b.id);

caso("lerFiltrosBoletos descarta status cancelado e data 2026-02-30", () => {
  const r = f.lerFiltrosBoletos({ status: "cancelado", de: "2026-02-30", ate: "2026-11-30" });
  assert.equal(r.status, "");
  assert.equal(r.de, "");
  assert.equal(r.ate, "2026-11-30");
});

caso("lerFiltrosBoletos aceita valores permitidos e limita a busca a 80 caracteres", () => {
  const r = f.lerFiltrosBoletos({ status: "pago", situacao: "atrasado", busca: `  ${"a".repeat(200)}  ` });
  assert.equal(r.status, "pago");
  assert.equal(r.situacao, "atrasado");
  assert.equal(r.busca.length, 80);
  assert.deepEqual(f.lerFiltrosBoletos({ situacao: "DROP", busca: null }), vazio);
});

caso("a_vencer inclui diasParaVencer 0 e 10 e exclui -1 e pago", () => {
  const lista = [
    boleto(1, { diasParaVencer: 0 }),
    boleto(2, { diasParaVencer: 10 }),
    boleto(3, { diasParaVencer: -1 }),
    boleto(4, { status: "pago", diasParaVencer: 3 }),
  ];
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, situacao: "a_vencer" })), [1, 2]);
});

caso("atrasado inclui -1 pendente e exclui -1 pago", () => {
  const lista = [boleto(1, { diasParaVencer: -1 }), boleto(2, { status: "pago", diasParaVencer: -1 }), boleto(3, { diasParaVencer: 0 })];
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, situacao: "atrasado" })), [1]);
});

caso("status pendente e pago filtram por igualdade", () => {
  const lista = [boleto(1), boleto(2, { status: "pago" })];
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, status: "pago" })), [2]);
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, status: "pendente" })), [1]);
});

caso("periodo 2026-11-01..2026-11-30 inclui 2026-11-30 e exclui 2026-12-01 e expireAt nulo", () => {
  const lista = [
    boleto(1, { expireAt: "2026-11-30" }),
    boleto(2, { expireAt: "2026-12-01" }),
    boleto(3, { expireAt: null }),
    boleto(4, { expireAt: "2026-11-01" }),
    boleto(5, { expireAt: "2026-10-31" }),
  ];
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, de: "2026-11-01", ate: "2026-11-30" })), [1, 4]);
});

caso("busca joao acha Joao da Silva com acento", () => {
  const lista = [boleto(1, { nomeCliente: "João da Silva" }), boleto(2, { nomeCliente: "Maria" })];
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, busca: "joao" })), [1]);
});

caso("busca 123 acha idclienteAthos 123", () => {
  const lista = [boleto(1, { idclienteAthos: 123 }), boleto(2, { idclienteAthos: 999 })];
  assert.deepEqual(ids(f.filtrarBoletos(lista, { ...vazio, busca: "123" })), [1]);
});

caso("sem filtros devolve a lista inteira na mesma ordem", () => {
  const lista = [boleto(3), boleto(1), boleto(2, { status: "pago" })];
  assert.deepEqual(ids(f.filtrarBoletos(lista, vazio)), [3, 1, 2]);
});
