"use client";

import { useEffect, useState } from "react";
import type { ItemProposta } from "../_shared/tipos";
import { formatarDinheiro, formatarMargem, linhaEstado } from "../_shared/formatadores";

/** Intencoes enviadas ao servidor ao editar um item. Nunca ha preco final: o servidor recalcula tudo (D-02). */
export interface IntencaoItem {
  quantidade?: number;
  nome?: string;
  descricaoCurta?: string | null;
  ajuste?: { tipo: "NENHUM" | "PERCENTUAL" | "VALOR"; valor?: number };
}

interface TabelaItensProps {
  itens: ItemProposta[];
  /** Total da proposta como o servidor devolveu (texto). */
  total: string;
  /** Verdadeiro quando a proposta nao esta em RASCUNHO (decidido pela pagina por `!podeEditar(status)`). */
  desabilitado: boolean;
  /** Cada callback devolve a mensagem de erro, ou null quando o servidor aceitou. */
  onEditar: (itemId: string, intencao: IntencaoItem) => Promise<string | null>;
  onRemover: (itemId: string) => Promise<string | null>;
  onAplicarPercentual: (percentual: number) => Promise<string | null>;
}

type TipoAjuste = "NENHUM" | "PERCENTUAL" | "VALOR";

const PERCENTUAL_MIN = -99.999;
const PERCENTUAL_MAX = 1000;

/** Texto do servidor ("2.000", "10.500") para o campo de edicao (virgula decimal, sem zeros finais). */
function paraCampo(texto: string | undefined, minCasas = 0): string {
  if (!texto) return "";
  const [inteiro, fracao = ""] = texto.split(".");
  let f = fracao.replace(/0+$/, "");
  if (f.length < minCasas) f = fracao.slice(0, minCasas).padEnd(minCasas, "0");
  return f ? `${inteiro},${f}` : inteiro;
}

function lerQuantidade(texto: string, permiteFracionar: boolean): { valor: number } | { erro: string } {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(limpo)) return { erro: "Quantidade inválida (até 3 casas decimais)." };
  const valor = Number(limpo);
  if (!(valor >= 0.001)) return { erro: "A quantidade deve ser maior que zero." };
  if (valor > 10000) return { erro: "A quantidade máxima é 10.000." };
  if (!permiteFracionar && !Number.isInteger(valor)) return { erro: "Este produto não permite quantidade fracionada." };
  return { valor };
}

function lerPercentual(texto: string): { valor: number } | { erro: string } {
  const limpo = texto.trim().replace(",", ".");
  if (!/^-?\d{1,4}(\.\d{1,3})?$/.test(limpo)) return { erro: "Percentual inválido (até 3 casas decimais)." };
  const valor = Number(limpo);
  if (valor < PERCENTUAL_MIN || valor > PERCENTUAL_MAX) {
    return { erro: "O percentual deve ficar entre -99,999 e 1.000." };
  }
  return { valor };
}

function lerPrecoFinal(texto: string): { valor: number } | { erro: string } {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(limpo)) return { erro: "Preço inválido (até 2 casas decimais)." };
  const valor = Number(limpo);
  if (!(valor > 0)) return { erro: "O preço final deve ser maior que zero." };
  return { valor };
}

interface LinhaItemProps {
  item: ItemProposta;
  desabilitado: boolean;
  onEditar: TabelaItensProps["onEditar"];
  onRemover: TabelaItensProps["onRemover"];
}

