"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MSG_SESSAO,
  formatarPercentual,
  formatarReais,
  lerNumero,
  renderizarPrevia,
  validarConfigCliente,
  type ConfigAdmin,
  type RespostaConfigAdmin,
  type VarianteVisual,
} from "@/lib/pesquisa-admin";

/**
 * Fase 52 (plano 52-08): formulário de configuração da pesquisa e da recompensa.
 *
 * Só o formulário: a página do plano 52-09 fornece PasswordGate e AdminShell. Busca e salva sozinho
 * em /api/admin/pesquisa-config. Nada vale antes de Salvar (UI-D16) e `beforeunload` avisa quando
 * há alteração pendente. O servidor é o juiz final dos limites.
 */

interface FormValues {
  ativo: boolean;
  percentualDesconto: string;
  tetoDesconto: string;
  compraMinima: string;
  validadeCupomDias: string;
  validadeLinkDias: string;
  intervaloDias: string;
  tetoMensal: string;
  prefixoCupom: string;
  linkGoogle: string;
  varianteVisual: VarianteVisual;
  textoFechamento: string;
  textoSemRecompensa: string;
  textoPosResposta: string;
  textoConviteGoogle: string;
  paginaTitulo: string;
  paginaSubtitulo: string;
  paginaObrigadoSemRecompensa: string;
  paginaGoogleTitulo: string;
  paginaGoogleCorpo: string;
}

function numeroParaTexto(valor: number): string {
  return String(valor).replace(".", ",");
}

function paraFormulario(c: ConfigAdmin): FormValues {
  return {
    ativo: c.ativo,
    percentualDesconto: numeroParaTexto(c.percentualDesconto),
    tetoDesconto: numeroParaTexto(c.tetoDesconto),
    compraMinima: numeroParaTexto(c.compraMinima),
    validadeCupomDias: numeroParaTexto(c.validadeCupomDias),
    validadeLinkDias: numeroParaTexto(c.validadeLinkDias),
    intervaloDias: numeroParaTexto(c.intervaloDias),
    tetoMensal: numeroParaTexto(c.tetoMensal),
    prefixoCupom: c.prefixoCupom,
    linkGoogle: c.linkGoogle ?? "",
    varianteVisual: c.varianteVisual,
    textoFechamento: c.textoFechamento,
    textoSemRecompensa: c.textoSemRecompensa,
    textoPosResposta: c.textoPosResposta,
    textoConviteGoogle: c.textoConviteGoogle,
    paginaTitulo: c.paginaTitulo,
    paginaSubtitulo: c.paginaSubtitulo,
    paginaObrigadoSemRecompensa: c.paginaObrigadoSemRecompensa,
    paginaGoogleTitulo: c.paginaGoogleTitulo,
    paginaGoogleCorpo: c.paginaGoogleCorpo,
  };
}

function paraConfig(v: FormValues): ConfigAdmin {
  const link = v.linkGoogle.trim();
  return {
    ativo: v.ativo,
    percentualDesconto: lerNumero(v.percentualDesconto),
    tetoDesconto: lerNumero(v.tetoDesconto),
    compraMinima: lerNumero(v.compraMinima),
    validadeCupomDias: lerNumero(v.validadeCupomDias),
    validadeLinkDias: lerNumero(v.validadeLinkDias),
    intervaloDias: lerNumero(v.intervaloDias),
    tetoMensal: lerNumero(v.tetoMensal),
    prefixoCupom: v.prefixoCupom.trim().toUpperCase(),
    linkGoogle: link ? link : null,
    varianteVisual: v.varianteVisual,
    textoFechamento: v.textoFechamento,
    textoSemRecompensa: v.textoSemRecompensa,
    textoPosResposta: v.textoPosResposta,
    textoConviteGoogle: v.textoConviteGoogle,
    paginaTitulo: v.paginaTitulo,
    paginaSubtitulo: v.paginaSubtitulo,
    paginaObrigadoSemRecompensa: v.paginaObrigadoSemRecompensa,
    paginaGoogleTitulo: v.paginaGoogleTitulo,
    paginaGoogleCorpo: v.paginaGoogleCorpo,
  };
}

