/**
 * Fase 51 (plano 51-05): consistencia entre as constantes do codigo e as linhas de deploy.
 * Os dois composes e o stack.env.example precisam listar as cinco envs com os mesmos padroes do codigo,
 * senao o container so enxerga o que o compose lista e codigo e deploy divergem em silencio.
 */
import * as fs from "fs";
import * as path from "path";

import {
  ATRASO_FECHAMENTO_MAX_PADRAO_S,
  ATRASO_FECHAMENTO_MIN_PADRAO_S,
  CLIENTE_FREQUENTE_MESES_PADRAO,
  CLIENTE_FREQUENTE_MIN_PADRAO,
  ENV_CLIENTE_FREQUENTE_MESES,
  ENV_CLIENTE_FREQUENTE_MIN,
  ENV_ETIQUETAS_ATIVAS,
  ENV_FECHAMENTO_ATRASO_MAX_S,
  ENV_FECHAMENTO_ATRASO_MIN_S,
  etiquetasAtivas,
  lerAtrasoFechamentoS,
  lerLimiaresClienteFrequente,
} from "./chatwoot-etiquetas";

// seis niveis acima de apps/backend/src/modules/integrations/chatwoot ate a raiz do repositorio
const DEPLOY = path.resolve(__dirname, "../../../../../../deploy");
const ler = (arquivo: string) => fs.readFileSync(path.join(DEPLOY, arquivo), "utf8");

const ENVS: Array<[string, string]> = [
  [ENV_ETIQUETAS_ATIVAS, "true"],
  [ENV_CLIENTE_FREQUENTE_MIN, String(CLIENTE_FREQUENTE_MIN_PADRAO)],
  [ENV_CLIENTE_FREQUENTE_MESES, String(CLIENTE_FREQUENTE_MESES_PADRAO)],
  [ENV_FECHAMENTO_ATRASO_MIN_S, String(ATRASO_FECHAMENTO_MIN_PADRAO_S)],
  [ENV_FECHAMENTO_ATRASO_MAX_S, String(ATRASO_FECHAMENTO_MAX_PADRAO_S)],
];

const COMPOSES = ["docker-compose.box.vps.yml", "docker-compose.vps.yml"];

function contar(texto: string, regex: RegExp): number {
  return (texto.match(regex) ?? []).length;
}

describe("envs de etiquetas do Chatwoot: codigo x deploy (Fase 51)", () => {
  const combinacoes = COMPOSES.flatMap((arquivo) => ENVS.map(([nome, padrao]) => [arquivo, nome, padrao] as const));

  it.each(combinacoes)("%s tem exatamente uma linha %s: ${%s:-padrao do codigo}", (arquivo, nome, padrao) => {
    const regex = new RegExp(`^\\s+${nome}:\\s+\\$\\{${nome}:-${padrao}\\}\\s*$`, "gm");
    expect(contar(ler(arquivo), regex)).toBe(1);
  });

  it.each(ENVS)("stack.env.example tem exatamente uma linha %s=%s", (nome, padrao) => {
    const regex = new RegExp(`^${nome}=${padrao}\\s*$`, "gm");
    expect(contar(ler("stack.env.example"), regex)).toBe(1);
  });

  it("etiquetasAtivas sem env e true (padrao do deploy)", () => {
    expect(etiquetasAtivas(undefined)).toBe(true);
  });

  it("lerLimiaresClienteFrequente sem env e { min: 3, meses: 6 } (padrao do deploy)", () => {
    expect(lerLimiaresClienteFrequente(() => undefined)).toEqual({ min: 3, meses: 6 });
  });

  it("lerAtrasoFechamentoS sem env e { minS: 45, maxS: 180 } (padrao do deploy)", () => {
    expect(lerAtrasoFechamentoS(() => undefined)).toEqual({ minS: 45, maxS: 180 });
  });
});
