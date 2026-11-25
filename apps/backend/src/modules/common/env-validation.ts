// Validacao das variaveis de ambiente obrigatorias no boot.
// A variavel do token do provedor iiBrasil (emissor SOAP descontinuado) foi
// removida da lista (fase 54, D-11).
export const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "ATHOS_SISTEMA_USUARIO_ID",
  "EMPRESA_NOME",
  "EMPRESA_CNPJ",
  "EMPRESA_ENDERECO",
  "EMPRESA_MUNICIPIO_IBGE",
] as const;

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")} — See .env.example for EMPRESA_* setup instructions`,
    );
  }

  return config;
}