const EXEMPLOS: Record<string, string> = {
  percentual: formatarPercentual(10),
  teto: formatarReais(2),
  compra_minima: formatarReais(6),
  validade: "22/12/2026",
  link: "https://exemplo.com/pesquisa/abc123",
  codigo: "BOX-7K3Q9M",
  link_google: "https://g.page/exemplo",
  nome_empresa: "Sua empresa",
};

interface CampoNumeroProps {
  id: string;
  label: string;
  valor: string;
  ajuda: React.ReactNode;
  erro?: string;
  disabled: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  onChange: (valor: string) => void;
}

function CampoNumero({ id, label, valor, ajuda, erro, disabled, inputMode = "decimal", onChange }: CampoNumeroProps) {
  const ajudaId = `${id}-ajuda`;
  const erroId = `${id}-erro`;
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        className={`form-control pesquisa-campo${erro ? " is-invalid" : ""}`}
        value={valor}
        onChange={(ev) => onChange(ev.target.value)}
        disabled={disabled}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${ajudaId} ${erroId}` : ajudaId}
      />
      <div id={ajudaId} className="pesquisa-ajuda">
        {ajuda}
      </div>
      {erro && (
        <div id={erroId} className="invalid-feedback pesquisa-erro">
          {erro}
        </div>
      )}
    </div>
  );
}

interface CampoMensagemProps {
  id: string;
  label: string;
  valor: string;
  ajuda: React.ReactNode;
  erro?: string;
  disabled: boolean;
  maximo: number;
  rows?: number;
  onChange: (valor: string) => void;
}

function CampoMensagem({
  id,
  label,
  valor,
  ajuda,
  erro,
  disabled,
  maximo,
  rows = 5,
  onChange,
}: CampoMensagemProps) {
  const ajudaId = `${id}-ajuda`;
  const erroId = `${id}-erro`;
  return (
    <div className="mb-3">
      <div className="d-flex align-items-start justify-content-between gap-2">
        <label htmlFor={id} className="form-label">
          {label}
        </label>
        <span className={`pesquisa-contador${valor.length > maximo ? " pesquisa-contador-excedido" : ""}`}>
          {valor.length}/{maximo}
        </span>
      </div>
      <textarea
        id={id}
        rows={rows}
        className={`form-control pesquisa-campo${erro ? " is-invalid" : ""}`}
        value={valor}
        onChange={(ev) => onChange(ev.target.value)}
        disabled={disabled}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${ajudaId} ${erroId}` : ajudaId}
      />
      <div id={ajudaId} className="pesquisa-ajuda">
        {ajuda}
      </div>
      {erro && (
        <div id={erroId} className="invalid-feedback pesquisa-erro">
          {erro}
        </div>
      )}
    </div>
  );
}

const VARIANTES: Array<{ valor: VarianteVisual; rotulo: string }> = [
  { valor: "ESTRELAS", rotulo: "Estrelas" },
  { valor: "CARINHAS", rotulo: "Carinhas" },
  { valor: "AB", rotulo: "Alternar (teste A/B)" },
];

type ResultadoCarga = { resposta: RespostaConfigAdmin } | { erro: string };

/** Busca unica da configuracao (usada pela carga inicial e pelo "Tentar novamente"); nunca lanca. */
async function buscarConfig(): Promise<ResultadoCarga> {
  try {
    const res = await fetch("/api/admin/pesquisa-config", { cache: "no-store" });
    if (res.status === 401) return { erro: MSG_SESSAO };
    const json = (await res.json().catch(() => ({}))) as RespostaConfigAdmin & { error?: string };
    if (!res.ok || !json.config) return { erro: "Não foi possível carregar a configuração." };
    return { resposta: json };
  } catch {
    return { erro: "Não foi possível carregar a configuração." };
  }
}

