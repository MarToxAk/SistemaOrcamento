"use client";

import { Suspense, use } from "react";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../admin-shell";
import RecursosBootstrap from "../_shared/recursos-bootstrap";
import { lerOpcao } from "../_shared/filtros-url";
import { formatBRL } from "../_shared/formatadores";
import { useFiltrosUrl } from "../_shared/use-filtros-url";
import { AbasNavegacao, type AbaCliente } from "./_abas/compartilhado";
import { useDadosCliente } from "./_abas/use-dados-cliente";
import { AbaContasEmAberto } from "./_abas/aba-contas-em-aberto";
import { AbaGerarBoleto } from "./_abas/aba-gerar-boleto";
import { AbaBoletos } from "./_abas/aba-boletos";
import { AbaNotas } from "./_abas/aba-notas";

const ABAS_PERMITIDAS: readonly AbaCliente[] = ["contas", "gerar-boleto", "boletos", "notas"];

export default function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ idcliente: string }>;
}) {
  const { idcliente } = use(params);

  return (
    <PasswordGate
      title="Contas a Receber"
      description="Esta area exibe dados financeiros de clientes. Digite a senha de configuracoes para continuar."
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
        <ClienteDetalheConteudo idcliente={idcliente} />
      </Suspense>
    </PasswordGate>
  );
}

function ClienteDetalheConteudo({ idcliente }: { idcliente: string }) {
  const { obter, definir } = useFiltrosUrl();
  const aba = lerOpcao<AbaCliente>(obter("aba"), ABAS_PERMITIDAS, "contas");

  const {
    dadosCliente,
    loadingCliente,
    erroCliente,
    titulos,
    loadingTitulos,
    erroTitulos,
    historico,
    loadingHistorico,
    erroHistorico,
    recarregar,
  } = useDadosCliente(idcliente);

  const titulosLivres = titulos.filter((t) => !t.boletoAtivo);
  const totalBoletos = new Set(titulos.flatMap((t) => (t.boletoAtivo ? [t.boletoAtivo.cobrancaId] : []))).size;

  return (
    <>
      <RecursosBootstrap />

      <AdminShell
        activeHref="/contas-receber"
        title="Detalhe do Cliente"
        subtitle={dadosCliente ? dadosCliente.nome_cliente : `Cliente #${idcliente}`}
        actions={
          <a href="/contas-receber" className="pa-link-btn text-nowrap">
            <i className="bi bi-arrow-left me-1" />Contas a Receber
          </a>
        }
      >
        {/* Dados do cliente */}
        <div className="pa-card">
          <div className="pa-card-header">
            <strong><i className="bi bi-person-circle me-2 text-primary" />Dados Cadastrais</strong>
          </div>
          <div className="pa-card-body">
            {loadingCliente ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroCliente ? (
              <div className="pa-empty pa-empty-erro">{erroCliente}</div>
            ) : dadosCliente ? (
              <div className="row g-2">
                <div className="col-md-6">
                  <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span className="text-muted small">Nome</span>
                    <strong className="small text-end">{dadosCliente.nome_cliente}</strong>
                  </div>
                  <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span className="text-muted small">Telefone</span>
                    <span className="small">{dadosCliente.telefone_completo ?? "—"}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span className="text-muted small">E-mail</span>
                    <span className="small">{dadosCliente.emailcliente ?? "—"}</span>
                  </div>
                  <div className="d-flex justify-content-between pb-2">
                    <span className="text-muted small">Limite de Crédito</span>
                    <span className="small fw-semibold">
                      {formatBRL(dadosCliente.limitecredito)}
                      {dadosCliente.bloqueaprazo === "S" && (
                        <span className="pa-pill pa-pill-danger ms-2">Bloqueado</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <AbasNavegacao
          abaAtual={aba}
          onSelecionar={(id) => definir({ aba: id === "contas" ? null : id })}
          contagens={{
            contas: titulos.length,
            "gerar-boleto": titulosLivres.length,
            boletos: totalBoletos,
          }}
        />

        {aba === "contas" && (
          <AbaContasEmAberto
            titulos={titulos}
            loadingTitulos={loadingTitulos}
            erroTitulos={erroTitulos}
            historico={historico}
            loadingHistorico={loadingHistorico}
            erroHistorico={erroHistorico}
          />
        )}

        {aba === "gerar-boleto" && (
          <AbaGerarBoleto
            idcliente={idcliente}
            dadosCliente={dadosCliente}
            titulos={titulos}
            loadingTitulos={loadingTitulos}
            erroTitulos={erroTitulos}
            onRecarregar={recarregar}
          />
        )}

        {aba === "boletos" && (
          <AbaBoletos
            idcliente={idcliente}
            dadosCliente={dadosCliente}
            titulos={titulos}
            loadingTitulos={loadingTitulos}
            erroTitulos={erroTitulos}
          />
        )}

        {aba === "notas" && <AbaNotas idcliente={idcliente} onRecarregar={recarregar} />}
      </AdminShell>
    </>
  );
}
