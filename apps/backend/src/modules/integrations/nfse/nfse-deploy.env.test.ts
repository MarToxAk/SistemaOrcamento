/**
 * Fase 54 (plano 54-09): contrato de deploy da NFS-e.
 * - NFSE_OVERRIDE_PASSWORD precisa ser repassada ao container pelos composes (senao o container nunca a ve)
 *   e aparecer sempre VAZIA nos arquivos versionados (D-09: a senha so existe no ambiente de deploy).
 * - As variaveis do emissor iiBrasil (descontinuado, D-11) nao podem voltar aos arquivos de deploy/env.
 * - As variaveis NFSE_NACIONAL_* continuam presentes (regressao protegida).
 */
import * as fs from "fs";
import * as path from "path";

// seis niveis acima de apps/backend/src/modules/integrations/nfse ate a raiz do repositorio
const RAIZ = path.resolve(__dirname, "../../../../../..");
const ler = (arquivo: string) => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");

const COMPOSES = ["deploy/docker-compose.vps.yml", "deploy/docker-compose.box.vps.yml"];
const EXEMPLOS = ["deploy/stack.env.example", ".env.example"];
const TODOS = [...COMPOSES, ...EXEMPLOS];

const NACIONAIS = [
  "NFSE_NACIONAL_CERT_PEM",
  "NFSE_NACIONAL_KEY_PEM",
  "NFSE_NACIONAL_CNPJ_PRESTADOR",
  "NFSE_NACIONAL_CODIGO_MUNICIPIO",
  "NFSE_NACIONAL_AMBIENTE",
];

// nomes legados do iiBrasil (token, CNPJ do prestador legado, inscricao municipal, URL SOAP, URL auxiliar)
const LEGADAS = ["NFSE_TOKEN", "NFSE_CNPJ_PRESTADOR", "NFSE_INSCRICAO_MUNICIPAL", "NFSE_SOAP_URL", "NFSE_AUX_URL"];

function contar(texto: string, regex: RegExp): number {
  return (texto.match(regex) ?? []).length;
}

describe("NFS-e: contrato de deploy (Fase 54, plano 54-09)", () => {
  it.each(COMPOSES)("%s repassa NFSE_OVERRIDE_PASSWORD exatamente uma vez com padrao vazio", (arquivo) => {
    const texto = ler(arquivo);
    const repasse = /^\s+NFSE_OVERRIDE_PASSWORD:\s+\$\{NFSE_OVERRIDE_PASSWORD:-\}\s*$/gm;
    expect(contar(texto, repasse)).toBe(1);
    // nenhuma outra linha pode atribuir valor literal a variavel
    expect(contar(texto, /NFSE_OVERRIDE_PASSWORD/g)).toBe(2); // chave + referencia ${...}
  });

  it.each(EXEMPLOS)("%s traz exatamente uma linha NFSE_OVERRIDE_PASSWORD= com valor vazio", (arquivo) => {
    const texto = ler(arquivo);
    expect(contar(texto, /^NFSE_OVERRIDE_PASSWORD=[ \t]*$/gm)).toBe(1);
    // nenhuma atribuicao com valor (comentarios nao contam)
    expect(contar(texto, /^[ \t]*NFSE_OVERRIDE_PASSWORD[ \t]*[=:][ \t]*\S+/gm)).toBe(0);
  });

  it.each(TODOS)("%s nao contem variaveis legadas do iiBrasil nem o dominio do provedor", (arquivo) => {
    const texto = ler(arquivo);
    for (const nome of LEGADAS) {
      expect(contar(texto, new RegExp(`\\b${nome}\\b`, "g"))).toBe(0);
    }
    expect(texto.toLowerCase()).not.toContain("iibr.com.br");
    expect(texto.toLowerCase()).not.toContain("iibrasil");
  });

  it.each(["deploy/docker-compose.vps.yml", "deploy/docker-compose.box.vps.yml", "deploy/stack.env.example"])(
    "%s mantem as cinco variaveis NFSE_NACIONAL_*",
    (arquivo) => {
      const texto = ler(arquivo);
      for (const nome of NACIONAIS) {
        expect(texto).toMatch(new RegExp(`\\b${nome}\\b`));
      }
    },
  );

  it(".env.example documenta o bloco NFSE_NACIONAL_* sem segredos", () => {
    const texto = ler(".env.example");
    expect(contar(texto, /^NFSE_NACIONAL_CERT_PEM=[ \t]*$/gm)).toBe(1);
    expect(contar(texto, /^NFSE_NACIONAL_KEY_PEM=[ \t]*$/gm)).toBe(1);
    for (const nome of NACIONAIS) {
      expect(texto).toMatch(new RegExp(`^${nome}=`, "m"));
    }
  });
});
