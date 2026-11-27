// Checagem executavel da lista permitida e da decisao de acesso do proxy de propostas (Fase 55, T-55-39 e T-55-40).
// Requer Node >= 22.18 (type stripping de .ts). Uso: node apps/frontend/scripts/checar-propostas-rotas.mjs
import assert from "node:assert/strict";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  console.log("SKIP: requer Node >= 22.18 (type stripping)");
  process.exit(0);
}

const r = await import(new URL("../src/lib/propostas-rotas.ts", import.meta.url).href);

const U1 = "0b7e2a52-3c1d-4f6a-9d0e-5a1b2c3d4e5f";
const U2 = "9f8e7d6c-5b4a-4321-8abc-0123456789ab";

function caso(nome, fn) {
  fn();
  console.log(`OK ${nome}`);
}

const aceitos = [
  ["GET", []],
  ["POST", []],
  ["GET", ["produtos"]],
  ["GET", ["assinantes"]],
  ["GET", ["clientes", "123"]],
  ["GET", [U1]],
  ["PATCH", [U1]],
  ["POST", [U1, "itens"]],
  ["PATCH", [U1, "itens", U2]],
  ["DELETE", [U1, "itens", U2]],
  ["POST", [U1, "aplicar-percentual"]],
  ["POST", [U1, "gerar"]],
  ["POST", [U1, "recuperar"]],
  ["POST", [U1, "duplicar"]],
  ["PATCH", [U1, "status"]],
  ["GET", [U1, "pdf"]],
  ["GET", [U1, "previa"]],
];

for (const [metodo, segmentos] of aceitos) {
  caso(`aceita ${metodo} /${segmentos.join("/")}`, () => {
    assert.equal(r.rotaPropostaPermitida(metodo, segmentos), true);
  });
}

const recusados = [
  ["DELETE no uuid sozinho", "DELETE", [U1]],
  ["PUT no uuid", "PUT", [U1]],
  ["GET em uuid/itens", "GET", [U1, "itens"]],
  ["segmento ..", "GET", [".."]],
  ["segmento .. depois de uuid", "GET", [U1, ".."]],
  ["segmento com percentual", "GET", ["%2e%2e"]],
  ["uuid com percentual", "GET", [`${U1}%2f..`]],
  ["clientes/abc", "GET", ["clientes", "abc"]],
  ["clientes com 11 digitos", "GET", ["clientes", "12345678901"]],
  ["clientes sem id", "GET", ["clientes"]],
  ["uuid em maiuscula", "GET", [U1.toUpperCase()]],
  ["segmento com barra", "GET", ["a/b"]],
  ["segmento com ponto", "GET", ["produtos."]],
  ["segmento vazio", "GET", [""]],
  ["POST em produtos", "POST", ["produtos"]],
  ["DELETE em produtos", "DELETE", ["produtos"]],
  ["GET aplicar-percentual", "GET", [U1, "aplicar-percentual"]],
  ["PATCH item sem uuid de item", "PATCH", [U1, "itens", "abc"]],
  ["GET em uuid/gerar", "GET", [U1, "gerar"]],
  ["POST em uuid/pdf", "POST", [U1, "pdf"]],
  ["DELETE em uuid/previa", "DELETE", [U1, "previa"]],
  ["PUT em uuid/status", "PUT", [U1, "status"]],
  ["POST gerar com segmento extra", "POST", [U1, "gerar", "x"]],
  ["GET em uuid/recuperar", "GET", [U1, "recuperar"]],
  ["GET em uuid/duplicar", "GET", [U1, "duplicar"]],
  ["POST em uuid/status", "POST", [U1, "status"]],
  ["POST em uuid/previa", "POST", [U1, "previa"]],
  ["gerar sem uuid", "POST", ["abc", "gerar"]],
  ["pdf com uuid em maiuscula", "GET", [U1.toUpperCase(), "pdf"]],
  ["4 segmentos desconhecidos", "GET", [U1, "itens", U2, "extra"]],
  ["4 segmentos genericos", "GET", ["a", "b", "c", "d"]],
  ["metodo vazio", "", []],
];

for (const [nome, metodo, segmentos] of recusados) {
  caso(`recusa ${nome}`, () => {
    assert.equal(r.rotaPropostaPermitida(metodo, segmentos), false);
  });
}

