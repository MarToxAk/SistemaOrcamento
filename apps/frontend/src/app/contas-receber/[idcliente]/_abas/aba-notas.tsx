"use client";

import { useEffect, useState } from "react";
import { safeHttpUrl } from "@/lib/safe-url";
import { formatBRL, formatDate } from "../../_shared/formatadores";
import type { NfseEmitidaCliente, NotaFiscalAthos } from "./compartilhado";

interface AbaNotasProps {
  idcliente: string;
  onRecarregar: (mostrarCarregando?: boolean) => void;
}

/** NFS-e emitidas (com remover anexo) e notas fiscais do Athos com busca por numero. */
export function AbaNotas({ idcliente, onRecarregar }: AbaNotasProps) {
  // NFS-e Emitidas
  const [nfseCarregada, setNfseCarregada] = useState(false);
  const [nfseEmitidas, setNfseEmitidas] = useState<NfseEmitidaCliente[]>([]);
  const [loadingNfse, setLoadingNfse] = useState(false);

  // Notas Fiscais Athos
  const [nfatCarregada, setNfatCarregada] = useState(false);
  const [notasFiscaisAthos, setNotasFiscaisAthos] = useState<NotaFiscalAthos[]>([]);
  const [loadingNfat, setLoadingNfat] = useState(false);
  const [buscaNumeroNf, setBuscaNumeroNf] = useState("");
  const [resultadoBuscaNf, setResultadoBuscaNf] = useState<NotaFiscalAthos[] | null>(null);
  const [buscandoNf, setBuscandoNf] = useState(false);

  async function carregarNfseEmitidas() {
    setLoadingNfse(true);
    try {
      const res = await fetch(`/api/cobranca/nfse/cliente/${idcliente}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as NfseEmitidaCliente[];
        setNfseEmitidas(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingNfse(false);
      setNfseCarregada(true);
    }
  }

  async function carregarNotasFiscaisAthos() {
    setLoadingNfat(true);
    try {
      const res = await fetch(`/api/athos/clientes/${idcliente}/notas-fiscais`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as NotaFiscalAthos[];
        setNotasFiscaisAthos(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingNfat(false);
      setNfatCarregada(true);
    }
  }

  async function buscarNotaPorNumero() {
    if (!buscaNumeroNf.trim()) return;
    setBuscandoNf(true);
    try {
      const res = await fetch(
        `/api/athos/clientes/${idcliente}/notas-fiscais?numero=${encodeURIComponent(buscaNumeroNf.trim())}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as NotaFiscalAthos[];
        setResultadoBuscaNf(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setBuscandoNf(false);
    }
  }

  // As duas listas carregam uma vez ao abrir a aba
  useEffect(() => {
    void carregarNfseEmitidas();
    void carregarNotasFiscaisAthos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idcliente]);

  return (
    <>
      <div className="pa-card">
        <div className="pa-card-header">
          <strong><i className="bi bi-file-earmark-text me-2 text-primary" />NFS-e Emitidas</strong>
        </div>
        <div className="pa-card-body">
          {loadingNfse ? (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Carregando NFS-e...</span>
              </div>
            </div>
          ) : nfseCarregada && nfseEmitidas.length === 0 ? (
            <div className="pa-empty">
              <span>Nenhuma NFS-e emitida para este cliente</span>
            </div>
          ) : nfseEmitidas.length > 0 ? (
            <div>
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Data emissão</th>
                    <th>Nº NFS-e</th>
                    <th>Nº RPS</th>
                    <th>Valor</th>
                    <th>Títulos vinculados</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {nfseEmitidas.map((nfse) => (
                    <tr key={nfse.id}>
                      <td className="small">{formatDate(nfse.dataEmissao)}</td>
                      <td className="small">{nfse.numeroNfse ?? "—"}</td>
                      <td className="small">{nfse.numeroRps ?? "—"}</td>
                      <td className="small fw-semibold">{formatBRL(nfse.valorServico)}</td>
                      <td className="small">
                        {nfse.titulos.length > 0
                          ? nfse.titulos.map((tid, i) => (
                              <span key={tid}>
                                <span className="badge bg-secondary">{tid}</span>
                                {i < nfse.titulos.length - 1 && " "}
                              </span>
                            ))
                          : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <div className="d-flex gap-2 align-items-center">
                          {nfse.linkNfse && (
                            <a
                              href={safeHttpUrl(nfse.linkNfse) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-success"
                              title="Baixar PDF da NFS-e"
                            >
                              <i className="bi bi-file-earmark-arrow-down" />
                            </a>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            title="Remove o anexo local. Não cancela a nota na prefeitura."
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Remover anexo da NFS-e ${nfse.numeroNfse ? `#${nfse.numeroNfse}` : `(ID ${nfse.id})`}?\n\nIsso NÃO cancela a nota na prefeitura, apenas remove o registro local e libera o título para novo anexo.`,
                                )
                              )
                                return;
                              try {
                                const res = await fetch(`/api/cobranca/nfse/${nfse.id}`, {
                                  method: "DELETE",
                                });
                                if (!res.ok) {
                                  const d = await res.json().catch(() => ({}));
                                  alert((d as { error?: string }).error ?? "Erro ao cancelar NFS-e.");
                                } else {
                                  setNfseEmitidas((prev) => prev.filter((n) => n.id !== nfse.id));
                                  onRecarregar();
                                }
                              } catch {
                                alert("Falha na conexão.");
                              }
                            }}
                          >
                            Cancelar ⓘ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pa-card mt-4 mb-4">
        <div className="pa-card-header">
          <strong><i className="bi bi-receipt-cutoff me-2 text-primary" />Notas Fiscais Athos</strong>
        </div>
        <div className="pa-card-body">
          {/* Campo de busca por número */}
          <div className="d-flex gap-2 mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ maxWidth: "240px" }}
              placeholder="Buscar por número da nota"
              value={buscaNumeroNf}
              onChange={(e) => setBuscaNumeroNf(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void buscarNotaPorNumero(); }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => void buscarNotaPorNumero()}
              disabled={buscandoNf || !buscaNumeroNf.trim()}
            >
              {buscandoNf ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              ) : "Buscar"}
            </button>
            {resultadoBuscaNf !== null && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => { setResultadoBuscaNf(null); setBuscaNumeroNf(""); }}
              >
                Limpar
              </button>
            )}
          </div>

          {/* Resultado da busca — acima da lista (D-16) */}
          {resultadoBuscaNf !== null && (
            <div className="alert alert-info mb-3">
              <strong>Resultado da busca — Nota Nº {buscaNumeroNf}:</strong>
              {resultadoBuscaNf.length === 0 ? (
                <span className="ms-1">Nenhuma nota encontrada com este número.</span>
              ) : (
                <div className="mt-2">
                  <table className="pa-table">
                    <thead>
                      <tr>
                        <th>Nº da nota</th>
                        <th>Data emissão</th>
                        <th>Valor</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoBuscaNf.map((nf) => (
                        <tr key={nf.numero}>
                          <td className="small">{nf.numero}</td>
                          <td className="small">{nf.dataemissao ? formatDate(nf.dataemissao) : "—"}</td>
                          <td className="small fw-semibold">{formatBRL(nf.valor)}</td>
                          <td className="small"><span className="pa-pill pa-pill-secondary">{nf.tipo}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Lista geral de até 50 notas — sempre visível (D-15) */}
          {loadingNfat ? (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Carregando notas fiscais...</span>
              </div>
            </div>
          ) : nfatCarregada && notasFiscaisAthos.length === 0 ? (
            <div className="pa-empty">
              <span>Nenhuma nota fiscal encontrada no Athos</span>
            </div>
          ) : notasFiscaisAthos.length > 0 ? (
            <div>
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Nº da nota</th>
                    <th>Data emissão</th>
                    <th>Valor</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {notasFiscaisAthos.map((nf) => (
                    <tr key={nf.numero}>
                      <td className="small">{nf.numero}</td>
                      <td className="small">{nf.dataemissao ? formatDate(nf.dataemissao) : "—"}</td>
                      <td className="small fw-semibold">{formatBRL(nf.valor)}</td>
                      <td className="small"><span className="pa-pill pa-pill-secondary">{nf.tipo}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default AbaNotas;
