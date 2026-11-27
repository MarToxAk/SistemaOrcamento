"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Assinante, PropostaDetalhe } from "../_shared/tipos";
import { acoesDisponiveis, mensagemDeErro } from "../_shared/formatadores";
import ConfirmarLancamento from "./confirmar-lancamento";

interface AcoesPropostaProps {
  proposta: PropostaDetalhe;
  /** Assinante mantido pela pagina (o servidor so o recebe ao gerar, D-19): valores iniciais do modal. */
  assinante: Assinante;
  onAssinanteChange: (assinante: Assinante) => void;
  /** Recarrega a proposta do servidor depois de uma acao. */
  onAtualizar: () => Promise<void>;
}

type Tom = "success" | "warning" | "danger" | "info";

interface Mensagem {
  tom: Tom;
  texto: string;
}

interface Resposta {
  ok: boolean;
  dados: unknown;
}

/** Campos que o backend devolve nas acoes de ciclo de vida (todos opcionais; so texto e numeros). */
interface DadosAcao {
  status?: string;
  idorcamentoAthos?: number;
  aviso?: string;
  mensagem?: string;
  id?: string;
}

function comoAcao(dados: unknown): DadosAcao {
  return dados !== null && typeof dados === "object" ? (dados as DadosAcao) : {};
}

/** Nome do arquivo do Content-Disposition (`filename="..."`); sem ele usa o padrao. */
function nomeDoArquivo(disposicao: string | null, padrao: string): string {
  const m = disposicao ? /filename="?([^";]+)"?/i.exec(disposicao) : null;
  return m && m[1].trim() ? m[1].trim() : padrao;
}

/**
 * Acoes da proposta por status. As acoes exibidas sao exatamente as de `acoesDisponiveis` (regra pura provada por
 * script); o navegador so envia intencoes e mostra a resposta do servidor (mensagem e aviso como texto React,
 * nunca HTML). Um unico estado pendente trava todos os botoes enquanto uma chamada esta em curso.
 */
