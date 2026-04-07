"use client";
import Script from "next/script";
import { useState } from "react";
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

const DADOS_EXEMPLO = {
  numero: 6,
  data: "2025-09-03",
  cliente: "Maria Souza",
  telefone: "(12) 99999-9999",
  email: "maria@email.com",
  vendedor: "João Silva",
  validade: "2 dias",
  prazoEntrega: "2025-09-10",
  condPagamento: "À vista",
  observacoes: "Não é possível fazer o cancelamento do pedido, após a confirmação do recebimento da proposta via email.",
  itens: [
    { descricao: "Cartão de Visita 4x4 300g", quantidade: 2, valor: 120, desconto: 0, total: 240 },
    { descricao: "Panfleto A5 90g", quantidade: 1, valor: 110.5, desconto: 10, total: 100.5 }
  ],
  carimbos: [] as CarimboForm[],
};

export default function PreencherOrcamentoPage() {
  const [form, setForm] = useState({ ...DADOS_EXEMPLO });
  const [numeroBusca, setNumeroBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

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

      setForm({
        numero: data.numero || numeroBusca,
        data: data.data || new Date().toISOString().slice(0, 10),
        cliente: data.cliente || "",
        telefone: data.telefone || funcionario?.celular || funcionario?.telefone || "",
        email: data.email || funcionario?.email || "",
        vendedor: data.vendedor || funcionario?.nome || "",
        validade: data.validade || "",
        prazoEntrega: data.prazoEntrega || "",
        condPagamento: data.condPagamento || "",
        observacoes: data.observacoes || "",
        itens: itens as ItemForm[],
        carimbos,
      });
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

    setSalvando(true);
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

      const numeroInterno = responseBody?.body?.idorcamento_interno;
      setSucesso(
        numeroInterno
          ? `Orcamento gerado com sucesso. Numero interno: ${numeroInterno}.`
          : "Orcamento gerado com sucesso.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar orcamento.";
      setErro(message);
    }
    setSalvando(false);
  }

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
      <div className="container my-5">
        <div className="orcamento-header d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 rounded-top" style={{background: "linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%)", color: "#222"}}>
          <div className="d-flex align-items-center">
            <img src="/media/logo_new.svg" alt="Logo Bom Custo" className="me-3" style={{maxWidth:180, maxHeight:120, background: "#fff", borderRadius:8, padding:4}} />
            <div>
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
          <div className="text-end">
            <h5 className="mb-1">Proposta Nº {form.numero}</h5>
            <div>{new Date(form.data).toLocaleDateString("pt-BR")}</div>
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
            <div className="row mb-4">
              <div className="col-12">
                <div className="p-4 rounded" style={{ background: "#f8f9fa", borderLeft: "4px solid #7dc8aa" }}>
                  <h5 className="mb-3"><i className="bi bi-stamp me-2"></i>Configuração do Carimbo Personalizado</h5>
                  {quantidadeBorracha > 0 && quantidadeBorracha < quantidadeCarcaca && (
                    <div className="alert alert-danger">
                      <strong>Erro de proporção:</strong> {quantidadeCarcaca} carcaça(s) para apenas {quantidadeBorracha} borracha(s).
                    </div>
                  )}
                  {form.carimbos.length === 0 ? (
                    <div className="alert alert-light border mb-0">Sem carimbos neste orçamento.</div>
                  ) : (
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
                  )}
                </div>
              </div>
            </div>
            <div className="row mt-4">
              <div className="col-12 d-flex justify-content-center">
                <button type="submit" className="btn btn-primary" disabled={salvando || loading}>
                  {salvando ? "Gerando..." : "Gerar Orçamento"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <style>{`
        body { background: #f9f7ed; }
        .logo { max-width: 180px; max-height: 120px; }
        .orcamento-header { border-radius: 8px 8px 0 0; }
        .orcamento-section { border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px #0001; }
        .orcamento-header .small { font-size: 0.85rem; opacity: 0.9; }
        @media (max-width: 768px) {
          .orcamento-header { flex-direction: column; text-align: center; }
          .orcamento-header .d-flex { flex-direction: column; text-align: center; }
          .orcamento-header .text-end { text-align: center !important; margin-top: 1rem; }
          .logo { margin-bottom: 1rem; }
        }
        @media print { .no-print { display: none !important; } }
      `}</style>
    </>
  );
}
