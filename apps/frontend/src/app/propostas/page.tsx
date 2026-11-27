"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../contas-receber/admin-shell";
import RecursosBootstrap from "../contas-receber/_shared/recursos-bootstrap";
import {
  STATUS_PILL,
  STATUS_ROTULO,
  type ErroApi,
  type ListaPropostas,
  type PropostaStatus,
} from "./_shared/tipos";

const FILTROS: { valor: PropostaStatus | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todas" },
  { valor: "RASCUNHO", rotulo: "Rascunho" },
  { valor: "ENVIADA", rotulo: "Enviada" },
  { valor: "FECHADA", rotulo: "Fechada" },
  { valor: "CANCELADA", rotulo: "Cancelada" },
];

const TAMANHO = 20;
const ATRASO_BUSCA_MS = 350;

function mensagemDoErro(dados: unknown, padrao: string): string {
  const e = (dados ?? {}) as ErroApi;
  return e.mensagem ?? e.error ?? padrao;
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function ListaDePropostas() {
  const [status, setStatus] = useState<PropostaStatus | "">("");
  const [campoBusca, setCampoBusca] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<ListaPropostas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);

  // Envio da busca com atraso; trocar a busca volta para a primeira pagina.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(campoBusca.trim());
      setPagina(1);
    }, ATRASO_BUSCA_MS);
    return () => clearTimeout(t);
  }, [campoBusca]);

  const carregar = useCallback(async () => {
    const id = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (busca) params.set("q", busca);
    params.set("pagina", String(pagina));
    params.set("tamanho", String(TAMANHO));
    try {
      const res = await fetch(`/api/propostas?${params.toString()}`, { cache: "no-store" });
      const dados: unknown = await res.json().catch(() => null);
      if (id !== requisicao.current) return;
      if (!res.ok) {
        setErro(mensagemDoErro(dados, "Não foi possível carregar as propostas."));
        setLista(null);
      } else {
        setLista(dados as ListaPropostas);
      }
    } catch {
      if (id !== requisicao.current) return;
      setErro("Não foi possível carregar as propostas.");
      setLista(null);
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [status, busca, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / lista.tamanho)) : 1;

  return (
    <div className="pa-card">
      <div className="pa-card-header">
        <div className="d-flex flex-wrap align-items-center gap-2 w-100">
          <div className="pa-seg" role="group" aria-label="Filtrar por status">
            {FILTROS.map((f) => (
              <button
                key={f.valor || "todas"}
                type="button"
                className={`pa-seg-btn${status === f.valor ? " pa-seg-btn-active" : ""}`}
                onClick={() => {
                  setStatus(f.valor);
                  setPagina(1);
                }}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="form-control form-control-sm ms-auto"
            style={{ maxWidth: 320 }}
            placeholder="Buscar por número do orçamento ou cliente"
            aria-label="Buscar por número do orçamento ou cliente"
            value={campoBusca}
            onChange={(e) => setCampoBusca(e.target.value)}
          />
        </div>
      </div>
      <div className="pa-card-body pa-card-body-flush">
        {carregando && !lista ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Carregando...</span>
            </div>
          </div>
        ) : erro ? (
          <div className="pa-empty pa-empty-erro">
            <span>{erro}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void carregar()}>
              Tentar novamente
            </button>
          </div>
        ) : !lista || lista.itens.length === 0 ? (
          <div className="pa-empty">
            <span>Nenhuma proposta encontrada.</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th className="text-end">Total (R$)</th>
                  <th>Status</th>
                  <th>Atualizada em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.itens.map((p) => (
                  <tr key={p.id}>
                    <td>{p.idorcamentoAthos != null ? p.idorcamentoAthos : "Rascunho"}</td>
                    <td>{p.clienteNome ?? "Sem cliente"}</td>
                    <td className="text-end">{p.total}</td>
                    <td>
                      <span className={`pa-pill pa-pill-${STATUS_PILL[p.status] ?? "secondary"}`}>
                        {STATUS_ROTULO[p.status] ?? p.status}
                      </span>
                    </td>
                    <td>{dataCurta(p.atualizadoEm)}</td>
                    <td className="text-end">
                      <a href={`/propostas/${p.id}`} className="pa-link-btn">
                        Abrir
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {lista && lista.total > lista.tamanho && (
        <div className="d-flex align-items-center justify-content-between p-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={carregando || pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="small text-muted">
            Página {lista.pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={carregando || pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

export default function PropostasPage() {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);

  async function novaProposta() {
    if (criando) return;
    setCriando(true);
    setErroCriar(null);
    try {
      const res = await fetch("/api/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const dados: unknown = await res.json().catch(() => null);
      if (!res.ok || !dados || typeof (dados as { id?: unknown }).id !== "string") {
        setErroCriar(mensagemDoErro(dados, "Não foi possível criar a proposta."));
        setCriando(false);
        return;
      }
      router.push(`/propostas/${(dados as { id: string }).id}`);
    } catch {
      setErroCriar("Não foi possível criar a proposta.");
      setCriando(false);
    }
  }

  return (
    <PasswordGate
      title="Propostas"
      description="Esta área exibe propostas comerciais com custo e margem. Digite a senha de configurações para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/propostas"
        title="Propostas"
        subtitle="Propostas comerciais para órgãos públicos"
        actions={
          <button type="button" className="pa-btn-accent" onClick={() => void novaProposta()} disabled={criando}>
            <i className="bi bi-plus-lg me-1" />
            {criando ? "Criando..." : "Nova proposta"}
          </button>
        }
      >
        {erroCriar && (
          <div className="pa-empty pa-empty-erro mb-3" role="alert">
            <span>{erroCriar}</span>
          </div>
        )}
        <ListaDePropostas />
      </AdminShell>
    </PasswordGate>
  );
}
