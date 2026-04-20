
"use client";
import { useEffect, useState } from "react";

type Quote = {
  id: string;
  internalNumber?: number;
  body?: { idorcamento?: number };
  status: string;
  customer: { nome: string; nomefantasia?: string; };
  createdAt: string;
  updatedAt: string;
  total?: number;
};

function getQuoteIdentifier(quote: Quote): string {
  if (quote.body?.idorcamento && Number.isFinite(quote.body.idorcamento)) {
    return String(Math.trunc(quote.body.idorcamento));
  }
  if (quote.internalNumber && Number.isFinite(quote.internalNumber)) {
    return String(Math.trunc(quote.internalNumber));
  }
  return quote.id;
}

function getParamFromUrl(param: string): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get(param) || "";
}

export default function OrcamentosListPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function fetchQuotes() {
      setLoading(true);
      setErro("");
      try {
        const res = await fetch("/api/quotes");
        if (!res.ok) throw new Error("Erro ao buscar orçamentos");
        const data = await res.json();
        setQuotes(data);
      } catch (e) {
        setErro("Não foi possível carregar os orçamentos.");
      } finally {
        setLoading(false);
      }
    }
    fetchQuotes();
  }, []);

  // Parâmetros do Chatwoot
  const chatid = getParamFromUrl("chatid");
  const accountId = getParamFromUrl("account_id");

  return (
    <div className="orcamento-app">
      <div className="orcamento-header">
        <img src="/media/logo_new.svg" alt="Logo" className="orcamento-logo" />
        <div className="orcamento-title">
          <h1>Lista de Orçamentos</h1>
          <p className="orcamento-subtitle">Consulte, filtre e acompanhe seus orçamentos em tempo real</p>
        </div>
      </div>
      <div className="orcamento-main" style={{ maxWidth: 900, width: "100%" }}>
        <div className="orcamento-card" style={{ width: "100%", maxWidth: "100%" }}>
          {loading ? (
            <div>Carregando orçamentos...</div>
          ) : erro ? (
            <div className="orcamento-alert orcamento-alert-info">{erro}</div>
          ) : (
            <div className="orcamento-lista">
              <table className="orcamento-tabela">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Atualizado</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td>{q.body?.idorcamento ?? q.internalNumber ?? q.id}</td>
                      <td>{q.customer?.nomefantasia || q.customer?.nome}</td>
                      <td><span className={`orcamento-status orcamento-status-${q.status.toLowerCase()}`}>{q.status}</span></td>
                      <td>{new Date(q.updatedAt).toLocaleString("pt-BR")}</td>
                      <td>
                        <a
                          className="btn btn-accent btn-sm"
                          href={`/orcamento/${getQuoteIdentifier(q)}?chatid=${chatid}&account_id=${accountId}`}
                        >Detalhes</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
