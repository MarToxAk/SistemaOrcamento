import { REQUIRED_ENV_VARS, validateEnv } from "./env-validation";

// Variavel legada do token do provedor iiBrasil (D-11): nao e mais obrigatoria.
const LEGACY_IIBRASIL_TOKEN_VAR = ["NFSE", "TOKEN"].join("_");

function configCompleta(): Record<string, unknown> {
  return {
    DATABASE_URL: "postgresql://x",
    INTERNAL_API_KEY: "k",
    CHATWOOT_BASE_URL: "https://chatwoot.example",
    CHATWOOT_API_TOKEN: "t",
    CHATWOOT_ACCOUNT_ID: "1",
    ATHOS_SISTEMA_USUARIO_ID: "1",
    EMPRESA_NOME: "Empresa",
    EMPRESA_CNPJ: "00000000000000",
    EMPRESA_ENDERECO: "Rua X",
    EMPRESA_MUNICIPIO_IBGE: "3520400",
  };
}

describe("validateEnv", () => {
  it("passa e devolve o proprio objeto sem a variavel legada do token iiBrasil", () => {
    const config = configCompleta();
    expect(config[LEGACY_IIBRASIL_TOKEN_VAR]).toBeUndefined();
    expect(validateEnv(config)).toBe(config);
  });

  it("REQUIRED_ENV_VARS nao contem a variavel legada do token iiBrasil", () => {
    expect((REQUIRED_ENV_VARS as readonly string[]).includes(LEGACY_IIBRASIL_TOKEN_VAR)).toBe(false);
  });

  it("lanca erro quando DATABASE_URL esta ausente", () => {
    const config = configCompleta();
    delete config.DATABASE_URL;
    expect(() => validateEnv(config)).toThrow(
      "Missing required environment variables: DATABASE_URL — See .env.example for EMPRESA_* setup instructions",
    );
  });

  it("trata valor so com espacos como ausente", () => {
    const config = { ...configCompleta(), DATABASE_URL: "   " };
    expect(() => validateEnv(config)).toThrow("Missing required environment variables: DATABASE_URL");
  });

  it("lista todas as variaveis faltantes separadas por virgula", () => {
    const config = configCompleta();
    delete config.DATABASE_URL;
    delete config.EMPRESA_NOME;
    expect(() => validateEnv(config)).toThrow(
      "Missing required environment variables: DATABASE_URL, EMPRESA_NOME",
    );
  });
});
