"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

interface DashboardSummary {
  total_a_receber: number;
  total_atrasado: number;
  total_clientes_devedores: number;
}

interface ClienteDevedor {
  idcliente: number;
  nome_cliente: string;
  telefone_completo: string | null;
  emailcliente: string | null;
  emailcobrancacliente: string | null;
  limitecredito: number;
  bloqueaprazo: string | null;
  total_devido: number;
  total_atrasado: number;
  titulos_pendentes: number;
  maior_atraso_dias: number | null;
}

interface TituloReceber {
  idcontareceber: number;
  numerotitulo: string | null;
  datavencimento: string;
  valor: number;
  observacao: string | null;
  idvenda: number | null;
  dataemissao: string | null;
  numeroordem: string | null;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function getBadgeClass(maior_atraso_dias: number | null): string {
  if (maior_atraso_dias === null || maior_atraso_dias === 0) return "badge bg-success";
  if (maior_atraso_dias <= 30) return "badge bg-warning text-dark";
  if (maior_atraso_dias <= 90) return "badge bg-orange text-white";
  return "badge bg-danger";
}

function getBadgeLabel(dias: number | null): string {
  if (dias === null || dias === 0) return "Em dia";
  return `${dias}d atraso`;
}

export default function ContasReceberPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [clientes, setClientes] = useState<ClienteDevedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [titulosMap, setTitulosMap] = useState<Record<number, TituloReceber[] | "loading" | "error">>({});