function LinhaItem({ item, desabilitado, onEditar, onRemover }: LinhaItemProps) {
  const [nome, setNome] = useState(item.nome);
  const [descricao, setDescricao] = useState(item.descricaoCurta ?? "");
  const [quantidade, setQuantidade] = useState(paraCampo(item.quantidade));
  const [tipo, setTipo] = useState<TipoAjuste>(item.ajuste?.tipo ?? "NENHUM");
  const [valorAjuste, setValorAjuste] = useState(
    paraCampo(item.ajuste?.valor, item.ajuste?.tipo === "VALOR" ? 2 : 0),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Cada campo volta ao valor do servidor quando o servidor o muda (a resposta e a fonte da verdade).
  useEffect(() => setNome(item.nome), [item.nome]);
  useEffect(() => setDescricao(item.descricaoCurta ?? ""), [item.descricaoCurta]);
  useEffect(() => setQuantidade(paraCampo(item.quantidade)), [item.quantidade]);
  useEffect(() => {
    setTipo(item.ajuste?.tipo ?? "NENHUM");
    setValorAjuste(paraCampo(item.ajuste?.valor, item.ajuste?.tipo === "VALOR" ? 2 : 0));
  }, [item.ajuste?.tipo, item.ajuste?.valor]);

  const estado = linhaEstado(item);
  const bloqueado = desabilitado || salvando;

  async function enviar(intencao: IntencaoItem): Promise<boolean> {
    setSalvando(true);
    setErro("");
    const mensagem = await onEditar(item.id, intencao);
    setSalvando(false);
    if (mensagem) {
      setErro(mensagem);
      return false;
    }
    return true;
  }

  function salvarNome() {
    const novo = nome.trim();
    if (novo === item.nome) return;
    if (novo === "") {
      setErro("O nome não pode ficar vazio.");
      setNome(item.nome);
      return;
    }
    void enviar({ nome: novo });
  }

  function salvarDescricao() {
    const nova = descricao.trim();
    if (nova === (item.descricaoCurta ?? "")) return;
    void enviar({ descricaoCurta: nova === "" ? null : nova });
  }

  function salvarQuantidade() {
    const lida = lerQuantidade(quantidade, item.permiteFracionar);
    if ("erro" in lida) {
      setErro(lida.erro);
      return;
    }
    if (lida.valor === Number(item.quantidade)) {
      setErro("");
      return;
    }
    void enviar({ quantidade: lida.valor });
  }

  function mudarTipo(novo: TipoAjuste) {
    setTipo(novo);
    setErro("");
    if (novo === "NENHUM") {
      setValorAjuste("");
      if (item.ajuste) void enviar({ ajuste: { tipo: "NENHUM" } });
    }
  }

  function confirmarAjuste() {
    if (tipo === "NENHUM") return;
    const lida = tipo === "PERCENTUAL" ? lerPercentual(valorAjuste) : lerPrecoFinal(valorAjuste);
    if ("erro" in lida) {
      setErro(lida.erro);
      return;
    }
    void enviar({ ajuste: { tipo, valor: lida.valor } });
  }

  async function remover() {
    if (!window.confirm(`Remover "${item.nome}" da proposta?`)) return;
    setSalvando(true);
    setErro("");
    const mensagem = await onRemover(item.id);
    if (mensagem) {
      setSalvando(false);
      setErro(mensagem);
    }
  }

  const ajusteInalterado =
    tipo === (item.ajuste?.tipo ?? "NENHUM") &&
    valorAjuste.trim() === paraCampo(item.ajuste?.valor, item.ajuste?.tipo === "VALOR" ? 2 : 0);

  return (
    <>
      <tr className={estado.classe}>
        <td className="ti-codigo">{item.idproduto}</td>
        <td className="ti-texto">
          <input
            type="text"
            className="form-control form-control-sm"
            aria-label={`Nome do item ${item.idproduto}`}
            maxLength={200}
            value={nome}
            disabled={bloqueado}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
          />
          <input
            type="text"
            className="form-control form-control-sm mt-1"
            aria-label={`Descrição curta do item ${item.idproduto}`}
            placeholder="Descrição curta (opcional)"
            maxLength={300}
            value={descricao}
            disabled={bloqueado}
            onChange={(e) => setDescricao(e.target.value)}
            onBlur={salvarDescricao}
          />
        </td>
        <td>{item.unidade ?? "—"}</td>
        <td className="ti-qtd">
          <input
            type="text"
            inputMode="decimal"
            className="form-control form-control-sm text-end"
            aria-label={`Quantidade do item ${item.idproduto}`}
            value={quantidade}
            disabled={bloqueado}
            onChange={(e) => setQuantidade(e.target.value)}
            onBlur={salvarQuantidade}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </td>
        <td className="text-end">{formatarDinheiro(item.precoBase)}</td>
        <td className="ti-ajuste">
          <div className="d-flex gap-1">
            <select
              className="form-select form-select-sm"
              aria-label={`Ajuste do item ${item.idproduto}`}
              value={tipo}
              disabled={bloqueado}
              onChange={(e) => mudarTipo(e.target.value as TipoAjuste)}
            >
              <option value="NENHUM">Nenhum</option>
              <option value="PERCENTUAL">Percentual %</option>
              <option value="VALOR">Preço final R$</option>
            </select>
            {tipo !== "NENHUM" ? (
              <>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-control form-control-sm text-end ti-ajuste-valor"
                  aria-label={`Valor do ajuste do item ${item.idproduto}`}
                  value={valorAjuste}
                  disabled={bloqueado}
                  onChange={(e) => setValorAjuste(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmarAjuste();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  disabled={bloqueado || ajusteInalterado}
                  onClick={confirmarAjuste}
                >
                  OK
                </button>
              </>
            ) : null}
          </div>
          {tipo === "VALOR" ? (
            <div className="ti-ajuda">
              O valor digitado vira o preço unitário final do item (substitui o preço base; não é acréscimo).
            </div>
          ) : null}
        </td>
        <td className="text-end fw-semibold">{formatarDinheiro(item.precoUnitario)}</td>
        <td className="text-end">{formatarDinheiro(item.totalLinha)}</td>
        <td className="text-end">{formatarDinheiro(item.custoUnitario)}</td>
        <td className="text-end">
          {formatarMargem(item.margemPercentual)}
          {estado.alerta ? (
            <div className="ti-alerta" role="alert">
              <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
              {estado.alerta}
            </div>
          ) : null}
        </td>
        <td className="text-end">
          {salvando ? <span className="ti-salvando">Salvando...</span> : null}
          <button
            type="button"
            className="btn btn-sm btn-outline-danger ms-1"
            aria-label={`Remover o item ${item.idproduto}`}
            disabled={bloqueado}
            onClick={() => void remover()}
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </button>
        </td>
      </tr>
      {erro ? (
        <tr className="ti-linha-erro">
          <td colSpan={11} role="alert">
            {erro}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Tabela de itens editavel da proposta. So envia intencoes (quantidade, nome, descricao, ajuste); preco final,
 * total, custo e margem sao exibidos como o servidor devolveu (D-02), e o destaque abaixo do custo vem de
 * `linhaEstado`, que le a flag do servidor (D-13). Todo texto vindo da API e renderizado como texto React.
 */
export default function TabelaItens({ itens, total, desabilitado, onEditar, onRemover, onAplicarPercentual }: TabelaItensProps) {
  const [percentual, setPercentual] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [erroPercentual, setErroPercentual] = useState("");

  async function aplicar() {
    const lido = lerPercentual(percentual);
    if ("erro" in lido) {
      setErroPercentual(lido.erro);
      return;
    }
    setAplicando(true);
    setErroPercentual("");
    const mensagem = await onAplicarPercentual(lido.valor);
    setAplicando(false);
    if (mensagem) setErroPercentual(mensagem);
  }

  const semItens = itens.length === 0;

  return (
    <div>
      <div className="ti-barra">
        <label className="small fw-semibold" htmlFor="ti-percentual-todos">
          Aplicar % em todos os itens
        </label>
        <input
          id="ti-percentual-todos"
          type="text"
          inputMode="decimal"
          className="form-control form-control-sm ti-percentual"
          placeholder="Ex.: 10 ou -5"
          value={percentual}
          disabled={desabilitado || aplicando || semItens}
          onChange={(e) => setPercentual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void aplicar();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={desabilitado || aplicando || semItens || percentual.trim() === ""}
          onClick={() => void aplicar()}
        >
          {aplicando ? "Aplicando..." : "Aplicar"}
        </button>
        <span className="ti-ajuda">
          Substitui os ajustes individuais e arredonda cada item para cima. Use 0 para limpar os ajustes.
        </span>
        {erroPercentual ? (
          <span className="ti-erro" role="alert">
            {erroPercentual}
          </span>
        ) : null}
      </div>

      {semItens ? (
        <div className="pa-empty">
          <span>Esta proposta ainda não tem itens.</span>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="pa-table ti-tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome e descrição</th>
                <th>Unid.</th>
                <th className="text-end">Qtd.</th>
                <th className="text-end">Preço base</th>
                <th>Ajuste</th>
                <th className="text-end">Preço final</th>
                <th className="text-end">Total</th>
                <th className="text-end">Custo unit.</th>
                <th className="text-end">Margem líq.</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <LinhaItem
                  key={item.id}
                  item={item}
                  desabilitado={desabilitado}
                  onEditar={onEditar}
                  onRemover={onRemover}
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="text-end fw-semibold">
                  Total da proposta ({itens.length} {itens.length === 1 ? "item" : "itens"})
                </td>
                <td className="text-end fw-semibold">{formatarDinheiro(total)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <style>{`
        .ti-barra { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.75rem 1.1rem; border-bottom: 1px solid #e9ecef; }
        .ti-percentual { width: 8rem; }
        .ti-ajuda { color: #6c757d; font-size: 0.75rem; margin-top: 0.2rem; }
        .ti-barra .ti-ajuda { margin-top: 0; }
        .ti-erro { color: #b02a37; font-size: 0.8rem; }
        .ti-tabela td { vertical-align: top; }
        .ti-texto { min-width: 16rem; }
        .ti-qtd { width: 6.5rem; }
        .ti-ajuste { min-width: 13rem; }
        .ti-ajuste-valor { width: 5.5rem; }
        .ti-tabela tr.table-danger > td { background: #f8d7da; }
        .ti-alerta { color: #b02a37; font-size: 0.75rem; font-weight: 600; }
        .ti-salvando { color: #6c757d; font-size: 0.75rem; }
        .ti-linha-erro td { color: #b02a37; font-size: 0.8rem; padding-top: 0; }
      `}</style>
    </div>
  );
}
