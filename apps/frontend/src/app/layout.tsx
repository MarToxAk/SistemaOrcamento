import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getEmpresaConfig } from "@/lib/empresa-config";
import { EmpresaProvider } from "@/lib/empresa";

export async function generateMetadata(): Promise<Metadata> {
  const { EMPRESA_NOME } = getEmpresaConfig();
  return {
    title: EMPRESA_NOME,
    description: "Painel de orçamentos integrado ao Chatwoot e PDV",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const empresa = getEmpresaConfig();
  return (
    <html lang="pt-BR">
      <head>
        <style>{`:root { --cor-primaria: ${empresa.EMPRESA_COR_PRIMARIA}; }`}</style>
      </head>
      <body>
        <EmpresaProvider value={empresa}>{children}</EmpresaProvider>
      </body>
    </html>
  );
}
