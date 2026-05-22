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

  // Modal boleto states
  const [boletoModalState, setBoletoModalState] = useState<
    "idle" | "confirm" | "loading" | "success" | "error"
  >("idle");
  const [expireAt, setExpireAt] = useState("");
  const [expireAtReadonly, setExpireAtReadonly] = useState(false);
  const [erroDatasModal, setErroDatasModal] = useState("");
  const [boletoResult, setBoletoResult] = useState<{
    cobrancaId: number;
    chargeId: number;
    linkBoleto: string;
    barcodeLinhaDigitavel: string;
    valor: number;
    expireAt: string;
    nomeArquivo: string;
  } | null>(null);
  const [boletoErro, setBoletoErro] = useState("");
  const [boletoErroDetalhe, setBoletoErroDetalhe] = useState("");
  const [copiado, setCopiado] = useState(false);

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

  // ESC key handler for modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && boletoModalState !== "loading") {
        fecharBoletoModal();
      }
    }
    if (boletoModalState !== "idle") {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [boletoModalState]);

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

  function abreBoletoModal() {
    const titulosSelecionados = titulos.filter((t) => selectedIds.has(t.idcontareceber));
    const datas = new Set(titulosSelecionados.map((t) => t.datavencimento?.slice(0, 10)));
    if (datas.size === 1) {
      setExpireAt([...datas][0] ?? "");
      setExpireAtReadonly(true);
      setErroDatasModal("");
    } else {
      setExpireAt("");
      setExpireAtReadonly(false);
      setErroDatasModal(
        "Os títulos selecionados possuem datas de vencimento diferentes. Informe a data de vencimento manualmente.",
      );
    }
    setBoletoModalState("confirm");
  }

  async function confirmarGerarBoleto() {
    setBoletoModalState("loading");
    const titulosSelecionados = titulos.filter((t) => selectedIds.has(t.idcontareceber));
    try {
      const res = await fetch("/api/cobranca/boleto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idclienteAthos: Number(idcliente),
          idcontasReceber: titulosSelecionados.map((t) => t.idcontareceber),
          expireAt,
        }),
      });
      const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
      if (!res.ok) {
        setBoletoErro(
          (data as { message?: string; error?: string })?.message ??
            (data as { message?: string; error?: string })?.error ??
            "Não foi possível gerar o boleto. Verifique a conexão e tente novamente.",
        );
        setBoletoErroDetalhe(`HTTP ${res.status}`);
        setBoletoModalState("error");
      } else {
        setBoletoResult(data as typeof boletoResult);
        setBoletoModalState("success");
      }
    } catch (err) {
      setBoletoErro(
        "Não foi possível gerar o boleto. Verifique a conexão e tente novamente.",
      );
      setBoletoErroDetalhe(err instanceof Error ? err.message : "");
      setBoletoModalState("error");
    }
  }

  function fecharBoletoModal() {
    setBoletoModalState("idle");
    setBoletoResult(null);
    setBoletoErro("");
    setBoletoErroDetalhe("");
    setCopiado(false);
  }

  // Derived variables for the modal
  const titulosSelecionadosParaBoleto = titulos.filter((t) => selectedIds.has(t.idcontareceber));
  const hoje = new Date().toISOString().slice(0, 10);
  const expireAtInvalido = !expireAt || expireAt < hoje;

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
              onClick={abreBoletoModal}
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

      {/* Modal boleto — 4 estados */}
      {boletoModalState !== "idle" && (
        <div
          className="boleto-modal-backdrop"
          onClick={boletoModalState !== "loading" ? fecharBoletoModal : undefined}
        >
          <div
            className="boleto-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Gerar Boleto Bancário"
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER — visível em todos os estados */}
            <div className="boleto-modal-header">
              <h5 className="mb-0 fw-semibold" style={{ fontSize: "var(--fs-lg, 1.35rem)" }}>
                <i className="bi bi-receipt me-2" />Gerar Boleto
              </h5>
              {boletoModalState !== "loading" && (
                <button
                  type="button"
                  className="btn-close"
                  onClick={fecharBoletoModal}
                  aria-label="Fechar"
                />
              )}
            </div>

            {/* ESTADO 1 — CONFIRMAÇÃO */}
            {boletoModalState === "confirm" && (
              <>
                <div className="boleto-modal-body">
                  <small className="text-muted d-block mb-3">
                    {titulosSelecionadosParaBoleto.length} título(s) selecionado(s) —{" "}
                    {formatBRL(totalSelecionado)}
                  </small>

                  {/* Resumo dos títulos */}
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-body p-3">
                      <div className="mb-2 text-muted small">Valor Total</div>
                      <div
                        className="fw-semibold mb-3"
                        style={{ fontSize: "var(--fs-xl, 1.7rem)" }}
                      >
                        {formatBRL(totalSelecionado)}
                      </div>
                      <ul className="list-unstyled mb-0">
                        {titulosSelecionadosParaBoleto.map((t) => (
                          <li
                            key={t.idcontareceber}
                            className="d-flex justify-content-between small border-bottom pb-1 mb-1"
                          >
                            <span className="text-muted">
                              {t.numerotitulo ?? `#${t.idcontareceber}`}
                            </span>
                            <span>{formatBRL(t.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Alert datas divergentes */}
                  {erroDatasModal && (
                    <div className="alert alert-danger d-flex gap-2 mb-3" role="alert">
                      <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                      <span className="small">{erroDatasModal}</span>
                    </div>
                  )}

                  {/* Campo de vencimento */}
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">
                      Data de Vencimento do Boleto
                    </label>
                    <input
                      type="date"
                      className={`form-control${expireAt && expireAt < hoje ? " is-invalid" : ""}`}
                      value={expireAt}
                      min={hoje}
                      readOnly={expireAtReadonly}
                      onChange={(e) => !expireAtReadonly && setExpireAt(e.target.value)}
                    />
                    {expireAtReadonly && (
                      <div className="mt-1">
                        <span className="badge bg-info text-dark small">
                          Preenchido automaticamente
                        </span>
                        <small className="text-muted ms-2">
                          Preenchida automaticamente com a data dos títulos.
                        </small>
                      </div>
                    )}
                    {expireAt && expireAt < hoje && (
                      <div className="invalid-feedback">
                        A data de vencimento não pode ser no passado.
                      </div>
                    )}
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={fecharBoletoModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={confirmarGerarBoleto}
                    disabled={expireAtInvalido}
                  >
                    <i className="bi bi-check-lg me-1" />Confirmar Geração
                  </button>
                </div>
              </>
            )}

            {/* ESTADO 2 — LOADING */}
            {boletoModalState === "loading" && (
              <div className="boleto-modal-body d-flex flex-column align-items-center justify-content-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Gerando boleto...</span>
                </div>
                <p className="mt-3 text-muted mb-0">Gerando boleto junto à EFI Bank…</p>
              </div>
            )}

            {/* ESTADO 3 — SUCESSO */}
            {boletoModalState === "success" && boletoResult && (
              <>
                <div className="boleto-modal-body" role="status" aria-live="polite">
                  <div className="text-center mb-4">
                    <i className="bi bi-check-circle-fill fs-1 text-success" />
                    <h5 className="fw-semibold text-success mt-2">Boleto Gerado com Sucesso</h5>
                  </div>
                  <div className="card border-0 bg-light mb-3">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between mb-2">
                        <span className="text-muted small">Valor</span>
                        <span
                          className="fw-semibold"
                          style={{ fontSize: "var(--fs-xl, 1.7rem)" }}
                        >
                          {formatBRL(boletoResult.valor)}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-muted small">Vencimento</span>
                        <span className="small">{formatDate(boletoResult.expireAt)}</span>
                      </div>
                    </div>
                  </div>

                  <label className="form-label small fw-semibold">Linha Digitável</label>
                  <div className="d-flex gap-2 align-items-start mb-3">
                    <input
                      type="text"
                      className="form-control boleto-linha-digitavel"
                      value={boletoResult.barcodeLinhaDigitavel}
                      readOnly
                      aria-label="Linha digitável do boleto"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm flex-shrink-0"
                      style={{ minWidth: "44px", minHeight: "44px" }}
                      onClick={() => {
                        void navigator.clipboard.writeText(boletoResult!.barcodeLinhaDigitavel);
                        setCopiado(true);
                        setTimeout(() => setCopiado(false), 2000);
                      }}
                    >
                      {copiado ? (
                        "Copiado! ✔"
                      ) : (
                        <>
                          <i className="bi bi-clipboard" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={fecharBoletoModal}
                  >
                    Fechar
                  </button>
                  <a
                    href={`/api/cobranca/boleto/${boletoResult.cobrancaId}/pdf`}
                    download={boletoResult.nomeArquivo}
                    className="btn btn-success"
                  >
                    <i className="bi bi-download me-1" />Baixar Boleto PDF
                  </a>
                  <a
                    href={boletoResult.linkBoleto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-secondary btn-sm"
                  >
                    <i className="bi bi-box-arrow-up-right me-1" />Ver no EFI
                  </a>
                  {boletoResult.nomeArquivo && (
                    <small className="text-muted d-block mt-1 text-center">
                      {boletoResult.nomeArquivo}
                    </small>
                  )}
                </div>
              </>
            )}

            {/* ESTADO 4 — ERRO */}
            {boletoModalState === "error" && (
              <>
                <div className="boleto-modal-body" role="alert" aria-live="assertive">
                  <div className="alert alert-danger d-flex gap-2">
                    <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                    <div>
                      <div>
                        {boletoErro ||
                          "Não foi possível gerar o boleto. Verifique a conexão e tente novamente."}
                      </div>
                      {boletoErroDetalhe && (
                        <small className="text-muted d-block mt-1">{boletoErroDetalhe}</small>
                      )}
                    </div>
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={fecharBoletoModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={() => {
                      setBoletoErro("");
                      setBoletoErroDetalhe("");
                      setBoletoModalState("confirm");
                    }}
                  >
                    Tentar Novamente
                  </button>
                </div>
              </>
            )}
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
        .boleto-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 1rem;
          animation: fadeIn 150ms ease-out;
        }
        .boleto-modal-card {
          width: min(520px, 100%);
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          animation: slideUp 150ms ease-out;
        }
        .boleto-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #ececec;
          background: #f9f7ed;
          border-radius: 10px 10px 0 0;
          flex-shrink: 0;
        }
        .boleto-modal-body {
          padding: 24px;
          flex: 1;
        }
        .boleto-modal-footer {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 16px 24px;
          border-top: 1px solid #ececec;
          flex-shrink: 0;
        }
        .boleto-linha-digitavel {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.85rem;
          background: #f5f5f5;
          border: 1px solid #ececec;
          border-radius: 6px;
          padding: 8px 12px;
          word-break: break-all;
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </>
  );
}
