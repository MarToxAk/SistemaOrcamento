"use client";

import { use, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { safeHttpUrl } from "@/lib/safe-url";
import { EMPRESA_NOME, EMPRESA_LOGO_URL } from "@/lib/empresa";

interface NfseEmitidaCliente {
  id: number;
  numeroNfse: string | null;
  numeroRps: number;
  valorServico: number;
  linkNfse: string | null;
  dataEmissao: string;
  titulos: number[];
}

interface NotaFiscalAthos {
  numero: string;
  dataemissao: string | null;
  valor: number;
  tipo: string;
}

interface DadosCliente {
  idcliente: number;
  nome_cliente: string;
  telefone_completo: string | null;
  emailcliente: string | null;
  emailcobrancacliente: string | null;
  limitecredito: number;
  bloqueaprazo: string | null;
}

interface TituloReceber {
  idcontareceber: number;
  numerotitulo: string | null;
  datavencimento: string;
  valor: number;
  observacao: string | null;
  idvenda: number | null;
  dataemissao: string | null;
  numeroordem: string | null;
  tipoNf?: string | null;
  numeroNf?: string | null;
  boletoAtivo?: { cobrancaId: number; status: string; linkBoleto: string | null; nomeArquivo: string | null } | null;
  nfseAtivo?: { nfseEmitidaId: number; numeroNfse: string | null; linkNfse?: string | null } | null;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function badgeClassName(tipoNf?: string | null): string {
  if (!tipoNf) return "";
  if (tipoNf === "NF-e") return "bg-primary";
  if (tipoNf === "NFS-e") return "bg-success";
  return "bg-secondary"; // combined or other labels
}

export default function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ idcliente: string }>;
}) {
  const { idcliente } = use(params);

  const [dadosCliente, setDadosCliente] = useState<DadosCliente | null>(null);
  const [titulos, setTitulos] = useState<TituloReceber[]>([]);
  const [loadingCliente, setLoadingCliente] = useState(true);
  const [loadingTitulos, setLoadingTitulos] = useState(true);
  const [erroCliente, setErroCliente] = useState("");
  const [erroTitulos, setErroTitulos] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modal boleto states
  const [boletoModalState, setBoletoModalState] = useState<
    "idle" | "confirm" | "loading" | "success" | "error"
  >("idle");
  const [expireAt, setExpireAt] = useState("");
  const [expireAtReadonly, setExpireAtReadonly] = useState(false);
  const [observacaoBoleto, setObservacaoBoleto] = useState("");
  const [erroDatasModal, setErroDatasModal] = useState("");
  const [boletoResult, setBoletoResult] = useState<{
    cobrancaId: number;
    chargeId: number;
    linkBoleto: string;
    barcodeLinhaDigitavel: string;
    valor: number;
    expireAt: string;
    nomeArquivo: string;
  } | null>(null);
  const [boletoErro, setBoletoErro] = useState("");
  const [boletoErroDetalhe, setBoletoErroDetalhe] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [boletoPreview, setBoletoPreview] = useState<{
    nomeCliente: string; total: number;
    itens: Array<{ nome: string; valor: number; quantidade?: number }>;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Modal NFS-e states
  const [nfseModalState, setNfseModalState] = useState<"idle" | "confirm" | "loading" | "success" | "error">("idle");
  const [nfseValor, setNfseValor] = useState("");
  const [nfseDescricao, setNfseDescricao] = useState("");
  const [nfseServico, setNfseServico] = useState("24.01");
  const [nfseAvisoFisico, setNfseAvisoFisico] = useState(false);
  const [nfseResult, setNfseResult] = useState<{
    nfseEmitidaId: number;
    numeroNfse: string;
    numeroRps: number;
    valor: number;
    linkNfse?: string | null;
  } | null>(null);
  const [nfseErro, setNfseErro] = useState("");
  const [nfseErroDetalhe, setNfseErroDetalhe] = useState("");
  const [nfseTitulosElegiveis, setNfseTitulosElegiveis] = useState<number[]>([]);

  // Refetch key for triggering title list reload
  const [refetchKey, setRefetchKey] = useState(0);

  // Seção NFS-e Emitidas
  const [nfseAberta, setNfseAberta] = useState(false);
  const [nfseCarregada, setNfseCarregada] = useState(false);
  const [nfseEmitidas, setNfseEmitidas] = useState<NfseEmitidaCliente[]>([]);
  const [loadingNfse, setLoadingNfse] = useState(false);
  const nfseRef = useRef<HTMLDivElement>(null);

  // Seção Notas Fiscais Athos
  const [nfatAberta, setNfatAberta] = useState(false);
  const [nfatCarregada, setNfatCarregada] = useState(false);
  const [notasFiscaisAthos, setNotasFiscaisAthos] = useState<NotaFiscalAthos[]>([]);
  const [loadingNfat, setLoadingNfat] = useState(false);
  const [buscaNumeroNf, setBuscaNumeroNf] = useState("");
  const [resultadoBuscaNf, setResultadoBuscaNf] = useState<NotaFiscalAthos[] | null>(null);
  const [buscandoNf, setBuscandoNf] = useState(false);
  const nfatRef = useRef<HTMLDivElement>(null);

  const checkboxRef = useRef<HTMLInputElement>(null);

  const totalSelecionado = titulos
    .filter((t) => selectedIds.has(t.idcontareceber))
    .reduce((acc, t) => acc + t.valor, 0);

  // Separar títulos: com boleto (agrupados) vs livres
  const titulosLivres = titulos.filter((t) => !t.boletoAtivo);

  const allSelected = titulosLivres.length > 0 && titulosLivres.every((t) => selectedIds.has(t.idcontareceber));
  const someSelected = selectedIds.size > 0 && !titulosLivres.every((t) => selectedIds.has(t.idcontareceber));
  const boletoGrupos = new Map<number, { boleto: NonNullable<typeof titulos[0]["boletoAtivo"]>; titulos: typeof titulos }>();
  for (const t of titulos) {
    if (t.boletoAtivo) {
      const id = t.boletoAtivo.cobrancaId;
      if (!boletoGrupos.has(id)) boletoGrupos.set(id, { boleto: t.boletoAtivo, titulos: [] });
      boletoGrupos.get(id)!.titulos.push(t);
    }
  }

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  useEffect(() => {
    // Fetch dados cadastrais do cliente
    fetch(`/api/athos/contas-receber/cliente/${idcliente}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar dados do cliente.");
        const data = (await res.json()) as DadosCliente;
        setDadosCliente(data);
      })
      .catch(() => setErroCliente("Erro ao carregar dados do cliente."))
      .finally(() => setLoadingCliente(false));

    // Fetch títulos do cliente + verificação de NF em paralelo
    fetch(`/api/athos/contas-receber/cliente/${idcliente}/titulos`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar títulos.");
        const data = (await res.json()) as TituloReceber[];
        // Verificar NF para cada título
        const ids = data.map((t) => t.idcontareceber);
        if (ids.length > 0) {
          try {
            const nfRes = await fetch(`/api/athos/contas-receber/cliente/${idcliente}/nf-status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idcontasReceber: ids }),
              cache: "no-store",
            });
            if (nfRes.ok) {
              const nfData = (await nfRes.json()) as Array<{ idcontareceber: number; tipoNf: string | null; numeroNf: string | null }>;
              const nfMap = new Map(nfData.map((n) => [n.idcontareceber, { tipoNf: n.tipoNf, numeroNf: n.numeroNf }]));
              // Verificar boletos ativos para os mesmos títulos
                let boletoMap = new Map<number, { cobrancaId: number; status: string; linkBoleto: string | null; nomeArquivo: string | null }>();
                try {
                  const boletoRes = await fetch("/api/cobranca/boleto/titulos-em-uso", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idcontasReceber: ids }),
                    cache: "no-store",
                  });
                  if (boletoRes.ok) {
                    const boletoData = (await boletoRes.json()) as Array<{ idcontareceber: number; cobrancaId: number; status: string; linkBoleto: string | null; nomeArquivo: string | null }>;
                    boletoMap = new Map(boletoData.map((b) => [b.idcontareceber, { cobrancaId: b.cobrancaId, status: b.status, linkBoleto: b.linkBoleto, nomeArquivo: b.nomeArquivo }]));
                  }
                } catch { /* silently ignore */ }

                // Verificar NFS-e emitidas no nosso banco para os mesmos títulos
                let nfseMap = new Map<number, { nfseEmitidaId: number; numeroNfse: string | null; linkNfse?: string | null }>();
                try {
                  const nfseRes = await fetch("/api/cobranca/nfse/titulos-em-uso", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idcontasReceber: ids }),
                    cache: "no-store",
                  });
                  if (nfseRes.ok) {
                    const nfseData = (await nfseRes.json()) as Array<{ idcontareceber: number; nfseEmitidaId: number; numeroNfse: string | null; linkNfse?: string | null }>;
                    nfseMap = new Map(nfseData.map((n) => [n.idcontareceber, { nfseEmitidaId: n.nfseEmitidaId, numeroNfse: n.numeroNfse, linkNfse: n.linkNfse }]));
                  }
                } catch { /* silently ignore */ }

                setTitulos(data.map((t) => {
                  const nf = nfMap.get(t.idcontareceber);
                  const nfseAtivo = nfseMap.get(t.idcontareceber) ?? null;
                  // Se houver NFS-e no nosso banco E NF-e/Athos, mostrar ambos combinados
                  let tipoNf: string | null = null;
                  let numeroNf: string | null = null;
                  if (nfseAtivo && nf?.tipoNf) {
                    tipoNf = `${nf.tipoNf} / NFS-e`;
                    const nums: string[] = [];
                    if (nf.numeroNf) nums.push(nf.numeroNf);
                    if (nfseAtivo.numeroNfse) nums.push(nfseAtivo.numeroNfse);
                    numeroNf = nums.length > 0 ? nums.join(", ") : null;
                  } else if (nfseAtivo) {
                    tipoNf = "NFS-e";
                    numeroNf = nfseAtivo.numeroNfse ?? null;
                  } else {
                    tipoNf = nf?.tipoNf ?? null;
                    numeroNf = nf?.numeroNf ?? null;
                  }
                  return {
                    ...t,
                    tipoNf,
                    numeroNf,
                    boletoAtivo: boletoMap.get(t.idcontareceber) ?? null,
                    nfseAtivo,
                  };
                }));
              return;
            }
          } catch { /* silently ignore NF check errors */ }
        }
        setTitulos(data);
      })
      .catch(() => setErroTitulos("Erro ao carregar títulos."))
      .finally(() => setLoadingTitulos(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idcliente, refetchKey]);

  // ESC key handler for boleto modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && boletoModalState !== "loading") {
        fecharBoletoModal();
      }
    }
    if (boletoModalState !== "idle") {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [boletoModalState]);

  // ESC key handler for NFS-e modal
  useEffect(() => {
    function handleKeyDownNfse(e: KeyboardEvent) {
      if (e.key === "Escape" && nfseModalState !== "loading") {
        fecharNfseModal();
      }
    }
    if (nfseModalState !== "idle") {
      document.addEventListener("keydown", handleKeyDownNfse);
      return () => document.removeEventListener("keydown", handleKeyDownNfse);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfseModalState]);

  async function carregarNfseEmitidas() {
    setLoadingNfse(true);
    try {
      const res = await fetch(`/api/cobranca/nfse/cliente/${idcliente}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as NfseEmitidaCliente[];
        setNfseEmitidas(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingNfse(false);
      setNfseCarregada(true);
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !nfseCarregada) {
        void carregarNfseEmitidas();
      }
    });
    if (nfseRef.current) observer.observe(nfseRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfseAberta, nfseCarregada]);

  async function carregarNotasFiscaisAthos() {
    setLoadingNfat(true);
    try {
      const res = await fetch(`/api/athos/clientes/${idcliente}/notas-fiscais`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as NotaFiscalAthos[];
        setNotasFiscaisAthos(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingNfat(false);
      setNfatCarregada(true);
    }
  }

  async function buscarNotaPorNumero() {
    if (!buscaNumeroNf.trim()) return;
    setBuscandoNf(true);
    try {
      const res = await fetch(
        `/api/athos/clientes/${idcliente}/notas-fiscais?numero=${encodeURIComponent(buscaNumeroNf.trim())}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as NotaFiscalAthos[];
        setResultadoBuscaNf(data);
      }
    } catch { /* silently ignore */ }
    finally {
      setBuscandoNf(false);
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !nfatCarregada) {
        void carregarNotasFiscaisAthos();
      }
    });
    if (nfatRef.current) observer.observe(nfatRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfatAberta, nfatCarregada]);

  function handleToggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll() {
    if (titulosLivres.every((t) => selectedIds.has(t.idcontareceber))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(titulosLivres.map((t) => t.idcontareceber)));
    }
  }

  async function abreBoletoModal() {
    const titulosSelecionados = titulos.filter((t) => selectedIds.has(t.idcontareceber));
    const datas = new Set(titulosSelecionados.map((t) => t.datavencimento?.slice(0, 10)));
    if (datas.size === 1) {
      setExpireAt([...datas][0] ?? "");
      setExpireAtReadonly(true);
      setErroDatasModal("");
    } else {
      setExpireAt("");
      setExpireAtReadonly(false);
      setErroDatasModal(
        "Os títulos selecionados possuem datas de vencimento diferentes. Informe a data de vencimento manualmente.",
      );
    }
    setBoletoPreview(null);
    setBoletoModalState("confirm");
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/cobranca/boleto/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idclienteAthos: Number(idcliente),
          idcontasReceber: titulosSelecionados.map((t) => t.idcontareceber),
        }),
      });
      if (res.ok) setBoletoPreview(await res.json());
    } catch { /* silently ignore */ }
    finally { setLoadingPreview(false); }
  }

  async function confirmarGerarBoleto() {
    setBoletoModalState("loading");
    const titulosSelecionados = titulos.filter((t) => selectedIds.has(t.idcontareceber));
    try {
      const res = await fetch("/api/cobranca/boleto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idclienteAthos: Number(idcliente),
          idcontasReceber: titulosSelecionados.map((t) => t.idcontareceber),
          expireAt,
          ...(observacaoBoleto.trim() ? { observacao: observacaoBoleto.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
      if (!res.ok) {
        setBoletoErro(
          (data as { message?: string; error?: string })?.message ??
            (data as { message?: string; error?: string })?.error ??
            "Não foi possível gerar o boleto. Verifique a conexão e tente novamente.",
        );
        setBoletoErroDetalhe(`HTTP ${res.status}`);
        setBoletoModalState("error");
      } else {
        setBoletoResult(data as typeof boletoResult);
        setBoletoModalState("success");
      }
    } catch (err) {
      setBoletoErro(
        "Não foi possível gerar o boleto. Verifique a conexão e tente novamente.",
      );
      setBoletoErroDetalhe(err instanceof Error ? err.message : "");
      setBoletoModalState("error");
    }
  }

  function fecharBoletoModal() {
    setBoletoModalState("idle");
    setBoletoResult(null);
    setBoletoErro("");
    setBoletoErroDetalhe("");
    setCopiado(false);
    setBoletoPreview(null);
    setObservacaoBoleto("");
  }

  async function abreNfseModal() {
    const titulosSel = titulos.filter((t) => selectedIds.has(t.idcontareceber));
    setNfseAvisoFisico(false);
    setNfseResult(null);
    setNfseErro("");
    setNfseErroDetalhe("");

    // Buscar tipo-produto para cada idvenda único em paralelo
    type ItemServico = { nome: string; quantidade: number; valor: number };
    type TipoProduto = { temProdutoFisico: boolean; valorServicos: number | null; itensServico: ItemServico[] };
    const vendasUnicas = [...new Set(titulosSel.map((t) => t.idvenda).filter((v): v is number => v != null))];
    const tipoPorVenda = new Map<number, TipoProduto>();
    await Promise.all(
      vendasUnicas.map(async (idv) => {
        try {
          const res = await fetch(`/api/athos/venda/${idv}/tipo-produto`, { cache: "no-store" });
          if (res.ok) {
            const d = (await res.json()) as { temProdutoFisico?: boolean; valorServicos?: number | null; itensServico?: ItemServico[] };
            tipoPorVenda.set(idv, {
              temProdutoFisico: d.temProdutoFisico ?? false,
              valorServicos: d.valorServicos ?? null,
              itensServico: d.itensServico ?? [],
            });
          }
        } catch { /* falha silenciosa */ }
      }),
    );

    // Classificar cada título: elegível (serviço) ou excluído (100% físico)
    let totalServicos = 0;
    let temFisico = false;
    const elegiveis: number[] = [];
    const vendasElegiveis = new Set<number>();

    for (const t of titulosSel) {
      const tipo = t.idvenda != null ? tipoPorVenda.get(t.idvenda) : undefined;
      if (tipo?.temProdutoFisico) {
        temFisico = true;
        if (!tipo.valorServicos || tipo.valorServicos <= 0) {
          // 100% físico — exclui da NFS-e
          continue;
        }
        // Misto — inclui com o valor da parcela de serviços
        elegiveis.push(t.idcontareceber);
        if (t.idvenda != null && !vendasElegiveis.has(t.idvenda)) {
          totalServicos += tipo.valorServicos;
          vendasElegiveis.add(t.idvenda);
        }
      } else {
        // Sem idvenda ou 100% serviço — inclui com valor total do título
        elegiveis.push(t.idcontareceber);
        totalServicos += t.valor;
        if (t.idvenda != null) vendasElegiveis.add(t.idvenda);
      }
    }

    // Pré-preencher descrição com itens de serviço das vendas elegíveis
    const itensDescricao: ItemServico[] = [];
    for (const idv of vendasElegiveis) {
      const tipo = tipoPorVenda.get(idv);
      if (tipo?.itensServico?.length) itensDescricao.push(...tipo.itensServico);
    }
    const descricaoAuto = itensDescricao
      .map((i) => {
        const qtd = Number.isInteger(i.quantidade) ? `${i.quantidade}x` : `${i.quantidade.toFixed(2).replace(".", ",")}x`;
        const val = `R$${i.valor.toFixed(2).replace(".", ",")}`;
        return `${i.nome} (${qtd}) - ${val}`;
      })
      .join("; ");

    setNfseTitulosElegiveis(elegiveis);
    setNfseAvisoFisico(temFisico);
    setNfseValor(elegiveis.length > 0 ? totalServicos.toFixed(2) : "0");
    setNfseDescricao(descricaoAuto);
    setNfseModalState("confirm");
  }

  async function confirmarEmitirNfse() {
    setNfseModalState("loading");
    try {
      const res = await fetch("/api/cobranca/nfse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idclienteAthos: Number(idcliente),
          idcontasReceber: nfseTitulosElegiveis,
          valor: parseFloat(nfseValor),
          descricaoServico: nfseDescricao || undefined,
          servicoCodigo: nfseServico,
        }),
      });
      const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
      if (!res.ok) {
        setNfseErro(
          (data as { message?: string; error?: string })?.message ??
            (data as { message?: string; error?: string })?.error ??
            "Não foi possível emitir a NFS-e. Verifique a conexão e tente novamente.",
        );
        setNfseErroDetalhe(`HTTP ${res.status}`);
        setNfseModalState("error");
      } else {
        setNfseResult(data as typeof nfseResult);
        setNfseModalState("success");
      }
    } catch (err) {
      setNfseErro("Falha na conexão.");
      setNfseErroDetalhe(err instanceof Error ? err.message : "");
      setNfseModalState("error");
    }
  }

  function fecharNfseModal(withRefetch?: boolean) {
    setNfseModalState("idle");
    setNfseResult(null);
    setNfseErro("");
    setNfseErroDetalhe("");
    if (withRefetch) {
      setLoadingTitulos(true);
      setRefetchKey((k) => k + 1);
    }
  }

  // Derived variables for the modal
  const titulosSelecionadosParaBoleto = titulos.filter((t) => selectedIds.has(t.idcontareceber));
  const selecionadosSemNf = titulosSelecionadosParaBoleto.filter((t) => !t.tipoNf);
  const hoje = new Date().toISOString().slice(0, 10);
  const expireAtInvalido = !expireAt || expireAt < hoje;

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js"
        strategy="beforeInteractive"
      />
      <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
        rel="stylesheet"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
      />

      <div className="container my-4">
        {/* Header */}
        <div className="orcamento-header d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 rounded-top">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <img
              src={EMPRESA_LOGO_URL}
              alt={EMPRESA_NOME}
              className="logo-img"
            />
            <div>
              <h3 className="mb-1">Detalhe do Cliente</h3>
              <small className="text-muted">Dados cadastrais e títulos em aberto</small>
            </div>
          </div>
          <div>
            <a href="/contas-receber" className="btn btn-sm btn-outline-secondary me-3">
              <i className="bi bi-arrow-left me-1" />Contas a Receber
            </a>
          </div>
        </div>

        {/* Main section */}
        <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          {/* Dados do cliente */}
          <div className="mb-4">
            <h5 className="fw-semibold mb-3">
              <i className="bi bi-person-circle me-2 text-primary" />Dados Cadastrais
            </h5>
            {loadingCliente ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroCliente ? (
              <div className="alert alert-danger">{erroCliente}</div>
            ) : dadosCliente ? (
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <div className="row g-2">
                    <div className="col-md-6">
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted small">Nome</span>
                        <strong className="small text-end">{dadosCliente.nome_cliente}</strong>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted small">Telefone</span>
                        <span className="small">{dadosCliente.telefone_completo ?? "—"}</span>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted small">E-mail</span>
                        <span className="small">{dadosCliente.emailcliente ?? "—"}</span>
                      </div>
                      <div className="d-flex justify-content-between pb-2">
                        <span className="text-muted small">Limite de Crédito</span>
                        <span className="small fw-semibold">
                          {formatBRL(dadosCliente.limitecredito)}
                          {dadosCliente.bloqueaprazo === "S" && (
                            <span className="badge bg-danger ms-2">Bloqueado</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Tabela de títulos */}
          <div>
            <h5 className="fw-semibold mb-3">
              <i className="bi bi-receipt me-2 text-primary" />Títulos em Aberto
            </h5>
            {loadingTitulos ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Carregando...</span>
                </div>
              </div>
            ) : erroTitulos ? (
              <div className="alert alert-danger">{erroTitulos}</div>
            ) : titulos.length === 0 ? (
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2" />Nenhum título encontrado para este cliente.
              </div>
            ) : (
              <div>
                {/* ─── GRUPOS DE BOLETO ─── */}
                {boletoGrupos.size > 0 && (
                  <div className="mb-3">
                    <h6 className="text-muted small mb-2">
                      <i className="bi bi-receipt me-1" />Títulos com boleto emitido
                    </h6>
                    {[...boletoGrupos.values()].map(({ boleto, titulos: tsBoleto }) => {
                      const totalBoleto = tsBoleto.reduce((s, t) => s + t.valor, 0);
                      const isPago = boleto.status === "pago";
                      const isStatus = isPago ? "bg-success" : boleto.status === "cancelado" ? "bg-secondary" : "bg-warning text-dark";
                      return (
                        <div key={boleto.cobrancaId} className="border rounded mb-2 overflow-hidden">
                          {/* Cabeçalho do grupo */}
                          <div className={`d-flex align-items-center gap-2 px-3 py-2 ${isPago ? "bg-success bg-opacity-10" : "bg-warning bg-opacity-10"}`}>
                            <span className={`badge ${isStatus}`}>
                              <i className="bi bi-receipt me-1" />Boleto #{boleto.cobrancaId} — {boleto.status}
                            </span>
                            <span className="small fw-semibold">{formatBRL(totalBoleto)}</span>
                            <span className="small text-muted">({tsBoleto.length} título{tsBoleto.length > 1 ? "s" : ""})</span>
                            <div className="ms-auto d-flex gap-2">
                              {boleto.linkBoleto && (
                                <a href={`/api/cobranca/boleto/${boleto.cobrancaId}/pdf`}
                                  download={boleto.nomeArquivo ?? undefined}
                                  className="btn btn-sm btn-outline-primary"
                                  title="Baixar PDF do boleto">
                                  <i className="bi bi-download me-1" />PDF
                                </a>
                              )}
                              <button type="button" className="btn btn-sm btn-outline-info"
                                title="Verificar pagamento na EFI"
                                onClick={async () => {
                                  await fetch(`/api/cobranca/boleto/${boleto.cobrancaId}/verificar-pagamento`, { method: "POST" });
                                  window.location.reload();
                                }}>
                                <i className="bi bi-arrow-clockwise me-1" />Verificar
                              </button>
                              {!isPago && (
                                <button type="button" className="btn btn-sm btn-outline-danger"
                                  title="Cancelar boleto e liberar títulos"
                                  onClick={async () => {
                                    if (!confirm(`Cancelar boleto #${boleto.cobrancaId}? Os ${tsBoleto.length} título(s) ficarão disponíveis para novo boleto.`)) return;
                                    await fetch(`/api/cobranca/boleto/${boleto.cobrancaId}/cancelar`, { method: "POST" });
                                    window.location.reload();
                                  }}>
                                  <i className="bi bi-x-circle me-1" />Cancelar
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Sub-tabela de títulos deste boleto */}
                          <table className="table table-sm mb-0">
                            <thead className="table-light">
                              <tr>
                                <th className="small text-muted fw-normal">Título</th>
                                <th className="small text-muted fw-normal">Vencimento</th>
                                <th className="small text-muted fw-normal">Valor</th>
                                <th className="small text-muted fw-normal">NF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tsBoleto.map((t) => {
                                const vencido = new Date(t.datavencimento) < new Date();
                                return (
                                  <tr key={t.idcontareceber}>
                                    <td className="small">{t.numerotitulo ?? "—"}</td>
                                    <td className={`small${vencido ? " text-danger" : ""}`}>{formatDate(t.datavencimento)}</td>
                                    <td className="small fw-semibold">{formatBRL(t.valor)}</td>
                                    <td>
                                      {t.tipoNf ? (
                                        <span className="d-inline-flex align-items-center gap-1">
                                          <span className={`badge ${badgeClassName(t.tipoNf)}`}>
                                            {t.tipoNf}{t.numeroNf ? ` #${t.numeroNf}` : ""}
                                          </span>
                                          {t.nfseAtivo?.linkNfse && (
                                            <a
                                              href={safeHttpUrl(t.nfseAtivo.linkNfse) ?? undefined}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="btn btn-link btn-sm p-0 text-success"
                                              title="Baixar PDF da NFS-e"
                                              style={{ lineHeight: 1 }}
                                            >
                                              <i className="bi bi-file-earmark-arrow-down" />
                                            </a>
                                          )}
                                        </span>
                                      ) : <span className="badge bg-secondary opacity-50">Sem NF</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─── TÍTULOS LIVRES (sem boleto) ─── */}
                {titulosLivres.length === 0 && boletoGrupos.size > 0 ? null : (
                  <div className="table-responsive">
                    {boletoGrupos.size > 0 && (
                      <h6 className="text-muted small mb-2">
                        <i className="bi bi-list-check me-1" />Títulos disponíveis
                      </h6>
                    )}
                    <table className="table table-sm table-hover table-bordered">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: "40px" }}>
                            <input type="checkbox" className="form-check-input"
                              checked={allSelected} ref={checkboxRef} onChange={handleToggleAll} />
                          </th>
                          <th>Título</th>
                          <th>Vencimento</th>
                          <th>Valor</th>
                          <th>NF</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {titulosLivres.map((titulo) => {
                          const vencido = new Date(titulo.datavencimento) < new Date();
                          return (
                            <tr key={titulo.idcontareceber}>
                              <td>
                                <input type="checkbox" className="form-check-input"
                                  checked={selectedIds.has(titulo.idcontareceber)}
                                  onChange={() => handleToggle(titulo.idcontareceber)} />
                              </td>
                              <td className="small">{titulo.numerotitulo ?? "—"}</td>
                              <td className={`small${vencido ? " text-danger fw-semibold" : ""}`}>
                                {formatDate(titulo.datavencimento)}
                              </td>
                              <td className="small fw-semibold">{formatBRL(titulo.valor)}</td>
                              <td>
                                {titulo.tipoNf ? (
                                  <span className="d-inline-flex align-items-center gap-1">
                                    <span className={`badge ${badgeClassName(titulo.tipoNf)}`}
                                      title={titulo.numeroNf ? `Nº ${titulo.numeroNf}` : titulo.tipoNf}>
                                      {titulo.tipoNf}{titulo.numeroNf ? ` #${titulo.numeroNf}` : ""}
                                    </span>
                                    {titulo.nfseAtivo?.linkNfse && (
                                      <a
                                        href={safeHttpUrl(titulo.nfseAtivo.linkNfse) ?? undefined}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-link btn-sm p-0 text-success"
                                        title="Baixar PDF da NFS-e"
                                        style={{ lineHeight: 1 }}
                                      >
                                        <i className="bi bi-file-earmark-arrow-down" />
                                      </a>
                                    )}
                                    {titulo.nfseAtivo && (
                                      <button
                                        type="button"
                                        className="btn btn-link btn-sm p-0 text-danger"
                                        title="Remover NFS-e do banco (permite re-emissão)"
                                        style={{ lineHeight: 1 }}
                                        onClick={async () => {
                                          if (!confirm(`Remover registro da NFS-e #${titulo.nfseAtivo!.numeroNfse ?? titulo.nfseAtivo!.nfseEmitidaId} do banco?\n\nIsso NÃO cancela a nota na prefeitura, apenas libera o título para nova emissão.`)) return;
                                          try {
                                            const res = await fetch(`/api/cobranca/nfse/${titulo.nfseAtivo!.nfseEmitidaId}`, { method: "DELETE" });
                                            if (!res.ok) {
                                              const d = await res.json().catch(() => ({}));
                                              alert((d as { error?: string }).error ?? "Erro ao remover NFS-e.");
                                            } else {
                                              setRefetchKey((k) => k + 1);
                                              setNfseCarregada(false); // força reload da seção NFS-e Emitidas
                                            }
                                          } catch {
                                            alert("Falha na conexão.");
                                          }
                                        }}
                                      >
                                        <i className="bi bi-x-circle" />
                                      </button>
                                    )}
                                  </span>
                                ) : <span className="badge bg-secondary opacity-50">Sem NF</span>}
                              </td>
                              <td>
                                {vencido
                                  ? <span className="badge bg-danger">VEN</span>
                                  : <span className="badge bg-info text-dark">AVC</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="table-secondary">
                          <td colSpan={6} className="small text-muted">
                            {selectedIds.size} título(s) selecionado(s) — Total: <strong>{formatBRL(totalSelecionado)}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── SEÇÃO NFS-e Emitidas ─── */}
      <div className="container mt-3">
        <hr />
        <div className="mt-2">
          <button
            className="btn btn-link p-0 text-decoration-none fw-semibold text-dark"
            onClick={() => setNfseAberta(!nfseAberta)}
            type="button"
          >
            {nfseAberta ? "▼" : "►"} NFS-e Emitidas
          </button>
          {nfseAberta && (
            <div ref={nfseRef} className="mt-2">
              {loadingNfse ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Carregando NFS-e...</span>
                  </div>
                </div>
              ) : nfseCarregada && nfseEmitidas.length === 0 ? (
                <p className="text-muted text-center py-3">Nenhuma NFS-e emitida para este cliente</p>
              ) : nfseEmitidas.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-sm table-hover table-bordered">
                    <thead className="table-light">
                      <tr>
                        <th>Data emissão</th>
                        <th>Nº NFS-e</th>
                        <th>Nº RPS</th>
                        <th>Valor</th>
                        <th>Títulos vinculados</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfseEmitidas.map((nfse) => (
                        <tr key={nfse.id}>
                          <td className="small">{formatDate(nfse.dataEmissao)}</td>
                          <td className="small">{nfse.numeroNfse ?? "—"}</td>
                          <td className="small">{nfse.numeroRps}</td>
                          <td className="small fw-semibold">{formatBRL(nfse.valorServico)}</td>
                          <td className="small">
                            {nfse.titulos.length > 0
                              ? nfse.titulos.map((tid, i) => (
                                  <span key={tid}>
                                    <span className="badge bg-secondary">{tid}</span>
                                    {i < nfse.titulos.length - 1 && " "}
                                  </span>
                                ))
                              : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            <div className="d-flex gap-2 align-items-center">
                              {nfse.linkNfse && (
                                <a
                                  href={safeHttpUrl(nfse.linkNfse) ?? undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-outline-success"
                                  title="Baixar PDF da NFS-e"
                                >
                                  <i className="bi bi-file-earmark-arrow-down" />
                                </a>
                              )}
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                title="Remove do sistema. O cancelamento na prefeitura pode não ser suportado."
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `Cancelar NFS-e ${nfse.numeroNfse ? `#${nfse.numeroNfse}` : `(ID ${nfse.id})`}?\n\nO cancelamento na prefeitura pode não ser suportado. O registro será removido do banco local.`,
                                    )
                                  )
                                    return;
                                  try {
                                    const res = await fetch(`/api/cobranca/nfse/${nfse.id}`, {
                                      method: "DELETE",
                                    });
                                    if (!res.ok) {
                                      const d = await res.json().catch(() => ({}));
                                      alert((d as { error?: string }).error ?? "Erro ao cancelar NFS-e.");
                                    } else {
                                      setNfseEmitidas((prev) => prev.filter((n) => n.id !== nfse.id));
                                      setRefetchKey((k) => k + 1);
                                    }
                                  } catch {
                                    alert("Falha na conexão.");
                                  }
                                }}
                              >
                                Cancelar ⓘ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ─── SEÇÃO Notas Fiscais Athos ─── */}
      <div className="container mt-2 mb-3">
        <hr />
        <div className="mt-2">
          <button
            className="btn btn-link p-0 text-decoration-none fw-semibold text-dark"
            onClick={() => setNfatAberta(!nfatAberta)}
            type="button"
          >
            {nfatAberta ? "▼" : "►"} Notas Fiscais Athos
          </button>
          {nfatAberta && (
            <div ref={nfatRef} className="mt-2">
              {/* Campo de busca por número */}
              <div className="d-flex gap-2 mb-3">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  style={{ maxWidth: "240px" }}
                  placeholder="Buscar por número da nota"
                  value={buscaNumeroNf}
                  onChange={(e) => setBuscaNumeroNf(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void buscarNotaPorNumero(); }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => void buscarNotaPorNumero()}
                  disabled={buscandoNf || !buscaNumeroNf.trim()}
                >
                  {buscandoNf ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  ) : "Buscar"}
                </button>
                {resultadoBuscaNf !== null && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => { setResultadoBuscaNf(null); setBuscaNumeroNf(""); }}
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Resultado da busca — acima da lista (D-16) */}
              {resultadoBuscaNf !== null && (
                <div className="alert alert-info mb-3">
                  <strong>Resultado da busca — Nota Nº {buscaNumeroNf}:</strong>
                  {resultadoBuscaNf.length === 0 ? (
                    <span className="ms-1">Nenhuma nota encontrada com este número.</span>
                  ) : (
                    <div className="table-responsive mt-2">
                      <table className="table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Nº da nota</th>
                            <th>Data emissão</th>
                            <th>Valor</th>
                            <th>Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultadoBuscaNf.map((nf) => (
                            <tr key={nf.numero}>
                              <td className="small">{nf.numero}</td>
                              <td className="small">{nf.dataemissao ? formatDate(nf.dataemissao) : "—"}</td>
                              <td className="small fw-semibold">{formatBRL(nf.valor)}</td>
                              <td className="small"><span className="badge bg-primary">{nf.tipo}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Lista geral de até 50 notas — sempre visível (D-15) */}
              {loadingNfat ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Carregando notas fiscais...</span>
                  </div>
                </div>
              ) : nfatCarregada && notasFiscaisAthos.length === 0 ? (
                <p className="text-muted text-center py-3">Nenhuma nota fiscal encontrada no Athos</p>
              ) : notasFiscaisAthos.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-sm table-hover table-bordered">
                    <thead className="table-light">
                      <tr>
                        <th>Nº da nota</th>
                        <th>Data emissão</th>
                        <th>Valor</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notasFiscaisAthos.map((nf) => (
                        <tr key={nf.numero}>
                          <td className="small">{nf.numero}</td>
                          <td className="small">{nf.dataemissao ? formatDate(nf.dataemissao) : "—"}</td>
                          <td className="small fw-semibold">{formatBRL(nf.valor)}</td>
                          <td className="small"><span className="badge bg-primary">{nf.tipo}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações — visível SOMENTE quando há seleção */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "white",
            borderTop: "1px solid #dee2e6",
            padding: "12px 16px",
            zIndex: 10,
          }}
          className="d-flex align-items-center gap-3 flex-wrap"
        >
          <span className="text-muted small">
            <strong>{selectedIds.size}</strong> título(s) selecionado(s) —{" "}
            <strong>{formatBRL(totalSelecionado)}</strong>
          </span>
          <div className="ms-auto d-flex align-items-center gap-2">
            {selecionadosSemNf.length > 0 && (
              <small className="text-danger">
                <i className="bi bi-exclamation-triangle me-1" />
                {selecionadosSemNf.length} título(s) sem NF — boleto bloqueado
              </small>
            )}
            <button
              type="button"
              className="btn btn-warning"
              onClick={abreBoletoModal}
              disabled={selecionadosSemNf.length > 0}
              title={selecionadosSemNf.length > 0 ? "Selecione apenas títulos com NF emitida para gerar boleto" : undefined}
            >
              <i className="bi bi-receipt me-1" />Gerar Boleto
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={abreNfseModal}
            >
              <i className="bi bi-file-earmark-text me-1" />Emitir NFS-e
            </button>
          </div>
        </div>
      )}

      {/* Modal boleto — 4 estados */}
      {boletoModalState !== "idle" && (
        <div
          className="boleto-modal-backdrop"
          onClick={boletoModalState !== "loading" ? fecharBoletoModal : undefined}
        >
          <div
            className="boleto-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Gerar Boleto Bancário"
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER — visível em todos os estados */}
            <div className="boleto-modal-header">
              <h5 className="mb-0 fw-semibold" style={{ fontSize: "var(--fs-lg, 1.35rem)" }}>
                <i className="bi bi-receipt me-2" />Gerar Boleto
              </h5>
              {boletoModalState !== "loading" && (
                <button
                  type="button"
                  className="btn-close"
                  onClick={fecharBoletoModal}
                  aria-label="Fechar"
                />
              )}
            </div>

            {/* ESTADO 1 — CONFIRMAÇÃO */}
            {boletoModalState === "confirm" && (
              <>
                <div className="boleto-modal-body">
                  <small className="text-muted d-block mb-3">
                    {titulosSelecionadosParaBoleto.length} título(s) selecionado(s) —{" "}
                    {formatBRL(totalSelecionado)}
                  </small>

                  {/* Resumo dos títulos */}
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-body p-3">
                      <div className="mb-2 text-muted small">Valor Total</div>
                      <div
                        className="fw-semibold mb-3"
                        style={{ fontSize: "var(--fs-xl, 1.7rem)" }}
                      >
                        {formatBRL(totalSelecionado)}
                      </div>
                      <ul className="list-unstyled mb-0">
                        {titulosSelecionadosParaBoleto.map((t) => (
                          <li
                            key={t.idcontareceber}
                            className="d-flex justify-content-between small border-bottom pb-1 mb-1"
                          >
                            <span className="text-muted">
                              {t.numerotitulo ?? `#${t.idcontareceber}`}
                            </span>
                            <span>{formatBRL(t.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Preview itens EFI */}
                  <div className="mb-3">
                    <div className="text-muted small fw-semibold mb-1">Itens da cobrança (EFI)</div>
                    {loadingPreview ? (
                      <div className="text-center py-2">
                        <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                      </div>
                    ) : boletoPreview?.itens?.length ? (
                      <ul className="list-group list-group-flush border rounded">
                        {boletoPreview.itens.map((item, i) => (
                          <li key={i} className="list-group-item d-flex justify-content-between px-3 py-2 small">
                            <span className="text-muted">
                              {item.nome}
                              {item.quantidade && item.quantidade > 1 ? (
                                <span className="text-secondary ms-1">×{item.quantidade}</span>
                              ) : null}
                            </span>
                            <span className="fw-semibold">{formatBRL(item.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {/* Alert datas divergentes */}
                  {erroDatasModal && (
                    <div className="alert alert-danger d-flex gap-2 mb-3" role="alert">
                      <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                      <span className="small">{erroDatasModal}</span>
                    </div>
                  )}

                  {/* Campo de vencimento */}
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">
                      Data de Vencimento do Boleto
                    </label>
                    <input
                      type="date"
                      className={`form-control${expireAt && expireAt < hoje ? " is-invalid" : ""}`}
                      value={expireAt}
                      min={hoje}
                      readOnly={expireAtReadonly}
                      onChange={(e) => !expireAtReadonly && setExpireAt(e.target.value)}
                    />
                    {expireAtReadonly && (
                      <div className="mt-1">
                        <span className="badge bg-info text-dark small">
                          Preenchido automaticamente
                        </span>
                        <small className="text-muted ms-2">
                          Preenchida automaticamente com a data dos títulos.
                        </small>
                      </div>
                    )}
                    {expireAt && expireAt < hoje && (
                      <div className="invalid-feedback">
                        A data de vencimento não pode ser no passado.
                      </div>
                    )}
                  </div>

                  {/* Campo de observação */}
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">
                      Observação <span className="text-muted fw-normal">(opcional)</span>
                    </label>
                    <textarea
                      className="form-control"
                      rows={2}
                      maxLength={255}
                      placeholder="Ex: Ref. pedido 1234 — aparece no boleto"
                      value={observacaoBoleto}
                      onChange={(e) => setObservacaoBoleto(e.target.value)}
                    />
                    {observacaoBoleto.length > 0 && (
                      <div className="text-end mt-1">
                        <small className="text-muted">{observacaoBoleto.length}/255</small>
                      </div>
                    )}
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={fecharBoletoModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={confirmarGerarBoleto}
                    disabled={expireAtInvalido}
                  >
                    <i className="bi bi-check-lg me-1" />Confirmar Geração
                  </button>
                </div>
              </>
            )}

            {/* ESTADO 2 — LOADING */}
            {boletoModalState === "loading" && (
              <div className="boleto-modal-body d-flex flex-column align-items-center justify-content-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Gerando boleto...</span>
                </div>
                <p className="mt-3 text-muted mb-0">Gerando boleto junto à EFI Bank…</p>
              </div>
            )}

            {/* ESTADO 3 — SUCESSO */}
            {boletoModalState === "success" && boletoResult && (
              <>
                <div className="boleto-modal-body" role="status" aria-live="polite">
                  <div className="text-center mb-4">
                    <i className="bi bi-check-circle-fill fs-1 text-success" />
                    <h5 className="fw-semibold text-success mt-2">Boleto Gerado com Sucesso</h5>
                  </div>
                  <div className="card border-0 bg-light mb-3">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between mb-2">
                        <span className="text-muted small">Valor</span>
                        <span
                          className="fw-semibold"
                          style={{ fontSize: "var(--fs-xl, 1.7rem)" }}
                        >
                          {formatBRL(boletoResult.valor)}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-muted small">Vencimento</span>
                        <span className="small">{formatDate(boletoResult.expireAt)}</span>
                      </div>
                    </div>
                  </div>

                  <label className="form-label small fw-semibold">Linha Digitável</label>
                  <div className="d-flex gap-2 align-items-start mb-3">
                    <input
                      type="text"
                      className="form-control boleto-linha-digitavel"
                      value={boletoResult.barcodeLinhaDigitavel}
                      readOnly
                      aria-label="Linha digitável do boleto"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm flex-shrink-0"
                      style={{ minWidth: "44px", minHeight: "44px" }}
                      onClick={() => {
                        void navigator.clipboard.writeText(boletoResult!.barcodeLinhaDigitavel);
                        setCopiado(true);
                        setTimeout(() => setCopiado(false), 2000);
                      }}
                    >
                      {copiado ? (
                        "Copiado! ✔"
                      ) : (
                        <>
                          <i className="bi bi-clipboard" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={fecharBoletoModal}
                  >
                    Fechar
                  </button>
                  <a
                    href={`/api/cobranca/boleto/${boletoResult.cobrancaId}/pdf`}
                    download={boletoResult.nomeArquivo}
                    className="btn btn-success"
                  >
                    <i className="bi bi-download me-1" />Baixar Boleto PDF
                  </a>
                  <a
                    href={boletoResult.linkBoleto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-secondary btn-sm"
                  >
                    <i className="bi bi-box-arrow-up-right me-1" />Ver no EFI
                  </a>
                  {boletoResult.nomeArquivo && (
                    <small className="text-muted d-block mt-1 text-center">
                      {boletoResult.nomeArquivo}
                    </small>
                  )}
                </div>
              </>
            )}

            {/* ESTADO 4 — ERRO */}
            {boletoModalState === "error" && (
              <>
                <div className="boleto-modal-body" role="alert" aria-live="assertive">
                  <div className="alert alert-danger d-flex gap-2">
                    <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                    <div>
                      <div>
                        {boletoErro ||
                          "Não foi possível gerar o boleto. Verifique a conexão e tente novamente."}
                      </div>
                      {boletoErroDetalhe && (
                        <small className="text-muted d-block mt-1">{boletoErroDetalhe}</small>
                      )}
                    </div>
                  </div>
                </div>
                <div className="boleto-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={fecharBoletoModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={() => {
                      setBoletoErro("");
                      setBoletoErroDetalhe("");
                      setBoletoModalState("confirm");
                    }}
                  >
                    Tentar Novamente
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal NFS-e — 4 estados */}
      {nfseModalState !== "idle" && (
        <div
          className="nfse-modal-backdrop"
          onClick={nfseModalState !== "loading" ? () => fecharNfseModal() : undefined}
        >
          <div
            className="nfse-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Emitir Nota Fiscal de Serviço"
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER — visível em todos os estados */}
            <div className="nfse-modal-header">
              <div>
                <h5 className="mb-0 fw-semibold nfse-modal-title" style={{ fontSize: "var(--fs-lg, 1.35rem)" }}>
                  <i className="bi bi-file-earmark-text me-1" />Emitir NFS-e
                </h5>
                <small className="text-muted">
                  {titulos.filter((t) => selectedIds.has(t.idcontareceber)).length} título(s) selecionado(s)
                </small>
              </div>
              {nfseModalState !== "loading" && (
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => fecharNfseModal()}
                  aria-label="Fechar"
                />
              )}
            </div>

            {/* ESTADO 1 — CONFIRMAÇÃO */}
            {nfseModalState === "confirm" && (() => {
              const titulosSel = titulos.filter((t) => selectedIds.has(t.idcontareceber));
              const nfseValorNum = parseFloat(nfseValor);
              const valorInvalido = isNaN(nfseValorNum) || nfseValorNum <= 0;
              return (
                <>
                  <div className="nfse-modal-body">
                    {/* Bloco de resumo */}
                    <div className="card border-0 shadow-sm mb-3">
                      <div className="card-body p-3">
                        <div className="mb-2 text-muted small">Valor Total dos Títulos</div>
                        <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-xl, 1.7rem)" }}>
                          {formatBRL(titulosSel.reduce((acc, t) => acc + t.valor, 0))}
                        </div>
                        <ul className="list-unstyled mb-0">
                          {titulosSel.map((t) => (
                            <li
                              key={t.idcontareceber}
                              className="d-flex justify-content-between small border-bottom pb-1 mb-1"
                            >
                              <span className="text-muted">{(t.numerotitulo && t.numerotitulo !== "?") ? t.numerotitulo : `#${t.idcontareceber}`}</span>
                              <span>{formatBRL(t.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Campo de valor */}
                    <div className="mb-3">
                      <label className="form-label fw-semibold small" htmlFor="nfse-valor">
                        Valor da NFS-e (R$)
                      </label>
                      <input
                        id="nfse-valor"
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={`form-control-plaintext fw-semibold${valorInvalido && nfseValor !== "" ? " is-invalid" : ""}`}
                        value={nfseValor}
                        aria-required="true"
                        readOnly
                      />
                      {valorInvalido && nfseValor !== "" && (
                        <div className="invalid-feedback">
                          {nfseAvisoFisico && nfseValor === "0"
                            ? "Esta venda contém apenas produtos físicos. NFS-e só pode ser emitida para serviços."
                            : "Informe um valor maior que zero."}
                        </div>
                      )}
                    </div>

                    {/* Tipo de serviço */}
                    <div className="mb-3">
                      <label className="form-label fw-semibold small" htmlFor="nfse-servico">
                        Tipo de Serviço
                      </label>
                      <select
                        id="nfse-servico"
                        className="form-select form-select-sm"
                        value={nfseServico}
                        onChange={(e) => setNfseServico(e.target.value)}
                      >
                        <option value="24.01">24.01 — Confecção de carimbos, banners, placas e sinalização</option>
                        <option value="24.01-02">24.01-02 — Gravação de objetos e joias</option>
                        <option value="13.05">13.05 — Composição gráfica e confecção de matrizes</option>
                        <option value="14.08">14.08 — Encadernação e acabamento</option>
                      </select>
                    </div>

                    {/* Campo de descrição do serviço */}
                    <div className="mb-3">
                      <label className="form-label fw-semibold small" htmlFor="nfse-descricao">
                        Descrição do Serviço (opcional)
                      </label>
                      <textarea
                        id="nfse-descricao"
                        rows={2}
                        className="form-control"
                        placeholder={`Ex: Prestação de serviços gráficos conforme pedido(s)`}
                        value={nfseDescricao}
                        onChange={(e) => setNfseDescricao(e.target.value)}
                      />
                    </div>

                    {/* Dados do tomador */}
                    {dadosCliente && (
                      <div className="mb-3">
                        <div className="text-muted small fw-semibold mb-1">Tomador</div>
                        <div className="text-muted small">{dadosCliente.nome_cliente}</div>
                      </div>
                    )}

                    {/* Aviso produto físico */}
                    {nfseAvisoFisico && (
                      <div className="alert alert-warning d-flex gap-2 mb-3" role="note">
                        <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                        <span className="small">
                          Este título contém produtos físicos que precisam de NF-e de produto.
                          A NFS-e cobrirá apenas os itens de serviço.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="nfse-modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => fecharNfseModal()}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={confirmarEmitirNfse}
                      disabled={valorInvalido}
                    >
                      <i className="bi bi-check-lg me-1" />Confirmar Emissão
                    </button>
                  </div>
                </>
              );
            })()}

            {/* ESTADO 2 — LOADING */}
            {nfseModalState === "loading" && (
              <div className="nfse-modal-body d-flex flex-column align-items-center justify-content-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Emitindo NFS-e...</span>
                </div>
                <p className="mt-3 text-muted mb-0">Emitindo NFS-e...</p>
              </div>
            )}

            {/* ESTADO 3 — SUCESSO */}
            {nfseModalState === "success" && nfseResult && (
              <>
                <div className="nfse-modal-body" role="status" aria-live="polite">
                  <div className="text-center mb-4">
                    <i className="bi bi-check-circle-fill fs-1 text-success" />
                    <h5 className="fw-semibold text-success mt-2">NFS-e Emitida com Sucesso</h5>
                  </div>
                  <div className="card border-0 bg-light mb-3">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between mb-2">
                        <span className="text-muted small">Número da NFS-e</span>
                        <span className="fw-semibold text-success" style={{ fontSize: "var(--fs-lg, 1.35rem)" }}>
                          <i className="bi bi-hash" />{nfseResult.numeroNfse}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between mb-2">
                        <span className="text-muted small">RPS</span>
                        <span className="small text-muted">{nfseResult.numeroRps}</span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-muted small">Valor</span>
                        <span className="fw-semibold" style={{ fontSize: "var(--fs-xl, 1.7rem)" }}>
                          {formatBRL(nfseResult.valor)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {nfseResult.linkNfse && (
                    <div className="text-center">
                      <a
                        href={safeHttpUrl(nfseResult.linkNfse) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-primary btn-sm"
                      >
                        <i className="bi bi-download me-1" />Baixar NFS-e PDF
                      </a>
                    </div>
                  )}
                </div>
                <div className="nfse-modal-footer">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => fecharNfseModal(true)}
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}

            {/* ESTADO 4 — ERRO */}
            {nfseModalState === "error" && (
              <>
                <div className="nfse-modal-body" role="alert" aria-live="assertive">
                  <div className="alert alert-danger d-flex gap-2">
                    <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
                    <div>
                      <div>
                        {nfseErro ||
                          "Não foi possível emitir a NFS-e. Verifique a conexão e tente novamente."}
                      </div>
                      {nfseErroDetalhe && (
                        <small className="text-muted d-block mt-1">{nfseErroDetalhe}</small>
                      )}
                    </div>
                  </div>
                </div>
                <div className="nfse-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => fecharNfseModal()}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={() => {
                      setNfseErro("");
                      setNfseErroDetalhe("");
                      setNfseModalState("confirm");
                    }}
                  >
                    Tentar Novamente
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        body { background: #f7f1e3; font-size: 1.02rem; }
        .orcamento-header {
          background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
          color: #222;
          border-radius: 8px 8px 0 0;
        }
        .orcamento-section { border-radius: 0 0 8px 8px; }
        .logo-img { max-width: 140px; max-height: 88px; background: #fff; border-radius: 8px; padding: 6px; }
        .bg-orange { background-color: #fd7e14 !important; }
        .boleto-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 1rem;
          animation: fadeIn 150ms ease-out;
        }
        .boleto-modal-card {
          width: min(520px, 100%);
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          animation: slideUp 150ms ease-out;
        }
        .boleto-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #ececec;
          background: #f9f7ed;
          border-radius: 10px 10px 0 0;
          flex-shrink: 0;
        }
        .boleto-modal-body {
          padding: 24px;
          flex: 1;
        }
        .boleto-modal-footer {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 16px 24px;
          border-top: 1px solid #ececec;
          flex-shrink: 0;
        }
        .boleto-linha-digitavel {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.85rem;
          background: #f5f5f5;
          border: 1px solid #ececec;
          border-radius: 6px;
          padding: 8px 12px;
          word-break: break-all;
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .nfse-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1051;
          padding: 1rem;
          animation: fadeIn 150ms ease-out;
        }
        .nfse-modal-card {
          width: min(520px, 100%);
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          animation: slideUp 150ms ease-out;
        }
        .nfse-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #ececec;
          background: #f9f7ed;
          border-radius: 10px 10px 0 0;
          flex-shrink: 0;
        }
        .nfse-modal-body {
          padding: 24px;
          flex: 1;
        }
        .nfse-modal-footer {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 16px 24px;
          border-top: 1px solid #ececec;
          flex-shrink: 0;
        }
      `}</style>
    </>
  );
}
