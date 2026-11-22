/**
 * Fase 52 (plano 52-13): paridade entre a previa real do admin (frontend) e o render de producao.
 *
 * O frontend nao tem runner de testes (52-CONTEXT.md, linha 74), entao a funcao real de previa e
 * carregada daqui por um `require` calculado. Um import estatico faria o TypeScript incluir
 * `apps/frontend` no programa do backend e disparar TS6059 (o backend compila com `rootDir: ./`);
 * o `require` calculado mantem `tsc --noEmit -p apps/backend/tsconfig.json` limpo, enquanto o jest
 * transforma o modulo lido com o mesmo ts-jest.
 */
import * as path from "node:path";

import { montarVariaveisMensagem } from "./pesquisa-efeitos";
import { PLACEHOLDERS_VALIDOS, renderizarTexto, validarTextoMensagem } from "./pesquisa-regras";

type RenderizarPrevia = (modelo: string, variaveis: Record<string, string>) => string;

const { renderizarPrevia } = require(path.join(
  __dirname,
  "../../../../frontend/src/lib/pesquisa-admin",
)) as { renderizarPrevia: RenderizarPrevia };

const LINK_GOOGLE = "https://g.page/r/abc/review";

// (1) fechamento: mesmas chaves de `prepararFechamento` (link real + numeric + codigo/link_google vazios).
const mapaFechamento: Record<string, string> = {
  link: `https://app.test/pesquisa/${"a".repeat(48)}`,
  percentual: "10%",
  teto: "R$ 5,00",
  compra_minima: "R$ 30,00",
  validade: "22/12/2026",
  nome_empresa: "Bom Custo",
  codigo: "",
  link_google: "",
};

// (2) pos-resposta: exatamente a saida de `montarVariaveisMensagem` (sem `link`).
const mapaPosResposta = montarVariaveisMensagem({
  linkGoogle: LINK_GOOGLE,
  cupom: {
    codigo: "BC-7K3Q9M",
    percentual: 10,
    teto: 5,
    compraMinima: 30,
    validadeAte: new Date("2026-12-22T03:00:00Z"),
  },
  empresaNome: "Bom Custo",
  cfg: { percentualDesconto: 10, tetoDesconto: 5, compraMinima: 30, validadeCupomDias: 30 },
});

// (3) convite: so `link_google` e `nome_empresa` (mesmas chaves de `enviarConviteGoogle`).
const mapaConvite: Record<string, string> = {
  link_google: LINK_GOOGLE,
  nome_empresa: "Bom Custo",
};

const contextos: Array<{ nome: string; variaveis: Record<string, string>; aplicaveis: readonly string[] }> = [
  { nome: "fechamento", variaveis: mapaFechamento, aplicaveis: PLACEHOLDERS_VALIDOS },
  {
    nome: "pos-resposta",
    variaveis: mapaPosResposta,
    aplicaveis: PLACEHOLDERS_VALIDOS.filter((chave) => chave !== "link"),
  },
  { nome: "convite", variaveis: mapaConvite, aplicaveis: ["link_google", "nome_empresa"] },
];

describe("Fase 52 (plano 52-13): paridade prévia x produção", () => {
  describe.each(contextos)("contexto $nome", ({ variaveis, aplicaveis }) => {
    const aplicaveisSet = new Set(aplicaveis);

    it("T52-13e: prévia e produção coincidem para as chaves do mapa do contexto (caixa alta e baixa)", () => {
      for (const chave of PLACEHOLDERS_VALIDOS) {
        for (const grafia of [chave.toUpperCase(), chave]) {
          const modelo = `Texto {${grafia}} fim.`;
          if (aplicaveisSet.has(chave)) {
            expect(renderizarPrevia(modelo, variaveis)).toBe(renderizarTexto(modelo, variaveis));
          } else {
            // Chave fora do mapa do contexto: producao devolve vazio, a previa mantem o literal.
            expect(renderizarTexto(modelo, variaveis)).toBe("Texto  fim.");
            expect(renderizarPrevia(modelo, variaveis)).toBe(modelo);
          }
        }
      }
    });
  });

  it("T52-13e: os três placeholders do gap são aceitos e renderizam o valor real (prévia = produção)", () => {
    expect(validarTextoMensagem("fechamento", "Responda: {LINK}")).toBeNull();
    expect(renderizarTexto("Responda: {LINK}", mapaFechamento)).toContain(mapaFechamento.link);
    expect(renderizarPrevia("Responda: {LINK}", mapaFechamento)).toBe(
      renderizarTexto("Responda: {LINK}", mapaFechamento),
    );

    expect(validarTextoMensagem("posResposta", "Cupom {CODIGO} vale.")).toBeNull();
    expect(renderizarTexto("Cupom {CODIGO} vale.", mapaPosResposta)).toContain("BC-7K3Q9M");
    expect(renderizarPrevia("Cupom {CODIGO} vale.", mapaPosResposta)).toBe(
      renderizarTexto("Cupom {CODIGO} vale.", mapaPosResposta),
    );

    expect(validarTextoMensagem("convite", "Avalie em {LINK_GOOGLE}")).toBeNull();
    expect(renderizarTexto("Avalie em {LINK_GOOGLE}", mapaConvite)).toContain(LINK_GOOGLE);
    expect(renderizarPrevia("Avalie em {LINK_GOOGLE}", mapaConvite)).toBe(
      renderizarTexto("Avalie em {LINK_GOOGLE}", mapaConvite),
    );
  });

  it("T52-13f: placeholder desconhecido é recusado pela validação com a mensagem do contrato", () => {
    const esperado =
      "Campo {NAO_EXISTE} não existe. Use: link, percentual, teto, compra_minima, validade, codigo, link_google, nome_empresa.";
    expect(validarTextoMensagem("fechamento", "Responda: {LINK} {NAO_EXISTE}")).toBe(esperado);
    expect(validarTextoMensagem("posResposta", "Cupom {CODIGO} {NAO_EXISTE}")).toBe(esperado);
    expect(validarTextoMensagem("convite", "Avalie {LINK_GOOGLE} {NAO_EXISTE}")).toBe(esperado);
  });
});
