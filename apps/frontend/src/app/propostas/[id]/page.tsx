"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../../contas-receber/admin-shell";
import RecursosBootstrap from "../../contas-receber/_shared/recursos-bootstrap";
import type { PropostaDetalhe } from "../_shared/tipos";
import {
  classeStatus,
  formatarDinheiro,
  formatarQuantidade,
  mensagemDeErro,
  podeEditar,
  rotuloStatus,
} from "../_shared/formatadores";
import BuscaProduto from "../_componentes/busca-produto";

/**
 * Tela da proposta. O estado e sempre a resposta do servidor: nenhum preco e calculado no navegador (D-02),
 * so intencoes sao enviadas. Todo texto vindo da API e renderizado como texto React.
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
        setErro(mensagemDeErro(dados, "Não foi possível carregar a proposta."));
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

  /** Adiciona um item (so produto e quantidade); a resposta completa do servidor vira o estado. */
  const adicionarItem = useCallback(
    async (idproduto: number, quantidade: number): Promise<string | null> => {
      try {
        const res = await fetch(`/api/propostas/${encodeURIComponent(id)}/itens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idproduto, quantidade }),
        });
        const dados: unknown = await res.json().catch(() => null);
        if (!res.ok) return mensagemDeErro(dados, "Não foi possível adicionar o item.");
        setProposta(dados as PropostaDetalhe);
        return null;
      } catch {
        return "Não foi possível adicionar o item.";
      }
    },
    [id],
  );

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
            <span className={`badge ${classeStatus(proposta.status)}`}>{rotuloStatus(proposta.status)}</span>
          </div>
        </div>
        <div className="pa-card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <div className="small text-muted">Cliente</div>
              <div>{nomeCliente ? String(nomeCliente) : "Sem cliente"}</div>
            </div>
            <div className="col-md-4">
              <div className="small text-muted">Total</div>
              <div className="fw-semibold">{formatarDinheiro(proposta.total)}</div>
            </div>
          </div>
        </div>
      </div>

      {podeEditar(proposta.status) ? (
        <div className="pa-card mb-3">
          <div className="pa-card-body">
            <BuscaProduto onAdicionar={adicionarItem} />
          </div>
        </div>
      ) : null}

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
                    <th className="text-end">Preço final</th>
                    <th className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {proposta.itens.map((item) => (
                    <tr key={item.id}>
                      <td>{item.idproduto}</td>
                      <td>{item.nome}</td>
                      <td className="text-end">
                        {formatarQuantidade(item.quantidade)}
                        {item.unidade ? ` ${item.unidade}` : ""}
                      </td>
                      <td className="text-end">{formatarDinheiro(item.precoUnitario)}</td>
                      <td className="text-end">{formatarDinheiro(item.totalLinha)}</td>
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
