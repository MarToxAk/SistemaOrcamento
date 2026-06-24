"use client";

// Contexto da empresa para Client Components. Os valores vêm do servidor
// (getEmpresaConfig em empresa-config.ts) via <EmpresaProvider> no layout,
// portanto são resolvidos em RUNTIME — trocar empresa = só mudar o .env.
//
// Uso nas páginas (Client Components):
//   const { EMPRESA_NOME, EMPRESA_LOGO_URL } = useEmpresa();

import { createContext, useContext, type ReactNode } from "react";
import type { EmpresaConfig } from "./empresa-config";

const FALLBACK: EmpresaConfig = {
  EMPRESA_NOME: "Sistema de Orçamento",
  EMPRESA_CNPJ: "",
  EMPRESA_ENDERECO: "",
  EMPRESA_EMAIL: "",
  EMPRESA_TELEFONES: "",
  EMPRESA_WHATSAPP: "",
  EMPRESA_LOGO_URL: "/media/logo-primary.png",
  EMPRESA_COR_PRIMARIA: "#0d6efd",
};

const EmpresaContext = createContext<EmpresaConfig>(FALLBACK);

export function EmpresaProvider({
  value,
  children,
}: {
  value: EmpresaConfig;
  children: ReactNode;
}) {
  return <EmpresaContext.Provider value={value}>{children}</EmpresaContext.Provider>;
}

export function useEmpresa(): EmpresaConfig {
  return useContext(EmpresaContext);
}
