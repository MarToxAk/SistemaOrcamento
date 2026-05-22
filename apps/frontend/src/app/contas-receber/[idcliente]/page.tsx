"use client";

import { use, useEffect, useRef, useState } from "react";
import Script from "next/script";

interface DadosCliente {
  idcliente: number;
  nome_cliente: string;
  telefone_completo: string | null;
  emailcliente: string | null;
  emailcobrancacliente: string | null;
  limitecredito: number;
  bloqueaprazo: string | null;
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

export default function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ idcliente: string }>;
}) {
  const { idcliente } = use(params);

  const [dadosCliente, setDadosCliente] = useState<DadosCliente | null>(null);
  const [titulos, setTitulos] = useState<TituloReceber[]>([]);
  const [loadingCliente, setLoadingCliente] = useState(true);
  const [loadingTitulos, setLoadingTitulos] = useState(true);
  const [erroCliente, setErroCliente] = useState("");
  const [erroTitulos, setErroTitulos] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const checkboxRef = useRef<HTMLInputElement>(null);

  const allSelected = titulos.length > 0 && selectedIds.size === titulos.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < titulos.length;

  const totalSelecionado = titulos
    .filter((t) => selectedIds.has(t.idcontareceber))
    .reduce((acc, t) => acc + t.valor, 0);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  useEffect(() => {
    // Fetch dados cadastrais do cliente
    fetch(`/api/athos/contas-receber/cliente/${idcliente}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar dados do cliente.");
        const data = (await res.json()) as DadosCliente;
        setDadosCliente(data);
      })
      .catch(() => setErroCliente("Erro ao carregar dados do cliente."))
      .finally(() => setLoadingCliente(false));

    // Fetch títulos do cliente
    fetch(`/api/athos/contas-receber/cliente/${idcliente}/titulos`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar títulos.");
        const data = (await res.json()) as TituloReceber[];
        setTitulos(data);
      })
      .catch(() => setErroTitulos("Erro ao carregar títulos."))
      .finally(() => setLoadingTitulos(false));
  }, [idcliente]);

  function handleToggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedIds.size === titulos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(titulos.map((t) => t.idcontareceber)));
    }
  }

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
              <h3 className="mb-1">Detalhe do Cliente</h3>
              <small className="text-muted">Dados cadastrais e títulos em aberto</small>
            </div>
          </div>
          <div>
            <a href="/contas-receber" className="btn btn-sm btn-outline-secondary me-3">
              <i className="bi bi-arrow-left me-1" />Contas a Receber
            </a>
          </div>
        </div>

        {/* Main section */}
        <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          {/* Dados do cliente */}
          <div className="mb-4">
            <h5 className="fw-semibold mb-3">
              <i className="bi bi-person-circle me-2 text-primary" />Dados Cadastrais
            </h5>
            {loadingCliente ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroCliente ? (
              <div className="alert alert-danger">{erroCliente}</div>
            ) : dadosCliente ? (
              <div className="card border-0 shadow-sm">
                <div className="card-body">
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
                            <span className="badge bg-danger ms-2">Bloqueado</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Tabela de títulos */}
          <div>
            <h5 className="fw-semibold mb-3">
              <i className="bi bi-receipt me-2 text-primary" />Títulos em Aberto
            </h5>
            {loadingTitulos ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroTitulos ? (
              <div className="alert alert-danger">{erroTitulos}</div>
            ) : titulos.length === 0 ? (
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2" />Nenhum título encontrado para este cliente.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover table-bordered">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: "40px" }}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={allSelected}
                          ref={checkboxRef}
                          onChange={handleToggleAll}
                        />
                      </th>
                      <th>Título</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titulos.map((titulo) => {
                      const vencido = new Date(titulo.datavencimento) < new Date();
                      return (
                        <tr key={titulo.idcontareceber}>
                          <td>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={selectedIds.has(titulo.idcontareceber)}
                              onChange={() => handleToggle(titulo.idcontareceber)}
                            />
                          </td>
                          <td className="small">{titulo.numerotitulo ?? "—"}</td>
                          <td className={`small${vencido ? " text-danger fw-semibold" : ""}`}>
                            {formatDate(titulo.datavencimento)}
                          </td>
                          <td className="small fw-semibold">{formatBRL(titulo.valor)}</td>
                          <td>
                            {vencido ? (
                              <span className="badge bg-danger">VEN</span>
                            ) : (
                              <span className="badge bg-info text-dark">AVC</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="table-secondary">
                      <td colSpan={5} className="small text-muted">
                        {selectedIds.size} título(s) selecionado(s) — Total:{" "}
                        <strong>{formatBRL(totalSelecionado)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barra de ações — visível SOMENTE quando há seleção */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "white",
            borderTop: "1px solid #dee2e6",
            padding: "12px 16px",
            zIndex: 10,
          }}
          className="d-flex align-items-center gap-3 flex-wrap"
        >
          <span className="text-muted small">
            <strong>{selectedIds.size}</strong> título(s) selecionado(s) —{" "}
            <strong>{formatBRL(totalSelecionado)}</strong>
          </span>
          <div className="ms-auto d-flex gap-2">
            <button
              type="button"
              className="btn btn-warning me-2"
              onClick={() => {
                /* TODO: Phase 29 — Gerar Boleto */
              }}
            >
              <i className="bi bi-receipt me-1" />Gerar Boleto
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                /* TODO: Phase 30 — Emitir NFS-e */
              }}
            >
              <i className="bi bi-file-earmark-text me-1" />Emitir NFS-e
            </button>
          </div>
        </div>
      )}

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
