// Config da empresa — lida em RUNTIME no servidor (process.env, SEM NEXT_PUBLIC).
// Permite trocar nome/logo/cor/contato por empresa apenas via .env do container,
// sem rebuild da imagem do frontend. Usado por Server Components (ex: layout.tsx)
// e entregue aos Client Components via <EmpresaProvider> (ver empresa.tsx).

export type EmpresaConfig = {
  EMPRESA_NOME: string;
  EMPRESA_CNPJ: string;
  EMPRESA_ENDERECO: string;
  EMPRESA_EMAIL: string;
  EMPRESA_LOGO_URL: string;
  EMPRESA_COR_PRIMARIA: string;
};

export function getEmpresaConfig(): EmpresaConfig {
  return {
    EMPRESA_NOME: process.env.EMPRESA_NOME ?? "Sistema de Orçamento",
    EMPRESA_CNPJ: process.env.EMPRESA_CNPJ ?? "",
    EMPRESA_ENDERECO: process.env.EMPRESA_ENDERECO ?? "",
    EMPRESA_EMAIL: process.env.EMPRESA_EMAIL ?? "",
    EMPRESA_LOGO_URL: process.env.EMPRESA_LOGO_URL ?? "/media/logo-primary.png",
    EMPRESA_COR_PRIMARIA: process.env.EMPRESA_COR_PRIMARIA ?? "#0d6efd",
  };
}