caso("montarCaminhoBackend junta /propostas, segmentos e query validada", () => {
  assert.equal(r.montarCaminhoBackend([], ""), "/propostas");
  assert.equal(r.montarCaminhoBackend([], "?status=RASCUNHO&pagina=2"), "/propostas?status=RASCUNHO&pagina=2");
  assert.equal(r.montarCaminhoBackend([U1, "itens"], ""), `/propostas/${U1}/itens`);
  assert.equal(r.montarCaminhoBackend([], "?"), "/propostas");
  assert.equal(r.montarCaminhoBackend([], "?q=a b"), "/propostas");
  assert.equal(r.montarCaminhoBackend([], "?q=x#frag"), "/propostas");
});

// Familia de template (plano 55-15, T-55-46): so "ORCAMENTO" e "PROPOSTA" exatos passam.
for (const familia of ["ORCAMENTO", "PROPOSTA"]) {
  caso(`familiaTemplateValida aceita ${familia}`, () => {
    assert.equal(r.familiaTemplateValida(familia), familia);
  });
}

const familiasInvalidas = [
  ["minuscula proposta", "proposta"],
  ["minuscula orcamento", "orcamento"],
  ["vazio", ""],
  ["null", null],
  ["undefined", undefined],
  ["numero", 1],
  ["lista ORCAMENTO,PROPOSTA", "ORCAMENTO,PROPOSTA"],
  ["PROPOSTA com espaco", "PROPOSTA "],
  ["caminho ../x", "../x"],
  ["array", ["PROPOSTA"]],
];

for (const [nome, valor] of familiasInvalidas) {
  caso(`familiaTemplateValida recusa ${nome}`, () => {
    assert.equal(r.familiaTemplateValida(valor), null);
  });
}

const metodos = ["GET", "POST", "PATCH", "DELETE"];
const listado = { GET: [U1], POST: [U1, "itens"], PATCH: [U1], DELETE: [U1, "itens", U2] };
const naoListado = ["segredo", "outra", U1, "nada"];

for (const metodo of metodos) {
  caso(`decidirAcessoProxy ${metodo} sem sessao e 401 em caminho listado`, () => {
    const d = r.decidirAcessoProxy({ temSessao: false, metodo, segmentos: listado[metodo], search: "" });
    assert.equal(d.ok, false);
    assert.equal(d.status, 401);
    assert.ok(d.mensagem.length > 0);
  });
  caso(`decidirAcessoProxy ${metodo} sem sessao e 401 em caminho nao listado`, () => {
    const d = r.decidirAcessoProxy({ temSessao: false, metodo, segmentos: naoListado, search: "" });
    assert.equal(d.ok, false);
    assert.equal(d.status, 401);
  });
  caso(`decidirAcessoProxy ${metodo} com sessao e caminho listado devolve o caminho do backend`, () => {
    const d = r.decidirAcessoProxy({ temSessao: true, metodo, segmentos: listado[metodo], search: "" });
    assert.equal(d.ok, true);
    assert.equal(d.caminho, `/propostas/${listado[metodo].join("/")}`);
  });
  caso(`decidirAcessoProxy ${metodo} com sessao e caminho nao listado e 404`, () => {
    const d = r.decidirAcessoProxy({ temSessao: true, metodo, segmentos: naoListado, search: "" });
    assert.equal(d.ok, false);
    assert.equal(d.status, 404);
  });
}

caso("decidirAcessoProxy GET [uuid] resulta em /propostas/<uuid>", () => {
  const d = r.decidirAcessoProxy({ temSessao: true, metodo: "GET", segmentos: [U1], search: "" });
  assert.deepEqual(d, { ok: true, caminho: `/propostas/${U1}` });
});

caso("decidirAcessoProxy GET listagem repassa a query string", () => {
  const d = r.decidirAcessoProxy({ temSessao: true, metodo: "GET", segmentos: [], search: "?status=ENVIADA&q=escola" });
  assert.deepEqual(d, { ok: true, caminho: "/propostas?status=ENVIADA&q=escola" });
});

caso("decidirAcessoProxy sem sessao nunca repassa nem a query", () => {
  const d = r.decidirAcessoProxy({ temSessao: false, metodo: "GET", segmentos: [], search: "?q=x" });
  assert.equal(d.ok, false);
  assert.equal(d.status, 401);
});

console.log("Checagem das rotas de propostas concluida.");
