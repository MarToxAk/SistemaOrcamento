"use client";

import { useState } from "react";
import { formatBRL, formatDate, formatMesAno } from "../../_shared/formatadores";
import { badgeClassName, type HistoricoCliente, type TituloReceber } from "./compartilhado";

interface AbaContasEmAbertoProps {
  titulos: TituloReceber[];
  loadingTitulos: boolean;
  erroTitulos: string;
  historico: HistoricoCliente | null;
  loadingHistorico: boolean;
  erroHistorico: string;
}

/** Visao somente leitura de todos os titulos em aberto do cliente, mais o historico de consumo. */
export function AbaContasEmAberto({
  titulos,
  loadingTitulos,
  erroTitulos,
  historico,
  loadingHistorico,
  erroHistorico,
}: AbaContasEmAbertoProps) {
  const [ordemItens, setOrdemItens] = useState<"valor" | "quantidade">("valor");
  const totalAberto = titulos.reduce((acc, t) => acc + t.valor, 0);

  return (
    <>
      <div className="pa-card">
        <div className="pa-card-header">
          <strong><i className="bi bi-receipt me-2 text-primary" />Títulos em Aberto</strong>
        </div>
        <div className="pa-card-body">
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
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>NF</th>
                  <th>Boleto</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {titulos.map((t) => {
                  const vencido = new Date(t.datavencimento) < new Date();
                  const boleto = t.boletoAtivo;
                  const pillVariante = !boleto
                    ? "secondary"
                    : boleto.status === "pago"
                      ? "success"
                      : boleto.status === "cancelado"
                        ? "secondary"
                        : "warning";
                  return (
                    <tr key={t.idcontareceber}>
                      <td className="small">{t.numerotitulo ?? "—"}</td>
                      <td className={`small${vencido ? " text-danger fw-semibold" : ""}`}>{formatDate(t.datavencimento)}</td>
                      <td className="small fw-semibold">{formatBRL(t.valor)}</td>
                      <td>
                        {t.tipoNf ? (
                          <span className="d-inline-flex align-items-center gap-1">
                            <span
                              className={`badge ${badgeClassName(t.tipoNf)}`}
                              title={t.numeroNf ? `Nº ${t.numeroNf}` : t.tipoNf}
                            >
                              {t.tipoNf}{t.numeroNf ? ` #${t.numeroNf}` : ""}
                            </span>
                            {t.nfseAtivo?.nfseEmitidaId && (
                              <a
                                href={`/api/cobranca/nfse/${t.nfseAtivo.nfseEmitidaId}/pdf`}
                                className="btn btn-link btn-sm p-0 text-success"
                                title="Baixar PDF da NFS-e"
                                style={{ lineHeight: 1 }}
                              >
                                <i className="bi bi-file-earmark-arrow-down" />
                              </a>
                            )}
                          </span>
                        ) : <span className="badge bg-secondary opacity-50">Sem NF</span>}
                      </td>
                      <td>
                        {boleto ? (
                          <span className={`pa-pill pa-pill-${pillVariante}`}>
                            <i className="bi bi-receipt me-1" />Boleto #{boleto.cobrancaId} — {boleto.status}
                          </span>
                        ) : (
                          <span className="small text-muted opacity-50">Sem Boleto</span>
                        )}
                      </td>
                      <td>
                        {vencido
                          ? <span className="badge bg-danger">VEN</span>
                          : <span className="badge bg-info text-dark">AVC</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="table-secondary">
                  <td colSpan={6} className="small text-muted">
                    {titulos.length} título(s) em aberto — Total: <strong>{formatBRL(totalAberto)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

        {/* Cards de resumo do histórico */}
          {!loadingHistorico && !erroHistorico && historico && (
            <div className="pa-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className="pa-card pa-stat">
                <div className="pa-stat-icon">
                  <i className="bi bi-cash-coin" />
                </div>
                <div className="pa-stat-body">
                  <p className="pa-stat-label">Total Já Pago</p>
                  <h4 className="pa-stat-value pa-stat-value-success">{formatBRL(historico.totalPago)}</h4>
                  <small className="text-muted">{historico.titulosPagos} título(s) quitado(s)</small>
                </div>
              </div>
              <div className="pa-card pa-stat">
                <div className="pa-stat-icon">
                  <i className="bi bi-calendar3" />
                </div>
                <div className="pa-stat-body">
                  <p className="pa-stat-label">Mês de Maior Gasto</p>
                  {historico.mesMaiorGasto ? (
                    <>
                      <h4 className="pa-stat-value pa-stat-value-accent">{formatMesAno(historico.mesMaiorGasto.mes)}</h4>
                      <small className="text-muted">{formatBRL(historico.mesMaiorGasto.total)} — por data de pagamento</small>
                    </>
                  ) : (
                    <h4 className="pa-stat-value pa-stat-value-accent">—</h4>
                  )}
                </div>
              </div>
              <div className="pa-card pa-stat">
                <div className="pa-stat-icon">
                  <i className="bi bi-tag" />
                </div>
                <div className="pa-stat-body">
                  <p className="pa-stat-label">Item de Maior Gasto</p>
                  {historico.itensPorValor.length > 0 ? (
                    <>
                      <h4 className="pa-stat-value pa-stat-value-accent">{historico.itensPorValor[0].descricao}</h4>
                      <small className="text-muted">{formatBRL(historico.itensPorValor[0].valorTotal)}</small>
                    </>
                  ) : (
                    <h4 className="pa-stat-value pa-stat-value-accent">—</h4>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contas Pagas */}
          <div className="pa-card mt-4">
            <div className="pa-card-header">
              <strong><i className="bi bi-check2-circle me-2 text-primary" />Contas Pagas</strong>
            </div>
            <div className="pa-card-body">
            {loadingHistorico ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroHistorico ? (
              <div className="pa-empty pa-empty-erro">{erroHistorico}</div>
            ) : !historico || historico.pagos.length === 0 ? (
              <div className="pa-empty">
                <span><i className="bi bi-info-circle me-2" />Nenhuma conta paga encontrada para este cliente.</span>
              </div>
            ) : (
              <div>
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Vencimento</th>
                      <th>Pagamento</th>
                      <th>Valor</th>
                      <th>Valor Pago</th>
                      <th>Juros</th>
                      <th>Desconto</th>
                      <th>Pedido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.pagos.map((p) => (
                      <tr key={p.idcontareceber}>
                        <td className="small">{p.numerotitulo ?? "—"}</td>
                        <td className="small">{formatDate(p.datavencimento)}</td>
                        <td className="small">{p.datapagamento ? formatDate(p.datapagamento) : "—"}</td>
                        <td className="small">{formatBRL(p.valor)}</td>
                        <td className="small fw-semibold">{formatBRL(p.valorpago)}</td>
                        <td className="small">{formatBRL(p.juros)}</td>
                        <td className="small">{formatBRL(p.desconto)}</td>
                        <td className="small">{p.numeroordem ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="table-secondary">
                      <td colSpan={8} className="small text-muted">
                        {historico.titulosPagos} título(s) pago(s) — Total: <strong>{formatBRL(historico.totalPago)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {historico.truncado && (
                  <p className="small text-muted mb-0">
                    Mostrando os 200 pagamentos mais recentes. O total acima considera todo o histórico.
                  </p>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Itens Mais Comprados */}
          <div className="pa-card mt-4">
            <div className="pa-card-header">
              <strong><i className="bi bi-bag-check me-2 text-primary" />Itens Mais Comprados</strong>
              <div className="pa-seg">
                <button
                  type="button"
                  className={`pa-seg-btn${ordemItens === "valor" ? " pa-seg-btn-active" : ""}`}
                  onClick={() => setOrdemItens("valor")}
                >
                  Por Valor
                </button>
                <button
                  type="button"
                  className={`pa-seg-btn${ordemItens === "quantidade" ? " pa-seg-btn-active" : ""}`}
                  onClick={() => setOrdemItens("quantidade")}
                >
                  Por Quantidade
                </button>
              </div>
            </div>
            <div className="pa-card-body">
            {loadingHistorico ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroHistorico ? (
              <div className="pa-empty pa-empty-erro">{erroHistorico}</div>
            ) : !historico ||
              (ordemItens === "valor" ? historico.itensPorValor : historico.itensPorQuantidade).length === 0 ? (
              <div className="pa-empty">
                <span><i className="bi bi-info-circle me-2" />Não há itens de venda registrados para este cliente.</span>
              </div>
            ) : (
              <div>
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Quantidade</th>
                      <th>Compras</th>
                      <th>Total Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ordemItens === "valor" ? historico.itensPorValor : historico.itensPorQuantidade).map((item) => (
                      <tr key={item.idproduto}>
                        <td className="small">{item.descricao}</td>
                        <td className="small">{item.quantidade}</td>
                        <td className="small">{item.compras}</td>
                        <td className="small fw-semibold">{formatBRL(item.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>

          {/* Gasto por Mês */}
          <div className="pa-card mt-4">
            <div className="pa-card-header">
              <strong><i className="bi bi-calendar3 me-2 text-primary" />Gasto por Mês</strong>
            </div>
            <div className="pa-card-body">
            {loadingHistorico ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroHistorico ? (
              <div className="pa-empty pa-empty-erro">{erroHistorico}</div>
            ) : !historico || historico.meses.length === 0 ? (
              <div className="pa-empty">
                <span><i className="bi bi-info-circle me-2" />Nenhum pagamento registrado para calcular o gasto mensal.</span>
              </div>
            ) : (
              <div>
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Títulos Pagos</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.meses.slice(0, 12).map((m) => {
                      const isPico = historico.mesMaiorGasto?.mes === m.mes;
                      return (
                        <tr key={m.mes} className={isPico ? "table-success" : undefined}>
                          <td className="small">
                            {formatMesAno(m.mes)}
                            {isPico && <span className="badge bg-success ms-2">Pico</span>}
                          </td>
                          <td className="small">{m.titulos}</td>
                          <td className="small fw-semibold">{formatBRL(m.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {historico.meses.length > 12 && (
                  <p className="small text-muted mb-0">
                    Mostrando os 12 meses mais recentes. O card de resumo considera todo o histórico.
                  </p>
                )}
              </div>
            )}
            </div>
          </div>
    </>
  );
}

export default AbaContasEmAberto;
