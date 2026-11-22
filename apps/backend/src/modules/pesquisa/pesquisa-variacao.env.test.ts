/**
 * Fase 52 (quick 261122-rlb): consistencia entre a flag PESQUISA_VARIACAO_IA no codigo e no deploy.
 * Os dois composes e o stack.env.example precisam declarar a flag com o mesmo padrao do codigo
 * (ligada por padrao), senao o container so enxerga o que o compose lista e codigo e deploy divergem.
 */
import * as fs from "fs";
import * as path from "path";

import { ENV_VARIACAO_IA, variacaoAtiva } from "./pesquisa-variacao";

// cinco niveis acima de apps/backend/src/modules/pesquisa ate a raiz do repositorio
const DEPLOY = path.resolve(__dirname, "../../../../../deploy");
const ler = (arquivo: string) => fs.readFileSync(path.join(DEPLOY, arquivo), "utf8");

const COMPOSES = ["docker-compose.box.vps.yml", "docker-compose.vps.yml"];

function contar(texto: string, regex: RegExp): number {
  return (texto.match(regex) ?? []).length;
}

describe("PESQUISA_VARIACAO_IA: codigo x deploy (quick 261122-rlb)", () => {
  it.each(COMPOSES)("%s tem exatamente uma linha PESQUISA_VARIACAO_IA com padrao true", (arquivo) => {
    const regex = new RegExp(`^\\s+PESQUISA_VARIACAO_IA:\\s+\\$\\{PESQUISA_VARIACAO_IA:-true\\}\\s*$`, "gm");
    expect(contar(ler(arquivo), regex)).toBe(1);
  });

  it("stack.env.example tem exatamente uma linha PESQUISA_VARIACAO_IA=true", () => {
    const regex = /^PESQUISA_VARIACAO_IA=true\s*$/gm;
    expect(contar(ler("stack.env.example"), regex)).toBe(1);
  });

  it("o padrao do codigo bate com o do deploy: variacaoAtiva sem env e true", () => {
    expect(variacaoAtiva(undefined)).toBe(true);
    expect(ENV_VARIACAO_IA).toBe("PESQUISA_VARIACAO_IA");
  });
});