export default function ConfigForm() {
  const [dados, setDados] = useState<RespostaConfigAdmin | null>(null);
  const [original, setOriginal] = useState<FormValues | null>(null);
  const [atual, setAtual] = useState<FormValues | null>(null);
  const [errosServidor, setErrosServidor] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroCarregar, setErroCarregar] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  const [ok, setOk] = useState("");
  const emEnvio = useRef(false);

  const aplicar = useCallback((resposta: RespostaConfigAdmin) => {
    const valores = paraFormulario(resposta.config);
    setDados(resposta);
    setOriginal(valores);
    setAtual(valores);
    setErrosServidor({});
  }, []);

  async function carregar() {
    setCarregando(true);
    setErroCarregar("");
    const resultado = await buscarConfig();
    if ("erro" in resultado) setErroCarregar(resultado.erro);
    else aplicar(resultado.resposta);
    setCarregando(false);
  }

  useEffect(() => {
    let cancelado = false;
    void buscarConfig().then((resultado) => {
      if (cancelado) return;
      if ("erro" in resultado) setErroCarregar(resultado.erro);
      else aplicar(resultado.resposta);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [aplicar]);

  const errosCliente = useMemo(
    () => (dados && atual ? validarConfigCliente(paraConfig(atual), dados.limites, dados.placeholders) : {}),
    [dados, atual],
  );
  const erros: Record<string, string> = { ...errosCliente, ...errosServidor };
  const temErros = Object.keys(erros).length > 0;
  const dirty = Boolean(original && atual && JSON.stringify(original) !== JSON.stringify(atual));

  useEffect(() => {
    if (!dirty) return;
    function avisarSaida(evento: BeforeUnloadEvent) {
      evento.preventDefault();
      evento.returnValue = "";
    }
    window.addEventListener("beforeunload", avisarSaida);
    return () => window.removeEventListener("beforeunload", avisarSaida);
  }, [dirty]);

  function alterar<K extends keyof FormValues>(campo: K, valor: FormValues[K]) {
    setAtual((prev) => (prev ? { ...prev, [campo]: valor } : prev));
    setErrosServidor({});
    setErroSalvar("");
    setOk("");
  }

  function descartar() {
    if (!original) return;
    setAtual({ ...original });
    setErrosServidor({});
    setErroSalvar("");
    setOk("");
  }

  function focarPrimeiroErro(campos: string[]) {
    const primeiro = campos[0];
    if (!primeiro) return;
    window.setTimeout(() => {
      const elemento = document.getElementById(`pesq-${primeiro}`);
      if (elemento instanceof HTMLElement) elemento.focus();
    }, 0);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!dados || !atual || emEnvio.current) return;
    if (carregando || salvando) return;

    const config = paraConfig(atual);
    const cliente = validarConfigCliente(config, dados.limites, dados.placeholders);
    if (Object.keys(cliente).length > 0) {
      setErrosServidor({});
      focarPrimeiroErro(Object.keys(cliente));
      return;
    }

    emEnvio.current = true;
    setSalvando(true);
    setErroSalvar("");
    setOk("");
    setErrosServidor({});
    try {
      const res = await fetch("/api/admin/pesquisa-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.status === 401) {
        setErroSalvar(MSG_SESSAO);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as RespostaConfigAdmin & {
        error?: string;
        message?: string | string[];
        campos?: Record<string, string>;
      };
      if (!res.ok) {
        if (res.status === 400 && json.campos && typeof json.campos === "object") {
          setErrosServidor(json.campos);
          setErroSalvar("Não foi possível salvar. Confira os campos destacados e tente de novo.");
          focarPrimeiroErro(Object.keys(json.campos));
          return;
        }
        const mensagem = Array.isArray(json.message) ? json.message.join(" ") : json.message;
        setErroSalvar(
          mensagem ?? json.error ?? "Não foi possível salvar. Confira os campos destacados e tente de novo.",
        );
        return;
      }
      if (!json.config) {
        setErroSalvar("Não foi possível salvar. Confira os campos destacados e tente de novo.");
        return;
      }
      aplicar(json);
      setOk("Configurações salvas.");
    } catch {
      setErroSalvar("Falha ao conectar no backend.");
    } finally {
      emEnvio.current = false;
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="pa-card" aria-busy="true">
        <div className="pa-card-body">
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Carregando configuração...
        </div>
      </div>
    );
  }

  if (erroCarregar || !dados || !atual || !original) {
    return (
      <div className="pa-card">
        <div className="pa-card-body">
          <div className="alert alert-danger" role="alert">
            {erroCarregar || "Não foi possível carregar a configuração."}
          </div>
          <button type="button" className="pesquisa-btn-secundario" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const percentualNum = lerNumero(atual.percentualDesconto);
  const tetoNum = lerNumero(atual.tetoDesconto);
  const intervaloNum = lerNumero(atual.intervaloDias);
  const pontoTeto =
    Number.isFinite(percentualNum) && percentualNum > 0 && Number.isFinite(tetoNum)
      ? (tetoNum * 100) / percentualNum
      : null;
  const ajudaPlaceholders = `Use {placeholders}. Disponíveis: ${dados.placeholders.join(", ")}.`;
  const bloqueado = salvando || !dirty || temErros;

  return (
    <form onSubmit={salvar} noValidate>
      <style>{`
        .pesquisa-config { max-width: 720px; width: 100%; }
        .pesquisa-campo { border-color: #8a94a3; }
        .pesquisa-campo:focus { border-color: #3d42df; box-shadow: 0 0 0 .2rem rgba(61, 66, 223, .18); }
        .pesquisa-ajuda { color: #5b6778; font-size: .82rem; margin-top: .25rem; }
        .pesquisa-erro { display: block; color: #e5484d; font-size: .85rem; margin-top: .25rem; }
        .pesquisa-contador { color: #5b6778; font-size: .78rem; white-space: nowrap; }
        .pesquisa-contador-excedido { color: #e5484d; font-weight: 600; }
        .pesquisa-previa { white-space: pre-wrap; overflow-wrap: anywhere; background: #f4f6fa; border: 1px solid #e6e9f0; border-radius: 8px; padding: .85rem 1rem; color: #1f2a37; }
        .pesquisa-aviso { color: #8a5a00; background: rgba(247, 166, 0, .16); border-radius: 6px; padding: .4rem .6rem; font-size: .82rem; margin-top: .35rem; }
        .pesquisa-seg-btn { min-height: 44px; }
        .pesquisa-btn-secundario { background: #fff; color: #1f2a37; border: 1px solid #8a94a3; border-radius: 6px; padding: .5rem .9rem; min-height: 44px; font-size: .85rem; font-weight: 600; }
        .pesquisa-btn-secundario:hover { background: #f4f6fa; }
        .pesquisa-btn-accent { min-height: 44px; padding: .5rem .9rem; }
        .pesquisa-actionbar-conteudo { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
        .pesquisa-actionbar-status { color: #5b6778; font-size: .85rem; }
        .pesquisa-campo:focus-visible, .pesquisa-btn-secundario:focus-visible, .pesquisa-seg-btn:focus-visible, .pesquisa-btn-accent:focus-visible { outline: 3px solid #3d42df; outline-offset: 2px; }
        @media (max-width: 400px) { .pesquisa-actionbar-conteudo { flex-direction: column; align-items: stretch; } }
      `}</style>

      <div className="pesquisa-config">
        <div className="pa-card">
          <div className="pa-card-header">
            <span>Situação</span>
          </div>
          <div className="pa-card-body">
            <div className="form-check form-switch">
              <input
                id="pesq-ativo"
                type="checkbox"
                role="switch"
                className="form-check-input"
                checked={atual.ativo}
                onChange={(ev) => alterar("ativo", ev.target.checked)}
                disabled={salvando}
              />
              <label htmlFor="pesq-ativo" className="form-check-label">
                Pesquisa e recompensa ativas
              </label>
            </div>
            <div className="pesquisa-ajuda">
              {atual.ativo
                ? "Vale para os próximos fechamentos."
                : "Desligado: o fechamento não envia o link da pesquisa e nenhum cupom é emitido."}
            </div>
          </div>
        </div>

        <div className="pa-card">
          <div className="pa-card-header">
            <span>Recompensa</span>
          </div>
          <div className="pa-card-body">
            <CampoNumero
              id="pesq-percentualDesconto"
              label="Desconto (%)"
              valor={atual.percentualDesconto}
              erro={erros.percentualDesconto}
              disabled={salvando}
              ajuda={`Padrão sugerido nesta empresa: ${formatarPercentual(dados.padroes.percentualDesconto)}.`}
              onChange={(v) => alterar("percentualDesconto", v)}
            />
            <CampoNumero
              id="pesq-tetoDesconto"
              label="Teto de desconto por cupom (R$)"
              valor={atual.tetoDesconto}
              erro={erros.tetoDesconto}
              disabled={salvando}
              ajuda="Desconto máximo em reais por cupom."
              onChange={(v) => alterar("tetoDesconto", v)}
            />
            <CampoNumero
              id="pesq-compraMinima"
              label="Compra mínima (R$)"
              valor={atual.compraMinima}
              erro={erros.compraMinima}
              disabled={salvando}
              ajuda="Compra mínima para usar o cupom."
              onChange={(v) => alterar("compraMinima", v)}
            />
            <CampoNumero
              id="pesq-validadeCupomDias"
              label="Validade do cupom (dias)"
              valor={atual.validadeCupomDias}
              erro={erros.validadeCupomDias}
              disabled={salvando}
              inputMode="numeric"
              ajuda="Contada a partir da emissão."
              onChange={(v) => alterar("validadeCupomDias", v)}
            />
            <CampoNumero
              id="pesq-intervaloDias"
              label="Intervalo entre cupons do mesmo cliente (dias)"
              valor={atual.intervaloDias}
              erro={erros.intervaloDias}
              disabled={salvando}
              inputMode="numeric"
              ajuda={`Um cupom por telefone a cada ${Number.isFinite(intervaloNum) ? intervaloNum : "…"} dias.`}
              onChange={(v) => alterar("intervaloDias", v)}
            />
            <CampoNumero
              id="pesq-tetoMensal"
              label="Teto mensal de desconto (R$)"
              valor={atual.tetoMensal}
              erro={erros.tetoMensal}
              disabled={salvando}
              ajuda="Quando o desconto usado no mês chega a este valor, novos cupons deixam de ser emitidos."
              onChange={(v) => alterar("tetoMensal", v)}
            />
            <CampoNumero
              id="pesq-prefixoCupom"
              label="Prefixo do código"
              valor={atual.prefixoCupom}
              erro={erros.prefixoCupom}
              disabled={salvando}
              inputMode="text"
              ajuda="Ex.: BOX ou BC. Seguido de 6 caracteres."
              onChange={(v) => alterar("prefixoCupom", v)}
            />
            {pontoTeto !== null && (
              <div className="pesquisa-ajuda">
                Com estes valores, o teto por cupom é atingido a partir de {formatarReais(pontoTeto)} de compra.
              </div>
            )}
          </div>
        </div>

        <div className="pa-card">
          <div className="pa-card-header">
            <span>Link e variante</span>
          </div>
          <div className="pa-card-body">
            <CampoNumero
              id="pesq-validadeLinkDias"
              label="Validade do link da pesquisa (dias)"
              valor={atual.validadeLinkDias}
              erro={erros.validadeLinkDias}
              disabled={salvando}
              inputMode="numeric"
              ajuda="Máximo de 14 dias. Limite do Chatwoot para aceitar a resposta."
              onChange={(v) => alterar("validadeLinkDias", v)}
            />
            <CampoNumero
              id="pesq-linkGoogle"
              label="Link de avaliação no Google"
              valor={atual.linkGoogle}
              erro={erros.linkGoogle}
              disabled={salvando}
              inputMode="text"
              ajuda="Deixe vazio para não enviar o convite."
              onChange={(v) => alterar("linkGoogle", v)}
            />
            {atual.linkGoogle.trim() === "" && (
              <div className="pesquisa-aviso">Sem link do Google: o convite não será enviado nem exibido.</div>
            )}
            <fieldset className="mt-3">
              <legend className="form-label">Variante visual</legend>
              <div className="pa-seg" role="group" aria-label="Variante visual">
                {VARIANTES.map((variante) => (
                  <button
                    key={variante.valor}
                    type="button"
                    className={`pa-seg-btn pesquisa-seg-btn${atual.varianteVisual === variante.valor ? " pa-seg-btn-active" : ""}`}
                    aria-pressed={atual.varianteVisual === variante.valor}
                    onClick={() => alterar("varianteVisual", variante.valor)}
                    disabled={salvando}
                  >
                    {variante.rotulo}
                  </button>
                ))}
              </div>
              <div className="pesquisa-ajuda">
                No teste A/B, cada pesquisa recebe uma variante ao acaso, 50% para cada.
              </div>
              {erros.varianteVisual && (
                <div id="pesq-varianteVisual-erro" className="pesquisa-erro">
                  {erros.varianteVisual}
                </div>
              )}
            </fieldset>
          </div>
        </div>

        <div className="pa-card">
          <div className="pa-card-header">
            <span>Mensagens</span>
          </div>
          <div className="pa-card-body">
            <CampoMensagem
              id="pesq-textoFechamento"
              label="Bloco do fechamento"
              valor={atual.textoFechamento}
              erro={erros.textoFechamento}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("textoFechamento", v)}
            />
            <CampoMensagem
              id="pesq-textoSemRecompensa"
              label="Bloco sem recompensa"
              valor={atual.textoSemRecompensa}
              erro={erros.textoSemRecompensa}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("textoSemRecompensa", v)}
            />
            <CampoMensagem
              id="pesq-textoPosResposta"
              label="Mensagem pós-resposta (WhatsApp, com cupom)"
              valor={atual.textoPosResposta}
              erro={erros.textoPosResposta}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("textoPosResposta", v)}
            />
            <CampoMensagem
              id="pesq-textoConviteGoogle"
              label="Convite do Google (WhatsApp, com link)"
              valor={atual.textoConviteGoogle}
              erro={erros.textoConviteGoogle}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("textoConviteGoogle", v)}
            />
            <CampoMensagem
              id="pesq-paginaTitulo"
              label="Título da página"
              valor={atual.paginaTitulo}
              erro={erros.paginaTitulo}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              rows={2}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("paginaTitulo", v)}
            />
            <CampoMensagem
              id="pesq-paginaSubtitulo"
              label="Subtítulo da página"
              valor={atual.paginaSubtitulo}
              erro={erros.paginaSubtitulo}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              rows={2}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("paginaSubtitulo", v)}
            />
            <CampoMensagem
              id="pesq-paginaObrigadoSemRecompensa"
              label="Agradecimento sem recompensa"
              valor={atual.paginaObrigadoSemRecompensa}
              erro={erros.paginaObrigadoSemRecompensa}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              rows={2}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("paginaObrigadoSemRecompensa", v)}
            />
            <CampoMensagem
              id="pesq-paginaGoogleTitulo"
              label="Título do bloco do Google"
              valor={atual.paginaGoogleTitulo}
              erro={erros.paginaGoogleTitulo}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              rows={2}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("paginaGoogleTitulo", v)}
            />
            <CampoMensagem
              id="pesq-paginaGoogleCorpo"
              label="Corpo do bloco do Google"
              valor={atual.paginaGoogleCorpo}
              erro={erros.paginaGoogleCorpo}
              disabled={salvando}
              maximo={dados.limites.textoMax}
              rows={3}
              ajuda={ajudaPlaceholders}
              onChange={(v) => alterar("paginaGoogleCorpo", v)}
            />
          </div>
        </div>

        <div className="pa-card">
          <div className="pa-card-header">
            <span>Prévia da mensagem</span>
          </div>
          <div className="pa-card-body">
            <div className="pesquisa-previa" aria-label="Prévia da mensagem de fechamento com valores de exemplo">
              {renderizarPrevia(atual.textoFechamento, EXEMPLOS)}
            </div>
            <div className="pesquisa-ajuda">Exemplo com valores fictícios; nada é enviado ao servidor.</div>
          </div>
        </div>

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
      </div>

      <div className="pa-actionbar mt-3">
        <div className="pesquisa-actionbar-conteudo">
          <span className="pesquisa-actionbar-status">
            {temErros ? "Confira os campos destacados." : dirty ? "Alterações não salvas." : ""}
          </span>
          <div className="ms-auto d-flex gap-2 flex-wrap">
            <button type="button" className="pesquisa-btn-secundario" onClick={descartar} disabled={!dirty || salvando}>
              Descartar alterações
            </button>
            <button type="submit" className="pa-btn-accent pesquisa-btn-accent" disabled={bloqueado}>
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
