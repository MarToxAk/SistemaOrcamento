"use client";

import { Suspense } from "react";

import PasswordGate from "@/components/password-gate";
import AdminShell from "../../contas-receber/admin-shell";
import RecursosBootstrap from "../../contas-receber/_shared/recursos-bootstrap";
import { useFiltrosUrl } from "../../contas-receber/_shared/use-filtros-url";
import ConfigForm from "./config-form";
import ResultadosPanel from "./resultados-panel";

/**
 * Fase 52 (plano 52-09): página /configuracoes/pesquisa com as abas Configuração e Resultados (D-23).
 *
 * O estado das abas vive na URL (`?aba=`), com "Configuração" como padrão fora da URL. O formulário
 * do plano 52-08 fica SEMPRE montado (apenas escondido na aba Resultados) para não perder o que foi
 * digitado; o painel de resultados só é montado quando a aba Resultados está ativa. O período
 * (`?periodo=`) só entra na URL quando não é o padrão "mes".
 */

type Aba = "configuracao" | "resultados";
type Periodo = "mes" | "30d" | "tudo";

function ConteudoPesquisa() {
  const { obter, definir } = useFiltrosUrl();

  const aba: Aba = obter("aba") === "resultados" ? "resultados" : "configuracao";
  const periodoBruto = obter("periodo");
  const periodo: Periodo = periodoBruto === "30d" || periodoBruto === "tudo" ? periodoBruto : "mes";

  function mudarAba(nova: Aba) {
    definir({ aba: nova === "resultados" ? "resultados" : null });
  }

  function mudarPeriodo(novo: Periodo) {
    definir({ periodo: novo === "mes" ? null : novo });
  }

  return (
    <>
      <div className="pa-seg mb-3" role="group" aria-label="Seção da pesquisa e recompensa">
        <button
          type="button"
          className={`pa-seg-btn${aba === "configuracao" ? " pa-seg-btn-active" : ""}`}
          aria-pressed={aba === "configuracao"}
          onClick={() => mudarAba("configuracao")}
        >
          Configuração
        </button>
        <button
          type="button"
          className={`pa-seg-btn${aba === "resultados" ? " pa-seg-btn-active" : ""}`}
          aria-pressed={aba === "resultados"}
          onClick={() => mudarAba("resultados")}
        >
          Resultados
        </button>
      </div>

      {/* Sempre montado: mantém o estado digitado e o aviso de saída ao alternar de aba. */}
      <div hidden={aba !== "configuracao"}>
        <ConfigForm />
      </div>

      {aba === "resultados" && <ResultadosPanel periodo={periodo} onPeriodo={mudarPeriodo} />}
    </>
  );
}

export default function ConfiguracaoPesquisaPage() {
  return (
    <PasswordGate
      title="Pesquisa e recompensa"
      description="Esta área altera a pesquisa de satisfação e a recompensa de desconto. Digite a senha de configurações para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/configuracoes/pesquisa"
        title="Pesquisa e recompensa"
        subtitle="Pesquisa de satisfação no fechamento e cupom de desconto"
      >
        <Suspense
          fallback={
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
            </div>
          }
        >
          <ConteudoPesquisa />
        </Suspense>
      </AdminShell>
    </PasswordGate>
  );
}
