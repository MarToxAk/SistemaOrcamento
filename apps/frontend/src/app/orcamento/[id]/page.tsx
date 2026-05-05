"use client";

import Script from "next/script";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type QuoteItem = {
  sequenciaitem?: number;
  produto?: { descricaoproduto?: string; descricaocurta?: string };
  quantidadeitem?: number;
  valoritem?: number;
  valordesconto?: number;
  orcamentovalorfinalitem?: number;
};

type QuoteDetail = {
  id?: string;
  statusKey?: string;
  availableNextStatuses?: Array<{ value: string; label: string }>;
  // integration status fields (added in 05-03)
  nfseNumero?: string | null;
  nfseLink?: string | null;
  nfseEmitidaEm?: string | null;
  paymentConfirmedAt?: string | null;
  approved?: boolean;
  approvedAt?: string | null;
  latestPdfUrl?: string | null;
  // ---
  body?: {
    idorcamento_interno?: number;
    idorcamento?: number;
    dataorcamento?: string;
    status?: string;
    vendedorNome?: string;
    cliente?: { nome?: string; telefone?: string; email?: string };
    observacoes?: string;
    validade?: string;
    prazoEntrega?: string;
    condicaoPagamento?: string;
    itens?: QuoteItem[];
    carimbos?: {
      itens?: Array<{ numero?: number; carimbo?: string; dimensoes?: string; descricao?: string }>;
    };
    totais?: { valor?: number; desconto?: number; valoracrescimo?: number };
    documentoPdf?: Array<{ publicUrl?: string; generatedAt?: string }>;
  };
};

function parseMaybeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseObjectMaybe(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function parseIncomingMessagePayload(data: unknown): Record<string, any> | null {
  if (!data) return null;
  if (typeof data === "object") return data as Record<string, any>;
  if (typeof data !== "string") return null;

  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function normalizeChatwootPayload(raw: Record<string, any>) {
  const dataObj = parseObjectMaybe(raw.data) ?? parseObjectMaybe(raw.payload) ?? raw;
  const nestedDataObj = parseObjectMaybe(dataObj?.data) ?? dataObj;

  const conversation =
    nestedDataObj?.conversation ??
    dataObj?.conversation ??
    nestedDataObj?.meta?.conversation ??
    raw?.conversation ??
    {};

  return { conversation };
}

export default function OrcamentoDetailPage() {
  const params = useParams<{ id: string }>();
  const quoteId = typeof params?.id === "string" ? params.id : "";

  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [externalPdfUrl, setExternalPdfUrl] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [sendingState, setSendingState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [statusSavingState, setStatusSavingState] = useState<"idle" | "saving">("idle");
  const [statusError, setStatusError] = useState("");
  const [nfseState, setNfseState] = useState<"idle" | "emitindo" | "sucesso" | "erro">("idle");
  const [nfseMsg, setNfseMsg] = useState("");
  const [nfseNumero, setNfseNumero] = useState<string | null>(null);
  const [nfseLink, setNfseLink] = useState<string | null>(null);
  const [nfseModal, setNfseModal] = useState(false);
  const [nfseServico, setNfseServico] = useState("24.01");
  const [nfseTomadorDoc, setNfseTomadorDoc] = useState("");
  const [nfseTomadorNome, setNfseTomadorNome] = useState("");
  const [nfseTomadorTipo, setNfseTomadorTipo] = useState<"cpf" | "cnpj">("cpf");
  const [nfseTomadorEnderecoLogradouro, setNfseTomadorEnderecoLogradouro] = useState("");
  const [nfseTomadorEnderecoNumero, setNfseTomadorEnderecoNumero] = useState("");
  const [nfseTomadorEnderecoBairro, setNfseTomadorEnderecoBairro] = useState("");
  const [nfseTomadorEnderecoCep, setNfseTomadorEnderecoCep] = useState("");
  const [nfseTomadorEnderecoCodigoMunicipio, setNfseTomadorEnderecoCodigoMunicipio] = useState("");
  const [nfseTomadorEnderecoUf, setNfseTomadorEnderecoUf] = useState("");
  const [nfseServicos, setNfseServicos] = useState<Array<{ codigo: string; descricao: string }>>([]);
  const [nfseTomadorAutoDoc, setNfseTomadorAutoDoc] = useState<string | null>(null);
  const [nfseDescontoAtivo, setNfseDescontoAtivo] = useState(false);
  const [nfseDescontoPercent, setNfseDescontoPercent] = useState("");
  const [nfseDescontoValor, setNfseDescontoValor] = useState("");
  const [nfseValorTotal, setNfseValorTotal] = useState("");
  const [nfseAthosQuery, setNfseAthosQuery] = useState("");
  const [nfseAthosResults, setNfseAthosResults] = useState<Array<{
    idcliente: number;
    tipoPessoa: "fisico" | "juridico";
    nome: string;
    documento: string | null;
    endereco: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
  }>>([]);
  const [nfseAthosSearching, setNfseAthosSearching] = useState(false);
  const [nfseClienteAthosSelecionado, setNfseClienteAthosSelecionado] = useState<number | null>(null);
  const [nfseAthosError, setNfseAthosError] = useState("");

  useEffect(() => {
    const isDevBypass =
      (typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "0.0.0.0"));
    if (isDevBypass) {
      setValidationState("valid");
      setValidationMessage("");
      return;
    }

    let validated = false;

    const handleMessage = (event: MessageEvent) => {
      const payload = parseIncomingMessagePayload(event.data);
      if (!payload) return;

      const { conversation } = normalizeChatwootPayload(payload);
      const convId = parseMaybeNumber(conversation?.id);
      if (convId !== undefined && convId > 0) {
        validated = true;
        setValidationState("valid");
        setValidationMessage("");
      }
    };

    const requestChatwootInfo = () => {
      try {
        window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
        window.parent?.postMessage({ event: "chatwoot-dashboard-app:fetch-info" }, "*");
      } catch {
        // noop
      }
    };

    window.addEventListener("message", handleMessage);
    requestChatwootInfo();

    const retryId = window.setTimeout(() => requestChatwootInfo(), 1200);
    const validationTimeout = window.setTimeout(() => {
      const isInIframe = window.parent !== window;
      if (!isInIframe) {
        setValidationMessage("Esta página deve ser acessada através do Chatwoot");
        setValidationState("invalid");
      } else if (!validated) {
        setValidationMessage("Não foi possível validar o contexto da conversa no Chatwoot");
        setValidationState("invalid");
      }
    }, 3500);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(retryId);
      window.clearTimeout(validationTimeout);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const externalUrl = params.get("pdfUrl") ?? params.get("nfseUrl") ?? params.get("documentUrl");
    if (externalUrl) {
      setExternalPdfUrl(externalUrl);
    }
  }, []);

  useEffect(() => {
    if (validationState !== "valid" || !quoteId) {
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as QuoteDetail & { error?: string; message?: string };

        if (!response.ok) {
          throw new Error(data?.message || data?.error || "Erro ao carregar orçamento.");
        }

        setQuote(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar orçamento.");
      } finally {
        setLoading(false);
      }
    };

    void fetchDetail();
  }, [validationState, quoteId]);

  async function handleStatusChange(nextStatus: string) {
    setStatusSavingState("saving");
    setStatusError("");
    try {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: nextStatus, changedBy: "Detalhe do orcamento" }),
      });
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & { message?: string; error?: string };
      if (!response.ok) throw new Error(data?.message || data?.error || "Falha ao atualizar status.");
      setQuote(data as QuoteDetail);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setStatusSavingState("idle");
    }
  }

  async function handleAbrirModalNfse() {
    let temDocumento = false;
    let servico = "24.01";
    let doc: string | null = null;
    let docTipo: "cpf" | "cnpj" = "cpf";
    let nome = "";

    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`);
      const data = await res.json().catch(() => ({})) as {
        servicosDisponiveis?: Array<{ codigo: string; descricao: string }>;
        servicoSugerido?: string;
        tomador?: {
          cpf?: string | null;
          cnpj?: string | null;
          nome?: string | null;
          temDocumento?: boolean;
          endereco?: {
            logradouro?: string;
            numero?: string;
            bairro?: string;
            cep?: string;
            codigoMunicipio?: string;
            uf?: string;
          } | null;
        };
      };
      setNfseServicos(data.servicosDisponiveis ?? [{ codigo: "24.01", descricao: "Confecção de carimbos, banners, placas" }]);
      servico = data.servicoSugerido ?? "24.01";
      setNfseServico(servico);
      doc = data.tomador?.cpf ?? data.tomador?.cnpj ?? null;
      docTipo = data.tomador?.cnpj ? "cnpj" : "cpf";
      nome = data.tomador?.nome ?? "";
      temDocumento = !!data.tomador?.temDocumento;
      setNfseTomadorAutoDoc(doc);
      setNfseTomadorDoc(doc ?? "");
      setNfseTomadorNome(nome);
      setNfseTomadorTipo(docTipo);
      setNfseTomadorEnderecoLogradouro(data.tomador?.endereco?.logradouro ?? "");
      setNfseTomadorEnderecoNumero(data.tomador?.endereco?.numero ?? "");
      setNfseTomadorEnderecoBairro(data.tomador?.endereco?.bairro ?? "");
      setNfseTomadorEnderecoCep(data.tomador?.endereco?.cep ?? "");
      setNfseTomadorEnderecoCodigoMunicipio(data.tomador?.endereco?.codigoMunicipio ?? "");
      setNfseTomadorEnderecoUf(data.tomador?.endereco?.uf ?? "");
    } catch {
      setNfseServicos([{ codigo: "24.01", descricao: "Confecção de carimbos, banners, placas" }]);
      setNfseTomadorEnderecoLogradouro("");
      setNfseTomadorEnderecoNumero("");
      setNfseTomadorEnderecoBairro("");
      setNfseTomadorEnderecoCep("");
      setNfseTomadorEnderecoCodigoMunicipio("");
      setNfseTomadorEnderecoUf("");
    }

    // Sempre abre o modal — usuário pode escolher o serviço e confirmar os dados
    setNfseAthosQuery("");
    setNfseAthosResults([]);
    setNfseAthosSearching(false);
    setNfseClienteAthosSelecionado(null);
    setNfseAthosError("");
    setNfseModal(true);
  }

  async function searchAthosClientes() {
    const q = nfseAthosQuery.trim();
    if (!q) return;
    setNfseAthosSearching(true);
    setNfseAthosError("");
    setNfseAthosResults([]);
    try {
      const isDoc = /^\d{3,}$/.test(q.replace(/\D/g, "")) && q.replace(/\D/g, "").length >= 8;
      const param = isDoc
        ? `documento=${encodeURIComponent(q.replace(/\D/g, ""))}`
        : `nome=${encodeURIComponent(q)}`;
      const res = await fetch(`/api/athos/clientes?${param}&take=10`);
      const data = await res.json().catch(() => ({ error: "Resposta inválida." })) as {
        items?: typeof nfseAthosResults;
        error?: string;
      };
      if (!res.ok || data.error) {
        setNfseAthosError(data.error ?? "Erro ao buscar clientes.");
      } else {
        setNfseAthosResults(data.items ?? []);
        if ((data.items ?? []).length === 0) setNfseAthosError("Nenhum cliente encontrado.");
      }
    } catch {
      setNfseAthosError("Falha ao conectar ao backend.");
    } finally {
      setNfseAthosSearching(false);
    }
  }

  function selecionarClienteAthos(item: typeof nfseAthosResults[0]) {
    setNfseClienteAthosSelecionado(item.idcliente);
    setNfseTomadorTipo(item.tipoPessoa === "juridico" ? "cnpj" : "cpf");
    setNfseTomadorDoc(item.documento ?? "");
    setNfseTomadorNome(item.nome);
    setNfseTomadorEnderecoLogradouro(item.endereco?.logradouro ?? "");
    setNfseTomadorEnderecoNumero(item.endereco?.numero ?? "");
    setNfseTomadorEnderecoBairro(item.endereco?.bairro ?? "");
    setNfseTomadorEnderecoCep(item.endereco?.cep ?? "");
    setNfseTomadorEnderecoCodigoMunicipio(item.endereco?.codigoMunicipio ?? "");
    setNfseTomadorEnderecoUf(item.endereco?.uf ?? "");
    setNfseAthosResults([]);
    setNfseAthosQuery("");
  }

  function syncDesconto(field: "percent" | "valor" | "total", raw: string) {
    const base = Number(quote?.body?.totais?.valor ?? 0);
    const n = parseFloat(raw.replace(",", "."));
    const valid = !isNaN(n) && n >= 0 && base > 0;

    if (field === "percent") {
      setNfseDescontoPercent(raw);
      if (valid) {
        const vDesc = (base * n) / 100;
        setNfseDescontoValor(vDesc.toFixed(2));
        setNfseValorTotal((base - vDesc).toFixed(2));
      } else {
        setNfseDescontoValor("");
        setNfseValorTotal("");
      }
    } else if (field === "valor") {
      setNfseDescontoValor(raw);
      if (valid) {
        const pct = (n / base) * 100;
        setNfseDescontoPercent(pct.toFixed(2));
        setNfseValorTotal((base - n).toFixed(2));
      } else {
        setNfseDescontoPercent("");
        setNfseValorTotal("");
      }
    } else {
      // Valor total não pode ser maior que o valor base
      const clamped = valid && n > base ? base : n;
      const rawClamped = (valid && n > base) ? base.toFixed(2) : raw;
      setNfseValorTotal(rawClamped);
      if (!isNaN(clamped) && clamped >= 0 && base > 0) {
        const vDesc = base - clamped;
        setNfseDescontoValor(vDesc.toFixed(2));
        setNfseDescontoPercent(vDesc >= 0 ? ((vDesc / base) * 100).toFixed(2) : "0");
      } else {
        setNfseDescontoValor("0");
        setNfseDescontoPercent("0");
      }
    }
  }

  async function handleEmitirNfse() {
    setNfseModal(false);
    setNfseState("emitindo");
    setNfseMsg("");
    try {
      const body: Record<string, string | number | boolean> = { servicoCodigo: nfseServico };
      const docLimpo = nfseTomadorDoc.replace(/\D/g, "");
      if (docLimpo) {
        if (nfseTomadorTipo === "cnpj") body.tomadorCnpj = docLimpo;
        else body.tomadorCpf = docLimpo;
      }
      if (nfseTomadorNome.trim()) body.tomadorNome = nfseTomadorNome.trim();
      if (nfseTomadorEnderecoLogradouro.trim()) body.tomadorEnderecoLogradouro = nfseTomadorEnderecoLogradouro.trim();
      if (nfseTomadorEnderecoNumero.trim()) body.tomadorEnderecoNumero = nfseTomadorEnderecoNumero.trim();
      if (nfseTomadorEnderecoBairro.trim()) body.tomadorEnderecoBairro = nfseTomadorEnderecoBairro.trim();
      if (nfseTomadorEnderecoCep.trim()) body.tomadorEnderecoCep = nfseTomadorEnderecoCep.trim();
      if (nfseTomadorEnderecoCodigoMunicipio.trim()) body.tomadorEnderecoCodigoMunicipio = nfseTomadorEnderecoCodigoMunicipio.trim();
      if (nfseTomadorEnderecoUf.trim()) body.tomadorEnderecoUf = nfseTomadorEnderecoUf.trim().toUpperCase();
      if (nfseDescontoAtivo && nfseDescontoValor) {
        body.descontoAtivo = true;
        body.descontoPorcentagem = Number(nfseDescontoPercent);
        body.descontoValor = Number(nfseDescontoValor);
      }

      if (nfseClienteAthosSelecionado != null) {
        body.clienteAthosId = nfseClienteAthosSelecionado;
      }
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/nfse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as { numero?: string; link?: string; jaEmitida?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data?.message || data?.error || "Falha ao emitir NFS-e.");
      const numero = data.numero ?? null;
      setNfseNumero(numero);
      setNfseLink(data.link ?? null);
      setNfseState("sucesso");
      setNfseMsg(data.jaEmitida ? `NFS-e já emitida: número ${numero}` : `NFS-e emitida com sucesso! Número: ${numero}`);
    } catch (err) {
      setNfseState("erro");
      setNfseMsg(err instanceof Error ? err.message : "Erro ao emitir NFS-e.");
    }
  }

  async function handleEnviar() {
    setSendingState("sending");
    setSendMessage("");
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/enviar`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data?.message || data?.error || "Falha ao enviar.");
      setSendingState("success");
      setSendMessage("Mensagem enviada ao cliente com sucesso.");
      const updated = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`, { cache: "no-store" });
      if (updated.ok) setQuote(await updated.json() as QuoteDetail);
    } catch (err) {
      setSendingState("error");
      setSendMessage(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      window.setTimeout(() => setSendingState("idle"), 3000);
    }
  }

  const isDevEnv =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0");

  const canEnviar =
    isDevEnv || Boolean(quote?.availableNextStatuses?.some((s) => s.value === "ENVIADO"));

  const body = quote?.body;
  const itens = body?.itens ?? [];
  const carimbos = body?.carimbos?.itens ?? [];
  const documentoPdf = Array.isArray(body?.documentoPdf) && body?.documentoPdf.length > 0 ? body.documentoPdf[0] : null;
  const pdfViewerUrl = externalPdfUrl ?? documentoPdf?.publicUrl ?? null;
  const quoteNumber = body?.idorcamento ?? body?.idorcamento_interno;

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      {validationState === "checking" && (
        <div className="container my-5">
          <div className="row justify-content-center">
            <div className="col-md-6 text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
              <h5 className="text-muted">Autenticando com Chatwoot...</h5>
              <p className="text-secondary small">Por favor, aguarde...</p>
            </div>
          </div>
        </div>
      )}

      {validationState === "invalid" && (
        <div className="container my-5">
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                <i className="bi bi-exclamation-triangle-fill mt-1" style={{fontSize: "1.25rem"}}></i>
                <div>
                  <h5 className="alert-heading mb-2">Acesso Restrito</h5>
                  <p className="mb-0">Esta página só pode ser acessada através do <strong>Chatwoot Dashboard</strong>.</p>
                  <hr className="my-2" />
                  <p className="mb-0 small text-muted">{validationMessage || "Abra esta página pelo Chatwoot."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {validationState === "valid" && (
        <div className="container my-5">
          <div className="orcamento-header p-3 rounded-top" style={{background: "linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%)", color: "#222"}}>
            <div className="header-left d-flex align-items-start gap-3 flex-grow-1">
              <img src="/media/logo_new.svg" alt="Logo Bom Custo" className="me-3 logo-img" style={{maxWidth:140, maxHeight:100, background: "#fff", borderRadius:8, padding:6}} />
              <div className="header-info">
                <h3 className="mb-0">Bom Custo Papelaria & Gráfica Rápida LTDA</h3>
                <div className="small">CNPJ: 62.391.927/0001-57</div>
                <div className="small">Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê</div>
                <div className="small">Ilhabela - SP, CEP: 11633-078</div>
                <div className="small">
                  Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405<br />
                  E-mail: orcamento@bomcustoilhabela.com.br
                </div>
              </div>
            </div>
            <div className="header-right d-flex flex-column align-items-end justify-content-start ms-3" style={{minWidth:160}}>
              <h5 className="mb-1">Orçamento Nº {quoteNumber ?? "-"}</h5>
              <div>{body?.dataorcamento ? new Date(body.dataorcamento).toLocaleDateString("pt-BR") : "-"}</div>
            </div>
          </div>
          {/* Integration status badges */}
          {(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.saleExternalId || quote?.approved) && (
            <div className="d-flex flex-wrap gap-2 px-3 py-2" style={{background: "rgba(255,255,255,0.7)"}}>
              {quote?.latestPdfUrl && (
                <span className="badge bg-secondary">
                  <i className="bi bi-file-pdf me-1" />PDF Gerado
                </span>
              )}
              {quote?.nfseNumero && (
                <a
                  href={quote.nfseLink ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="badge bg-success text-decoration-none"
                >
                  <i className="bi bi-file-check me-1" />NFS-e #{quote.nfseNumero}
                </a>
              )}
              {quote?.paymentConfirmedAt && (
                <span className="badge bg-primary">
                  <i className="bi bi-check-circle me-1" />PIX Confirmado
                </span>
              )}
              {quote?.approved && (
                <span className="badge bg-info text-dark">
                  <i className="bi bi-person-check me-1" />Aprovado pelo Cliente
                </span>
              )}
            </div>
          )}

          <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
            {loading ? <div className="text-muted">Carregando orçamento...</div> : null}
            {error ? <div className="alert alert-danger">{error}</div> : null}

            {!loading && !error && body && (
              <>
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <strong>Status:</strong>{" "}
                    <span className="badge bg-light text-dark border me-2">{body.status ?? "-"}</span>
                    {quote?.availableNextStatuses && quote.availableNextStatuses.length > 0 && (
                      <div className="d-inline-block mt-1">
                        <select
                          className="form-select form-select-sm"
                          style={{ maxWidth: 180 }}
                          value=""
                          disabled={statusSavingState === "saving"}
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.value = "";
                            if (v) void handleStatusChange(v);
                          }}
                        >
                          <option value="">{statusSavingState === "saving" ? "Salvando..." : "Alterar status"}</option>
                          {quote.availableNextStatuses.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        {statusError && <div className="text-danger small mt-1">{statusError}</div>}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4"><strong>Vendedor:</strong> {body.vendedorNome ?? "-"}</div>
                  <div className="col-md-4"><strong>Data:</strong> {body.dataorcamento ? new Date(body.dataorcamento).toLocaleDateString("pt-BR") : "-"}</div>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-md-4"><strong>Cliente:</strong> {body.cliente?.nome ?? "-"}</div>
                  <div className="col-md-4"><strong>Telefone:</strong> {body.cliente?.telefone ?? "-"}</div>
                  <div className="col-md-4"><strong>E-mail:</strong> {body.cliente?.email ?? "-"}</div>
                  <div className="col-md-4"><strong>Validade:</strong> {body.validade ?? "-"}</div>
                  <div className="col-md-4"><strong>Prazo entrega:</strong> {body.prazoEntrega ?? "-"}</div>
                  <div className="col-md-4"><strong>Pagamento:</strong> {body.condicaoPagamento ?? "-"}</div>
                </div>

                <h5>Itens</h5>
                <div className="table-responsive mb-4">
                  <table className="table table-bordered align-middle itens-table">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Descrição</th>
                        <th>Qtd</th>
                        <th>Valor</th>
                        <th>Desconto</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item, idx) => (
                        <tr key={`${item.sequenciaitem ?? idx}-${idx}`}>
                          <td>{item.sequenciaitem ?? idx + 1}</td>
                          <td>{item.produto?.descricaocurta || item.produto?.descricaoproduto || "-"}</td>
                          <td>{Number(item.quantidadeitem ?? 0)}</td>
                          <td>{Number(item.valoritem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td>{Number(item.valordesconto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td>{Number(item.orcamentovalorfinalitem ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {carimbos.length > 0 && (
                  <>
                    <h5>Carimbos</h5>
                    <ul className="list-group mb-4">
                      {carimbos.map((carimbo, idx) => (
                        <li key={`${carimbo.numero ?? idx}-${idx}`} className="list-group-item">
                          <strong>{carimbo.numero ?? idx + 1}.</strong> {carimbo.carimbo ?? "-"}
                          {carimbo.dimensoes ? ` - ${carimbo.dimensoes}` : ""}
                          {carimbo.descricao ? ` - ${carimbo.descricao}` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="row g-3 mb-4">
                  <div className="col-md-4"><strong>Total:</strong> {Number(body.totais?.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  <div className="col-md-4"><strong>Desconto:</strong> {Number(body.totais?.desconto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  <div className="col-md-4"><strong>Acréscimo:</strong> {Number(body.totais?.valoracrescimo ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                </div>

                {body.observacoes ? <div className="alert alert-light"><strong>Observações:</strong> {body.observacoes}</div> : null}

                {sendMessage ? (
                  <div className={`alert ${sendingState === "success" ? "alert-success" : "alert-danger"} mb-3`}>
                    {sendMessage}
                  </div>
                ) : null}

                {nfseMsg ? (
                  <div className={`alert ${nfseState === "sucesso" ? "alert-success" : "alert-danger"} mb-3`}>
                    <i className={`bi ${nfseState === "sucesso" ? "bi-check-circle" : "bi-exclamation-triangle"} me-2`} />
                    {nfseMsg}
                  </div>
                ) : null}

                <div className="d-flex gap-2 flex-wrap">
                  {quote?.statusKey && quote.statusKey !== "CANCELADO" && !nfseNumero ? (
                    <button
                      type="button"
                      className="btn btn-warning"
                      onClick={() => void handleAbrirModalNfse()}
                      disabled={nfseState === "emitindo"}
                    >
                      {nfseState === "emitindo" ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          Emitindo NFS-e...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-receipt me-2" />
                          Emitir Nota Fiscal
                        </>
                      )}
                    </button>
                  ) : nfseNumero ? (
                    <>
                      <span className="btn btn-outline-success disabled">
                        <i className="bi bi-check-circle me-2" />
                        NFS-e #{nfseNumero}
                      </span>
                      {nfseLink ? (
                        <a className="btn btn-outline-primary" href={nfseLink} target="_blank" rel="noreferrer">
                          <i className="bi bi-box-arrow-up-right me-2" />
                          Abrir NFS-e
                        </a>
                      ) : null}
                    </>
                  ) : null}
                  {canEnviar ? (
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={() => void handleEnviar()}
                      disabled={sendingState === "sending"}
                    >
                      {sendingState === "sending" ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-send me-2" />
                          Enviar ao Cliente
                        </>
                      )}
                    </button>
                  ) : null}
                  {pdfViewerUrl ? (
                    <button type="button" className="btn btn-primary" onClick={() => setPdfModalOpen(true)}>
                      Visualizar PDF
                    </button>
                  ) : null}
                  {documentoPdf?.publicUrl ? (
                    <a className="btn btn-outline-dark" href={documentoPdf.publicUrl} target="_blank" rel="noreferrer">Abrir PDF</a>
                  ) : null}
                  <a className="btn btn-outline-secondary" href="/orcamento">Voltar para lista</a>
                </div>

                {!pdfViewerUrl ? (
                  <div className="alert alert-warning mt-3 mb-0">
                    Nenhum PDF disponível para visualização. Gere um PDF primeiro ou envie `pdfUrl` na URL para usar um PDF externo (NFS-e).
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {pdfModalOpen && pdfViewerUrl ? (
        <div className="pdf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Visualizador de PDF">
          <div className="pdf-modal-card">
            <div className="pdf-modal-header">
              <h5 className="mb-0">Visualização de PDF</h5>
              <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setPdfModalOpen(false)} />
            </div>
            <div className="pdf-modal-actions">
              <a className="btn btn-sm btn-outline-dark" href={pdfViewerUrl} target="_blank" rel="noreferrer">Nova Aba</a>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPdfModalOpen(false)}>Fechar</button>
            </div>
            <div className="pdf-modal-body">
              <iframe
                id="iframe_show_document_modal"
                style={{ border: "none", width: "100%", height: "100%", position: "relative", zIndex: 4 }}
                allowFullScreen
                src={pdfViewerUrl}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal emissão NFS-e */}
      {nfseModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1060 }}>
          <div style={{ background: "#fff", borderRadius: 8, width: "100%", maxWidth: 480, padding: "1.5rem", boxShadow: "0 4px 24px #0003", maxHeight: "90vh", overflowY: "auto" }}>
            <h5 className="mb-3"><i className="bi bi-file-earmark-text me-2" />Emitir Nota Fiscal (NFS-e)</h5>

            {/* Busca cliente Athos */}
            <div className="mb-3">
              <label className="form-label fw-semibold">Buscar cliente Athos</label>
              {nfseClienteAthosSelecionado ? (
                <div className="alert alert-success py-2 d-flex justify-content-between align-items-center">
                  <span>
                    <i className="bi bi-person-check me-2" />
                    <strong>{nfseTomadorNome}</strong>
                    {nfseTomadorDoc ? ` — ${nfseTomadorDoc}` : ""}
                    <small className="text-muted ms-2">(id {nfseClienteAthosSelecionado})</small>
                  </span>
                  <button
                    type="button"
                    className="btn-close btn-sm"
                    aria-label="Remover seleção"
                    onClick={() => {
                      setNfseClienteAthosSelecionado(null);
                      setNfseTomadorDoc("");
                      setNfseTomadorNome("");
                      setNfseAthosResults([]);
                      setNfseAthosQuery("");
                      setNfseAthosError("");
                    }}
                  />
                </div>
              ) : (
                <>
                  <div className="input-group mb-1">
                    <input
                      className="form-control"
                      placeholder="Nome ou CPF/CNPJ"
                      value={nfseAthosQuery}
                      onChange={e => setNfseAthosQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void searchAthosClientes(); } }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => void searchAthosClientes()}
                      disabled={nfseAthosSearching || !nfseAthosQuery.trim()}
                    >
                      {nfseAthosSearching
                        ? <span className="spinner-border spinner-border-sm" role="status" />
                        : <i className="bi bi-search" />}
                    </button>
                  </div>
                  {nfseAthosError && <div className="text-danger small">{nfseAthosError}</div>}
                  {nfseAthosResults.length > 0 && (
                    <ul className="list-group list-group-flush border rounded" style={{ maxHeight: 180, overflowY: "auto" }}>
                      {nfseAthosResults.map(item => (
                        <li key={item.idcliente} className="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center">
                          <span>
                            <span className={`badge me-2 ${item.tipoPessoa === "juridico" ? "bg-info text-dark" : "bg-secondary"}`}>
                              {item.tipoPessoa === "juridico" ? "PJ" : "PF"}
                            </span>
                            <strong>{item.nome}</strong>
                            {item.documento ? <small className="text-muted ms-2">{item.documento}</small> : null}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => selecionarClienteAthos(item)}
                          >
                            Selecionar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Serviço</label>
              <select className="form-select" value={nfseServico} onChange={e => setNfseServico(e.target.value)}>
                {nfseServicos.map(s => (
                  <option key={s.codigo} value={s.codigo}>{s.codigo} — {s.descricao}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Documento do tomador</label>
              <div className="d-flex gap-2 mb-2">
                <div className="form-check">
                  <input className="form-check-input" type="radio" id="tipoCpf" checked={nfseTomadorTipo === "cpf"} onChange={() => setNfseTomadorTipo("cpf")} />
                  <label className="form-check-label" htmlFor="tipoCpf">CPF</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="radio" id="tipoCnpj" checked={nfseTomadorTipo === "cnpj"} onChange={() => setNfseTomadorTipo("cnpj")} />
                  <label className="form-check-label" htmlFor="tipoCnpj">CNPJ</label>
                </div>
              </div>
              <input
                className="form-control"
                placeholder={nfseTomadorTipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                value={nfseTomadorDoc}
                onChange={e => setNfseTomadorDoc(e.target.value)}
              />
              {nfseTomadorAutoDoc && (
                <small className="text-success"><i className="bi bi-check-circle me-1" />Encontrado automaticamente</small>
              )}
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold">Nome do tomador</label>
              <input className="form-control" placeholder="Nome completo ou razão social" value={nfseTomadorNome} onChange={e => setNfseTomadorNome(e.target.value)} />
            </div>

            <div className="mb-2">
              <label className="form-label fw-semibold">Endereço do tomador</label>
              <input
                className="form-control mb-2"
                placeholder="Logradouro"
                value={nfseTomadorEnderecoLogradouro}
                onChange={e => setNfseTomadorEnderecoLogradouro(e.target.value)}
              />
              <input
                className="form-control"
                placeholder="Número"
                value={nfseTomadorEnderecoNumero}
                onChange={e => setNfseTomadorEnderecoNumero(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <input
                className="form-control"
                placeholder="Bairro"
                value={nfseTomadorEnderecoBairro}
                onChange={e => setNfseTomadorEnderecoBairro(e.target.value)}
              />
            </div>

            <div className="row g-2 mb-3">
              <div className="col-5">
                <input
                  className="form-control"
                  placeholder="CEP"
                  value={nfseTomadorEnderecoCep}
                  onChange={e => setNfseTomadorEnderecoCep(e.target.value)}
                />
              </div>
              <div className="col-5">
                <input
                  className="form-control"
                  placeholder="Município (IBGE)"
                  value={nfseTomadorEnderecoCodigoMunicipio}
                  onChange={e => setNfseTomadorEnderecoCodigoMunicipio(e.target.value)}
                />
              </div>
              <div className="col-2">
                <input
                  className="form-control text-uppercase"
                  placeholder="UF"
                  maxLength={2}
                  value={nfseTomadorEnderecoUf}
                  onChange={e => setNfseTomadorEnderecoUf(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="alert alert-light small mb-4">
              Use a busca acima para selecionar um cliente Athos. Se preferir, preencha documento e endereço manualmente.
            </div>

            {/* Seção de desconto */}
            <div className="mb-3">
              <div className="form-check form-switch mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="nfseDescontoSwitch"
                  checked={nfseDescontoAtivo}
                  onChange={e => {
                    setNfseDescontoAtivo(e.target.checked);
                    if (e.target.checked) {
                      setNfseDescontoPercent("0");
                      setNfseDescontoValor("0");
                      setNfseValorTotal((quote?.body?.totais?.valor ?? 0).toFixed(2));
                    } else {
                      setNfseDescontoPercent("");
                      setNfseDescontoValor("");
                      setNfseValorTotal("");
                    }
                  }}
                />
                <label className="form-check-label fw-semibold" htmlFor="nfseDescontoSwitch">Aplicar desconto</label>
              </div>
              {nfseDescontoAtivo && (
                <div className="border rounded p-3 bg-light">
                  <div className="row g-2">
                    <div className="col-4">
                      <label className="form-label small mb-1">% desconto</label>
                      <div className="input-group input-group-sm">
                        <input
                          className="form-control"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0.00"
                          value={nfseDescontoPercent}
                          onChange={e => syncDesconto("percent", e.target.value)}
                        />
                        <span className="input-group-text">%</span>
                      </div>
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-1">R$ desconto</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">R$</span>
                        <input
                          className="form-control"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={nfseDescontoValor}
                          onChange={e => syncDesconto("valor", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-1">Valor total</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">R$</span>
                        <input
                          className="form-control"
                          type="number"
                          min="0"
                          max={(quote?.body?.totais?.valor ?? 0).toFixed(2)}
                          step="0.01"
                          placeholder={(quote?.body?.totais?.valor ?? 0).toFixed(2)}
                          value={nfseValorTotal}
                          onChange={e => syncDesconto("total", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  {quote?.body?.totais?.valor != null && (
                    <small className="text-muted mt-1 d-block">
                      Valor base: {Number(quote.body?.totais?.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </small>
                  )}
                </div>
              )}
            </div>

            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-secondary" onClick={() => setNfseModal(false)}>Cancelar</button>
              <button className="btn btn-warning" onClick={() => void handleEmitirNfse()}>
                <i className="bi bi-file-earmark-check me-2" />Emitir NFS-e
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        body { background: #f9f7ed; }
        .orcamento-header { border-radius: 8px 8px 0 0; display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 1rem; }
        .orcamento-section { border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px #0001; }
        .itens-table thead th { background: #f9e7f5; }
        .pdf-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 1rem;
        }
        .pdf-modal-card {
          width: min(1200px, 100%);
          height: min(860px, calc(100vh - 2rem));
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 20px 45px rgba(0,0,0,0.22);
          display: grid;
          grid-template-rows: auto auto 1fr;
          overflow: hidden;
        }
        .pdf-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid #ececec;
          background: #f8fafb;
        }
        .pdf-modal-actions {
          display: flex;
          gap: 0.5rem;
          padding: 0.7rem 1rem;
          border-bottom: 1px solid #f0f0f0;
          background: #fff;
        }
        .pdf-modal-body {
          min-height: 0;
          height: 100%;
          background: #2d3339;
        }
        .orcamento-header .small { font-size: 0.85rem; opacity: 0.9; }
        .header-right { text-align: right; display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-end; }
        .header-left { display:flex; align-items:flex-start; gap:1rem; }
        .logo-img { max-width:140px; max-height:100px; }
        @media (max-width: 768px) {
          .orcamento-header { display:block; text-align: center; }
          .header-left { display:flex; align-items:center; justify-content:center; gap:1rem; }
          .header-right { text-align:center; align-items:center; margin-top:0.75rem; }
          .logo-img { margin: 0 auto; }
          .pdf-modal-card { height: calc(100vh - 1.25rem); }
        }
      `}</style>
    </>
  );
}
