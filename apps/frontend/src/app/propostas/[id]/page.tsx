"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../../contas-receber/admin-shell";
import RecursosBootstrap from "../../contas-receber/_shared/recursos-bootstrap";
import type { Assinante, AssinanteProposta, CamposCabecalho, PropostaDetalhe } from "../_shared/tipos";
import {
  classeStatus,
  formatarDinheiro,
  mensagemDeErro,
  podeEditar,
  rotuloStatus,
} from "../_shared/formatadores";
import BuscaProduto from "../_componentes/busca-produto";
import TabelaItens, { type IntencaoItem } from "../_componentes/tabela-itens";
import ClientePainel from "../_componentes/cliente-painel";
import OrgaoPainel from "../_componentes/orgao-painel";
import CondicoesPainel from "../_componentes/condicoes-painel";

const ASSINANTE_VAZIO: Assinante = { nome: "", cargo: "", cpf: "" };

function paraAssinante(servidor: AssinanteProposta | null): Assinante {
  return servidor
    ? { nome: servidor.nome, cargo: servidor.cargo ?? "", cpf: servidor.cpf ?? "" }
    : { ...ASSINANTE_VAZIO };
}

/** Rascunho do assinante guardado so nesta aba (o servidor o recebe ao gerar, D-19); valida o formato lido. */
function lerAssinanteSalvo(chave: string): Assinante | null {
  try {
    const bruto = window.sessionStorage.getItem(chave);
    if (!bruto) return null;
    const dado: unknown = JSON.parse(bruto);
    if (dado === null || typeof dado !== "object") return null;
    const { nome, cargo, cpf } = dado as Record<string, unknown>;
    if (typeof nome !== "string" || typeof cargo !== "string" || typeof cpf !== "string") return null;
    return { nome, cargo, cpf };
  } catch {
    return null;
  }
}

/**
 * Tela da proposta. O estado e sempre a resposta do servidor: nenhum preco e calculado no navegador (D-02),
 * so intencoes sao enviadas. Todo texto vindo da API e renderizado como texto React.
 */