  async function fetchDashboard() {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/athos/contas-receber/dashboard", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Erro ao carregar dashboard de contas a receber.");
      }
      const data = (await res.json()) as { summary: DashboardSummary; clientes: ClienteDevedor[] };
      setSummary(data.summary);
      setClientes(data.clientes);
    } catch {
      setErro("Erro ao carregar dashboard de contas a receber.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleCliente(idcliente: number) {
    if (expandedId === idcliente) {
      setExpandedId(null);
      return;
    }
    setExpandedId(idcliente);
    if (titulosMap[idcliente] !== undefined) return;

    setTitulosMap((prev) => ({ ...prev, [idcliente]: "loading" }));
    try {
      const res = await fetch(`/api/athos/contas-receber/cliente/${idcliente}/titulos`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Erro ao buscar títulos.");
      const data = (await res.json()) as TituloReceber[];
      setTitulosMap((prev) => ({ ...prev, [idcliente]: data }));
    } catch {
      setTitulosMap((prev) => ({ ...prev, [idcliente]: "error" }));
    }
  }

  useEffect(() => {
    void fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js"
        strategy="beforeInteractive"
      />
      <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
        rel="stylesheet"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
      />

      <div className="container my-4">
        {/* Header */}
        <div className="orcamento-header d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 rounded-top">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <img
              src="/media/logo-primary.png"
              alt="Logo Bom Custo"
              className="logo-img"
            />
            <div>
              <h3 className="mb-1">Contas a Receber</h3>
              <small className="text-muted">Monitoramento de inadimplência</small>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void fetchDashboard()}
            >
              <i className="bi bi-arrow-clockwise me-1" />Atualizar
            </button>
          </div>
        </div>

        {/* Main section */}
        <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
            </div>
          ) : erro ? (
            <div className="alert alert-danger">{erro}</div>
          ) : (
            <>
              {/* SEÇÃO 1 — Top Cards */}
              {summary && (
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <div className="card border-0 shadow-sm h-100">
                      <div className="card-body">
                        <p className="text-muted small mb-1">
                          <i className="bi bi-cash-stack me-1" />Total a Receber
                        </p>
                        <h4 className="fw-bold text-primary">{formatBRL(summary.total_a_receber)}</h4>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="card border-0 shadow-sm h-100">
                      <div className="card-body">
                        <p className="text-muted small mb-1">
                          <i className="bi bi-exclamation-triangle-fill me-1" />Inadimplência Ativa
                        </p>
                        <h4 className="fw-bold text-danger">{formatBRL(summary.total_atrasado)}</h4>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="card border-0 shadow-sm h-100">
                      <div className="card-body">
                        <p className="text-muted small mb-1">
                          <i className="bi bi-people-fill me-1" />Clientes Devedores
                        </p>
                        <h4 className="fw-bold">{summary.total_clientes_devedores} clientes</h4>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SEÇÃO 2 — Grid de Cards por cliente */}
              {clientes.length === 0 ? (
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2" />Nenhum cliente com contas em aberto.
                </div>
              ) : (
                <div className="row g-3">
                  {clientes.map((cliente) => {
                    const pct =
                      cliente.limitecredito > 0
                        ? Math.min(100, Math.round((cliente.total_devido / cliente.limitecredito) * 100))
                        : 0;
                    const progressBarClass =
                      pct >= 80 ? "progress-bar bg-danger" : pct >= 50 ? "progress-bar bg-warning" : "progress-bar bg-success";
                    const isExpanded = expandedId === cliente.idcliente;

                    return (
                      <div key={cliente.idcliente} className="col-md-6 col-lg-4">
                        <div className="card h-100 border-0 shadow-sm">
                          <div className="card-header d-flex justify-content-between align-items-center bg-transparent border-bottom">
                            <strong
                              className="text-truncate"
                              style={{ maxWidth: "65%" }}
                              title={cliente.nome_cliente}
                            >
                              {cliente.nome_cliente}
                            </strong>
                            <span className={getBadgeClass(cliente.maior_atraso_dias)}>
                              {getBadgeLabel(cliente.maior_atraso_dias)}
                            </span>
                          </div>
                          <div className="card-body pb-2">
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-muted small">Total devido</span>
                              <span className="fw-semibold">{formatBRL(cliente.total_devido)}</span>
                            </div>
                            {cliente.total_atrasado > 0 && (
                              <div className="d-flex justify-content-between mb-1">
                                <span className="text-muted small">Atrasado</span>
                                <span className="text-danger fw-semibold">{formatBRL(cliente.total_atrasado)}</span>
                              </div>
                            )}
                            <small className="text-muted">
                              {cliente.titulos_pendentes} título(s) em aberto
                            </small>
                            {cliente.limitecredito > 0 && (
                              <div className="mt-2">
                                <div className="d-flex justify-content-between small text-muted mb-1">
                                  <span>Limite de crédito</span>
                                  <span>{formatBRL(cliente.limitecredito)}</span>
                                </div>
                                <div className="progress" style={{ height: "6px" }}>
                                  <div
                                    className={progressBarClass}
                                    role="progressbar"
                                    style={{ width: `${pct}%` }}
                                    aria-valuenow={pct}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="card-footer bg-transparent border-top d-flex gap-2 flex-wrap">
                            {cliente.telefone_completo && (
                              <a
                                href={`https://wa.me/55${cliente.telefone_completo.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-success"
                              >
                                <i className="bi bi-whatsapp me-1" />WhatsApp
                              </a>
                            )}
                            <button
                              type="button"
                              className={`btn btn-sm ${isExpanded ? "btn-primary" : "btn-outline-primary"}`}
                              onClick={() => void handleToggleCliente(cliente.idcliente)}
                            >
                              <i className={`bi ${isExpanded ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />
                              Títulos
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SEÇÃO 3 — Accordion de títulos */}
              {expandedId !== null && (
                <div className="mt-4">
                  <h6 className="mb-3">
                    Títulos em Aberto — {clientes.find((c) => c.idcliente === expandedId)?.nome_cliente}
                  </h6>
                  {titulosMap[expandedId] === "loading" && (
                    <div className="text-center py-3">
                      <span className="spinner-border spinner-border-sm text-primary" role="status" />
                    </div>
                  )}
                  {titulosMap[expandedId] === "error" && (
                    <div className="alert alert-warning">Erro ao carregar títulos.</div>
                  )}
                  {Array.isArray(titulosMap[expandedId]) && (titulosMap[expandedId] as TituloReceber[]).length === 0 && (
                    <div className="alert alert-info">Nenhum título encontrado.</div>
                  )}
                  {Array.isArray(titulosMap[expandedId]) && (titulosMap[expandedId] as TituloReceber[]).length > 0 && (
                    <div className="table-responsive">
                      <table className="table table-sm table-hover">
                        <thead>
                          <tr>
                            <th>Título</th>
                            <th>Vencimento</th>
                            <th>Valor</th>
                            <th>Pedido</th>
                            <th>Obs.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(titulosMap[expandedId] as TituloReceber[]).map((titulo) => {
                            const vencido = new Date(titulo.datavencimento) < new Date();
                            return (
                              <tr key={titulo.idcontareceber}>
                                <td>{titulo.numerotitulo ?? "—"}</td>
                                <td className={vencido ? "text-danger" : ""}>
                                  {formatDate(titulo.datavencimento)}
                                </td>
                                <td className="fw-semibold">{formatBRL(titulo.valor)}</td>
                                <td>
                                  {titulo.numeroordem ? (
                                    <span className="badge bg-secondary">#{titulo.numeroordem}</span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td>
                                  {titulo.observacao
                                    ? titulo.observacao.length > 40
                                      ? titulo.observacao.slice(0, 40) + "…"
                                      : titulo.observacao
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        body { background: #f7f1e3; font-size: 1.02rem; }
        .orcamento-header {
          background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
          color: #222;
          border-radius: 8px 8px 0 0;
        }
        .orcamento-section { border-radius: 0 0 8px 8px; }
        .logo-img { max-width: 140px; max-height: 88px; background: #fff; border-radius: 8px; padding: 6px; }
        .bg-orange { background-color: #fd7e14 !important; }
      `}</style>
    </>
  );
}
