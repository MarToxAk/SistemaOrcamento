"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../../contas-receber/admin-shell";
import RecursosBootstrap from "../../contas-receber/_shared/recursos-bootstrap";
import { STATUS_PILL, STATUS_ROTULO, type ErroApi, type PropostaDetalhe } from "../_shared/tipos";

function mensagemDoErro(dados: unknown, padrao: string): string {
  const e = (dados ?? {}) as ErroApi;
  return e.mensagem ?? e.error ?? padrao;
}

/**
 * Tela da proposta (somente leitura neste plano). O estado e sempre a resposta do servidor: nenhum
 * preco e calculado no navegador. Todo texto vindo da API e renderizado como texto React.
 */
function DetalheProposta({ id }: { id: string }) {
  const [proposta, setProposta] = useState<PropostaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);

  const carregar = useCallback(async () => {
    const atual = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/propostas/${encodeURIComponent(id)}`, { cache: "no-store" });
      const dados: unknown = await res.json().catch(() => null);
      if (atual !== requisicao.current) return;
      if (!res.ok) {
        setErro(mensagemDoErro(dados, "Não foi possível carregar a proposta."));
        setProposta(null);
      } else {
        setProposta(dados as PropostaDetalhe);
      }
    } catch {
      if (atual !== requisicao.current) return;
      setErro("Não foi possível carregar a proposta.");
      setProposta(null);
    } finally {
      if (atual === requisicao.current) setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !proposta) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando...</span>
        </div>
      </div>
    );
  }

  if (erro || !proposta) {
    return (
      <div className="pa-empty pa-empty-erro" role="alert">
        <span>{erro ?? "Proposta não encontrada."}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void carregar()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const nomeCliente = proposta.cliente?.razaoSocial ?? proposta.cliente?.nomeFantasia ?? null;

  return (
    <>
      <div className="pa-card mb-3">
        <div className="pa-card-header">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="fw-semibold">
              {proposta.idorcamentoAthos != null ? `Proposta ${proposta.idorcamentoAthos}` : "Proposta (rascunho)"}
            </span>
            <span className={`pa-pill pa-pill-${STATUS_PILL[proposta.status] ?? "secondary"}`}>
              {STATUS_ROTULO[proposta.status] ?? proposta.status}
            </span>
          </div>
        </div>
        <div className="pa-card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <div className="small text-muted">Cliente</div>
              <div>{nomeCliente ? String(nomeCliente) : "Sem cliente"}</div>
            </div>
            <div className="col-md-4">
              <div className="small text-muted">Total (R$)</div>
              <div className="fw-semibold">{proposta.total}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="pa-card">
        <div className="pa-card-header">
          <span className="fw-semibold">Itens</span>
          <span className="pa-card-header-count">({proposta.itens.length})</span>
        </div>
        <div className="pa-card-body pa-card-body-flush">
          {proposta.itens.length === 0 ? (
            <div className="pa-empty">
              <span>Esta proposta ainda não tem itens.</span>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th className="text-end">Quantidade</th>
                    <th className="text-end">Preço final (R$)</th>
                    <th className="text-end">Total (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {proposta.itens.map((item) => (
                    <tr key={item.id}>
                      <td>{item.idproduto}</td>
                      <td>{item.nome}</td>
                      <td className="text-end">
                        {item.quantidade}
                        {item.unidade ? ` ${item.unidade}` : ""}
                      </td>
                      <td className="text-end">{item.precoUnitario}</td>
                      <td className="text-end">{item.totalLinha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function PropostaPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  return (
    <PasswordGate
      title="Proposta"
      description="Esta área exibe propostas comerciais com custo e margem. Digite a senha de configurações para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/propostas"
        title="Proposta"
        subtitle="Itens e total calculados pelo servidor"
        actions={
          <a href="/propostas" className="pa-link-btn">
            <i className="bi bi-arrow-left me-1" />
            Voltar para a lista
          </a>
        }
      >
        {id ? <DetalheProposta id={id} /> : null}
      </AdminShell>
    </PasswordGate>
  );
}
