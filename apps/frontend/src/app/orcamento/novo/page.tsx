"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CARIMBOS_CONFIG } from "./carimbos-config";

type ItemForm = {
  descricao: string;
  quantidade: number;
  valor: number;
  desconto: number;
  total: number;
};

type CarimboForm = {
  numero: number;
  carimbo: string;
  dimensoes: string;
  descricao: string;
};

const CORES_VALIDAS_CARIMBO = [...CARIMBOS_CONFIG.coresValidas];

function descricaoTemCorValida(descricao: string) {
  return !!CARIMBOS_CONFIG.extrairCor(descricao || "");
}

function sugerirCarcacaTexto(carimbo: CarimboForm) {
  const base = `${carimbo.carimbo || ""} ${carimbo.dimensoes || ""}`.trim();
  const match = CARIMBOS_CONFIG.buscarCarimboCarcaca(base);
  return match?.desc || "";
}

function ehBorrachaPersonalizada(descricao: string) {
  const texto = (descricao || "").toUpperCase();
  return texto.includes("BORRACHA") && texto.includes("CARIMBO") && texto.includes("PERSONALIZADO");
}

function ehCarimboModelo(descricao: string) {
  if (!descricao) return false;
  return CARIMBOS_CONFIG.isAutomatico(descricao) || CARIMBOS_CONFIG.isMadeira(descricao);
}

function parseMaybeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePhone(value: string) {
  let telefone = (value || "").replace(/[\s\-()]/g, "");
  if (telefone.startsWith("+55")) telefone = telefone.slice(3);
  else if (telefone.startsWith("55") && telefone.length >= 12) telefone = telefone.slice(2);
  if (telefone.length === 11) return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
  if (telefone.length === 10) return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 6)}-${telefone.slice(6)}`;
  return value;
}

function parseIncomingMessagePayload(data: unknown): Record<string, any> | null {
  if (!data) return null;
  if (typeof data === "object") return data as Record<string, any>;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch { return null; }
}

function parseObjectMaybe(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch { return null; }
}

function normalizeChatwootPayload(raw: Record<string, any>) {
  const dataObj = parseObjectMaybe(raw.data) ?? parseObjectMaybe(raw.payload) ?? raw;
  const nestedDataObj = parseObjectMaybe(dataObj?.data) ?? dataObj;
  const conversation =
    nestedDataObj?.conversation ?? dataObj?.conversation ??
    nestedDataObj?.meta?.conversation ?? raw?.conversation ?? {};
  const contact =
    nestedDataObj?.contact ?? dataObj?.contact ??
    nestedDataObj?.meta?.sender ?? dataObj?.meta?.sender ??
    raw?.meta?.sender ?? raw?.contact ?? raw?.sender ??
    (nestedDataObj?.name || nestedDataObj?.email || nestedDataObj?.phone_number || nestedDataObj?.phone
      ? nestedDataObj : {});
  return { conversation, contact };
}

const DADOS_EXEMPLO = {
  numero: 0, data: "", cliente: "", telefone: "", email: "",
  vendedor: "", validade: "", prazoEntrega: "", condPagamento: "",
  observacoes: "", itens: [] as ItemForm[], carimbos: [] as CarimboForm[],
};

export default function PreencherOrcamentoPage() {
  const [form, setForm] = useState({ ...DADOS_EXEMPLO });
  const [numeroBusca, setNumeroBusca] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [chatwootContactId, setChatwootContactId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sendingState, setSendingState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");
  const router = useRouter();

  // ─── Chatwoot init + URL params ───────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parseOptionalNumber = (...keys: string[]) => {
      for (const key of keys) {
        const raw = params.get(key);
        if (!raw) continue;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
      return undefined;
    };
    setConversationId(parseOptionalNumber("chatid", "conversationId", "conversation_id"));
    setChatwootContactId(parseOptionalNumber("chatwootContactId", "chatwoot_contact_id", "contact_id"));

    const isDevBypass =
      (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development") ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0"));
    if (isDevBypass) { setValidationState("valid"); setValidationMessage(""); return; }

    const nomeQuery  = params.get("nome")  ?? params.get("name")    ?? params.get("cliente")      ?? "";
    const telefoneQuery = params.get("telefone") ?? params.get("phone") ?? params.get("phone_number") ?? "";
    const emailQuery = params.get("email") ?? "";
    if (nomeQuery || telefoneQuery || emailQuery) {
      setForm((current) => ({
        ...current,
        cliente:  nomeQuery    || current.cliente,
        telefone: telefoneQuery ? normalizePhone(telefoneQuery) : current.telefone,
        email:    emailQuery   || current.email,
      }));
    }

    const applyChatwootData = (conversation: Record<string, unknown>, contact: Record<string, unknown>) => {
      const convId    = parseMaybeNumber(conversation?.id);
      const contactId = parseMaybeNumber(contact?.id);
      if (convId    !== undefined) setConversationId(convId);
      if (contactId !== undefined) setChatwootContactId(contactId);
      const nome       = String(contact?.name ?? contact?.display_name ?? contact?.full_name ?? contact?.identifier ?? "").trim();
      const telefoneRaw = String(contact?.phone_number ?? contact?.phoneNumber ?? contact?.phone ?? contact?.identifier ?? "").trim();
      const email      = String(contact?.email ?? contact?.inbox_email ?? "").trim();
      if (!nome && !telefoneRaw && !email) return;
      setForm((current) => ({
        ...current,
        cliente:  nome       || current.cliente,
        telefone: telefoneRaw ? normalizePhone(telefoneRaw) : current.telefone,
        email:    email      || current.email,
      }));
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = parseIncomingMessagePayload(event.data);
      if (!payload) return;
      const { conversation, contact } = normalizeChatwootPayload(payload);
      const hasUsefulContext =
        parseMaybeNumber(conversation?.id) !== undefined ||
        parseMaybeNumber(contact?.id)      !== undefined ||
        Boolean(contact?.name || contact?.email || contact?.phone_number || contact?.phone || contact?.identifier);
      if (!hasUsefulContext) return;
      applyChatwootData(conversation, contact);
    };

    const requestChatwootInfo = () => {
      try {
        window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
        window.parent?.postMessage({ event: "chatwoot-dashboard-app:fetch-info" }, "*");
      } catch { /* noop */ }
    };

    window.addEventListener("message", handleMessage);
    requestChatwootInfo();
    const retryId = window.setTimeout(() => requestChatwootInfo(), 1200);
    const validationTimeout = window.setTimeout(() => {
      const isInIframe = window.parent !== window;
      if (!isInIframe) { setValidationMessage("Esta página deve ser acessada através do Chatwoot"); setValidationState("invalid"); }
    }, 3500);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(retryId);
      window.clearTimeout(validationTimeout);
    };
  }, []);

  // ─── conversationId → valid ───────────────────────────────────────────────
  useEffect(() => {
    if (conversationId !== undefined && conversationId > 0) {
      setValidationState("valid");
      setValidationMessage("");
    }
  }, [conversationId]);

  // ─── Derived carimbo state ────────────────────────────────────────────────
  const avisosCarimbo = form.carimbos
    .map((item, idx) => ({ idx, valido: !item.descricao?.trim() || descricaoTemCorValida(item.descricao) }))
    .filter((item) => !item.valido)
    .map((item) => `Carimbo ${item.idx + 1}: cor nao reconhecida na descricao.`);

  const itemBorracha = form.itens.find((item) => ehBorrachaPersonalizada(item.descricao));
  const quantidadeBorracha = Number(itemBorracha?.quantidade ?? form.carimbos.length ?? 0);
  const quantidadeCarcaca  = form.carimbos.filter((item) => !item.carimbo.toUpperCase().includes("BORRACHA")).length;
  const borrachaSozinha    = quantidadeCarcaca === 0 && quantidadeBorracha > 0;

  function atualizarCarimbo(index: number, patch: Partial<CarimboForm>) {
    setForm((f) => ({ ...f, carimbos: f.carimbos.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  // ─── Buscar orçamento no Athos ────────────────────────────────────────────
  async function buscarOrcamento() {
    setLoading(true); setErro(""); setSucesso("");
    try {
      const res = await fetch(`/api/quotes/athos/${numeroBusca}?format=mapped`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as any).error || "Orçamento não encontrado no Athos.");
      }
      const data = await res.json() as any;
      const funcionario       = data.funcionario ?? {};
      const itensDetalhados   = Array.isArray(data.itensDetalhados)   ? data.itensDetalhados   : [];
      const carimbosDetalhados = Array.isArray(data.carimbosDetalhados) ? data.carimbosDetalhados : (Array.isArray(data.carimbos) ? data.carimbos : []);

      const itens: ItemForm[] = itensDetalhados.length > 0
        ? itensDetalhados.map((item: any) => {
            const produto = item?.produto ?? {};
            return {
              descricao: produto?.descricaocurta || produto?.descricaoproduto || item?.descricao || "",
              quantidade: Number(item?.quantidade ?? 0),
              valor:      Number(item?.valor ?? 0),
              desconto:   Number(item?.desconto ?? 0),
              total:      Number(item?.total ?? 0),
            };
          })
        : (Array.isArray(data.itens)
            ? data.itens.map((item: any) => ({
                descricao: item?.descricao ?? "",
                quantidade: Number(item?.quantidade ?? 0),
                valor:      Number(item?.valor ?? 0),
                desconto:   Number(item?.desconto ?? 0),
                total:      Number(item?.total ?? 0),
              }))
            : []);

      const carimbosDoBackend: CarimboForm[] = carimbosDetalhados.map((item: any, idx: number) => ({
        numero: Number(item?.numero ?? idx + 1),
        carimbo: String(item?.carimbo ?? ""),
        dimensoes: String(item?.dimensoes ?? ""),
        descricao: String(item?.descricao ?? ""),
      }));

      const carimbosDosItens: CarimboForm[] = itensDetalhados
        .filter((item: any) => {
          const desc = String(item?.descricao ?? item?.produto?.descricaoproduto ?? item?.produto?.descricaocurta ?? "");
          return ehCarimboModelo(desc);
        })
        .map((item: any, idx: number) => {
          const produto = item?.produto ?? {};
          const descricaoItem = String(item?.descricao ?? produto?.descricaoproduto ?? produto?.descricaocurta ?? "");
          return {
            numero: idx + 1,
            carimbo: descricaoItem,
            dimensoes: CARIMBOS_CONFIG.extrairDimensoes(descricaoItem) || String(produto?.referencia ?? ""),
            descricao: "",
          };
        });

      let carimbos: CarimboForm[] = carimbosDoBackend.length > 0 ? carimbosDoBackend : carimbosDosItens;

      const borrachaDetalhada = itensDetalhados.find((item: any) => {
        const desc = String(item?.descricao ?? item?.produto?.descricaoproduto ?? item?.produto?.descricaocurta ?? "");
        return ehBorrachaPersonalizada(desc);
      });
      const qBorracha = Number(borrachaDetalhada?.itemRaw?.quantidadeitem ?? borrachaDetalhada?.quantidade ?? 0);
      if (qBorracha > carimbos.length) {
        for (let i = 0; i < qBorracha - carimbos.length; i++) {
          carimbos.push({ numero: carimbos.length + 1, carimbo: "BORRACHA", dimensoes: "", descricao: "" });
        }
      }

      setForm((current) => ({
        numero: data.numero || numeroBusca,
        data:   data.data   || new Date().toISOString().slice(0, 10),
        cliente:  current.cliente  || data.cliente  || "",
        telefone: current.telefone || data.telefone || funcionario?.celular || funcionario?.telefone || "",
        email:    current.email    || "",
        vendedor: data.vendedor || funcionario?.nome || "",
        validade: data.validade    || "",
        prazoEntrega: data.prazoEntrega || "",
        condPagamento: data.condPagamento || "",
        observacoes:   data.observacoes   || "",
        itens,
        carimbos,
      }));
      setErro("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao carregar orçamento.");
    }
    setLoading(false);
  }

  // ─── Gerar orçamento ──────────────────────────────────────────────────────
  async function gerarOrcamento(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (event.currentTarget && !event.currentTarget.checkValidity()) return;
    setErro(""); setSucesso("");

    const itensInvalidos = form.itens.some((item) => Number(item.quantidade) <= 0 || Number(item.valor) < 0);
    if (itensInvalidos) { setErro("Existem itens com quantidade ou valor invalido."); return; }

    const payload = {
      idorcamento: Number.isFinite(Number(form.numero)) ? Number(form.numero) : undefined,
      dataorcamento: form.data || undefined,
      vendedorNome: form.vendedor || undefined,
      conversationId,
      chatwootContactId,
      cliente: { nome: form.cliente, telefone: form.telefone || undefined, email: form.email || undefined },
      validade: form.validade || undefined,
      prazoEntrega: form.prazoEntrega || undefined,
      condicaoPagamento: form.condPagamento || undefined,
      observacoes: form.observacoes || undefined,
      itens: form.itens.map((item, idx) => {
        const quantidade = Number(item.quantidade);
        const valor = Number(item.valor);
        const desconto = Number(item.desconto || 0);
        const totalCalculado = Number.isFinite(Number(item.total))
          ? Number(item.total)
          : Number((quantidade * valor - desconto).toFixed(2));
        return {
          sequenciaitem: idx + 1,
          produto: { descricaoproduto: item.descricao, descricaocurta: item.descricao },
          quantidadeitem: quantidade,
          valoritem: valor,
          valordesconto: desconto,
          orcamentovalorfinalitem: totalCalculado,
        };
      }),
      carimbos: {
        quantidade_total: form.carimbos.length,
        itens: form.carimbos.map((carimbo, idx) => ({
          numero: Number(carimbo.numero || idx + 1),
          carimbo: carimbo.carimbo || "BORRACHA",
          dimensoes: carimbo.dimensoes || undefined,
          descricao: carimbo.descricao || undefined,
        })),
      },
      totais: {
        desconto: Number(form.itens.reduce((acc, item) => acc + Number(item.desconto || 0), 0).toFixed(2)),
        valor:    Number(form.itens.reduce((acc, item) => acc + Number(item.total    || 0), 0).toFixed(2)),
      },
      source: "MANUAL" as const,
    };

    setSendingState("sending");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await res.json().catch(() => ({})) as any;
      if (!res.ok) throw new Error(responseBody?.message || responseBody?.error || "Falha ao gerar orcamento.");
      const numeroAthos    = responseBody?.body?.idorcamento;
      const numeroInterno  = responseBody?.body?.idorcamento_interno;
      setSucesso(numeroAthos ? `Orçamento gerado. Número Athos: ${numeroAthos}.` : numeroInterno ? `Orçamento gerado. Número interno: ${numeroInterno}.` : "Orçamento gerado com sucesso.");
      setSendingState('success');
      const identifier = numeroAthos ?? numeroInterno ?? undefined;
      if (identifier) {
        const query = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
        const href  = `/orcamento/${encodeURIComponent(String(identifier))}${query ? `?${query}` : ''}`;
        window.setTimeout(() => { try { router.push(href); } catch { window.location.href = href; } }, 600);
      }
      window.setTimeout(() => setSendingState('idle'), 2000);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar orcamento.");
      setSendingState('error');
      window.setTimeout(() => setSendingState('idle'), 2000);
    }
  }

  // ─── Resumo values ────────────────────────────────────────────────────────
  const totalDesconto = form.itens.reduce((a, i) => a + Number(i.desconto || 0), 0);
  const totalValor    = form.itens.reduce((a, i) => a + Number(i.total    || 0), 0);
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ─── Href helpers ─────────────────────────────────────────────────────────
  function getListHref() {
    if (typeof window === "undefined") return "/orcamento";
    const query = window.location.search.replace(/^\?/, "");
    return query ? `/orcamento?${query}` : "/orcamento";
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />

      {/* ── Checking ── */}
      {validationState === "checking" && (
        <>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
          <div className="container my-5">
            <div className="row justify-content-center">
              <div className="col-md-6 text-center">
                <div className="spinner-border text-primary mb-3" role="status"><span className="visually-hidden">Carregando...</span></div>
                <h5 className="text-muted">Autenticando com Chatwoot...</h5>
                <p className="text-secondary small">Por favor, aguarde...</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Invalid ── */}
      {validationState === "invalid" && (
        <>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
          <div className="container my-5">
            <div className="row justify-content-center">
              <div className="col-md-6">
                <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                  <i className="bi bi-exclamation-triangle-fill mt-1" style={{ fontSize: "1.25rem" }} />
                  <div>
                    <h5 className="alert-heading mb-2">Acesso Restrito</h5>
                    <p className="mb-0">Esta página só pode ser acessada através do <strong>Chatwoot Dashboard</strong>.</p>
                    <hr className="my-2" />
                    <p className="mb-0 small text-muted">{validationMessage || "Por favor, volte ao Chatwoot e clique na opção de orçamento novamente."}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Valid — bc2 Layout v2 / Painel ── */}
      {validationState === "valid" && (
        <div className="bc2-app theme-painel density-compact">

          {/* ── Sidebar ── */}
          <aside className="bc2-sidebar">
            <div className="bc2-sidebar__brand">
              <img src="/media/logo-primary.png" alt="Bom Custo" />
              <div className="bc2-sidebar__brand-text">
                <div className="bc2-sidebar__brand-name">Bom Custo</div>
                <div className="bc2-sidebar__brand-sub">Papelaria &amp; Gráfica</div>
              </div>
            </div>
            <nav className="bc2-sidebar__nav">
              <a href={getListHref()} className="bc2-navitem">
                <i className="bi bi-list-ul" />
                <span className="bc2-navitem__label">Orçamentos</span>
              </a>
              <button type="button" className="bc2-navitem is-active">
                <i className="bi bi-plus-circle" />
                <span className="bc2-navitem__label">Novo Orçamento</span>
              </button>
              <a href="/status" className="bc2-navitem">
                <i className="bi bi-kanban" />
                <span className="bc2-navitem__label">Produção</span>
              </a>
            </nav>
            <div className="bc2-sidebar__foot">
              <a href={getListHref()} className="bc2-navitem">
                <i className="bi bi-arrow-left" />
                <span className="bc2-navitem__label">Voltar à Lista</span>
              </a>
            </div>
          </aside>

          {/* ── Main ── */}
          <main className="bc2-main">

            {/* TopBar */}
            <header className="bc2-topbar">
              <div className="bc2-topbar__left">
                <h1 className="bc2-topbar__title">Novo Orçamento</h1>
                <p className="bc2-topbar__sub">
                  Preencha os dados do cliente e os itens da proposta.
                  {form.numero ? <> · <span className="bc2-num bc2-num--big">Nº {form.numero}</span></> : null}
                </p>
              </div>
              <div className="bc2-topbar__right">
                {/* Busca Athos */}
                <div className="bc2-athos-search">
                  <input
                    type="text"
                    className="bc2-input"
                    placeholder="Nº no Athos…"
                    value={numeroBusca}
                    onChange={(e) => setNumeroBusca(e.target.value)}
                    disabled={loading}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscarOrcamento(); } }}
                    style={{ width: 140 }}
                  />
                  <button
                    type="button"
                    className="bc2-btn bc2-btn--ghost"
                    onClick={() => void buscarOrcamento()}
                    disabled={loading || !numeroBusca}
                  >
                    {loading
                      ? <span className="bc2-spin" style={{ width: 14, height: 14, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />
                      : <i className="bi bi-search" />}
                    {" "}Carregar
                  </button>
                </div>
              </div>
            </header>

            {/* Feedback banner */}
            {erro && (
              <div className="bc2-banner bc2-banner--danger">
                <i className="bi bi-exclamation-triangle-fill" /> {erro}
              </div>
            )}
            {sucesso && (
              <div className="bc2-banner bc2-banner--success">
                <i className="bi bi-check-circle-fill" /> {sucesso}
              </div>
            )}

            {/* bc2-form: 3 sections left + sticky aside right */}
            <form
              className={`bc2-form${submitted ? " was-submitted" : ""}`}
              noValidate
              onSubmit={gerarOrcamento}
              id="form-novo-orcamento"
            >

              {/* ── Left column ── */}
              <div className="bc2-form__grid">

                {/* Section 01 — Cliente */}
                <section className="bc2-card">
                  <header className="bc2-card__head">
                    <h3 className="bc2-card__title">
                      <span className="bc2-section-num">01</span> Cliente
                    </h3>
                  </header>
                  <div className="bc2-formgrid bc2-formgrid--3">
                    <label className="bc2-field bc2-field--span-2">
                      <span className="bc2-label">Nome do Cliente <em>*</em></span>
                      <input
                        className={`bc2-input${submitted && !form.cliente ? " bc2-input--invalid" : ""}`}
                        value={form.cliente}
                        onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                        placeholder="Ex.: Pousada Mar Azul"
                        required
                      />
                      {submitted && !form.cliente && <span className="bc2-field__error">Nome do cliente é obrigatório.</span>}
                    </label>
                    <label className="bc2-field">
                      <span className="bc2-label">Telefone <em>*</em></span>
                      <input
                        className={`bc2-input${submitted && !form.telefone ? " bc2-input--invalid" : ""}`}
                        value={form.telefone}
                        onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                        placeholder="(12) 99648-4918"
                        required
                      />
                      {submitted && !form.telefone && <span className="bc2-field__error">Telefone é obrigatório.</span>}
                    </label>
                    <label className="bc2-field bc2-field--span-2">
                      <span className="bc2-label">E-mail</span>
                      <input
                        type="email"
                        className="bc2-input"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="cliente@email.com"
                      />
                    </label>
                    <label className="bc2-field">
                      <span className="bc2-label">Vendedor <em>*</em></span>
                      <input
                        className={`bc2-input${submitted && !form.vendedor ? " bc2-input--invalid" : ""}`}
                        value={form.vendedor}
                        onChange={(e) => setForm((f) => ({ ...f, vendedor: e.target.value }))}
                        required
                      />
                      {submitted && !form.vendedor && <span className="bc2-field__error">Informe o nome do vendedor.</span>}
                    </label>
                  </div>
                </section>

                {/* Section 02 — Condições */}
                <section className="bc2-card">
                  <header className="bc2-card__head">
                    <h3 className="bc2-card__title">
                      <span className="bc2-section-num">02</span> Condições
                    </h3>
                  </header>
                  <div className="bc2-formgrid bc2-formgrid--3">
                    <label className="bc2-field">
                      <span className="bc2-label">Validade da Proposta <em>*</em></span>
                      <input
                        className={`bc2-input${submitted && !form.validade ? " bc2-input--invalid" : ""}`}
                        value={form.validade}
                        onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))}
                        placeholder="Ex.: 7 dias"
                        required
                      />
                      {submitted && !form.validade && <span className="bc2-field__error">Informe a validade da proposta.</span>}
                    </label>
                    <label className="bc2-field">
                      <span className="bc2-label">Prazo de Entrega <em>*</em></span>
                      <input
                        type="date"
                        className={`bc2-input${submitted && !form.prazoEntrega ? " bc2-input--invalid" : ""}`}
                        value={form.prazoEntrega}
                        onChange={(e) => setForm((f) => ({ ...f, prazoEntrega: e.target.value }))}
                        required
                      />
                      {submitted && !form.prazoEntrega && <span className="bc2-field__error">Informe o prazo de entrega.</span>}
                    </label>
                    <label className="bc2-field">
                      <span className="bc2-label">Condição de Pagamento</span>
                      <select
                        className="bc2-input"
                        value={form.condPagamento}
                        onChange={(e) => setForm((f) => ({ ...f, condPagamento: e.target.value }))}
                      >
                        <option value="À vista">À vista</option>
                        <option value="30 dias">30 dias</option>
                        <option value="2x">2x sem juros</option>
                        <option value="3x">3x sem juros</option>
                      </select>
                    </label>
                    <label className="bc2-field bc2-field--span-3">
                      <span className="bc2-label">Observações da Proposta</span>
                      <textarea
                        className="bc2-input"
                        rows={3}
                        value={form.observacoes}
                        onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                        placeholder="Texto livre que aparece no PDF…"
                      />
                    </label>
                  </div>
                </section>

                {/* Section 03 — Itens */}
                <section className="bc2-card">
                  <header className="bc2-card__head">
                    <h3 className="bc2-card__title">
                      <span className="bc2-section-num">03</span> Itens do Orçamento
                    </h3>
                    <div className="bc2-card__head-right">
                      <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                        {form.itens.length === 0 ? "Carregue um orçamento do Athos acima" : `${form.itens.length} item(ns)`}
                      </span>
                    </div>
                  </header>

                  {form.itens.length === 0 ? (
                    <div className="bc2-empty" style={{ padding: "32px 0" }}>
                      <i className="bi bi-inbox" style={{ fontSize: 28, display: "block", marginBottom: 8, opacity: 0.35 }} />
                      Nenhum item carregado. Digite um número do Athos e clique em Carregar.
                    </div>
                  ) : (
                    <div className="bc2-tablewrap">
                      <table className="bc2-table bc2-table--inset">
                        <thead>
                          <tr>
                            <th>Descrição</th>
                            <th className="num">Qtd</th>
                            <th className="num">Unit.</th>
                            <th className="num">Desconto</th>
                            <th className="num">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.itens.map((item, idx) => (
                            <tr key={idx}>
                              <td><span className="bc2-cell-strong">{item.descricao}</span></td>
                              <td className="num">{item.quantidade}</td>
                              <td className="num">{fmtBRL(item.valor)}</td>
                              <td className="num bc2-cell-soft">{fmtBRL(item.desconto)}</td>
                              <td className="num bc2-cell-strong">{fmtBRL(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} className="bc2-tfoot-label">Total da proposta</td>
                            <td className="num bc2-cell-soft" style={{ paddingTop: 14, fontSize: 11 }}>{totalDesconto > 0 ? `− ${fmtBRL(totalDesconto)}` : ""}</td>
                            <td className="num bc2-tfoot-value">{fmtBRL(totalValor)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Carimbos */}
                  {form.carimbos.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--line)", padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <i className="bi bi-stamp" style={{ color: "var(--accent)", fontSize: 16 }} />
                        <span style={{ font: "700 11px/1 var(--font-body)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink)" }}>
                          Configuração de Carimbo Personalizado
                        </span>
                        <span style={{ font: "700 10px/1 var(--font-body)", background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 8px", borderRadius: 999 }}>
                          {form.carimbos.length} carimbo(s)
                        </span>
                      </div>

                      {quantidadeBorracha > 0 && quantidadeBorracha < quantidadeCarcaca && (
                        <div className="bc2-banner bc2-banner--danger" style={{ marginBottom: 12 }}>
                          <i className="bi bi-exclamation-triangle-fill" />
                          <strong> Erro de proporção:</strong> {quantidadeCarcaca} carcaça(s) para apenas {quantidadeBorracha} borracha(s).
                        </div>
                      )}

                      {form.carimbos.length > 1 && (
                        <div className="bc2-banner bc2-banner--info" style={{ marginBottom: 12 }}>
                          <i className="bi bi-info-circle" />
                          <strong> Múltiplos Carimbos ({form.carimbos.length}):</strong> Adicione uma descrição para cada bloco abaixo.
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {form.carimbos.map((carimbo, idx) => {
                          const entradaBorracha = borrachaSozinha || carimbo.carimbo.toUpperCase().includes("BORRACHA");
                          const labelTitle = form.carimbos.length > 1
                            ? `Carimbo ${idx + 1}`
                            : "Descrição do Carimbo Personalizado";

                          return (
                            <div
                              key={idx}
                              style={{
                                borderRadius: "var(--radius)",
                                padding: 12,
                                borderLeft: `3px solid ${entradaBorracha ? "var(--info)" : "var(--amber)"}`,
                                background: entradaBorracha ? "var(--info-bg)" : "var(--amber-bg)",
                              }}
                            >
                              {entradaBorracha ? (
                                <>
                                  <label className="bc2-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <i className="bi bi-rulers" /> Borracha {idx + 1}
                                  </label>
                                  <input
                                    className="bc2-input"
                                    value={carimbo.dimensoes}
                                    placeholder="Ex: 4x2 cm"
                                    onChange={(e) => atualizarCarimbo(idx, { dimensoes: e.target.value })}
                                    style={{ marginBottom: 8 }}
                                  />
                                  <textarea
                                    className={`bc2-input${carimbo.descricao?.trim() && !descricaoTemCorValida(carimbo.descricao) ? " bc2-input--warn" : ""}`}
                                    rows={3}
                                    value={carimbo.descricao}
                                    placeholder={`Descrição da borracha ${idx + 1} (cores, fontes, logos, disposição, etc.)`}
                                    onChange={(e) => atualizarCarimbo(idx, { descricao: e.target.value })}
                                  />
                                </>
                              ) : (
                                <>
                                  <label className="bc2-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <i className="bi bi-pencil-square" /> {labelTitle}
                                    {form.carimbos.length > 1 && (
                                      <span style={{ background: "var(--neutral-bg)", color: "var(--neutral)", padding: "2px 7px", borderRadius: 999, font: "700 10px/1 var(--font-body)" }}>
                                        {carimbo.carimbo || "BORRACHA"}
                                      </span>
                                    )}
                                  </label>
                                  <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", marginBottom: 8, fontSize: 12 }}>
                                    <div><strong>Carimbo:</strong> {carimbo.carimbo || "Não informado"}</div>
                                    {carimbo.dimensoes && <div><strong>Dimensões:</strong> {carimbo.dimensoes}</div>}
                                  </div>
                                  <textarea
                                    className={`bc2-input${carimbo.descricao?.trim() && !descricaoTemCorValida(carimbo.descricao) ? " bc2-input--warn" : ""}`}
                                    rows={form.carimbos.length > 1 ? 3 : 4}
                                    value={carimbo.descricao}
                                    placeholder="Especifique cores, fontes, logos, disposição e detalhes do carimbo"
                                    onChange={(e) => atualizarCarimbo(idx, { descricao: e.target.value })}
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {avisosCarimbo.length > 0 && (
                        <div className="bc2-banner bc2-banner--warn" style={{ marginTop: 10 }}>
                          <i className="bi bi-exclamation-triangle" />
                          <div>
                            <strong>Validação de cores:</strong> {avisosCarimbo.join(" ")}
                            <div style={{ fontSize: 11, marginTop: 3 }}>Cores aceitas: {CORES_VALIDAS_CARIMBO.join(", ")}</div>
                          </div>
                        </div>
                      )}

                      <p style={{ font: "500 11.5px/1.5 var(--font-body)", color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>
                        <i className="bi bi-lightbulb me-1" style={{ color: "var(--info)" }} />
                        <strong>Esta descrição será associada a:</strong>
                        <br />
                        {quantidadeCarcaca > 0 && <span>✓ Carcaça(s) do Carimbo Automático (Qtd: {quantidadeCarcaca})<br /></span>}
                        {quantidadeBorracha > quantidadeCarcaca && <span>✓ Borracha(s) adicional(is) sem carcaça (Qtd: {quantidadeBorracha - quantidadeCarcaca})</span>}
                      </p>
                    </div>
                  )}
                </section>

              </div>{/* /bc2-form__grid */}

              {/* ── Aside — Resumo sticky ── */}
              <aside className="bc2-form__aside">
                <section className="bc2-card bc2-card--sticky">
                  <header className="bc2-card__head">
                    <h3 className="bc2-card__title">Resumo</h3>
                  </header>

                  <dl className="bc2-summary">
                    <div>
                      <dt>Itens</dt>
                      <dd>{form.itens.length > 0 ? `${form.itens.length} item(ns)` : "—"}</dd>
                    </div>
                    <div>
                      <dt>Desconto total</dt>
                      <dd>{totalDesconto > 0 ? fmtBRL(totalDesconto) : "Isento"}</dd>
                    </div>
                    {form.carimbos.length > 0 && (
                      <div>
                        <dt>Carimbos</dt>
                        <dd>{form.carimbos.length} carimbo(s)</dd>
                      </div>
                    )}
                    <div className="bc2-summary__total">
                      <dt>Total</dt>
                      <dd>{totalValor > 0 ? fmtBRL(totalValor) : "—"}</dd>
                    </div>
                  </dl>

                  <div className="bc2-form__actions">
                    <a href={getListHref()} className="bc2-btn bc2-btn--ghost">
                      <i className="bi bi-arrow-left" /> Cancelar
                    </a>
                    <button
                      type="submit"
                      className="bc2-btn bc2-btn--primary"
                      disabled={sendingState === 'sending' || loading}
                    >
                      {sendingState === 'sending' && (
                        <><span className="bc2-spin" style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} /> Enviando…</>
                      )}
                      {sendingState === 'success' && <><i className="bi bi-check-circle-fill" /> Enviado</>}
                      {sendingState === 'error'   && <><i className="bi bi-x-circle-fill" /> Erro</>}
                      {sendingState === 'idle'    && <><i className="bi bi-check2" /> Gerar Orçamento</>}
                    </button>
                  </div>

                  <p className="bc2-form__hint">
                    <i className="bi bi-info-circle" />
                    Ao gerar, um PDF é montado e um link de aprovação é preparado para o cliente.
                  </p>
                </section>
              </aside>

            </form>
          </main>
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }

        :root {
          --font-body:    var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-display: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-mono:    'JetBrains Mono', ui-monospace, monospace;
          --bg: #faf6ec; --surface: #ffffff; --surface-2: #fbf6ea; --surface-3: #f5edd9;
          --ink: #2a1f17; --ink-soft: #6b5c4d; --ink-faint: #a59785;
          --line: #e8dfcc; --line-soft: #f0e8d4;
          --accent: #0e6d73; --accent-fg: #ffffff; --accent-soft: #d6ebed;
          --success: #128a3a; --success-bg: #defce9;
          --warn: #a36500; --warn-bg: #fbecd0;
          --info: #0e6d73; --info-bg: #d8eef0;
          --danger: #c2362c; --danger-bg: #fbe3df;
          --amber: #9a5a1a; --amber-bg: #f8e7cf;
          --neutral: #475569; --neutral-bg: #e2e8f0;
          --radius: 10px; --radius-sm: 6px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02), 0 1px 3px rgba(11,18,32,.06);
          --row-pad-y: 7px; --row-pad-x: 12px; --card-pad: 14px;
          --gap-1: 4px; --gap-2: 8px; --gap-3: 12px; --gap-4: 16px;
        }

        .theme-painel {
          --font-body: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --font-display: var(--font-mulish, 'Mulish', system-ui, sans-serif);
          --bg: #f5f7fa; --surface: #ffffff; --surface-2: #f8fafc; --surface-3: #eef2f7;
          --ink: #0b1220; --ink-soft: #5b6b80; --ink-faint: #9aa7b8;
          --line: #e4e9f0; --line-soft: #eef2f6;
          --accent: #0e6d73; --accent-soft: #d6ebed;
          --radius: 10px;
          --shadow-card: 0 1px 0 rgba(11,18,32,.02), 0 1px 3px rgba(11,18,32,.06);
        }
        .density-compact {
          --row-pad-y: 7px; --row-pad-x: 12px; --card-pad: 14px;
          --gap-1: 4px; --gap-2: 8px; --gap-3: 12px; --gap-4: 16px;
        }

        /* Shell */
        .bc2-app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; background: var(--bg); font-family: var(--font-body); font-size: 14px; color: var(--ink); -webkit-font-smoothing: antialiased; }
        .bc2-app button { font-family: inherit; }
        .bc2-app a { color: var(--accent); text-decoration: none; }
        .bc2-app a:hover { text-decoration: underline; text-underline-offset: 3px; }

        /* Sidebar */
        .bc2-sidebar { position: sticky; top: 0; height: 100vh; background: #ffffff; border-right: 1px solid #eaeef4; display: flex; flex-direction: column; padding: 16px 12px; }
        .bc2-sidebar__brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 14px; border-bottom: 1px solid #eef2f6; margin-bottom: 8px; }
        .bc2-sidebar__brand img { width: 40px; height: 40px; object-fit: contain; background: #f8fafc; border-radius: 10px; padding: 4px; }
        .bc2-sidebar__brand-name { font: 700 14.5px/1.1 var(--font-body); color: var(--ink); letter-spacing: -0.012em; }
        .bc2-sidebar__brand-sub  { font: 500 10.5px/1.2 var(--font-body); color: var(--ink-faint); margin-top: 2px; text-transform: uppercase; letter-spacing: .02em; }
        .bc2-sidebar__nav { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; flex: 1; }
        .bc2-sidebar__foot { border-top: 1px solid #eef2f6; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .bc2-navitem { display: flex; align-items: center; gap: 11px; border: none; background: transparent; color: var(--ink-soft); padding: 7px 10px; border-radius: calc(var(--radius) - 2px); font: 600 12.5px/1 var(--font-body); cursor: pointer; text-align: left; text-decoration: none; }
        .bc2-navitem i { font-size: 15px; width: 20px; text-align: center; }
        .bc2-navitem__label { flex: 1; }
        .bc2-navitem:hover { background: var(--surface-2); color: var(--ink); text-decoration: none; }
        .bc2-navitem.is-active { background: var(--ink); color: #ffffff; }

        /* Main */
        .bc2-main { display: flex; flex-direction: column; padding: 20px 24px 40px; min-width: 0; }

        /* TopBar */
        .bc2-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--gap-3); margin-bottom: 22px; flex-wrap: wrap; row-gap: 12px; }
        .bc2-topbar__left { min-width: 0; flex: 1 1 280px; }
        .bc2-topbar__title { margin: 0; font: 800 28px/1.1 var(--font-display); color: var(--ink); letter-spacing: -0.028em; }
        .bc2-topbar__sub { margin: 6px 0 0; font: 500 13.5px/1.45 var(--font-body); color: var(--ink-soft); }
        .bc2-topbar__right { display: flex; align-items: center; gap: var(--gap-2); flex-wrap: wrap; }

        /* Athos search bar */
        .bc2-athos-search { display: flex; align-items: center; gap: 6px; }

        /* Buttons */
        .bc2-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 700 13px/1 var(--font-body); padding: 8px 12px; border-radius: 8px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background .12s; }
        .bc2-btn:hover { background: var(--surface-2); text-decoration: none; }
        .bc2-btn--primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
        .bc2-btn--primary:hover { background: #0a5358; border-color: #0a5358; color: #fff; }
        .bc2-btn--primary:disabled { opacity: .6; cursor: not-allowed; }
        .bc2-btn--ghost { background: transparent; color: var(--ink-soft); border-color: var(--line); }
        .bc2-btn--ghost:hover { color: var(--ink); border-color: var(--ink-soft); }
        .bc2-btn--sm { font-size: 12px; padding: 5px 9px; }

        /* Banner feedback */
        .bc2-banner { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; border-radius: var(--radius); font: 500 13px/1.4 var(--font-body); margin-bottom: 14px; }
        .bc2-banner--danger  { background: var(--danger-bg);  color: var(--danger);  }
        .bc2-banner--success { background: var(--success-bg); color: var(--success); }
        .bc2-banner--info    { background: var(--info-bg);    color: var(--info);    }
        .bc2-banner--warn    { background: var(--warn-bg);    color: var(--warn);    }

        /* Card */
        .bc2-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-card); overflow: hidden; margin-bottom: var(--gap-3); }
        .bc2-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--gap-2); padding: 14px 18px; border-bottom: 1px solid #eef2f6; flex-wrap: wrap; }
        .bc2-card__title { margin: 0; font: 800 11px/1 var(--font-body); text-transform: uppercase; letter-spacing: .045em; color: var(--ink); display: flex; align-items: center; gap: 8px; }
        .bc2-card__head-right { display: flex; align-items: center; gap: var(--gap-2); }
        .bc2-card--sticky { position: sticky; top: 20px; }

        /* Section number badge */
        .bc2-section-num { font: 700 10px/1 var(--font-mono); background: var(--accent); color: var(--accent-fg); padding: 2px 6px; border-radius: 5px; letter-spacing: 0; }

        /* Form grid layout */
        .bc2-form { display: grid; grid-template-columns: 1fr 300px; gap: var(--gap-3); align-items: start; }
        .bc2-form__grid { display: flex; flex-direction: column; min-width: 0; }
        .bc2-form__aside { min-width: 0; }
        .bc2-formgrid { display: grid; gap: var(--gap-3); padding: var(--card-pad); }
        .bc2-formgrid--3 { grid-template-columns: repeat(3, 1fr); }
        .bc2-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .bc2-field--span-2 { grid-column: span 2; }
        .bc2-field--span-3 { grid-column: span 3; }
        .bc2-label { font: 700 10px/1 var(--font-body); color: var(--ink-faint); text-transform: uppercase; letter-spacing: .07em; }
        .bc2-label em { font-style: normal; color: var(--danger); margin-left: 3px; }
        .bc2-input { width: 100%; min-width: 0; background: #ffffff; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 11px; font: 500 13px/1.2 var(--font-body); transition: border .12s, box-shadow .12s; font-family: var(--font-body); }
        .bc2-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(14,109,115,.14); }
        textarea.bc2-input { resize: vertical; min-height: 72px; }
        select.bc2-input { cursor: pointer; }
        .bc2-input--invalid { border-color: var(--danger) !important; }
        .bc2-input--warn    { border-color: var(--warn); }
        .bc2-field__error { font: 600 11px/1 var(--font-body); color: var(--danger); margin-top: 2px; }

        /* Summary aside */
        .bc2-summary { margin: 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; }
        .bc2-summary > div { display: flex; justify-content: space-between; font: 500 12px/1.3 var(--font-body); color: var(--ink-soft); }
        .bc2-summary dt { color: var(--ink-soft); }
        .bc2-summary dd { margin: 0; color: var(--ink); font-weight: 600; }
        .bc2-summary__total { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 4px; }
        .bc2-summary__total dt, .bc2-summary__total dd { font: 700 15px/1 var(--font-body); color: var(--ink); }
        .bc2-form__actions { display: flex; gap: 8px; padding: 0 18px 14px; }
        .bc2-form__actions .bc2-btn { flex: 1; justify-content: center; }
        .bc2-form__hint { padding: 0 18px 16px; margin: 0; font: 500 11.5px/1.4 var(--font-body); color: var(--ink-soft); display: flex; gap: 6px; align-items: flex-start; }
        .bc2-form__hint i { color: var(--info); margin-top: 1px; flex-shrink: 0; }

        /* Table */
        .bc2-tablewrap { overflow-x: auto; }
        .bc2-table { width: 100%; border-collapse: collapse; font: 500 13px/1.3 var(--font-body); color: var(--ink); }
        .bc2-table th { text-align: left; font: 700 10.5px/1 var(--font-body); text-transform: uppercase; letter-spacing: .055em; color: var(--ink-faint); background: #fafbfd; padding: 8px var(--row-pad-x); border-bottom: 1px solid #eaeef4; }
        .bc2-table th.num { text-align: right; }
        .bc2-table td { padding: var(--row-pad-y) var(--row-pad-x); border-bottom: 1px solid #f1f4f8; vertical-align: middle; }
        .bc2-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .bc2-table tbody tr:last-child td { border-bottom: none; }
        .bc2-table--inset th { background: transparent; padding-top: 12px; }
        .bc2-tfoot-label { text-align: right; font: 700 11px/1 var(--font-body); color: var(--ink-soft); text-transform: uppercase; letter-spacing: .07em; padding-top: 14px; }
        .bc2-tfoot-value { font: 700 15px/1 var(--font-body); color: var(--ink); padding-top: 14px; text-align: right; font-variant-numeric: tabular-nums; }
        .bc2-cell-strong { font-weight: 700; color: var(--ink); }
        .bc2-cell-soft { color: var(--ink-soft); }
        .bc2-num { font-variant-numeric: tabular-nums; font-family: var(--font-mono); font-weight: 600; }
        .bc2-num--big { color: var(--accent); }
        .bc2-empty { text-align: center; color: var(--ink-soft); padding: 40px 0; font: 500 13px/1.4 var(--font-body); }

        /* Spinner */
        @keyframes bc2-spin { to { transform: rotate(360deg); } }
        .bc2-spin { animation: bc2-spin .7s linear infinite; display: inline-block; }

        /* Send button animations */
        @keyframes bc2-pop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.08);opacity:1} 100%{transform:scale(1)} }
        @keyframes bc2-shake { 0%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-2px)} 80%{transform:translateX(2px)} 100%{transform:translateX(0)} }

        /* Responsive */
        @media (max-width: 1000px) { .bc2-form { grid-template-columns: 1fr; } .bc2-card--sticky { position: static; } }
        @media (max-width: 880px) {
          .bc2-app { grid-template-columns: 64px 1fr; }
          .bc2-sidebar { padding: 12px 6px; }
          .bc2-sidebar__brand-text, .bc2-navitem__label { display: none; }
          .bc2-sidebar__brand { justify-content: center; padding: 0 0 12px; }
          .bc2-navitem { justify-content: center; padding: 8px; }
          .bc2-main { padding: 16px; }
        }
        @media (max-width: 720px) {
          .bc2-formgrid--3 { grid-template-columns: 1fr; }
          .bc2-field--span-2, .bc2-field--span-3 { grid-column: auto; }
        }
      `}</style>
    </>
  );
}
