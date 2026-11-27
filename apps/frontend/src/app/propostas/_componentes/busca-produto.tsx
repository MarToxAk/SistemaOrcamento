"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProdutoBusca } from "../_shared/tipos";
import { formatarDinheiro, formatarQuantidade } from "../_shared/formatadores";

interface BuscaProdutoProps {
  /** Pede ao servidor para adicionar o item. Devolve a mensagem de erro, ou null quando deu certo. */
  onAdicionar: (idproduto: number, quantidade: number) => Promise<string | null>;
  desabilitado?: boolean;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;
const LIMITE = 10;
const QUANTIDADE_MAXIMA = 10000;

/** Le a quantidade digitada (ate 3 casas, virgula ou ponto). Devolve o numero ou a mensagem de erro. */
function lerQuantidade(texto: string, permiteFracionar: boolean): { valor: number } | { erro: string } {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(limpo)) {
    return { erro: "Informe uma quantidade válida (até 3 casas decimais)." };
  }
  const valor = Number(limpo);
  if (!(valor >= 0.001)) return { erro: "A quantidade deve ser maior que zero." };
  if (valor > QUANTIDADE_MAXIMA) return { erro: "A quantidade máxima é 10.000." };
  if (!permiteFracionar && !Number.isInteger(valor)) {
    return { erro: "Este produto não permite quantidade fracionada." };
  }
  return { valor };
}

/**
 * Busca remota (com atraso) de produto do Athos para montar a proposta. A marca aparece so como apoio a
 * escolha: nunca vai para a tabela de itens nem para o PDF (D-22). Todo texto vindo da API e renderizado
 * como texto React.
 */
