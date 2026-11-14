"use client";

import { proximaOrdenacao, type ConfigOrdenacao, type Ordenacao } from "../_shared/ordenacao";

interface PropsSeletor<O extends string> {
  id: string;
  config: ConfigOrdenacao<O>;
  ordenacao: Ordenacao<O>;
  onMudar: (nova: Ordenacao<O>) => void;
}

/** Seletor "Ordenar Por" + botao de direcao, colocado logo acima de cada lista (Fase 48, D-05). */
export default function SeletorOrdenacao<O extends string>({ id, config, ordenacao, onMudar }: PropsSeletor<O>) {
  const textoDirecao = config.rotulosDirecao[ordenacao.ordem][ordenacao.dir];
  const rotuloBotao = `Inverter ordem (atual: ${textoDirecao})`;
  const invertida: Ordenacao<O> = { ordem: ordenacao.ordem, dir: ordenacao.dir === "asc" ? "desc" : "asc" };

  return (
    <div className="pa-ordenacao">
      <label className="pa-ordenacao-rotulo" htmlFor={id}>
        Ordenar Por
      </label>
      {config.permitidas.length > 1 ? (
        <select
          id={id}
          className="form-select form-select-sm"
          value={ordenacao.ordem}
          onChange={(e) => {
            const nova = config.permitidas.find((o) => o === e.target.value);
            if (nova !== undefined) onMudar({ ordem: nova, dir: config.direcaoInicial[nova] });
          }}
        >
          {config.permitidas.map((o) => (
            <option key={o} value={o}>
              {config.rotulos[o]}
            </option>
          ))}
        </select>
      ) : (
        <span id={id} className="pa-ordenacao-unico">
          {config.rotulos[ordenacao.ordem]}
        </span>
      )}
      <button
        type="button"
        className="pa-ordenacao-dir"
        aria-label={rotuloBotao}
        title={rotuloBotao}
        onClick={() => onMudar(invertida)}
      >
        <i className={`bi ${ordenacao.dir === "asc" ? "bi-arrow-up" : "bi-arrow-down"}`} aria-hidden="true" />
        {textoDirecao}
      </button>
      <style>{`
        .pa-ordenacao { display: inline-flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
        .pa-ordenacao-rotulo { color: var(--pa-text-muted); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin: 0; }
        .pa-ordenacao select { width: auto; min-width: 10rem; }
        .pa-ordenacao-unico { font-size: 0.8rem; font-weight: 600; color: var(--pa-text); }
        .pa-ordenacao-dir { border: 1px solid var(--pa-border); background: var(--pa-surface); color: var(--pa-text); border-radius: 6px; height: 31px; padding: 0 0.6rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
        .pa-ordenacao-dir:hover { background: var(--pa-accent-soft); color: var(--pa-accent); }
      `}</style>
    </div>
  );
}

interface PropsTh<O extends string> {
  ordem: O;
  rotulo: string;
  config: ConfigOrdenacao<O>;
  ordenacao: Ordenacao<O>;
  onMudar: (nova: Ordenacao<O>) => void;
  className?: string;
}

/** Cabecalho de coluna clicavel: reflete a ordem ativa em aria-sort e inverte/troca a ordem ao clicar. */
export function ThOrdenavel<O extends string>({ ordem, rotulo, config, ordenacao, onMudar, className }: PropsTh<O>) {
  const ativo = ordenacao.ordem === ordem;
  const ariaSort = ativo ? (ordenacao.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={className} aria-sort={ariaSort}>
      <button type="button" className="pa-th-sort" onClick={() => onMudar(proximaOrdenacao(ordenacao, ordem, config))}>
        {rotulo}
        {ativo && (
          <i
            className={`bi ${ordenacao.dir === "asc" ? "bi-sort-up" : "bi-sort-down"} ms-1`}
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
}
