"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface TomadorAthosCliente {
  idcliente: number;
  tipoPessoa: "fisico" | "juridico";
  nome: string;
  documento: string | null;
  endereco: {
    logradouro: string;
    numero: string;
    bairro: string;
    cep: string;
    codigoMunicipio: string;
    uf: string;
  } | null;
}

interface TomadorAthosSearchProps {
  onSelecionar: (cliente: TomadorAthosCliente) => void;
  disabled?: boolean;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

function formatarDocumentoVisual(documento: string | null): string {
  if (!documento) return "";
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digitos.length === 14) {
    return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return documento;
}

function buildQuery(termoBruto: string): string | null {
  const termo = termoBruto.trim();
  if (termo.length < MIN_CHARS) return null;

  const digitos = termo.replace(/\D/g, "");
  const params = new URLSearchParams();
  params.set("take", "8");

  if (digitos.length === 11 || digitos.length === 14) {
    params.set("documento", digitos);
    return params.toString();
  }

  if (digitos.length > 0 && digitos === termo.replace(/\s/g, "") && digitos.length <= 9) {
    params.set("idcliente", digitos);
    return params.toString();
  }

  params.set("nome", termo);
  return params.toString();
}

/**
 * Busca remota (debounced) de cliente Athos dentro da tela do orcamento.
 * Espelha a UX de contas-receber/cliente-autocomplete.tsx (combobox/listbox
 * acessivel), mas busca em GET /api/athos/clientes em vez de filtrar uma
 * lista ja carregada em memoria. Nao importa nem depende do componente do
 * contas-receber (D-00/D-06) nem das variaveis CSS do admin-shell (prefixo
 * pa), que a pagina de orcamento nao carrega.
 */
export default function TomadorAthosSearch({ onSelecionar, disabled }: TomadorAthosSearchProps) {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<TomadorAthosCliente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);
  const [indiceDestacado, setIndiceDestacado] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    function onDocumentMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  useEffect(() => {
    const qs = buildQuery(termo);
    if (!qs) {
      setItens([]);
      setErro("");
      setCarregando(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setCarregando(true);
      setErro("");
      fetch(`/api/athos/clientes?${qs}`, { signal: controller.signal, cache: "no-store" })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data: { items?: TomadorAthosCliente[] }) => {
          setItens(Array.isArray(data?.items) ? data.items : []);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setItens([]);
          setErro("Falha ao buscar cliente no Athos.");
        })
        .finally(() => {
          setCarregando(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [termo]);

  function selecionar(cliente: TomadorAthosCliente) {
    setAberto(false);
    setIndiceDestacado(-1);
    onSelecionar(cliente);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || itens.length === 0) {
      if (e.key === "ArrowDown" && itens.length > 0) {
        setAberto(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceDestacado((i) => (i + 1) % itens.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceDestacado((i) => (i <= 0 ? itens.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (indiceDestacado >= 0 && indiceDestacado < itens.length) {
        e.preventDefault();
        selecionar(itens[indiceDestacado]);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const activeOptionId =
    indiceDestacado >= 0 && indiceDestacado < itens.length ? `${listboxId}-opt-${indiceDestacado}` : undefined;

  return (
    <div className="tas-search" ref={containerRef}>
      <div className="input-group input-group-sm">
        <span className="input-group-text bg-white">
          <i className="bi bi-search" />
        </span>
        <input
          type="text"
          className="form-control"
          placeholder="Buscar cliente por nome, CPF/CNPJ ou ID (min. 3 caracteres)..."
          value={termo}
          disabled={disabled}
          role="combobox"
          aria-expanded={aberto}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          onChange={(e) => {
            setTermo(e.target.value);
            setIndiceDestacado(-1);
            setAberto(e.target.value.trim().length >= MIN_CHARS);
          }}
          onFocus={() => {
            if (termo.trim().length >= MIN_CHARS) setAberto(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {carregando ? (
          <span className="input-group-text bg-white">
            <span className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">Buscando...</span>
            </span>
          </span>
        ) : null}
      </div>
      {aberto && (
        <ul className="tas-search-list list-group" id={listboxId} role="listbox">
          {erro ? (
            <li className="list-group-item tas-search-erro">{erro}</li>
          ) : carregando && itens.length === 0 ? (
            <li className="list-group-item tas-search-empty">Buscando...</li>
          ) : itens.length === 0 ? (
            <li className="list-group-item tas-search-empty">Nenhum cliente encontrado</li>
          ) : (
            itens.map((cliente, idx) => (
              <li
                key={cliente.idcliente}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={idx === indiceDestacado}
                className={`list-group-item tas-search-item${idx === indiceDestacado ? " tas-search-item-active" : ""}`}
                onMouseEnter={() => setIndiceDestacado(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionar(cliente);
                }}
              >
                <span className="tas-id-badge">#{cliente.idcliente}</span>
                <span className="tas-search-nome text-truncate" title={cliente.nome}>
                  {cliente.nome}
                </span>
                <span className="tas-search-doc">{formatarDocumentoVisual(cliente.documento)}</span>
              </li>
            ))
          )}
        </ul>
      )}

      <style>{`
        .tas-search { position: relative; width: 100%; max-width: 420px; }
        .tas-search-list {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 1060;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, .16);
          max-height: 280px;
          overflow-y: auto;
          padding: 0.25rem;
        }
        .tas-search-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0.45rem 0.6rem;
        }
        .tas-search-item-active { background: #f0e7fa; }
        .tas-search-nome { flex: 1 1 auto; min-width: 0; }
        .tas-search-doc { color: #6c757d; font-size: 0.8rem; white-space: nowrap; }
        .tas-id-badge {
          background: #e9ecef;
          color: #495057;
          border-radius: 999px;
          padding: 0.1rem 0.5rem;
          font-size: 0.75rem;
          white-space: nowrap;
        }
        .tas-search-empty, .tas-search-erro {
          border: none;
          padding: 0.6rem 0.75rem;
          font-size: 0.85rem;
          color: #6c757d;
        }
        .tas-search-erro { color: #b02a37; }
      `}</style>
    </div>
  );
}
