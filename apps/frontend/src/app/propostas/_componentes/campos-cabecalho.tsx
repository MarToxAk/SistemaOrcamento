"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CamposCabecalho } from "../_shared/tipos";

/** Envia os campos alterados ao servidor; devolve a mensagem de erro, ou null quando o servidor aceitou. */
export type SalvarCabecalho = (campos: CamposCabecalho) => Promise<string | null>;

export type EstadoGravacao = "ocioso" | "salvando" | "salvo" | "erro";

/**
 * Estado "Salvando..." / "Salvo" / erro de um painel. As gravacoes sao serializadas (uma de cada vez, na ordem
 * em que foram pedidas), para que a resposta de uma nunca sobreponha a de outra mais recente.
 */
export function useGravacao(onSalvar: SalvarCabecalho) {
  const [estado, setEstado] = useState<EstadoGravacao>("ocioso");
  const [erro, setErro] = useState("");
  const cadeia = useRef<Promise<unknown>>(Promise.resolve());
  const pendentes = useRef(0);
  const houveErro = useRef(false);

  const salvar = useCallback(
    (campos: CamposCabecalho): Promise<string | null> => {
      if (pendentes.current === 0) houveErro.current = false;
      pendentes.current += 1;
      setEstado("salvando");
      setErro("");
      const execucao = cadeia.current.then(async () => {
        const mensagem = await onSalvar(campos);
        pendentes.current -= 1;
        if (mensagem) {
          houveErro.current = true;
          setErro(mensagem);
          setEstado("erro");
        } else if (pendentes.current === 0 && !houveErro.current) {
          setEstado("salvo");
        }
        return mensagem;
      });
      cadeia.current = execucao.catch(() => null);
      return execucao;
    },
    [onSalvar],
  );

  /** Mostra um erro de validacao local sem chamar o servidor. */
  const falhar = useCallback((mensagem: string) => {
    setErro(mensagem);
    setEstado("erro");
  }, []);

  return { estado, erro, salvar, falhar };
}

/** Indicador discreto do estado de gravacao do painel. Texto sempre renderizado como texto React. */
export function IndicadorGravacao({ estado, erro }: { estado: EstadoGravacao; erro: string }) {
  if (estado === "salvando") {
    return (
      <span className="small text-muted" role="status">
        Salvando...
      </span>
    );
  }
  if (estado === "salvo") {
    return (
      <span className="small text-success" role="status">
        <i className="bi bi-check2 me-1" />
        Salvo
      </span>
    );
  }
  if (estado === "erro") {
    return (
      <span className="small text-danger" role="alert">
        {erro}
      </span>
    );
  }
  return null;
}

interface CampoTextoProps {
  rotulo: string;
  /** Valor atual no servidor (a resposta e a fonte da verdade). */
  valor: string | null | undefined;
  maxLength: number;
  desabilitado: boolean;
  tipo?: "text" | "email" | "tel";
  placeholder?: string;
  /** Normaliza o texto digitado antes de comparar e enviar (ex.: caixa alta da UF). */
  transformar?: (texto: string) => string;
  /** Chamado ao sair do campo, so quando o texto (sem espacos nas pontas) mudou. "" = limpar o campo. */
  onConfirmar: (novo: string) => void;
}

/** Campo de texto de uma linha que grava ao sair (nunca a cada tecla) e volta ao valor do servidor quando ele muda. */
export function CampoTexto({
  rotulo,
  valor,
  maxLength,
  desabilitado,
  tipo = "text",
  placeholder,
  transformar,
  onConfirmar,
}: CampoTextoProps) {
  const id = useId();
  const [texto, setTexto] = useState(valor ?? "");

  useEffect(() => setTexto(valor ?? ""), [valor]);

  function confirmar() {
    const novo = (transformar ? transformar(texto) : texto).trim();
    setTexto(novo);
    if (novo === (valor ?? "")) return;
    onConfirmar(novo);
  }

  return (
    <>
      <label htmlFor={id} className="form-label small text-muted mb-1">
        {rotulo}
      </label>
      <input
        id={id}
        type={tipo}
        className="form-control form-control-sm"
        maxLength={maxLength}
        placeholder={placeholder}
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
