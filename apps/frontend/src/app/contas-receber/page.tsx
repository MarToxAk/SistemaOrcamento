"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useEmpresa } from "@/lib/empresa";

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

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

type StatusFiltro = "AVC" | "VEN" | "REC" | "CAN" | "";

const STATUS_OPTIONS: { value: StatusFiltro; label: string; cls: string }[] = [
  { value: "",    label: "Todos (abertos)", cls: "btn-outline-secondary" },
  { value: "AVC", label: "A Vencer",        cls: "btn-outline-info"      },
  { value: "VEN", label: "Vencidos",        cls: "btn-outline-danger"    },
  { value: "REC", label: "Recebidos",       cls: "btn-outline-success"   },
  { value: "CAN", label: "Cancelados",      cls: "btn-outline-dark"      },
];

export default function ContasReceberPage() {
  const { EMPRESA_NOME, EMPRESA_LOGO_URL } = useEmpresa();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [clientes, setClientes] = useState<ClienteDevedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("");

  async function fetchDashboard(status: StatusFiltro = statusFiltro) {
    setLoading(true);
    setErro("");
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/athos/contas-receber/dashboard${qs}`, { cache: "no-store" });
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

  useEffect(() => {
    void fetchDashboard(statusFiltro);
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
              src={EMPRESA_LOGO_URL}
              alt={EMPRESA_NOME}
              className="logo-img"
            />
            <div>
              <h3 className="mb-1">Contas a Receber</h3>
              <small className="text-muted">Monitoramento de inadimplência</small>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn-sm ${statusFiltro === opt.value ? opt.cls.replace("outline-", "") : opt.cls}`}
                onClick={() => {
                  setStatusFiltro(opt.value);
                  void fetchDashboard(opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-sm btn-light border"
              onClick={() => void fetchDashboard(statusFiltro)}
              title="Atualizar"
            >
              <i className="bi bi-arrow-clockwise" />
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
                          <div className="card-footer bg-transparent border-top">
                            <a
                              href={`/contas-receber/${cliente.idcliente}`}
                              className="btn btn-sm btn-outline-primary"
                            >
                              <i className="bi bi-person-lines-fill me-1" />Ver Detalhe
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
