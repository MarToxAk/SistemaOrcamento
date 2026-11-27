"use client";

import { useEffect, useId, useState } from "react";
import type { Assinante } from "../_shared/tipos";
import { formatarDinheiro, podeGerar } from "../_shared/formatadores";

interface ConfirmarLancamentoProps {
  /** Resumo do que sera lancado (texto ja formatado pelo servidor/formatadores; nada e calculado aqui). */
  resumo: { cliente: string; quantidadeItens: number; total: string };
  /** Valores iniciais do assinante (os da proposta, mantidos pela pagina). */
  assinanteInicial: Assinante;
  /** Verdadeiro enquanto a chamada de gerar esta em andamento: o botao fica travado (sem duplo disparo). */
  pendente: boolean;
  /** Mensagem original do servidor quando a ultima tentativa falhou. */
  erro: string | null;
  onCancelar: () => void;
  onConfirmar: (assinante: Assinante) => void;
}

/**
 * Confirmacao explicita do lancamento no Athos de producao (D-07): acao one-way, a proposta deixa de ser editavel
 * (D-08) e o cancelamento e so local (D-10). O botao de confirmar e decidido por `podeGerar` (ciencia, assinante
 * preenchido e nenhuma chamada pendente). Todo texto e renderizado como texto React.
 */
export default function ConfirmarLancamento({
  resumo,
  assinanteInicial,
  pendente,
  erro,
  onCancelar,
  onConfirmar,
}: ConfirmarLancamentoProps) {
  const titulo = useId();
  const [assinante, setAssinante] = useState<Assinante>(assinanteInicial);
  const [ciencia, setCiencia] = useState(false);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape" && !pendente) onCancelar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pendente, onCancelar]);

  const habilitado = podeGerar({ ciencia, assinanteNome: assinante.nome, pendente });

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titulo}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titulo}>
                Gerar proposta e lançar no Athos
              </h5>
            </div>
            <div className="modal-body">
              <div className="alert alert-danger" role="alert">
                Isto cria um orçamento REAL no Athos de produção com os itens e preços desta proposta. Depois de
                lançada, a proposta não pode mais ser editada (só duplicada) e o cancelamento no sistema é apenas
                local: o orçamento continua aberto no Athos e deve ser cancelado pelo Balcão.
              </div>

              <dl className="row small mb-3">
                <dt className="col-sm-4">Cliente</dt>
                <dd className="col-sm-8">{resumo.cliente}</dd>
                <dt className="col-sm-4">Itens</dt>
                <dd className="col-sm-8">{resumo.quantidadeItens}</dd>
                <dt className="col-sm-4">Total</dt>
                <dd className="col-sm-8 fw-semibold">{formatarDinheiro(resumo.total)}</dd>
              </dl>

              <div className="row g-2 mb-3">
                <div className="col-12">
                  <label className="form-label small mb-1" htmlFor={`${titulo}-nome`}>
                    Assinante (nome, obrigatório)
                  </label>
                  <input
                    id={`${titulo}-nome`}
                    type="text"
                    className="form-control form-control-sm"
                    maxLength={120}
                    value={assinante.nome}
                    disabled={pendente}
                    onChange={(e) => setAssinante({ ...assinante, nome: e.target.value })}
                  />
                </div>
                <div className="col-md-7">
                  <label className="form-label small mb-1" htmlFor={`${titulo}-cargo`}>
                    Cargo (opcional)
                  </label>
                  <input
                    id={`${titulo}-cargo`}
                    type="text"
                    className="form-control form-control-sm"
                    maxLength={120}
                    value={assinante.cargo}
                    disabled={pendente}
                    onChange={(e) => setAssinante({ ...assinante, cargo: e.target.value })}
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label small mb-1" htmlFor={`${titulo}-cpf`}>
                    CPF (opcional)
                  </label>
                  <input
                    id={`${titulo}-cpf`}
                    type="text"
                    className="form-control form-control-sm"
                    maxLength={20}
                    value={assinante.cpf}
                    disabled={pendente}
                    onChange={(e) => setAssinante({ ...assinante, cpf: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-check">
                <input
                  id={`${titulo}-ciencia`}
                  type="checkbox"
                  className="form-check-input"
                  checked={ciencia}
                  disabled={pendente}
                  onChange={(e) => setCiencia(e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`${titulo}-ciencia`}>
                  Entendi e quero lançar no Athos
                </label>
              </div>

              {erro ? (
                <div className="alert alert-warning mt-3 mb-0" role="alert">
                  {erro}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" disabled={pendente} onClick={onCancelar}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!habilitado}
                onClick={() => onConfirmar(assinante)}
              >
                {pendente ? "Lançando..." : "Gerar proposta e lançar no Athos"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
