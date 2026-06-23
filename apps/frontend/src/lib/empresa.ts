// Constantes de empresa — lidas de NEXT_PUBLIC_EMPRESA_* (baked at build).
// Usado por todos os Client Components das 7 páginas-alvo.
// layout.tsx (Server Component) lê process.env diretamente — não importa daqui.

export const EMPRESA_NOME     = process.env.NEXT_PUBLIC_EMPRESA_NOME     ?? "Sistema de Orçamento";
export const EMPRESA_CNPJ     = process.env.NEXT_PUBLIC_EMPRESA_CNPJ     ?? "";
export const EMPRESA_ENDERECO = process.env.NEXT_PUBLIC_EMPRESA_ENDERECO ?? "";
export const EMPRESA_EMAIL    = process.env.NEXT_PUBLIC_EMPRESA_EMAIL    ?? "";
export const EMPRESA_LOGO_URL = process.env.NEXT_PUBLIC_EMPRESA_LOGO_URL ?? "/media/logo-primary.png";
export const EMPRESA_COR_PRIMARIA = process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd";
