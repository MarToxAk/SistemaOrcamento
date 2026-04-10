"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
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

  if (telefone.startsWith("+55")) {
    telefone = telefone.slice(3);
  } else if (telefone.startsWith("55") && telefone.length >= 12) {
    telefone = telefone.slice(2);
  }

  if (telefone.length === 11) {
    return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
  }
  if (telefone.length === 10) {
    return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 6)}-${telefone.slice(6)}`;
  }

  return value;
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

function normalizeChatwootPayload(raw: Record<string, any>) {
  const dataObj = parseObjectMaybe(raw.data) ?? parseObjectMaybe(raw.payload) ?? raw;
  const nestedDataObj = parseObjectMaybe(dataObj?.data) ?? dataObj;

  const conversation =
    nestedDataObj?.conversation ??
    dataObj?.conversation ??
    nestedDataObj?.meta?.conversation ??
    raw?.conversation ??
    {};

  const contact =
    nestedDataObj?.contact ??
    dataObj?.contact ??
    nestedDataObj?.meta?.sender ??
    dataObj?.meta?.sender ??
    raw?.meta?.sender ??
    raw?.contact ??
    raw?.sender ??
    (nestedDataObj?.name || nestedDataObj?.email || nestedDataObj?.phone_number || nestedDataObj?.phone
      ? nestedDataObj
      : {});

  return { conversation, contact };
}

const DADOS_EXEMPLO = {
  numero: 0,
  data: "",
  cliente: "",
  telefone: "",
  email: "",
  vendedor: "",
  validade: "",
  prazoEntrega: "",
  condPagamento: "",
  observacoes: "",
  itens: [] as ItemForm[],
  carimbos: [] as CarimboForm[],
};

export default function PreencherOrcamentoPage() {
  const [form, setForm] = useState({ ...DADOS_EXEMPLO });
  const [numeroBusca, setNumeroBusca] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [chatwootContactId, setChatwootContactId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [sendingState, setSendingState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [validationState, setValidationState] = useState<"checking" | "valid" | "invalid">("checking");
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const parseOptionalNumber = (...keys: string[]) => {
      for (const key of keys) {
        const raw = params.get(key);
        if (!raw) continue;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return undefined;
    };

    // Compatibilidade com parametros de diferentes integrações Chatwoot.
    setConversationId(parseOptionalNumber("chatid", "conversationId", "conversation_id"));
    setChatwootContactId(parseOptionalNumber("chatwootContactId", "chatwoot_contact_id", "contact_id"));

    const nomeQuery = params.get("nome") ?? params.get("name") ?? params.get("cliente") ?? "";
    const telefoneQuery = params.get("telefone") ?? params.get("phone") ?? params.get("phone_number") ?? "";
    const emailQuery = params.get("email") ?? "";

    if (nomeQuery || telefoneQuery || emailQuery) {
      setForm((current) => ({
        ...current,
        cliente: nomeQuery || current.cliente,
        telefone: telefoneQuery ? normalizePhone(telefoneQuery) : current.telefone,
        email: emailQuery || current.email,
      }));
    }

    const applyChatwootData = (conversation: Record<string, unknown>, contact: Record<string, unknown>) => {
      const convId = parseMaybeNumber(conversation?.id);
      const contactId = parseMaybeNumber(contact?.id);

      if (convId !== undefined) {
        setConversationId(convId);
      }
      if (contactId !== undefined) {
        setChatwootContactId(contactId);
      }

      const nome = String(
        contact?.name ??
          contact?.display_name ??
          contact?.full_name ??
          contact?.identifier ??
          "",
      ).trim();

      const telefoneRaw = String(
        contact?.phone_number ??
          contact?.phoneNumber ??
          contact?.phone ??
          contact?.identifier ??
          "",
      ).trim();

      const email = String(contact?.email ?? contact?.inbox_email ?? "").trim();

      if (!nome && !telefoneRaw && !email) return;

      setForm((current) => ({
        ...current,
        cliente: nome || current.cliente,
        telefone: telefoneRaw ? normalizePhone(telefoneRaw) : current.telefone,
        email: email || current.email,
      }));
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = parseIncomingMessagePayload(event.data);
      if (!payload) return;

      const { conversation, contact } = normalizeChatwootPayload(payload);
      const hasUsefulContext =
        parseMaybeNumber(conversation?.id) !== undefined ||
        parseMaybeNumber(contact?.id) !== undefined ||
        Boolean(contact?.name || contact?.email || contact?.phone_number || contact?.phone || contact?.identifier);

      if (!hasUsefulContext) return;

      applyChatwootData(conversation, contact);
    };

    const requestChatwootInfo = () => {
      try {
        // Formato oficial da doc do Chatwoot.
        window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
        // Compatibilidade com integrações antigas que escutam objeto.
        window.parent?.postMessage({ event: "chatwoot-dashboard-app:fetch-info" }, "*");
      } catch {
        // Ignora falha fora de iframe/Chatwoot.
      }
    };

    window.addEventListener("message", handleMessage);
    requestChatwootInfo();

    const retryId = window.setTimeout(() => {
      requestChatwootInfo();
    }, 1200);

    // Validazione: verificar se está no Chatwoot após timeout
    const validationTimeout = window.setTimeout(() => {
      const isInIframe = window.parent !== window;
      if (!isInIframe) {
        setValidationMessage("Esta página deve ser acessada através do Chatwoot");
        setValidationState("invalid");
      }
    }, 3500);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(retryId);
      window.clearTimeout(validationTimeout);
    };
  }, []);

  // Validação: marcar como válido quando receber dados do Chatwoot
  useEffect(() => {
    if (
      conversationId !== undefined &&
      conversationId > 0
    ) {
      setValidationState("valid");
      setValidationMessage("");
    }
  }, [conversationId]);

  const avisosCarimbo = form.carimbos
    .map((item, idx) => ({
      idx,
      valido: !item.descricao?.trim() || descricaoTemCorValida(item.descricao),
    }))
    .filter((item) => !item.valido)
    .map((item) => `Carimbo ${item.idx + 1}: cor nao reconhecida na descricao.`);

  const itemBorracha = form.itens.find((item) => ehBorrachaPersonalizada(item.descricao));
  const quantidadeBorracha = Number(itemBorracha?.quantidade ?? form.carimbos.length ?? 0);
  const quantidadeCarcaca = form.carimbos.filter((item) => !item.carimbo.toUpperCase().includes("BORRACHA")).length;
  const borrachaSozinha = quantidadeCarcaca === 0 && quantidadeBorracha > 0;

  function atualizarCarimbo(index: number, patch: Partial<CarimboForm>) {
    setForm((f) => ({
      ...f,
      carimbos: f.carimbos.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  // Busca real no backend/Athos
  async function buscarOrcamento() {
    setLoading(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch(`/api/quotes/athos/${numeroBusca}?format=mapped`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Orçamento não encontrado no Athos.");
      }
      const data = await res.json();
      const funcionario = data.funcionario ?? {};
      const itensDetalhados = Array.isArray(data.itensDetalhados) ? data.itensDetalhados : [];
      const carimbosDetalhados = Array.isArray(data.carimbosDetalhados)
        ? data.carimbosDetalhados
        : (Array.isArray(data.carimbos) ? data.carimbos : []);

      const itens = itensDetalhados.length > 0
        ? itensDetalhados.map((item: any) => {
            const produto = item?.produto ?? {};
            const descricaoProduto =
              produto?.descricaocurta ||
              produto?.descricaoproduto ||
              item?.descricao ||
              "";

            return {
              descricao: descricaoProduto,
              quantidade: Number(item?.quantidade ?? 0),
              valor: Number(item?.valor ?? 0),
              desconto: Number(item?.desconto ?? 0),
              total: Number(item?.total ?? 0),
            };
          })
        : (Array.isArray(data.itens)
            ? data.itens.map((item: any) => ({
                descricao: item?.descricao ?? "",
                quantidade: Number(item?.quantidade ?? 0),
                valor: Number(item?.valor ?? 0),
                desconto: Number(item?.desconto ?? 0),
                total: Number(item?.total ?? 0),
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
          const descricaoItem = String(item?.descricao ?? item?.produto?.descricaoproduto ?? item?.produto?.descricaocurta ?? "");
          return ehCarimboModelo(descricaoItem);
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

      const carimbos: CarimboForm[] = carimbosDoBackend.length > 0 ? carimbosDoBackend : carimbosDosItens;

      const borrachaDetalhada = itensDetalhados.find((item: any) => {
        const desc = String(item?.descricao ?? item?.produto?.descricaoproduto ?? item?.produto?.descricaocurta ?? "");
        return ehBorrachaPersonalizada(desc);
      });
      const quantidadeBorrachaDetectada = Number(
        borrachaDetalhada?.itemRaw?.quantidadeitem ??
        borrachaDetalhada?.quantidade ??
        0,
      );

      if (quantidadeBorrachaDetectada > carimbos.length) {
        const faltantes = quantidadeBorrachaDetectada - carimbos.length;
        for (let i = 0; i < faltantes; i++) {
          carimbos.push({
            numero: carimbos.length + 1,
            carimbo: "BORRACHA",
            dimensoes: "",
            descricao: "",
          });
        }
      }

      // Campos de cliente, telefone e email são preservados do Chatwoot.
      // A busca do Athos preenche apenas se ainda estiverem vazios.
      setForm((current) => ({
        numero: data.numero || numeroBusca,
        data: data.data || new Date().toISOString().slice(0, 10),
        cliente: current.cliente || data.cliente || "",
        telefone: current.telefone || data.telefone || funcionario?.celular || funcionario?.telefone || "",
        email: current.email || "",
        vendedor: data.vendedor || funcionario?.nome || "",
        validade: data.validade || "",
        prazoEntrega: data.prazoEntrega || "",
        condPagamento: data.condPagamento || "",
        observacoes: data.observacoes || "",
        itens: itens as ItemForm[],
        carimbos,
      }));
      setErro("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar orçamento.";
      setErro(message);
    }
    setLoading(false);
  }

  async function gerarOrcamento(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setSucesso("");

    const itensInvalidos = form.itens.some((item) => Number(item.quantidade) <= 0 || Number(item.valor) < 0);
    if (itensInvalidos) {
      setErro("Existem itens com quantidade ou valor invalido.");
      return;
    }

    const payload = {
      idorcamento: Number.isFinite(Number(form.numero)) ? Number(form.numero) : undefined,
      dataorcamento: form.data || undefined,
      vendedorNome: form.vendedor || undefined,
      conversationId,
      chatwootContactId,
      cliente: {
        nome: form.cliente,
        telefone: form.telefone || undefined,
        email: form.email || undefined,
      },
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
          produto: {
            descricaoproduto: item.descricao,
            descricaocurta: item.descricao,
          },
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
        valor: Number(form.itens.reduce((acc, item) => acc + Number(item.total || 0), 0).toFixed(2)),
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

      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(responseBody?.message || responseBody?.error || "Falha ao gerar orcamento.");
      }

      const numeroAthos = responseBody?.body?.idorcamento;
      const numeroInterno = responseBody?.body?.idorcamento_interno;
      setSucesso(
        numeroAthos
          ? `Orcamento gerado com sucesso. Numero Athos: ${numeroAthos}.`
          : numeroInterno
            ? `Orcamento gerado com sucesso. Numero interno: ${numeroInterno}.`
          : "Orcamento gerado com sucesso.",
      );
      setSendingState('success');
      window.setTimeout(() => setSendingState('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar orcamento.";
      setErro(message);
      setSendingState('error');
      window.setTimeout(() => setSendingState('idle'), 2000);
    }
  }

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
                  <p className="mb-0">
                    Esta página só pode ser acessada através do <strong>Chatwoot Dashboard</strong>.
                  </p>
                  <hr className="my-2" />
                  <p className="mb-0 small text-muted">
                    {validationMessage || "Por favor, volte ao Chatwoot e clique na opção de orçamento novamente."}
                  </p>
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
              <h5 className="mb-1">Orçamento Nº {form.numero}</h5>
              <div>{new Date(form.data || new Date()).toLocaleDateString("pt-BR")}</div>
            </div>
          </div>
          <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          <form className="needs-validation" noValidate onSubmit={gerarOrcamento}>
            <div className="row mb-4 justify-content-center">
              <div className="col-md-6 text-center">
                <div className="d-flex gap-2 justify-content-center align-items-end">
                  <div className="flex-grow-1" style={{maxWidth: 300}}>
                    <label htmlFor="numeroOrcamento" className="form-label">Número do Orçamento</label>
                    <input
                      type="text"
                      className="form-control form-control-lg text-center"
                      id="numeroOrcamento"
                      value={numeroBusca}
                      onChange={e => setNumeroBusca(e.target.value)}
                      placeholder="Digite o número"
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg px-4"
                    onClick={buscarOrcamento}
                    disabled={loading || !numeroBusca}
                  >
                    {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-search"></i>} Carregar
                  </button>
                </div>
              </div>
            </div>
            {erro && (
              <div className="alert alert-danger text-center">{erro}</div>
            )}
            {sucesso && (
              <div className="alert alert-success text-center">{sucesso}</div>
            )}
            <div className="row mb-4">
              <div className="col-md-6">
                <label htmlFor="clienteNome" className="form-label">Nome do Cliente</label>
                <input type="text" className="form-control" id="clienteNome" value={form.cliente} onChange={e => setForm(f => ({...f, cliente: e.target.value}))} required />
              </div>
              <div className="col-md-3">
                <label htmlFor="clienteTelefone" className="form-label">Telefone</label>
                <input type="text" className="form-control" id="clienteTelefone" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} required />
              </div>
              <div className="col-md-3">
                <label htmlFor="clienteEmail" className="form-label">E-mail</label>
                <input type="email" className="form-control" id="clienteEmail" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              </div>
            </div>
            <div className="row mb-4">
              <div className="col-md-6">
                <label htmlFor="observacoes" className="form-label">Observações da Proposta</label>
                <textarea className="form-control" id="observacoes" rows={3} value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))}></textarea>
              </div>
              <div className="col-md-6">
                <div className="row">
                  <div className="col-md-12 mb-3">
                    <label htmlFor="vendedor" className="form-label">Vendedor</label>
                    <input type="text" className="form-control" id="vendedor" value={form.vendedor} onChange={e => setForm(f => ({...f, vendedor: e.target.value}))} required />
                  </div>
                  <div className="col-md-12 mb-3">
                    <label htmlFor="validade" className="form-label">Validade da Proposta</label>
                    <input type="text" className="form-control" id="validade" value={form.validade} onChange={e => setForm(f => ({...f, validade: e.target.value}))} required />
                  </div>
                  <div className="col-md-12 mb-3">
                    <label htmlFor="prazoEntrega" className="form-label">Prazo de Entrega</label>
                    <input type="date" className="form-control" id="prazoEntrega" value={form.prazoEntrega} onChange={e => setForm(f => ({...f, prazoEntrega: e.target.value}))} required />
                  </div>
                  <div className="col-md-12">
                    <label htmlFor="condPagamento" className="form-label">Condição de Pagamento</label>
                    <select className="form-select" id="condPagamento" value={form.condPagamento} onChange={e => setForm(f => ({...f, condPagamento: e.target.value}))} required>
                      <option value="À vista">À vista</option>
                      <option value="30 dias">30 dias</option>
                      <option value="2x">2x sem juros</option>
                      <option value="3x">3x sem juros</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="row mb-4">
              <div className="col-12">
                <h5>Itens do Orçamento</h5>
                <div className="table-responsive">
                  <table className="table table-bordered">
                    <thead className="table-light">
                      <tr>
                        <th>Descrição</th>
                        <th className="text-center">Quantidade</th>
                        <th className="text-end">Valor Unit.</th>
                        <th className="text-end">Desconto</th>
                        <th className="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.itens.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.descricao}</td>
                          <td className="text-center">{item.quantidade}</td>
                          <td className="text-end">{item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td className="text-end">{item.desconto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td className="text-end">{item.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {form.carimbos.length > 0 && (
              <div className="row mb-4">
                <div className="col-12">
                  <div className="p-4 rounded" style={{ background: "#f8f9fa", borderLeft: "4px solid #7dc8aa" }}>
                    <h5 className="mb-3"><i className="bi bi-stamp me-2"></i>Configuração do Carimbo Personalizado</h5>
                    {quantidadeBorracha > 0 && quantidadeBorracha < quantidadeCarcaca && (
                      <div className="alert alert-danger">
                        <strong>Erro de proporção:</strong> {quantidadeCarcaca} carcaça(s) para apenas {quantidadeBorracha} borracha(s).
                      </div>
                    )}
                    <>
                        {form.carimbos.length > 1 && (
                          <div className="alert alert-primary mb-3">
                            <i className="bi bi-exclamation-triangle me-2"></i>
                            <strong>Múltiplos Carimbos Detectados ({form.carimbos.length}):</strong> Adicione uma descrição para cada bloco abaixo. Deixe em branco se for igual ao anterior.
                          </div>
                        )}

                        {form.carimbos.map((carimbo, idx) => {
                        const base = `${carimbo.carimbo || ""} ${carimbo.dimensoes || ""}`.trim();
                        const label = form.carimbos.length > 1 ? `Descrição do Carimbo ${idx + 1}` : "Descrição do Carimbo Personalizado";
                          const entradaBorracha = borrachaSozinha || carimbo.carimbo.toUpperCase().includes("BORRACHA");

                        return (
                            <div
                              key={idx}
                              className="mb-3 p-3 rounded"
                              style={entradaBorracha ? { background: "#e8f4f8", borderLeft: "3px solid #17a2b8" } : { background: "#fff3cd", borderLeft: "3px solid #ff9800" }}
                            >
                              {entradaBorracha ? (
                                <>
                                  <label className="form-label d-flex align-items-center gap-2">
                                    <i className="bi bi-rulers"></i>
                                    <span>Borracha {idx + 1}</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control mb-2"
                                    value={carimbo.dimensoes}
                                    placeholder="Ex: 4x2 cm"
                                    onChange={e => atualizarCarimbo(idx, { dimensoes: e.target.value })}
                                  />
                                  <textarea
                                    className={`form-control ${carimbo.descricao?.trim() && !descricaoTemCorValida(carimbo.descricao) ? "border-warning" : ""}`}
                                    rows={3}
                                    value={carimbo.descricao}
                                    placeholder={`Descrição da borracha ${idx + 1} (cores, fontes, logos, disposição, etc.)`}
                                    onChange={e => atualizarCarimbo(idx, { descricao: e.target.value })}
                                  />
                                </>
                              ) : (
                                <>
                                  <label className="form-label">
                                    <i className="bi bi-pencil-square me-1"></i>{label}
                                    {form.carimbos.length > 1 && (
                                      <span className="badge text-bg-secondary ms-2">{carimbo.carimbo || "BORRACHA"}</span>
                                    )}
                                  </label>
                                  <div className="mb-2 p-2 rounded bg-white border">
                                    <div><strong>Carimbo:</strong> {carimbo.carimbo || "Nao informado"}</div>
                                    {carimbo.dimensoes && <div><strong>Dimensoes:</strong> {carimbo.dimensoes}</div>}
                                  </div>
                                  <textarea
                                    className={`form-control ${carimbo.descricao?.trim() && !descricaoTemCorValida(carimbo.descricao) ? "border-warning" : ""}`}
                                    rows={form.carimbos.length > 1 ? 3 : 4}
                                    value={carimbo.descricao}
                                    placeholder="Especifique cores, fontes, logos, disposição e detalhes do carimbo"
                                    onChange={e => atualizarCarimbo(idx, { descricao: e.target.value })}
                                  />
                                </>
                              )}
                            </div>
                        );
                      })}
                      {avisosCarimbo.length > 0 && (
                        <div className="alert alert-warning mt-3 mb-0">
                          <strong>Validação de cores:</strong>
                          <div>{avisosCarimbo.join(" ")}</div>
                          <small>Cores aceitas: {CORES_VALIDAS_CARIMBO.join(", ")}</small>
                        </div>
                      )}
                      <small className="form-text text-muted d-block mt-3">
                        <i className="bi bi-lightbulb me-1"></i>
                        <strong>Esta descrição será associada a:</strong>
                        <ul className="mb-0 mt-2">
                          {quantidadeCarcaca > 0 && <li>✓ Carcaça(s) do Carimbo Automático (Qtd Total: {quantidadeCarcaca})</li>}
                          {quantidadeBorracha > quantidadeCarcaca && <li>✓ Borracha(s) adicional(is) sem carcaça (Qtd Total: {quantidadeBorracha - quantidadeCarcaca})</li>}
                        </ul>
                      </small>
                    </>
                  </div>
                </div>
              </div>
            )}
            <div className="row mt-4">
              <div className="col-12 d-flex justify-content-center">
                <button type="submit" className="btn btn-primary" disabled={sendingState === 'sending' || loading}>
                  {sendingState === 'sending' && (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Enviando...
                    </>
                  )}
                  {sendingState === 'success' && (
                    <>
                      <i className="bi bi-check-circle-fill me-2 success-icon"></i>
                      Enviado
                    </>
                  )}
                  {sendingState === 'error' && (
                    <>
                      <i className="bi bi-x-circle-fill me-2 error-icon"></i>
                      Erro ao enviar
                    </>
                  )}
                  {sendingState === 'idle' && 'Gerar Orçamento'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      )}
      <style>{`
        body { background: #f9f7ed; }
        .logo { max-width: 180px; max-height: 120px; }
        .orcamento-header { border-radius: 8px 8px 0 0; display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 1rem; }
        .orcamento-section { border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px #0001; }
        .orcamento-header .small { font-size: 0.85rem; opacity: 0.9; }
        .header-right { text-align: right; display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-end; }
        .header-left { display:flex; align-items:flex-start; gap:1rem; }
        .logo-img { max-width:140px; max-height:100px; }
        @media (max-width: 768px) {
          .orcamento-header { display:block; text-align: center; }
          .header-left { display:flex; align-items:center; justify-content:center; gap:1rem; }
          .header-right { text-align:center; align-items:center; margin-top:0.75rem; }
          .logo-img { margin: 0 auto; }
        }
        @media print { .no-print { display: none !important; } }

        /* Animações do botão de envio */ 
        .success-icon { color: #28a745; font-size: 1.15rem; animation: pop 420ms cubic-bezier(.2,.9,.2,1); }
        .error-icon { color: #dc3545; font-size: 1.15rem; animation: shake 620ms ease-in-out; }

        @keyframes pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1); } }
        @keyframes shake { 0%{ transform: translateX(0) } 20%{ transform: translateX(-3px) } 40%{ transform: translateX(3px) } 60%{ transform: translateX(-2px) } 80%{ transform: translateX(2px) } 100%{ transform: translateX(0) } }
      `}</style>
    </>
  );
}
