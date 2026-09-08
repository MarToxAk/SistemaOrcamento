"use client";

import { useEffect, useId, useRef, useState } from "react";

interface ClienteSugestao {
  idcliente: number;
  nome_cliente: string;
  total_devido: number;
  maior_atraso_dias: number | null;
}

interface ClienteAutocompleteProps {
  clientes: ClienteSugestao[];
  valor: string;
  onValorChange: (valor: string) => void;
  onSelecionar: (idcliente: number) => void;
}

const MAX_SUGESTOES = 8;

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default function ClienteAutocomplete({ clientes, valor, onValorChange, onSelecionar }: ClienteAutocompleteProps) {
  const [aberto, setAberto] = useState(false);
  const [indiceDestacado, setIndiceDestacado] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const termo = normalizar(valor.trim());
  const sugestoes: ClienteSugestao[] = termo
    ? clientes
        .filter(
          (c) => normalizar(c.nome_cliente).includes(termo) || String(c.idcliente).startsWith(termo),
        )
        .slice(0, MAX_SUGESTOES)
    : [];

  useEffect(() => {
    function onDocumentMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  function selecionar(cliente: ClienteSugestao) {
    setAberto(false);
    setIndiceDestacado(-1);
    onSelecionar(cliente.idcliente);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || sugestoes.length === 0) {
      if (e.key === "ArrowDown" && sugestoes.length > 0) {
        setAberto(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceDestacado((i) => (i + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceDestacado((i) => (i <= 0 ? sugestoes.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (indiceDestacado >= 0 && indiceDestacado < sugestoes.length) {
        e.preventDefault();
        selecionar(sugestoes[indiceDestacado]);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const activeOptionId =
    indiceDestacado >= 0 && indiceDestacado < sugestoes.length ? `${listboxId}-opt-${indiceDestacado}` : undefined;

  return (
    <div className="pa-autocomplete" ref={containerRef}>
      <div className="input-group input-group-sm">
        <span className="input-group-text bg-white">
          <i className="bi bi-search" />
        </span>
        <input
          type="text"
          className="form-control"
          placeholder="Buscar cliente por nome ou ID..."
          value={valor}
          role="combobox"
          aria-expanded={aberto}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          onChange={(e) => {
            onValorChange(e.target.value);
            setIndiceDestacado(-1);
            setAberto(e.target.value.trim().length > 0);
          }}
          onFocus={() => {
            if (valor.trim().length > 0) setAberto(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {aberto && (
        <ul className="pa-autocomplete-list" id={listboxId} role="listbox">
          {sugestoes.length === 0 ? (
            <li className="pa-autocomplete-empty">Nenhum cliente encontrado</li>
          ) : (
            sugestoes.map((cliente, idx) => (
              <li
                key={cliente.idcliente}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={idx === indiceDestacado}
                className={`pa-autocomplete-item${idx === indiceDestacado ? " pa-autocomplete-item-active" : ""}`}
                onMouseEnter={() => setIndiceDestacado(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionar(cliente);
                }}
              >
                <span className="pa-id-badge">#{cliente.idcliente}</span>
                <span className="pa-autocomplete-nome text-truncate" title={cliente.nome_cliente}>
                  {cliente.nome_cliente}
                </span>
                <span className="pa-autocomplete-valor">
                  {cliente.total_devido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                {cliente.maior_atraso_dias !== null && cliente.maior_atraso_dias > 0 && (
                  <span className="pa-pill pa-pill-warning">{cliente.maior_atraso_dias}d</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}

      <style>{`
        .pa-autocomplete { position: relative; width: 260px; }
        .pa-autocomplete-list {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 1045;
          background: var(--pa-surface);
          border: 1px solid var(--pa-border);
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, .12);
          list-style: none;
          margin: 0;
          padding: 0.25rem;
          max-height: 320px;
          overflow-y: auto;
        }
        .pa-autocomplete-empty {
          padding: 0.6rem 0.75rem;
          color: var(--pa-text-muted);
          font-size: 0.85rem;
        }
        .pa-autocomplete-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 0.6rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .pa-autocomplete-item-active { background: var(--pa-accent-soft); }
        .pa-autocomplete-nome { flex: 1 1 auto; min-width: 0; }
        .pa-autocomplete-valor { color: var(--pa-text-muted); font-size: 0.8rem; white-space: nowrap; }
      `}</style>
    </div>
  );
}
