"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatBRL } from "../_shared/formatadores";
import {
  CONFIG_NOTAS,
  CONFIG_NOTAS_CLIENTE,
  ordenarNotas,
  type OrdemNotas,
  type Ordenacao,
} from "../_shared/ordenacao";
import {
  LIMITE_NOTAS_ZIP,
  NOTAS_POR_PAGINA,
  baixarArquivo,
  chaveNota,
  filtrarNotasExibicao,
  formatarDataEmissao,
  montarPayloadZip,
  paginar,
  xmlIndisponivel,
  type NotaNfeLista,
  type NotaNfseLista,
  type NotaSelecionavel,
  type RespostaNotas,
} from "../_shared/notas-util";
import SeletorOrdenacao, { ThOrdenavel } from "./seletor-ordenacao";

interface NotasFiscaisProps {
  idclienteAthos?: number;
  de?: string;
  ate?: string;
  tipo?: "" | "nfse" | "nfe";
  busca?: string;
  pagina?: number;
  onMudarPagina?: (pagina: number) => void;
  /** Ordem das notas (Fase 48). Sem a prop, usa o padrao (emissao mais recente primeiro) e guarda a escolha aqui dentro. */
  ordenacao?: Ordenacao<OrdemNotas>;
  onMudarOrdenacao?: (nova: Ordenacao<OrdemNotas>) => void;
  mostrarCliente?: boolean;
  /** Acoes extras na coluna Acoes de cada NFS-e (ex.: Remover Anexo na aba do cliente). */
  acoesExtrasNfse?: (nota: NotaNfseLista, recarregar: () => void) => ReactNode;
}

interface MensagemStatus {
  tipo: "sucesso" | "erro";
  texto: string;
}

const TEXTO_TRUNCADO = "Mostrando as 500 NFS-e mais recentes. Use o período para ver outras.";

const chaveNfse = (n: NotaNfseLista) => chaveNota({ tipo: "NFS-e", id: n.id });
const chaveNfe = (n: NotaNfeLista) =>
  chaveNota({ tipo: "NF-e", cobrancaBoletoId: n.cobrancaBoletoId, numero: n.numero });

const ehNfse = (n: NotaNfseLista | NotaNfeLista): n is NotaNfseLista => n.tipo === "NFS-e";
const ehNfe = (n: NotaNfseLista | NotaNfeLista): n is NotaNfeLista => n.tipo === "NF-e";

const REQUISICAO_ZIP = (corpo: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
});

