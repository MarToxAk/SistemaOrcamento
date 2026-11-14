"use client";

import { useEffect, useState } from "react";
import NotasFiscais from "../../_componentes/notas-fiscais";
import { formatBRL, formatDate } from "../../_shared/formatadores";
import { CONFIG_NOTAS_CLIENTE, lerOrdenacao, ordenacaoParaUrl } from "../../_shared/ordenacao";
import { useFiltrosUrl } from "../../_shared/use-filtros-url";
import type { NotaFiscalAthos } from "./compartilhado";

interface AbaNotasProps {
  idcliente: string;
  onRecarregar: (mostrarCarregando?: boolean) => void;
}

/** NFS-e e NF-e do cliente com PDF, XML e ZIP (Remover Anexo na NFS-e) e notas fiscais do Athos com busca por numero. */
export function AbaNotas({ idcliente, onRecarregar }: AbaNotasProps) {
  // Sem id valido nao ha filtro: a lista geral nunca pode aparecer na tela de um cliente.
  const idClienteAthos = Number(idcliente);
  const idValido = Number.isInteger(idClienteAthos) && idClienteAthos > 0;

  // Ordem das notas na URL da tela do cliente: so por data de emissao (sem Nome, D-03); ordem=nome ou pago cai no padrao.
  const { obter, definir } = useFiltrosUrl();
  const ordenacao = lerOrdenacao(obter("ordem"), obter("dir"), CONFIG_NOTAS_CLIENTE);

  // Notas Fiscais Athos
  const [nfatCarregada, setNfatCarregada] = useState(false);
  const [notasFiscaisAthos, setNotasFiscaisAthos] = useState<NotaFiscalAthos[]>([]);
  const [loadingNfat, setLoadingNfat] = useState(false);
  const [buscaNumeroNf, setBuscaNumeroNf] = useState("");
  const [resultadoBuscaNf, setResultadoBuscaNf] = useState<NotaFiscalAthos[] | null>(null);
  const [buscandoNf, setBuscandoNf] = useState(false);

  /** Remove o anexo local da NFS-e (mesmo confirm e mesmo DELETE de antes); a lista recarrega pelo componente. */
  async function removerAnexo(
    nota: { id: number; numero: string | null },
    recarregarLista: () => void,
  ) {
    if (
      !confirm(
        `Remover anexo da NFS-e ${nota.numero ? `#${nota.numero}` : `(ID ${nota.id})`}?\n\nIsso NÃO cancela a nota na prefeitura, apenas remove o registro local e libera o título para novo anexo.`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/cobranca/nfse/${nota.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert((d as { error?: string }).error ?? "Erro ao cancelar NFS-e.");
      } else {
        recarregarLista();
        onRecarregar();
      }
    } catch {
      alert("Falha na conexão.");
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

  // A lista do Athos carrega uma vez ao abrir a aba (NFS-e e NF-e carregam dentro do NotasFiscais)
  useEffect(() => {
    void carregarNotasFiscaisAthos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idcliente]);

  return (
    <>
      {idValido ? (
        <NotasFiscais
          idclienteAthos={idClienteAthos}
          mostrarCliente={false}
          ordenacao={ordenacao}
          onMudarOrdenacao={(nova) => definir(ordenacaoParaUrl(nova, CONFIG_NOTAS_CLIENTE))}
          acoesExtrasNfse={(nota, recarregar) => (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger text-nowrap"
              title="Remove o anexo local. Não cancela a nota na prefeitura."
              onClick={() => void removerAnexo(nota, recarregar)}
            >
              Remover Anexo
            </button>
          )}
        />
      ) : (
        <div className="pa-card">
          <div className="pa-empty pa-empty-erro">
            <span>Cliente inválido.</span>
          </div>
        </div>
      )}

      <div className="pa-card mt-4 mb-4">
        <div className="pa-card-header">
          <strong><i className="bi bi-receipt-cutoff me-2 text-primary" />Notas Fiscais Athos</strong>
        </div>
        <div className="pa-card-body">
          <p className="small text-muted mb-3">
            PDF e XML disponíveis na seção NF-e dos Boletos para notas vinculadas a boleto.
          </p>
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
