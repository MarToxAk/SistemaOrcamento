import type { Metadata } from "next";
import { headers } from "next/headers";

import { backendFetch } from "@/lib/backend-client";
import { getEmpresaConfig } from "@/lib/empresa-config";
import { ipDoCliente } from "@/lib/ip-cliente";
import type { EstadoPagina, PesquisaPublicaView } from "@/lib/pesquisa-publica";
import PesquisaCliente from "./pesquisa-cliente";

// D-01/D-43: pagina publica com estado resolvido NO SERVIDOR (backendFetch), no padrao de
// /cobranca/confirmar/[token]. O cliente final nunca acessa o backend diretamente. T-52-10: o
// token esta na URL, entao a pagina nao pode ser indexada nem vazar o token via Referer.
export const dynamic = "force-dynamic";

const SRI_BOOTSTRAP_ICONS = "sha384-4LISF5TTJX/fLmGSxO53rV4miRxdg84mZsxmO8Rx5jGtp/LbrixFETvWa5a6sESd";

export async function generateMetadata(): Promise<Metadata> {
  const { EMPRESA_NOME } = getEmpresaConfig();
  return {
    title: EMPRESA_NOME,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function converterView(view: PesquisaPublicaView): EstadoPagina {
  if (view.estado === "ABERTA") {
    return {
      tipo: "ABERTA",
      variante: view.variante,
      textos: view.textos,
      corPrimaria: view.corPrimaria,
      linkGoogle: view.linkGoogle,
    };
  }
  if (view.estado === "RESPONDIDA") {
    return {
      tipo: "RESPONDIDA",
      textos: view.textos,
      corPrimaria: view.corPrimaria,
      linkGoogle: view.linkGoogle,
    };
  }
  return { tipo: "INDISPONIVEL" };
}

async function carregarEstado(token: string): Promise<EstadoPagina> {
  const ip = ipDoCliente(await headers());
  const extraHeaders: Record<string, string> = {};
  if (ip) extraHeaders["x-client-ip"] = ip;

  try {
    const res = await backendFetch(`/pesquisa/publica/${encodeURIComponent(token)}`, {
      headers: extraHeaders,
    });
    // Excecao, status 5xx ou corpo irreconhecivel viram o estado de erro generico; nunca lanca.
    if (res.status >= 500) return { tipo: "ERRO" };
    const data = (await res.json().catch(() => null)) as PesquisaPublicaView | null;
    if (!data || typeof data !== "object" || !("estado" in data)) return { tipo: "ERRO" };
    return converterView(data);
  } catch {
    return { tipo: "ERRO" };
  }
}

export default async function PesquisaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const estadoInicial = await carregarEstado(token);
  const config = getEmpresaConfig();

  const empresa = {
    nome: config.EMPRESA_NOME,
    logoUrl: config.EMPRESA_LOGO_URL,
    whatsapp: config.EMPRESA_WHATSAPP,
    corFallback: config.EMPRESA_COR_PRIMARIA,
  };

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
        integrity={SRI_BOOTSTRAP_ICONS}
        crossOrigin="anonymous"
      />
      <PesquisaCliente token={token} estadoInicial={estadoInicial} empresa={empresa} />
    </>
  );
}