/** Notas fiscais (NFS-e e NF-e dos boletos) com PDF, XML, PDF e XML (ZIP) e ZIP em lote das selecionadas. */
export default function NotasFiscais({
  idclienteAthos,
  de,
  ate,
  tipo = "",
  busca = "",
  pagina = 1,
  onMudarPagina,
  ordenacao,
  onMudarOrdenacao,
  mostrarCliente = true,
  acoesExtrasNfse,
}: NotasFiscaisProps) {
  const [dados, setDados] = useState<RespostaNotas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState<MensagemStatus | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  // NFS-e cujo XML respondeu 404 "XML indisponivel" nesta sessao (a lista ainda dizia "salvo" ou "link").
  const [xmlSemArquivo, setXmlSemArquivo] = useState<Set<number>>(new Set());
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  // Sem onMudarPagina (aba do cliente) a pagina e controlada aqui dentro.
  const [paginaInterna, setPaginaInterna] = useState(1);
  // Na tela do cliente (um cliente so) o criterio Nome nao existe (D-03).
  const config = mostrarCliente ? CONFIG_NOTAS : CONFIG_NOTAS_CLIENTE;
  const [ordenacaoInterna, setOrdenacaoInterna] = useState<Ordenacao<OrdemNotas>>(config.padrao);
  const ordenacaoPedida = ordenacao ?? ordenacaoInterna;
  const ordenacaoAtual: Ordenacao<OrdemNotas> = config.permitidas.includes(ordenacaoPedida.ordem)
    ? ordenacaoPedida
    : config.padrao;
  const requisicao = useRef(0);

  const carregar = useCallback(
    async (silencioso = false) => {
      const minha = ++requisicao.current;
      if (!silencioso) setCarregando(true);
      setErro("");
      try {
        const params = new URLSearchParams();
        if (idclienteAthos !== undefined) params.set("idclienteAthos", String(idclienteAthos));
        if (de) params.set("de", de);
        if (ate) params.set("ate", ate);
        const query = params.toString();
        const res = await fetch(`/api/cobranca/notas${query ? `?${query}` : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const corpo = (await res.json()) as RespostaNotas;
        if (minha !== requisicao.current) return;
        setDados({
          nfse: Array.isArray(corpo.nfse) ? corpo.nfse : [],
          nfe: Array.isArray(corpo.nfe) ? corpo.nfe : [],
          truncado: Boolean(corpo.truncado),
          avisoNfe: corpo.avisoNfe ?? null,
        });
        setXmlSemArquivo(new Set());
      } catch {
        if (minha !== requisicao.current) return;
        setErro("Não foi possível carregar as notas fiscais.");
      } finally {
        if (minha === requisicao.current) setCarregando(false);
      }
    },
    [idclienteAthos, de, ate],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Todas as notas carregadas por chave: a selecao sobrevive a troca de pagina e some quando a nota some da lista.
  const porChave = useMemo(() => {
    const mapa = new Map<string, NotaSelecionavel>();
    for (const n of dados?.nfse ?? []) mapa.set(chaveNfse(n), { tipo: "NFS-e", id: n.id });
    for (const n of dados?.nfe ?? []) {
      mapa.set(chaveNfe(n), { tipo: "NF-e", cobrancaBoletoId: n.cobrancaBoletoId, numero: n.numero });
    }
    return mapa;
  }, [dados]);

  const notasSelecionadas = useMemo(() => {
    const lista: NotaSelecionavel[] = [];
    for (const chave of selecionadas) {
      const nota = porChave.get(chave);
      if (nota) lista.push(nota);
    }
    return lista;
  }, [selecionadas, porChave]);

  const { ordem: ordemAtual, dir: dirAtual } = ordenacaoAtual;
  // Ordena a lista inteira filtrada ANTES de paginar: a ordem vale para todas as paginas (D-08).
  const filtradas = useMemo(
    () =>
      ordenarNotas(
        filtrarNotasExibicao<NotaNfseLista | NotaNfeLista>([...(dados?.nfse ?? []), ...(dados?.nfe ?? [])], {
          tipo,
          busca,
        }),
        { ordem: ordemAtual, dir: dirAtual },
      ),
    [dados, tipo, busca, ordemAtual, dirAtual],
  );
  const totalNfse = filtradas.filter(ehNfse).length;
  const totalNfe = filtradas.length - totalNfse;

  const paginaPedida = onMudarPagina ? pagina : paginaInterna;
  const pag = paginar(filtradas, paginaPedida, NOTAS_POR_PAGINA);
  const itensNfse = pag.itens.filter(ehNfse);
  const itensNfe = pag.itens.filter(ehNfe);

  function mudarPagina(nova: number) {
    if (onMudarPagina) onMudarPagina(nova);
    else setPaginaInterna(nova);
  }

  function mudarOrdenacao(nova: Ordenacao<OrdemNotas>) {
    // Mudar a ordem volta para a pagina 1 (quando a pagina vem da URL, quem controla zera junto com a ordem).
    if (!onMudarPagina) setPaginaInterna(1);
    if (onMudarOrdenacao) onMudarOrdenacao(nova);
    else setOrdenacaoInterna(nova);
  }

  function alternar(chave: string) {
    setSelecionadas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function alternarTodas(chaves: string[]) {
    setSelecionadas((prev) => {
      const proximo = new Set(prev);
      const todas = chaves.length > 0 && chaves.every((c) => proximo.has(c));
      for (const c of chaves) {
        if (todas) proximo.delete(c);
        else proximo.add(c);
      }
      return proximo;
    });
  }

  /** Um download por vez; resultado ou erro vai para a linha de status. */
  async function executar(
    chaveAcao: string,
    url: string,
    init: RequestInit | undefined,
    nomePadrao: string,
    rotulo: string,
    aoFalhar?: (statusHttp: number, mensagem: string) => void,
  ) {
    if (baixando !== null) return;
    setBaixando(chaveAcao);
    setStatus(null);
    const resultado = await baixarArquivo(url, init, nomePadrao);
    if (resultado.ok) {
      setStatus({ tipo: "sucesso", texto: `${rotulo} baixado: ${resultado.nome}` });
    } else {
      aoFalhar?.(resultado.status, resultado.mensagem);
      setStatus({ tipo: "erro", texto: resultado.mensagem });
    }
    setBaixando(null);
  }

  function baixarXml(nota: NotaNfseLista) {
    void executar(
      `xml:${nota.id}`,
      `/api/cobranca/nfse/${nota.id}/xml`,
      undefined,
      `NFSe-${nota.numero ?? nota.id}.xml`,
      "XML",
      (statusHttp, mensagem) => {
        if (xmlIndisponivel(statusHttp, mensagem)) {
          setXmlSemArquivo((prev) => new Set(prev).add(nota.id));
        }
      },
    );
  }

  function baixarPdfNfse(nota: NotaNfseLista) {
    void executar(
      `pdf:nfse:${nota.id}`,
      `/api/cobranca/nfse/${nota.id}/pdf`,
      undefined,
      `NFSe-${nota.numero ?? nota.id}.pdf`,
      "PDF",
    );
  }

  function baixarZipNfse(nota: NotaNfseLista) {
    void executar(
      `zip:nfse:${nota.id}`,
      "/api/cobranca/notas/zip",
      REQUISICAO_ZIP({ nfseIds: [nota.id] }),
      `NFSe-${nota.numero ?? nota.id}.zip`,
      "ZIP",
    );
  }

  function baixarPdfNfe(nota: NotaNfeLista) {
    void executar(
      `pdf:nfe:${nota.cobrancaBoletoId}:${nota.numero}`,
      `/api/cobranca/nfe/danfe?cobrancaBoletoId=${nota.cobrancaBoletoId}&numero=${encodeURIComponent(nota.numero)}`,
      undefined,
      `NF-e-${nota.numero}.pdf`,
      "PDF",
    );
  }

  function baixarZipNfe(nota: NotaNfeLista) {
    void executar(
      `zip:nfe:${nota.cobrancaBoletoId}:${nota.numero}`,
      "/api/cobranca/notas/zip",
      REQUISICAO_ZIP({ nfe: [{ cobrancaBoletoId: nota.cobrancaBoletoId, numero: nota.numero }] }),
      `NF-e-${nota.numero}.zip`,
      "ZIP",
    );
  }

  const acimaDoLimite = notasSelecionadas.length > LIMITE_NOTAS_ZIP;

  function baixarSelecionadas() {
    if (notasSelecionadas.length === 0 || acimaDoLimite) return;
    void executar(
      "zip:lote",
      "/api/cobranca/notas/zip",
      REQUISICAO_ZIP(montarPayloadZip(notasSelecionadas)),
      "notas-fiscais.zip",
      "ZIP",
    );
  }

  const ocupado = baixando !== null;
  const mostrarNfse = tipo !== "nfe";
  const mostrarNfe = tipo !== "nfse";

  function seletor(chave: string, rotulo: string) {
    return (
      <input
        type="checkbox"
        className="form-check-input"
        checked={selecionadas.has(chave)}
        onChange={() => alternar(chave)}
        aria-label={rotulo}
      />
    );
  }

  const chavesPaginaNfse = itensNfse.map(chaveNfse);
  const chavesPaginaNfe = itensNfe.map(chaveNfe);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="small text-muted">
          {dados && !carregando && !erro
            ? `${filtradas.length} nota(s) fiscal(is) encontrada(s)`
            : " "}
        </span>
        <div className="d-flex align-items-center gap-2">
          <SeletorOrdenacao
            id={mostrarCliente ? "ordenar-notas" : "ordenar-notas-cliente"}
            config={config}
            ordenacao={ordenacaoAtual}
            onMudar={mudarOrdenacao}
          />
          <button type="button" className="pa-icon-btn" onClick={() => void carregar()} title="Atualizar">
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>

      {status && (
        <div
          role="status"
          className={`alert ${status.tipo === "sucesso" ? "alert-success" : "alert-warning"} small py-2`}
        >
          {status.texto}
        </div>
      )}
      {dados?.truncado && mostrarNfse && <div className="alert alert-info small py-2">{TEXTO_TRUNCADO}</div>}

      {carregando ? (
        <div className="pa-card">
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Carregando...</span>
            </div>
          </div>
        </div>
      ) : erro ? (
        <div className="pa-card">
          <div className="pa-empty pa-empty-erro">
            <span>{erro}</span>
            <button type="button" className="pa-link-btn bg-transparent mt-2" onClick={() => void carregar()}>
              Atualizar
            </button>
          </div>
        </div>
      ) : (
        <>
          {mostrarNfse && (
            <div className="pa-card mb-3">
              <div className="pa-card-header">
                <div>
                  <strong>NFS-e Emitidas</strong>
                  <span className="pa-card-header-count">({totalNfse})</span>
                </div>
              </div>
              <div className="pa-card-body pa-card-body-flush" style={{ overflowX: "auto" }}>
                {itensNfse.length === 0 ? (
                  <div className="pa-empty">
                    <span>{totalNfse === 0 ? "Nenhuma NFS-e encontrada." : "Nenhuma NFS-e nesta página."}</span>
                  </div>
                ) : (
                  <table className="pa-table">
                    <thead>
                      <tr>
                        <th style={{ width: "2.5rem" }}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={chavesPaginaNfse.every((c) => selecionadas.has(c))}
                            onChange={() => alternarTodas(chavesPaginaNfse)}
                            aria-label="Selecionar todas as NFS-e da página"
                          />
                        </th>
                        <th>Número</th>
                        {mostrarCliente && (
                          <ThOrdenavel ordem="nome" rotulo="Cliente" config={config} ordenacao={ordenacaoAtual} onMudar={mudarOrdenacao} />
                        )}
                        <ThOrdenavel ordem="data" rotulo="Emissão" config={config} ordenacao={ordenacaoAtual} onMudar={mudarOrdenacao} />
                        <th>Valor</th>
                        <th>Títulos</th>
                        <th>XML</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensNfse.map((nota) => {
                        const semXml = nota.xml === "indisponivel" || xmlSemArquivo.has(nota.id);
                        const rotuloNota = `NFS-e ${nota.numero ?? nota.id}`;
                        return (
                          <tr key={nota.id}>
                            <td>
                              {seletor(chaveNfse(nota), `Selecionar ${rotuloNota}`)}
                            </td>
                            <td className="small text-nowrap">{nota.numero ?? "—"}</td>
                            {mostrarCliente && (
                              <td className="pa-td-cliente">
                                <span className="pa-id-badge">#{nota.idclienteAthos}</span>
                                <span className="text-truncate" title={nota.nomeCliente}>
                                  {nota.nomeCliente}
                                </span>
                              </td>
                            )}
                            <td className="small text-nowrap">{formatarDataEmissao(nota.dataEmissao)}</td>
                            <td className="small fw-semibold text-nowrap">{formatBRL(nota.valor)}</td>
                            <td className="small">
                              {nota.titulos.length > 0 ? (
                                nota.titulos.map((tid) => (
                                  <span key={tid} className="badge bg-secondary me-1">
                                    {tid}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td>
                              {semXml ? (
                                <span className="pa-pill pa-pill-danger">XML Indisponível</span>
                              ) : nota.xml === "link" ? (
                                <span className="pa-pill pa-pill-secondary">Pelo Link</span>
                              ) : (
                                <span className="pa-pill pa-pill-success">Salvo</span>
                              )}
                            </td>
                            <td>
                              <div className="d-flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  className="pa-link-btn bg-transparent text-nowrap"
                                  disabled={ocupado}
                                  title="Baixar o PDF (DANFSe) da NFS-e"
                                  onClick={() => baixarPdfNfse(nota)}
                                >
                                  <i className="bi bi-file-earmark-pdf me-1" />
                                  {baixando === `pdf:nfse:${nota.id}` ? "Baixando..." : "PDF"}
                                </button>
                                <button
                                  type="button"
                                  className="pa-link-btn bg-transparent text-nowrap"
                                  disabled={ocupado || semXml}
                                  title={semXml ? "XML indisponível" : "Baixar o XML da NFS-e"}
                                  onClick={() => baixarXml(nota)}
                                >
                                  <i className="bi bi-filetype-xml me-1" />
                                  {baixando === `xml:${nota.id}` ? "Baixando..." : "XML"}
                                </button>
                                <button
                                  type="button"
                                  className="pa-link-btn bg-transparent text-nowrap"
                                  disabled={ocupado}
                                  title={
                                    semXml
                                      ? "ZIP com o PDF; o que faltar (XML) vai listado no LEIA-ME"
                                      : "ZIP com o PDF e o XML da NFS-e"
                                  }
                                  onClick={() => baixarZipNfse(nota)}
                                >
                                  <i className="bi bi-file-earmark-zip me-1" />
                                  {baixando === `zip:nfse:${nota.id}` ? "Baixando..." : "PDF e XML"}
                                </button>
                                {acoesExtrasNfse?.(nota, () => void carregar(true))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {mostrarNfe && (
            <div className="pa-card mb-3">
              <div className="pa-card-header">
                <div>
                  <strong>NF-e dos Boletos</strong>
                  <span className="pa-card-header-count">({totalNfe})</span>
                </div>
              </div>
              {dados?.avisoNfe && <div className="alert alert-warning small mx-3 mt-3 mb-0 py-2">{dados.avisoNfe}</div>}
              <div className="pa-card-body pa-card-body-flush" style={{ overflowX: "auto" }}>
                {itensNfe.length === 0 ? (
                  <div className="pa-empty">
                    <span>{totalNfe === 0 ? "Nenhuma NF-e de boleto encontrada." : "Nenhuma NF-e nesta página."}</span>
                  </div>
                ) : (
                  <table className="pa-table">
                    <thead>
                      <tr>
                        <th style={{ width: "2.5rem" }}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={chavesPaginaNfe.every((c) => selecionadas.has(c))}
                            onChange={() => alternarTodas(chavesPaginaNfe)}
                            aria-label="Selecionar todas as NF-e da página"
                          />
                        </th>
                        <th>Número</th>
                        {mostrarCliente && (
                          <ThOrdenavel ordem="nome" rotulo="Cliente" config={config} ordenacao={ordenacaoAtual} onMudar={mudarOrdenacao} />
                        )}
                        <ThOrdenavel ordem="data" rotulo="Emissão" config={config} ordenacao={ordenacaoAtual} onMudar={mudarOrdenacao} />
                        <th>Valor</th>
                        <th>Boleto</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensNfe.map((nota) => (
                        <tr key={chaveNfe(nota)}>
                          <td>
                            {seletor(chaveNfe(nota), `Selecionar NF-e ${nota.numero}`)}
                          </td>
                          <td className="small text-nowrap">{nota.numero}</td>
                          {mostrarCliente && (
                            <td className="pa-td-cliente">
                              <span className="pa-id-badge">#{nota.idclienteAthos}</span>
                              <span className="text-truncate" title={nota.nomeCliente}>
                                {nota.nomeCliente}
                              </span>
                            </td>
                          )}
                          <td className="small text-nowrap">{formatarDataEmissao(nota.dataEmissao)}</td>
                          <td className="small fw-semibold text-nowrap">
                            {nota.valor === null ? "—" : formatBRL(nota.valor)}
                          </td>
                          <td className="small text-nowrap">
                            #{nota.cobrancaBoletoId}
                            <span
                              className={`pa-pill ms-1 ${nota.boletoStatus === "pago" ? "pa-pill-success" : nota.boletoStatus === "pendente" ? "pa-pill-warning" : "pa-pill-secondary"}`}
                            >
                              {nota.boletoStatus}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              <button
                                type="button"
                                className="pa-link-btn bg-transparent text-nowrap"
                                disabled={ocupado}
                                title="Baixar o PDF (DANFE) da NF-e"
                                onClick={() => baixarPdfNfe(nota)}
                              >
                                <i className="bi bi-file-earmark-pdf me-1" />
                                {baixando === `pdf:nfe:${nota.cobrancaBoletoId}:${nota.numero}` ? "Baixando..." : "PDF"}
                              </button>
                              <button
                                type="button"
                                className="pa-link-btn bg-transparent text-nowrap"
                                disabled={ocupado}
                                title="ZIP com o PDF e o XML da NF-e"
                                onClick={() => baixarZipNfe(nota)}
                              >
                                <i className="bi bi-file-earmark-zip me-1" />
                                {baixando === `zip:nfe:${nota.cobrancaBoletoId}:${nota.numero}` ? "Baixando..." : "PDF e XML"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {pag.totalPaginas > 1 && (
            <div className="d-flex justify-content-center align-items-center gap-3 mb-3">
              <button
                type="button"
                className="pa-link-btn bg-transparent"
                disabled={pag.pagina <= 1}
                onClick={() => mudarPagina(pag.pagina - 1)}
              >
                Anterior
              </button>
              <span className="small text-muted">
                Página {pag.pagina} de {pag.totalPaginas}
              </span>
              <button
                type="button"
                className="pa-link-btn bg-transparent"
                disabled={pag.pagina >= pag.totalPaginas}
                onClick={() => mudarPagina(pag.pagina + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}

      {notasSelecionadas.length > 0 && (
        <div className="pa-actionbar d-flex align-items-center gap-3 flex-wrap">
          <span className="small fw-semibold">
            {notasSelecionadas.length} nota(s) selecionada(s)
          </span>
          <button
            type="button"
            className="pa-btn-accent"
            disabled={ocupado || acimaDoLimite}
            onClick={baixarSelecionadas}
          >
            <i className="bi bi-file-earmark-zip me-1" />
            {baixando === "zip:lote" ? "Baixando..." : "Baixar Selecionadas (ZIP)"}
          </button>
          <button
            type="button"
            className="pa-link-btn bg-transparent"
            disabled={ocupado}
            onClick={() => setSelecionadas(new Set())}
          >
            Limpar Seleção
          </button>
          {acimaDoLimite && (
            <span className="small text-danger" role="alert">
              Máximo de {LIMITE_NOTAS_ZIP} notas por arquivo ZIP.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
