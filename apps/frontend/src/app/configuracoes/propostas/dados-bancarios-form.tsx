"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Formulario dos dados bancarios da proposta (GET/PATCH /api/propostas/config).
 * O servidor valida e devolve o registro salvo; a tela so mostra o que o servidor responde.
 */

interface ConfigBancaria {
  bancoNome: string;
  agencia: string;
  conta: string;
  titular: string;
  documentoTitular: string;
  completa: boolean;
  atualizadoEm: string | null;
}

type Campos = Pick<ConfigBancaria, "bancoNome" | "agencia" | "conta" | "titular" | "documentoTitular">;

const VAZIO: Campos = { bancoNome: "", agencia: "", conta: "", titular: "", documentoTitular: "" };
const MSG_SESSAO = "Sessão expirada. Recarregue a página e digite a senha de configurações de novo.";

const CAMPOS: Array<{ chave: keyof Campos; rotulo: string; ajuda?: string; max: number }> = [
  { chave: "bancoNome", rotulo: "Banco", ajuda: "Ex.: Santander", max: 80 },
  { chave: "agencia", rotulo: "Agência", ajuda: "Só números (pode ter hífen e dígito)", max: 16 },
  { chave: "conta", rotulo: "Conta corrente", ajuda: "Só números (pode ter hífen e dígito)", max: 24 },
  { chave: "titular", rotulo: "Titular da conta", ajuda: "Razão social que aparece no PDF", max: 200 },
  { chave: "documentoTitular", rotulo: "CNPJ ou CPF do titular", max: 20 },
];

function extrairCampos(c: ConfigBancaria): Campos {
  return {
    bancoNome: c.bancoNome,
    agencia: c.agencia,
    conta: c.conta,
    titular: c.titular,
    documentoTitular: c.documentoTitular,
  };
}

function mensagemErro(json: { message?: string | string[]; mensagem?: string; error?: string }): string {
  if (Array.isArray(json.message)) return json.message.join("; ");
  return json.mensagem || (typeof json.message === "string" ? json.message : "") || json.error || "";
}

export default function DadosBancariosForm() {
  const [config, setConfig] = useState<ConfigBancaria | null>(null);
  const [atual, setAtual] = useState<Campos>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroCarregar, setErroCarregar] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregar("");
    try {
      const res = await fetch("/api/propostas/config", { cache: "no-store" });
      if (res.status === 401) {
        setErroCarregar(MSG_SESSAO);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as ConfigBancaria & { message?: string; error?: string };
      if (!res.ok) {
        setErroCarregar(mensagemErro(json) || "Não foi possível carregar os dados bancários.");
        return;
      }
      setConfig(json);
      setAtual(extrairCampos(json));
    } catch {
      setErroCarregar("Falha ao conectar no backend.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const original = config ? extrairCampos(config) : VAZIO;
  const alterado = (Object.keys(original) as Array<keyof Campos>).some((k) => original[k] !== atual[k]);
  const algumVazio = (Object.keys(atual) as Array<keyof Campos>).some((k) => atual[k].trim() === "");

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    setErroSalvar("");
    setOk("");
    try {
      const res = await fetch("/api/propostas/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atual),
      });
      if (res.status === 401) {
        setErroSalvar(MSG_SESSAO);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as ConfigBancaria & {
        message?: string | string[];
        mensagem?: string;
        error?: string;
      };
      if (!res.ok) {
        setErroSalvar(mensagemErro(json) || "Não foi possível salvar. Confira os campos e tente de novo.");
        return;
      }
      setConfig(json);
      setAtual(extrairCampos(json));
      setOk("Dados bancários salvos. As próximas propostas geradas já usam estes dados.");
    } catch {
      setErroSalvar("Falha ao conectar no backend.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="pa-card">
        <div className="pa-card-body text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  if (erroCarregar || !config) {
    return (
      <div className="pa-card">
        <div className="pa-card-body">
          <div className="alert alert-danger" role="alert">
            {erroCarregar || "Não foi possível carregar os dados bancários."}
          </div>
          <button type="button" className="btn btn-outline-secondary" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pa-card">
      <div className="pa-card-body">
        {!config.completa && (
          <div className="alert alert-warning" role="status">
            Os dados bancários ainda não estão completos. Enquanto agência e conta estiverem vazias, a prévia e o
            lançamento de propostas ficam bloqueados (nada é gravado no Athos).
          </div>
        )}

        <form onSubmit={(e) => void salvar(e)} noValidate>
          <div className="row g-3">
            {CAMPOS.map((c) => (
              <div className="col-md-6" key={c.chave}>
                <label htmlFor={`banco-${c.chave}`} className="form-label">
                  {c.rotulo}
                </label>
                <input
                  id={`banco-${c.chave}`}
                  type="text"
                  className="form-control"
                  value={atual[c.chave]}
                  maxLength={c.max}
                  autoComplete="off"
                  disabled={salvando}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setAtual((anterior) => ({ ...anterior, [c.chave]: valor }));
                    setOk("");
                  }}
                />
                {c.ajuda && <div className="form-text">{c.ajuda}</div>}
              </div>
            ))}
          </div>

          <div className="d-flex align-items-center gap-3 mt-4">
            <button type="submit" className="btn btn-primary" disabled={salvando || !alterado || algumVazio}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            {config.atualizadoEm && (
              <span className="text-muted small">
                Última alteração: {new Date(config.atualizadoEm).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </form>

        {ok && (
          <div className="alert alert-success mt-3" role="status">
            {ok}
          </div>
        )}
        {erroSalvar && (
          <div className="alert alert-danger mt-3" role="alert">
            {erroSalvar}
          </div>
        )}

        <p className="text-muted small mt-3 mb-0">
          Estes dados ficam só no banco do sistema e aparecem no PDF das propostas. Propostas já geradas mantêm os
          dados bancários do momento em que foram emitidas.
        </p>
      </div>
    </div>
  );
}
