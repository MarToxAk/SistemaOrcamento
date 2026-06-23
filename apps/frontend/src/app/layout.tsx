import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "Orçamento",
    description: "Painel de orçamentos integrado ao Chatwoot e PDV",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const cor = process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd";
  return (
    <html lang="pt-BR">
      <head>
        <style>{`:root { --cor-primaria: ${cor}; }`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
