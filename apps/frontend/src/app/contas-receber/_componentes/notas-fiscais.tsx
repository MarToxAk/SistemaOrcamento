"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBRL } from "../_shared/formatadores";
import {
  baixarArquivo,
  formatarDataEmissao,
  xmlIndisponivel,
  type NotaNfseLista,
  type RespostaNotas,
} from "../_shared/notas-util";

interface NotasFiscaisProps {
  idclienteAthos?: number;
  de?: string;
  ate?: string;
  mostrarCliente?: boolean;
}

interface MensagemStatus {
  tipo: "sucesso" | "erro";
  texto: string;
}

const TEXTO_TRUNCADO = "Mostrando as 500 NFS-e mais recentes. Use o período para ver outras.";

/** Notas fiscais (NFS-e e, nas proximas tarefas, NF-e dos boletos) com download de XML. */
export default function NotasFiscais({ idclienteAthos, de, ate, mostrarCliente = true }: NotasFiscaisProps) {
  const [dados, setDados] = useState<RespostaNotas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState<MensagemStatus | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  // NFS-e cujo XML respondeu 404 "XML indisponivel" nesta sessao (a lista ainda dizia "salvo" ou "link").
  const [xmlSemArquivo, setXmlSemArquivo] = useState<Set<number>>(new Set());
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

  async function baixarXml(nota: NotaNfseLista) {
    if (baixando !== null) return;
    setBaixando(`xml:${nota.id}`);
    setStatus(null);
    const resultado = await baixarArquivo(
      `/api/cobranca/nfse/${nota.id}/xml`,
      undefined,
      `NFSe-${nota.numero ?? nota.id}.xml`,
    );
    if (resultado.ok) {
      setStatus({ tipo: "sucesso", texto: `XML baixado: ${resultado.nome}` });
    } else {
      if (xmlIndisponivel(resultado.status, resultado.mensagem)) {
        setXmlSemArquivo((prev) => new Set(prev).add(nota.id));
      }
      setStatus({ tipo: "erro", texto: resultado.mensagem });
    }
    setBaixando(null);
  }

  const nfse = dados?.nfse ?? [];

  return (
    <div className="pa-card">
      <div className="pa-card-header">
        <div>
          <strong>NFS-e Emitidas</strong>
          {dados && <span className="pa-card-header-count">({nfse.length})</span>}
        </div>
        <button type="button" className="pa-icon-btn" onClick={() => void carregar()} title="Atualizar">
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {status && (
        <div
          role="status"
          className={`alert ${status.tipo === "sucesso" ? "alert-success" : "alert-warning"} small mx-3 mt-3 mb-0 py-2`}
        >
          {status.texto}
        </div>
      )}
      {dados?.truncado && <div className="alert alert-info small mx-3 mt-3 mb-0 py-2">{TEXTO_TRUNCADO}</div>}

      <div className="pa-card-body pa-card-body-flush" style={{ overflowX: "auto" }}>
        {carregando ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Carregando...</span>
            </div>
          </div>
        ) : erro ? (
          <div className="pa-empty pa-empty-erro">
            <span>{erro}</span>
            <button type="button" className="pa-link-btn bg-transparent mt-2" onClick={() => void carregar()}>
              Atualizar
            </button>
          </div>
        ) : nfse.length === 0 ? (
          <div className="pa-empty">
            <span>Nenhuma NFS-e encontrada.</span>
          </div>
        ) : (
          <table className="pa-table">
            <thead>
              <tr>
                <th>Número</th>
                {mostrarCliente && <th>Cliente</th>}
                <th>Emissão</th>
                <th>Valor</th>
                <th>Títulos</th>
                <th>XML</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {nfse.map((nota) => {
                const semXml = nota.xml === "indisponivel" || xmlSemArquivo.has(nota.id);
                const ocupado = baixando !== null;
                return (
                  <tr key={nota.id}>
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
                      <button
                        type="button"
                        className="pa-link-btn bg-transparent text-nowrap"
                        disabled={ocupado || semXml}
                        title={semXml ? "XML indisponível" : "Baixar o XML da NFS-e"}
                        onClick={() => void baixarXml(nota)}
                      >
                        <i className="bi bi-filetype-xml me-1" />
                        {baixando === `xml:${nota.id}` ? "Baixando..." : "XML"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
