import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Mulish } from "next/font/google";

const mulish = Mulish({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-mulish",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BomCusto Orcamento",
  description: "Painel de orcamentos integrado ao Chatwoot e PDV",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={mulish.variable}>
      <body>{children}</body>
    </html>
  );
}