export default function AcoesProposta({ proposta, assinante, onAssinanteChange, onAtualizar }: AcoesPropostaProps) {
  const router = useRouter();
  const base = `/api/propostas/${encodeURIComponent(proposta.id)}`;
  const numero = proposta.idorcamentoAthos;
  const sufixo = numero != null ? ` nº ${numero}` : "";

  const [pendente, setPendente] = useState<string | null>(null);
  const emCurso = useRef(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  /** Executa uma acao de cada vez: o segundo disparo enquanto ha uma em curso e ignorado. */
  const executar = useCallback(async (rotulo: string, acao: () => Promise<void>) => {
    if (emCurso.current) return;
    emCurso.current = true;
    setPendente(rotulo);
    try {
      await acao();
    } finally {
      emCurso.current = false;
      setPendente(null);
    }
  }, []);

  const chamar = useCallback(
    async (metodo: "POST" | "PATCH", caminho: string, corpo?: unknown): Promise<Resposta> => {
      try {
        const res = await fetch(`${base}${caminho}`, {
          method: metodo,
          headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
        const dados: unknown = await res.json().catch(() => null);
        return { ok: res.ok, dados };
      } catch {
        return { ok: false, dados: null };
      }
    },
    [base],
  );

  /** Busca um PDF autenticado como blob (sem URL publica, T-55-63); erro devolve a mensagem do servidor. */
  const buscarPdf = useCallback(
    async (caminho: string, padrao: string): Promise<{ blob: Blob; nome: string | null } | { erro: string }> => {
      try {
        const res = await fetch(`${base}${caminho}`, { cache: "no-store" });
        const tipo = res.headers.get("content-type") ?? "";
        if (!res.ok || !tipo.includes("application/pdf")) {
          const dados: unknown = await res.json().catch(() => null);
          return { erro: mensagemDeErro(dados, padrao) };
        }
        return { blob: await res.blob(), nome: res.headers.get("content-disposition") };
      } catch {
        return { erro: padrao };
      }
    },
    [base],
  );

  async function recarregar() {
    try {
      await onAtualizar();
    } catch {
      // A tela mantem o ultimo estado; o operador pode recarregar manualmente.
    }
  }

  function previa() {
    // A aba e aberta de imediato (dentro do clique) para o navegador nao bloquear o pop-up depois da chamada.
    const janela = window.open("", "_blank");
    void executar("previa", async () => {
      setMensagem(null);
      const r = await buscarPdf("/previa", "Não foi possível gerar a prévia do PDF.");
      if ("erro" in r) {
        janela?.close();
        setMensagem({ tom: "danger", texto: r.erro });
        return;
      }
      const url = URL.createObjectURL(r.blob);
      if (!janela) {
        URL.revokeObjectURL(url);
        setMensagem({ tom: "warning", texto: "O navegador bloqueou a nova aba. Libere pop-ups para ver a prévia." });
        return;
      }
      janela.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  function baixarPdf() {
    void executar("pdf", async () => {
      setMensagem(null);
      const r = await buscarPdf("/pdf", "Não foi possível baixar o PDF oficial.");
      if ("erro" in r) {
        setMensagem({ tom: "danger", texto: r.erro });
        return;
      }
      const url = URL.createObjectURL(r.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeDoArquivo(r.nome, numero != null ? `Proposta-${numero}.pdf` : "Proposta.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  }

  function gerar(escolhido: Assinante) {
    void executar("gerar", async () => {
      setErroModal(null);
      onAssinanteChange(escolhido);
      const nome = escolhido.nome.trim();
      const cargo = escolhido.cargo.trim();
      const cpf = escolhido.cpf.trim();
      const r = await chamar("POST", "/gerar", {
        assinanteNome: nome,
        assinanteCargo: cargo || undefined,
        assinanteCpf: cpf || undefined,
        confirmar: true,
      });
      const dados = comoAcao(r.dados);
      if (!r.ok) {
        const falha = mensagemDeErro(r.dados, "Não foi possível lançar a proposta no Athos.");
        setErroModal(falha);
        setMensagem({ tom: "danger", texto: falha });
        // Um erro ambiguo pode deixar a proposta em LANCANDO: a tela passa a oferecer "Recuperar lançamento".
        await recarregar();
        return;
      }
      setModalAberto(false);
      const lancada = dados.idorcamentoAthos != null ? `Proposta nº ${dados.idorcamentoAthos} lançada no Athos.` : "Proposta lançada no Athos.";
      setMensagem({ tom: dados.aviso ? "warning" : "success", texto: dados.aviso ? `${lancada} ${dados.aviso}` : lancada });
      await recarregar();
    });
  }

  function recuperar() {
    void executar("recuperar", async () => {
      setMensagem(null);
      const r = await chamar("POST", "/recuperar");
      const dados = comoAcao(r.dados);
      if (!r.ok) {
        setMensagem({ tom: "danger", texto: mensagemDeErro(r.dados, "Não foi possível recuperar o lançamento.") });
        await recarregar();
        return;
      }
      const texto =
        dados.status === "ENVIADA"
          ? `Lançamento recuperado: proposta nº ${dados.idorcamentoAthos ?? ""} lançada no Athos.${dados.aviso ? ` ${dados.aviso}` : ""}`
          : dados.mensagem || "O Athos não tem o orçamento desta proposta; ela voltou a rascunho.";
      setMensagem({ tom: dados.status === "ENVIADA" ? (dados.aviso ? "warning" : "success") : "info", texto });
      await recarregar();
    });
  }

  function duplicar() {
    void executar("duplicar", async () => {
      setMensagem(null);
      const r = await chamar("POST", "/duplicar");
      const novoId = comoAcao(r.dados).id;
      if (!r.ok || typeof novoId !== "string") {
        setMensagem({ tom: "danger", texto: mensagemDeErro(r.dados, "Não foi possível duplicar a proposta.") });
        return;
      }
      router.push(`/propostas/${encodeURIComponent(novoId)}`);
    });
  }

  function mudarStatus(novo: "FECHADA" | "CANCELADA") {
    void executar(novo === "FECHADA" ? "fechar" : "cancelar", async () => {
      setMensagem(null);
      const r = await chamar("PATCH", "/status", { status: novo });
      if (!r.ok) {
        setMensagem({ tom: "danger", texto: mensagemDeErro(r.dados, "Não foi possível alterar o status da proposta.") });
        await recarregar();
        return;
      }
      const aviso = comoAcao(r.dados).aviso;
      if (novo === "CANCELADA") {
        setMensagem({
          tom: "warning",
          texto: aviso ?? "Proposta cancelada. O cancelamento é só local, no sistema.",
        });
      } else {
        setMensagem({ tom: "success", texto: "Proposta marcada como fechada." });
      }
      await recarregar();
    });
  }

  function cancelar() {
    const aviso =
      numero != null
        ? `O orçamento nº ${numero} continua aberto no Athos; cancele-o pelo Balcão. Este cancelamento é só local.\n\nCancelar a proposta nº ${numero} mesmo assim?`
        : "Cancelar este rascunho? Ele não poderá mais ser editado.";
    if (!window.confirm(aviso)) return;
    mudarStatus("CANCELADA");
  }

  function botao(id: string): ReactNode {
    const ocupado = pendente !== null;
    switch (id) {
      case "previa":
        return (
          <button key={id} type="button" className="btn btn-sm btn-outline-secondary" disabled={ocupado} onClick={previa}>
            <i className="bi bi-eye me-1" />
            {pendente === "previa" ? "Gerando prévia..." : "Prévia do PDF"}
          </button>
        );
      case "gerar":
        return (
          <button
            key={id}
            type="button"
            className="btn btn-sm btn-danger"
            disabled={ocupado}
            onClick={() => {
              setErroModal(null);
              setModalAberto(true);
            }}
          >
            <i className="bi bi-send me-1" />
            Gerar proposta e lançar no Athos
          </button>
        );
      case "recuperar":
        return (
          <button key={id} type="button" className="btn btn-sm btn-warning" disabled={ocupado} onClick={recuperar}>
            <i className="bi bi-arrow-repeat me-1" />
            {pendente === "recuperar" ? "Recuperando..." : "Recuperar lançamento"}
          </button>
        );
      case "pdf":
        return (
          <button key={id} type="button" className="btn btn-sm btn-primary" disabled={ocupado} onClick={baixarPdf}>
            <i className="bi bi-file-earmark-pdf me-1" />
            {pendente === "pdf" ? "Baixando..." : `Baixar PDF oficial${sufixo}`}
          </button>
        );
      case "duplicar":
        return (
          <button key={id} type="button" className="btn btn-sm btn-outline-primary" disabled={ocupado} onClick={duplicar}>
            <i className="bi bi-files me-1" />
            {pendente === "duplicar" ? "Duplicando..." : `Duplicar${sufixo}`}
          </button>
        );
      case "fechar":
        return (
          <button
            key={id}
            type="button"
            className="btn btn-sm btn-success"
            disabled={ocupado}
            onClick={() => mudarStatus("FECHADA")}
          >
            <i className="bi bi-check2-circle me-1" />
            {pendente === "fechar" ? "Salvando..." : `Marcar como fechada${sufixo}`}
          </button>
        );
      case "cancelar":
        return (
          <button key={id} type="button" className="btn btn-sm btn-outline-danger" disabled={ocupado} onClick={cancelar}>
            <i className="bi bi-x-circle me-1" />
            {pendente === "cancelar" ? "Cancelando..." : `Cancelar proposta${sufixo}`}
          </button>
        );
      default:
        return null;
    }
  }

  const acoes = acoesDisponiveis(proposta.status, proposta.pdfDisponivel);
  const clienteNome = proposta.cliente?.razaoSocial ?? proposta.cliente?.nomeFantasia ?? null;

  return (
    <div className="mb-3">
      {proposta.status === "LANCANDO" ? (
        <div className="alert alert-warning" role="status">
          Lançamento em andamento ou interrompido. Se ele não terminar sozinho, use &quot;Recuperar lançamento&quot;.
        </div>
      ) : null}

      {acoes.length > 0 ? <div className="d-flex flex-wrap gap-2">{acoes.map((id) => botao(id))}</div> : null}

      {mensagem ? (
        <div className={`alert alert-${mensagem.tom} mt-3 mb-0`} role="status">
          {mensagem.texto}
        </div>
      ) : null}

      {modalAberto && acoes.includes("gerar") ? (
        <ConfirmarLancamento
          resumo={{
            cliente: clienteNome ? String(clienteNome) : "Sem cliente",
            quantidadeItens: proposta.itens.length,
            total: proposta.total,
          }}
          assinanteInicial={assinante}
          pendente={pendente === "gerar"}
          erro={erroModal}
          onCancelar={() => setModalAberto(false)}
          onConfirmar={gerar}
        />
      ) : null}
    </div>
  );
}
