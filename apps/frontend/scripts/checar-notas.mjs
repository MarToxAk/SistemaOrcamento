// Checagem executavel das funcoes puras de notas fiscais (Fase 47, D-10..D-12).
// Requer Node >= 22.18 (type stripping de .ts). Uso: node apps/frontend/scripts/checar-notas.mjs
import assert from "node:assert/strict";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  console.log("SKIP: requer Node >= 22.18 (type stripping)");
  process.exit(0);
}

const n = await import(new URL("../src/app/contas-receber/_shared/notas-util.ts", import.meta.url).href);

function caso(nome, fn) {
  fn();
  console.log(`OK ${nome}`);
}

caso("LIMITE_NOTAS_ZIP e 50", () => {
  assert.equal(n.LIMITE_NOTAS_ZIP, 50);
});

caso("chaveNota gera a chave dos dois tipos", () => {
  assert.equal(n.chaveNota({ tipo: "NFS-e", id: 74 }), "nfse:74");
  assert.equal(n.chaveNota({ tipo: "NF-e", cobrancaBoletoId: 45, numero: "4521" }), "nfe:45:4521");
});

caso("montarPayloadZip separa os tipos e remove repetidos", () => {
  const payload = n.montarPayloadZip([
    { tipo: "NFS-e", id: 1 },
    { tipo: "NF-e", cobrancaBoletoId: 45, numero: "4521" },
    { tipo: "NFS-e", id: 1 },
    { tipo: "NFS-e", id: 2 },
    { tipo: "NF-e", cobrancaBoletoId: 45, numero: "4521" },
    { tipo: "NF-e", cobrancaBoletoId: 45, numero: "4522" },
  ]);
  assert.deepEqual(payload, {
    nfseIds: [1, 2],
    nfe: [
      { cobrancaBoletoId: 45, numero: "4521" },
      { cobrancaBoletoId: 45, numero: "4522" },
    ],
  });
});

caso("extrairNomeArquivo le filename entre aspas", () => {
  assert.equal(n.extrairNomeArquivo('attachment; filename="NFSe-239.xml"', "x"), "NFSe-239.xml");
});

caso("extrairNomeArquivo le filename* UTF-8", () => {
  assert.equal(n.extrairNomeArquivo("attachment; filename*=UTF-8''Relat%C3%B3rio.zip", "x"), "Relatório.zip");
});

caso("extrairNomeArquivo ignora diretorios (../../a/b.zip -> b.zip)", () => {
  assert.equal(n.extrairNomeArquivo('attachment; filename="../../a/b.zip"', "x"), "b.zip");
  assert.equal(n.extrairNomeArquivo('attachment; filename="C:\\temp\\c.pdf"', "x"), "c.pdf");
});

caso("extrairNomeArquivo remove caracteres de controle", () => {
  assert.equal(n.extrairNomeArquivo('attachment; filename="a\u0000b\nc.xml"', "x"), "abc.xml");
});

caso("extrairNomeArquivo com cabecalho nulo ou vazio devolve o padrao", () => {
  assert.equal(n.extrairNomeArquivo(null, "padrao.pdf"), "padrao.pdf");
  assert.equal(n.extrairNomeArquivo('attachment; filename=""', "padrao.pdf"), "padrao.pdf");
  assert.equal(n.extrairNomeArquivo('attachment; filename="../"', "padrao.pdf"), "padrao.pdf");
});

caso("mensagemErroDownload 404 com mensagem do backend e xmlIndisponivel", () => {
  const mensagem = n.mensagemErroDownload(404, { message: "XML indisponível para a NFS-e 239: sem XML salvo." });
  assert.ok(mensagem.includes("XML indisponível"));
  assert.equal(n.xmlIndisponivel(404, mensagem), true);
  assert.equal(n.xmlIndisponivel(500, mensagem), false);
  assert.equal(n.xmlIndisponivel(404, "Nota não encontrada."), false);
});

caso("mensagemErroDownload cobre 401, status 0, lista de mensagens e padroes", () => {
  assert.ok(n.mensagemErroDownload(401, null).includes("Sessão de administrador"));
  assert.equal(n.mensagemErroDownload(0, null), "Falha na conexão.");
  assert.equal(n.mensagemErroDownload(400, { message: ["a", "b"] }), "a; b");
  assert.equal(n.mensagemErroDownload(400, { error: "Selecione ao menos uma nota." }), "Selecione ao menos uma nota.");
  assert.equal(n.mensagemErroDownload(404, null), "Arquivo indisponível.");
  assert.equal(n.mensagemErroDownload(500, null), "Erro ao baixar (HTTP 500).");
});

caso("filtrarNotasExibicao filtra por tipo e busca sem acento", () => {
  const lista = [
    { tipo: "NFS-e", numero: "239", nomeCliente: "JOÃO LTDA", idclienteAthos: 10 },
    { tipo: "NF-e", numero: "4521", nomeCliente: "Maria Papelaria", idclienteAthos: 20 },
  ];
  const soNfe = n.filtrarNotasExibicao(lista, { tipo: "nfe", busca: "" });
  assert.deepEqual(soNfe.map((x) => x.numero), ["4521"]);
  const joao = n.filtrarNotasExibicao(lista, { tipo: "", busca: "joao" });
  assert.deepEqual(joao.map((x) => x.nomeCliente), ["JOÃO LTDA"]);
  assert.equal(n.filtrarNotasExibicao(lista, { tipo: "", busca: "4521" }).length, 1);
  assert.equal(n.filtrarNotasExibicao(lista, { tipo: "", busca: "20" }).length, 1);
  assert.equal(n.filtrarNotasExibicao(lista, { tipo: "nfse", busca: "maria" }).length, 0);
  assert.equal(n.filtrarNotasExibicao(lista, { tipo: "", busca: "" }).length, 2);
});

caso("paginar 120 itens na pagina 3 com 50 por pagina devolve 20 itens e 3 paginas", () => {
  const lista = Array.from({ length: 120 }, (_, i) => i);
  const r = n.paginar(lista, 3, 50);
  assert.equal(r.itens.length, 20);
  assert.equal(r.totalPaginas, 3);
  assert.equal(r.pagina, 3);
});

caso("paginar leva pagina fora do intervalo para a mais proxima e aceita lista vazia", () => {
  const lista = Array.from({ length: 120 }, (_, i) => i);
  assert.equal(n.paginar(lista, 99, 50).pagina, 3);
  assert.equal(n.paginar(lista, 0, 50).pagina, 1);
  assert.equal(n.paginar(lista, Number.NaN, 50).pagina, 1);
  const vazia = n.paginar([], 5, 50);
  assert.deepEqual(vazia, { itens: [], totalPaginas: 1, pagina: 1 });
});

caso("formatarDataEmissao nao desloca data pura e trata nulos", () => {
  assert.equal(n.formatarDataEmissao("2026-11-13"), "13/11/2026");
  assert.equal(n.formatarDataEmissao(null), "—");
  assert.equal(n.formatarDataEmissao("lixo"), "—");
});
