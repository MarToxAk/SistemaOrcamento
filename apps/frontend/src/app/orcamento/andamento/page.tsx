"use client";
import { useEffect, useState } from "react";

type Quote = {
  id: string;
  status: string;
  customer?: { nome?: string; nomefantasia?: string };
  updatedAt: string;
};

export default function AndamentoPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [skip, setSkip] = useState(0);
  const [take] = useState(10);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    loadQuotes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadQuotes(reset = false) {
    try {
      if (reset) {
        setLoading(true);
        setSkip(0);
      } else {
        setLoadingMore(true);
      }

      const currentSkip = reset ? 0 : skip;
      const res = await fetch(`/api/quotes?status=APROVADO&take=${take}&skip=${currentSkip}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erro ao buscar orçamentos");
      }
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];

      if (reset) {
        setQuotes(rows);
        setSkip(rows.length);
      } else {
        setQuotes((prev) => prev.concat(rows));
        setSkip((prev) => prev + rows.length);
      }
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar orçamentos");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function gerarPdf(id: string) {
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(id)}/pdf`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Falha ao gerar PDF");
      }
      const data = await res.json();
      if (data?.publicUrl) {
        window.open(data.publicUrl, "_blank");
      } else {
        alert("PDF gerado. Verifique os documentos do orçamento.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h2>Orçamentos Aprovados</h2>
      {erro && <div style={{ color: "red" }}>{erro}</div>}
      <div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Cliente</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Atualizado</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td style={{ padding: 8, borderBottom: "1px solid #f1f1f1" }}>{q.id}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f1f1f1" }}>{q.customer?.nomefantasia || q.customer?.nome}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f1f1f1" }}>{q.status}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f1f1f1" }}>{new Date(q.updatedAt).toLocaleString("pt-BR")}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f1f1f1" }}>
                  <button onClick={() => gerarPdf(q.id)} style={{ marginRight: 8 }}>Gerar PDF</button>
                  <a href={`/orcamento/${q.id}`} style={{ marginLeft: 8 }}>Detalhes</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, textAlign: "center" }}>
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <button onClick={() => loadQuotes(false)} disabled={loadingMore}>
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </div>
    </div>
  );
}
