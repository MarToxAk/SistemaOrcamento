// Checagem executavel das funcoes puras de URL e formatadores da area de contas a receber (Fase 47, D-04).
// Requer Node >= 22.18 (type stripping de .ts). Uso: node apps/frontend/scripts/checar-filtros-url.mjs
import assert from "node:assert/strict";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  console.log("SKIP: requer Node >= 22.18 (type stripping)");
  process.exit(0);
}

const f = await import(new URL("../src/app/contas-receber/_shared/filtros-url.ts", import.meta.url).href);
const fmt = await import(new URL("../src/app/contas-receber/_shared/formatadores.ts", import.meta.url).href);

function caso(nome, fn) {
  fn();
  console.log(`OK ${nome}`);
}

caso("lerOpcao aceita VEN e troca DROP pelo padrao", () => {
  const permitidos = ["", "AVC", "VEN", "REC", "CAN"];
  assert.equal(f.lerOpcao("VEN", permitidos, ""), "VEN");
  assert.equal(f.lerOpcao("DROP", permitidos, ""), "");
  assert.equal(f.lerOpcao(null, permitidos, "AVC"), "AVC");
});

caso("lerData aceita data real e rejeita invalidas", () => {
  assert.equal(f.lerData("2026-11-13"), "2026-11-13");
  assert.equal(f.lerData("2026-02-30"), "");
  assert.equal(f.lerData("13/11/2026"), "");
  assert.equal(f.lerData(null), "");
});

caso("lerTexto corta em 80 e faz trim", () => {
  assert.equal(f.lerTexto("  papelaria  "), "papelaria");
  assert.equal(f.lerTexto("a".repeat(200)).length, 80);
  assert.equal(f.lerTexto(undefined), "");
});

caso("lerInteiroPositivo rejeita 0, -3 e abc", () => {
  assert.equal(f.lerInteiroPositivo("0", 1), 1);
  assert.equal(f.lerInteiroPositivo("-3", 1), 1);
  assert.equal(f.lerInteiroPositivo("abc", 1), 1);
  assert.equal(f.lerInteiroPositivo("7", 1), 7);
});

caso("montarQuery remove vazios e mantem as demais chaves", () => {
  assert.equal(f.montarQuery("status=VEN&busca=x", { busca: null, de: "2026-11-01" }), "status=VEN&de=2026-11-01");
});

caso("montarQuery aceita ? inicial e remove valor vazio", () => {
  assert.equal(f.montarQuery("?a=1", { a: "" }), "");
});

caso("formatBRL formata em pt-BR", () => {
  assert.ok(fmt.formatBRL(1234.5).includes("1.234,50"));
});
