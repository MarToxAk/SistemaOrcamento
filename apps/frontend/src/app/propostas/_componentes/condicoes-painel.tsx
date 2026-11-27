"use client";

import { useEffect, useId, useState } from "react";
import type { Assinante, AssinanteRecente, PropostaDetalhe } from "../_shared/tipos";
import { CampoTexto, IndicadorGravacao, useGravacao, type SalvarCabecalho } from "./campos-cabecalho";

interface CondicoesPainelProps {
  proposta: PropostaDetalhe;
  /** Verdadeiro fora de RASCUNHO (a pagina decide por `!podeEditar(status)`, D-08). */
  desabilitado: boolean;
  onSalvar: SalvarCabecalho;
  /** Assinante em edicao (a pagina o guarda e o entrega a acao de gerar; o servidor so o recebe ao gerar, D-19). */
  assinante: Assinante;
  onAssinanteChange: (assinante: Assinante) => void;
}

const DIAS_MIN = 1;
const DIAS_MAX = 365;
const OBSERVACAO_MAX = 2000;

interface CampoDiasProps {
  rotulo: string;
  valor: number;
  desabilitado: boolean;
  onConfirmar: (dias: number) => void;
  onInvalido: (mensagem: string) => void;
}

/** Dias inteiros de 1 a 365 (D-20); grava ao sair do campo e so quando o numero mudou. */
function CampoDias({ rotulo, valor, desabilitado, onConfirmar, onInvalido }: CampoDiasProps) {
  const id = useId();
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => setTexto(String(valor)), [valor]);

  function confirmar() {
    const limpo = texto.trim();
    if (!/^\d{1,3}$/.test(limpo) || Number(limpo) < DIAS_MIN || Number(limpo) > DIAS_MAX) {
      onInvalido(`${rotulo}: informe um número inteiro de ${DIAS_MIN} a ${DIAS_MAX}.`);
      setTexto(String(valor));
      return;
    }
    const dias = Number(limpo);
    setTexto(String(dias));
    if (dias !== valor) onConfirmar(dias);
  }

  return (
    <>
      <label htmlFor={id} className="form-label small text-muted mb-1">
        {rotulo}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className="form-control form-control-sm"
        maxLength={3}
        value={texto}
        disabled={desabilitado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </>
  );
}

function rotuloRecente(a: AssinanteRecente): string {
  return a.cargo ? `${a.nome} — ${a.cargo}` : a.nome;
}

/**
 * Condicoes comerciais (validade, prazo de entrega, observacao) gravadas ao sair do campo, e assinante escolhido
 * entre os recentes (GET /api/propostas/assinantes) ou digitado. O assinante nao vai no PATCH do cabecalho: o
 * servidor o recebe somente ao gerar a proposta (D-19).
 */
export default function CondicoesPainel({
  proposta,
  desabilitado,
  onSalvar,
  assinante,
  onAssinanteChange,
}: CondicoesPainelProps) {
  const { estado, erro, salvar, falhar } = useGravacao(onSalvar);
  const idObservacao = useId();
  const idRecentes = useId();
  const [observacao, setObservacao] = useState(proposta.observacao ?? "");
  const [recentes, setRecentes] = useState<AssinanteRecente[]>([]);

  useEffect(() => setObservacao(proposta.observacao ?? ""), [proposta.observacao]);

  // Os recentes so servem para escolher quem assina; fora de RASCUNHO a lista nao e usada.
  useEffect(() => {
    if (desabilitado) return;
    const controller = new AbortController();
    fetch("/api/propostas/assinantes", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((dados: unknown) => {
        if (!Array.isArray(dados)) return setRecentes([]);
        setRecentes(
          dados.filter(
            (a): a is AssinanteRecente => a !== null && typeof a === "object" && typeof (a as { nome?: unknown }).nome === "string",
          ),
        );
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setRecentes([]);
      });
    return () => controller.abort();
  }, [desabilitado]);

  function salvarObservacao() {
    const nova = observacao.trim();
    setObservacao(nova);
    if (nova === (proposta.observacao ?? "")) return;
    void salvar({ observacao: nova === "" ? null : nova });
  }

  function escolherRecente(indice: string) {
    const escolhido = indice === "" ? undefined : recentes[Number(indice)];
    if (!escolhido) return;
    onAssinanteChange({ nome: escolhido.nome, cargo: escolhido.cargo ?? "", cpf: escolhido.cpf ?? "" });
  }

  return (
    <div className="pa-card mb-3">
      <div className="pa-card-header">
        <span className="fw-semibold">Condições e assinante</span>
        <IndicadorGravacao estado={estado} erro={erro} />
      </div>
      <div className="pa-card-body">
        <div className="row g-3">
          <div className="col-md-3">
            <CampoDias
              rotulo="Validade (dias)"
              valor={proposta.validadeDias}
              desabilitado={desabilitado}
              onConfirmar={(dias) => void salvar({ validadeDias: dias })}
              onInvalido={falhar}
            />
          </div>
          <div className="col-md-3">
            <CampoDias
              rotulo="Prazo de entrega (dias)"
              valor={proposta.prazoEntregaDias}
              desabilitado={desabilitado}
              onConfirmar={(dias) => void salvar({ prazoEntregaDias: dias })}
              onInvalido={falhar}
            />
          </div>
          <div className="col-12">
            <label htmlFor={idObservacao} className="form-label small text-muted mb-1">
              Observação (impressa no PDF)
            </label>
            <textarea
              id={idObservacao}
              className="form-control form-control-sm"
              rows={3}
              maxLength={OBSERVACAO_MAX}
              value={observacao}
              disabled={desabilitado}
              onChange={(e) => setObservacao(e.target.value)}
              onBlur={salvarObservacao}
            />
            <div className="small text-muted text-end">
              {observacao.length}/{OBSERVACAO_MAX}
            </div>
          </div>
        </div>

        <div className="mt-3 border-top pt-3">
          <div className="fw-semibold mb-2">Assinante</div>
          <div className="row g-3">
            {!desabilitado && recentes.length > 0 ? (
              <div className="col-12">
                <label htmlFor={idRecentes} className="form-label small text-muted mb-1">
                  Assinantes recentes
                </label>
                <select
                  id={idRecentes}
                  className="form-select form-select-sm"
                  value=""
                  onChange={(e) => escolherRecente(e.target.value)}
                >
                  <option value="">Escolher um assinante recente...</option>
                  {recentes.map((a, i) => (
                    <option key={`${a.nome}|${a.cargo ?? ""}|${a.cpf ?? ""}`} value={String(i)}>
                      {rotuloRecente(a)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="col-md-5">
              <CampoTexto
                rotulo="Nome (obrigatório para gerar)"
                valor={assinante.nome}
                maxLength={120}
                desabilitado={desabilitado}
                onConfirmar={(novo) => onAssinanteChange({ ...assinante, nome: novo })}
              />
            </div>
            <div className="col-md-4">
              <CampoTexto
                rotulo="Cargo (opcional)"
                valor={assinante.cargo}
                maxLength={120}
                desabilitado={desabilitado}
                onConfirmar={(novo) => onAssinanteChange({ ...assinante, cargo: novo })}
              />
            </div>
            <div className="col-md-3">
              <CampoTexto
                rotulo="CPF (opcional)"
                valor={assinante.cpf}
                maxLength={20}
                desabilitado={desabilitado}
                onConfirmar={(novo) => onAssinanteChange({ ...assinante, cpf: novo })}
              />
            </div>
          </div>
          {!desabilitado ? (
            <div className="small text-muted mt-2">O assinante é gravado na proposta ao gerá-la.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