function DetalheProposta({ id }: { id: string }) {
  const [proposta, setProposta] = useState<PropostaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);
  const [assinante, setAssinante] = useState<Assinante>(ASSINANTE_VAZIO);
  const assinanteIniciado = useRef(false);
  const chaveAssinante = `proposta-assinante:${id}`;

  const carregar = useCallback(async () => {
    const atual = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/propostas/${encodeURIComponent(id)}`, { cache: "no-store" });
      const dados: unknown = await res.json().catch(() => null);
      if (atual !== requisicao.current) return;
      if (!res.ok) {
        setErro(mensagemDeErro(dados, "Não foi possível carregar a proposta."));
        setProposta(null);
      } else {
        setProposta(dados as PropostaDetalhe);
      }
    } catch {
      if (atual !== requisicao.current) return;
      setErro("Não foi possível carregar a proposta.");
      setProposta(null);
    } finally {
      if (atual === requisicao.current) setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Envia uma intencao ao servidor (nunca preco final). A resposta completa vira o estado da tela; devolve a
   * mensagem de erro ou null quando o servidor aceitou.
   */
  const enviar = useCallback(
    async (metodo: "POST" | "PATCH" | "DELETE", caminho: string, corpo: unknown, padrao: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/propostas/${encodeURIComponent(id)}${caminho}`, {
          method: metodo,
          headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
        const dados: unknown = await res.json().catch(() => null);
        if (!res.ok) return mensagemDeErro(dados, padrao);
        setProposta(dados as PropostaDetalhe);
        return null;
      } catch {
        return padrao;
      }
    },
    [id],
  );

  // O assinante parte do que o servidor ja tem (proposta lancada) ou do rascunho guardado nesta aba.
  useEffect(() => {
    if (!proposta || assinanteIniciado.current) return;
    assinanteIniciado.current = true;
    setAssinante(lerAssinanteSalvo(chaveAssinante) ?? paraAssinante(proposta.assinante));
  }, [proposta, chaveAssinante]);

  const alterarAssinante = useCallback(
    (novo: Assinante) => {
      setAssinante(novo);
      try {
        window.sessionStorage.setItem(chaveAssinante, JSON.stringify(novo));
      } catch {
        // Sem armazenamento da aba: o assinante continua na tela, so nao sobrevive a recarregar.
      }
    },
    [chaveAssinante],
  );

  /** Grava so os campos alterados do cabecalho (PATCH); a resposta completa vira o estado da tela. */
  const salvarCabecalho = useCallback(
    (campos: CamposCabecalho) => enviar("PATCH", "", campos, "Não foi possível salvar o cabeçalho."),
    [enviar],
  );

  const adicionarItem = useCallback(
    (idproduto: number, quantidade: number) =>
      enviar("POST", "/itens", { idproduto, quantidade }, "Não foi possível adicionar o item."),
    [enviar],
  );

  const editarItem = useCallback(
    (itemId: string, intencao: IntencaoItem) =>
      enviar("PATCH", `/itens/${encodeURIComponent(itemId)}`, intencao, "Não foi possível salvar o item."),
    [enviar],
  );

  const removerItem = useCallback(
    (itemId: string) =>
      enviar("DELETE", `/itens/${encodeURIComponent(itemId)}`, undefined, "Não foi possível remover o item."),
    [enviar],
  );

  const aplicarPercentual = useCallback(
    (percentual: number) =>
      enviar("POST", "/aplicar-percentual", { percentual }, "Não foi possível aplicar o percentual."),
    [enviar],
  );

  if (carregando && !proposta) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando...</span>
        </div>
      </div>
    );
  }

  if (erro || !proposta) {
    return (
      <div className="pa-empty pa-empty-erro" role="alert">
        <span>{erro ?? "Proposta não encontrada."}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void carregar()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const nomeCliente = proposta.cliente?.razaoSocial ?? proposta.cliente?.nomeFantasia ?? null;
  // Regra de edicao decidida em um so lugar (D-08) e repassada aos paineis e a tabela.
  const desabilitado = !podeEditar(proposta.status);

  return (
    <>
      <div className="pa-card mb-3">
        <div className="pa-card-header">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="fw-semibold">
              {proposta.idorcamentoAthos != null ? `Proposta ${proposta.idorcamentoAthos}` : "Proposta (rascunho)"}
            </span>
            <span className={`badge ${classeStatus(proposta.status)}`}>{rotuloStatus(proposta.status)}</span>
          </div>
        </div>
        <div className="pa-card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <div className="small text-muted">Cliente</div>
              <div>{nomeCliente ? String(nomeCliente) : "Sem cliente"}</div>
            </div>
            <div className="col-md-4">
              <div className="small text-muted">Total</div>
              <div className="fw-semibold">{formatarDinheiro(proposta.total)}</div>
            </div>
          </div>
        </div>
      </div>

      <ClientePainel proposta={proposta} desabilitado={desabilitado} onSalvar={salvarCabecalho} />
      <OrgaoPainel proposta={proposta} desabilitado={desabilitado} onSalvar={salvarCabecalho} />
      <CondicoesPainel
        proposta={proposta}
        desabilitado={desabilitado}
        onSalvar={salvarCabecalho}
        assinante={desabilitado ? paraAssinante(proposta.assinante) : assinante}
        onAssinanteChange={alterarAssinante}
      />

      {desabilitado ? (
        <div className="alert alert-warning" role="status">
          Esta proposta já foi lançada e não pode mais ser editada. Só é possível duplicá-la para fazer alterações.
        </div>
      ) : (
        <div className="pa-card mb-3">
          <div className="pa-card-body">
            <BuscaProduto onAdicionar={adicionarItem} />
          </div>
        </div>
      )}

      <div className="pa-card">
        <div className="pa-card-header">
          <span className="fw-semibold">Itens</span>
          <span className="pa-card-header-count">({proposta.itens.length})</span>
        </div>
        <div className="pa-card-body pa-card-body-flush">
          <TabelaItens
            itens={proposta.itens}
            total={proposta.total}
            desabilitado={desabilitado}
            onEditar={editarItem}
            onRemover={removerItem}
            onAplicarPercentual={aplicarPercentual}
          />
        </div>
      </div>
    </>
  );
}

export default function PropostaPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  return (
    <PasswordGate
      title="Proposta"
      description="Esta área exibe propostas comerciais com custo e margem. Digite a senha de configurações para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/propostas"
        title="Proposta"
        subtitle="Itens e total calculados pelo servidor"
        actions={
          <a href="/propostas" className="pa-link-btn">
            <i className="bi bi-arrow-left me-1" />
            Voltar para a lista
          </a>
        }
      >
        {id ? <DetalheProposta id={id} /> : null}
      </AdminShell>
    </PasswordGate>
  );
}