export default function BuscaProduto({ onAdicionar, desabilitado = false }: BuscaProdutoProps) {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<ProdutoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);
  const [indiceDestacado, setIndiceDestacado] = useState(-1);
  const [escolhido, setEscolhido] = useState<ProdutoBusca | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [erroAdicao, setErroAdicao] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  useEffect(() => {
    const texto = termo.trim();
    if (texto.length < MIN_CHARS) {
      setItens([]);
      setErro("");
      setCarregando(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setCarregando(true);
      setErro("");
      const qs = new URLSearchParams({ q: texto, limit: String(LIMITE) });
      fetch(`/api/propostas/produtos?${qs.toString()}`, { signal: controller.signal, cache: "no-store" })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((dados: unknown) => {
          setItens(Array.isArray(dados) ? (dados as ProdutoBusca[]) : []);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === "AbortError") return;
          setItens([]);
          setErro("Falha ao buscar produto no Athos.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setCarregando(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [termo]);

  function escolher(produto: ProdutoBusca) {
    if (produto.preco == null) return;
    setEscolhido(produto);
    setQuantidade("1");
    setErroAdicao("");
    setAberto(false);
    setIndiceDestacado(-1);
  }

  function cancelarEscolha() {
    setEscolhido(null);
    setErroAdicao("");
  }

  async function confirmar() {
    if (!escolhido || adicionando) return;
    const lida = lerQuantidade(quantidade, escolhido.permiteFracionar);
    if ("erro" in lida) {
      setErroAdicao(lida.erro);
      return;
    }
    setAdicionando(true);
    setErroAdicao("");
    const mensagem = await onAdicionar(escolhido.idproduto, lida.valor);
    setAdicionando(false);
    if (mensagem) {
      setErroAdicao(mensagem);
      return;
    }
    setEscolhido(null);
    setTermo("");
    setItens([]);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || itens.length === 0) {
      if (e.key === "ArrowDown" && itens.length > 0) setAberto(true);
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
        escolher(itens[indiceDestacado]);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const opcaoAtiva =
    indiceDestacado >= 0 && indiceDestacado < itens.length ? `${listboxId}-opt-${indiceDestacado}` : undefined;

  return (
    <div className="bp-busca" ref={containerRef}>
      <label className="form-label small text-muted mb-1" htmlFor={`${listboxId}-campo`}>
        Adicionar produto do Athos
      </label>
      <div className="input-group input-group-sm">
        <span className="input-group-text bg-white">
          <i className="bi bi-search" />
        </span>
        <input
          id={`${listboxId}-campo`}
          type="text"
          className="form-control"
          placeholder="Buscar por nome, código ou marca (mín. 2 caracteres)..."
          value={termo}
          disabled={desabilitado}
          role="combobox"
          aria-expanded={aberto}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={opcaoAtiva}
          onChange={(e) => {
            setTermo(e.target.value);
            setIndiceDestacado(-1);
            setAberto(e.target.value.trim().length >= MIN_CHARS);
          }}
          onFocus={() => {
            if (termo.trim().length >= MIN_CHARS) setAberto(true);
          }}
          onKeyDown={aoTeclar}
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
        <ul className="bp-lista list-group" id={listboxId} role="listbox">
          {erro ? (
            <li className="list-group-item bp-aviso bp-erro">{erro}</li>
          ) : carregando && itens.length === 0 ? (
            <li className="list-group-item bp-aviso">Buscando...</li>
          ) : itens.length === 0 ? (
            <li className="list-group-item bp-aviso">
              Produto não encontrado? Cadastre no Athos desktop e busque de novo: este sistema não cadastra
              produtos.
            </li>
          ) : (
            itens.map((produto, idx) => {
              const semPreco = produto.preco == null;
              return (
                <li
                  key={produto.idproduto}
                  id={`${listboxId}-opt-${idx}`}
                  role="option"
                  aria-selected={idx === indiceDestacado}
                  aria-disabled={semPreco}
                  className={`list-group-item bp-item${idx === indiceDestacado ? " bp-item-ativo" : ""}${
                    semPreco ? " bp-item-desabilitado" : ""
                  }`}
                  onMouseEnter={() => setIndiceDestacado(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    escolher(produto);
                  }}
                >
                  <span className="bp-codigo">#{produto.idproduto}</span>
                  <span className="bp-descricao">
                    <span className="bp-nome" title={produto.descricao}>
                      {produto.descricao}
                    </span>
                    <span className="bp-apoio">
                      {produto.marca ? `${produto.marca} · ` : ""}
                      {produto.unidade ? `${produto.unidade} · ` : ""}
                      Estoque loja: {formatarQuantidade(produto.estoqueLoja)}
                    </span>
                    {semPreco ? <span className="bp-apoio bp-erro">Sem preço no Athos: não pode ser adicionado.</span> : null}
                  </span>
                  <span className="bp-preco">{semPreco ? "—" : formatarDinheiro(produto.preco ?? "")}</span>
                </li>
              );
            })
          )}
        </ul>
      )}

      {escolhido ? (
        <div className="bp-escolhido mt-2" role="group" aria-label="Quantidade do produto escolhido">
          <div className="small">
            <strong>{escolhido.descricao}</strong>
            <span className="text-muted">
              {" "}
              · {formatarDinheiro(escolhido.preco ?? "")}
              {escolhido.unidade ? ` / ${escolhido.unidade}` : ""}
            </span>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
            <label className="small text-muted mb-0" htmlFor={`${listboxId}-qtd`}>
              Quantidade
            </label>
            <input
              id={`${listboxId}-qtd`}
              type="text"
              inputMode="decimal"
              className="form-control form-control-sm bp-qtd"
              value={quantidade}
              disabled={desabilitado || adicionando}
              onChange={(e) => setQuantidade(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmar();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={desabilitado || adicionando}
              onClick={() => void confirmar()}
            >
              {adicionando ? "Adicionando..." : "Adicionar"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={adicionando}
              onClick={cancelarEscolha}
            >
              Cancelar
            </button>
          </div>
          {erroAdicao ? (
            <div className="small bp-erro mt-1" role="alert">
              {erroAdicao}
            </div>
          ) : null}
        </div>
      ) : null}

      <style>{`
        .bp-busca { position: relative; width: 100%; max-width: 560px; }
        .bp-lista {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 1060;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, .16);
          max-height: 320px;
          overflow-y: auto;
          padding: 0.25rem;
        }
        .bp-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0.45rem 0.6rem;
        }
        .bp-item-ativo { background: #f0e7fa; }
        .bp-item-desabilitado { cursor: not-allowed; opacity: 0.6; }
        .bp-codigo {
          background: #e9ecef;
          color: #495057;
          border-radius: 999px;
          padding: 0.1rem 0.5rem;
          font-size: 0.75rem;
          white-space: nowrap;
        }
        .bp-descricao { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
        .bp-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bp-apoio { color: #6c757d; font-size: 0.78rem; }
        .bp-preco { font-weight: 600; white-space: nowrap; }
        .bp-aviso { border: none; padding: 0.6rem 0.75rem; font-size: 0.85rem; color: #6c757d; }
        .bp-erro { color: #b02a37; }
        .bp-escolhido { border: 1px solid #dee2e6; border-radius: 8px; padding: 0.6rem 0.75rem; background: #fff; }
        .bp-qtd { width: 7rem; }
      `}</style>
    </div>
  );
}
