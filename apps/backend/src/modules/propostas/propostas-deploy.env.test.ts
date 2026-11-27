/**
 * Fase 55 (plano 55-16): contrato de deploy do kill-switch PROPOSTA_ESCRITA_ATIVA (D-30, D-07).
 * - O compose lista as variaveis explicitamente: sem o repasse o container de producao nunca a ve.
 * - A flag nasce DESLIGADA em todos os arquivos versionados; ligar e decisao humana (plano 55-12).
 * - Exatamente uma linha por arquivo: ausente ou duplicada e regressao de configuracao.
 */
import * as fs from "fs";
import * as path from "path";

// cinco niveis acima de apps/backend/src/modules/propostas ate a raiz do repositorio
const RAIZ = path.resolve(__dirname, "../../../../..");
const ler = (arquivo: string) => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");

const COMPOSES = ["deploy/docker-compose.vps.yml", "deploy/docker-compose.box.vps.yml"];
const EXEMPLOS = [".env.example", "deploy/stack.env.example"];
const TODOS = [...COMPOSES, ...EXEMPLOS];

function contar(texto: string, regex: RegExp): number {
  return (texto.match(regex) ?? []).length;
}

describe("Propostas: contrato de deploy da flag PROPOSTA_ESCRITA_ATIVA (Fase 55, plano 55-16)", () => {
  it.each(COMPOSES)("%s repassa PROPOSTA_ESCRITA_ATIVA exatamente uma vez com padrao false", (arquivo) => {
    const texto = ler(arquivo);
    const repasse = /^[ \t]+PROPOSTA_ESCRITA_ATIVA:[ \t]+\$\{PROPOSTA_ESCRITA_ATIVA:-false\}[ \t]*$/gm;
    expect(contar(texto, repasse)).toBe(1);
    // nenhuma outra linha de atribuicao da variavel (chave de ambiente) alem do repasse
    expect(contar(texto, /^[ \t]+PROPOSTA_ESCRITA_ATIVA[ \t]*:/gm)).toBe(1);
  });

  it.each(EXEMPLOS)("%s traz exatamente uma linha PROPOSTA_ESCRITA_ATIVA=false", (arquivo) => {
    const texto = ler(arquivo);
    expect(contar(texto, /^PROPOSTA_ESCRITA_ATIVA=false[ \t]*$/gm)).toBe(1);
    expect(contar(texto, /^[ \t]*PROPOSTA_ESCRITA_ATIVA[ \t]*=/gm)).toBe(1);
  });

  it.each(TODOS)("%s nao liga a flag em nenhuma atribuicao", (arquivo) => {
    const texto = ler(arquivo);
    // atribuicao com valor true (em env ou como padrao do compose); comentarios nao contam
    expect(contar(texto, /^[ \t]*PROPOSTA_ESCRITA_ATIVA[ \t]*=[ \t]*["']?true/gim)).toBe(0);
    expect(contar(texto, /^[ \t]*PROPOSTA_ESCRITA_ATIVA[ \t]*:[ \t]*["']?true/gim)).toBe(0);
    expect(contar(texto, /PROPOSTA_ESCRITA_ATIVA:-true/g)).toBe(0);
  });

  it.each(EXEMPLOS)("%s documenta que a flag e independente de ATHOS_ORCAMENTO_ESCRITA", (arquivo) => {
    const texto = ler(arquivo);
    expect(texto).toMatch(/INDEPENDENTE de ATHOS_ORCAMENTO_ESCRITA/);
    expect(texto).toMatch(/55-ROTEIRO-ATIVACAO\.md/);
  });
});
