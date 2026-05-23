// QuoteTable.jsx — list/table of quotes, with paid-row stripe and actions
const FILTER_OPTIONS = [
  { value: "",                    label: "Todos" },
  { value: "PENDENTE",            label: "Pendente" },
  { value: "ENVIADO",             label: "Enviado" },
  { value: "APROVADO",            label: "Aprovado" },
  { value: "EM_PRODUCAO",         label: "Em Produção" },
  { value: "PRONTO_PARA_ENTREGA", label: "Pronto p/ Entrega" },
  { value: "ENTREGUE",            label: "Entregue" },
  { value: "CANCELADO",           label: "Cancelado" },
];

const QuoteFilters = ({ value, onChange }) => (
  <nav className="bc-filters" aria-label="Filtrar por status">
    {FILTER_OPTIONS.map((o) => (
      <button
        key={o.value || "_all"}
        type="button"
        className={`bc-fbtn ${value === o.value ? "is-on" : ""}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </nav>
);

const fmtBRL = (v) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";

const QuoteTable = ({ quotes, onView, onSendLink, onAdvance, savingId, linkSendingId }) => {
  return (
    <div className="bc-table-wrap">
      <table className="bc-table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Pedido/Pagamento</th>
            <th>Cliente</th>
            <th>Data</th>
            <th>Vendedor</th>
            <th>Total</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {quotes.length === 0 && (
            <tr>
              <td colSpan={8} className="bc-empty">
                Nenhum orçamento encontrado para este contato.
              </td>
            </tr>
          )}
          {quotes.map((q) => {
            const isPaid = Boolean(q.orderNumber || q.paymentConfirmedAt);
            const needsApproval = q.isAssociated && !q.approved;
            return (
              <tr key={q.id} className={isPaid ? "row-paid" : ""}>
                <td>{q.idorcamento}</td>
                <td>
                  <div className="bc-stack-1">
                    <PedidoBadge orderNumber={q.orderNumber} />
                    <PaymentBadge paid={isPaid} />
                  </div>
                </td>
                <td>{q.cliente}</td>
                <td>{fmtDate(q.updatedAt)}</td>
                <td>{q.vendedor || "-"}</td>
                <td>{fmtBRL(q.total)}</td>
                <td>
                  <StatusPill statusKey={q.statusKey} />
                  {q.isAssociated && (
                    <div style={{ marginTop: 4 }}>
                      <ApprovalBadge approved={q.approved} />
                    </div>
                  )}
                </td>
                <td>
                  <div className="bc-actions">
                    <button
                      className="bc-btn bc-btn--outline-primary bc-btn--sm"
                      title="Visualizar orçamento"
                      onClick={() => onView(q)}
                    >
                      <i className="bi bi-eye" />
                    </button>
                    {needsApproval && (
                      <button
                        className="bc-btn bc-btn--outline-warning bc-btn--sm"
                        title="Enviar link de aprovação"
                        onClick={() => onSendLink(q)}
                        disabled={linkSendingId === q.id}
                      >
                        <i className="bi bi-send" />{" "}
                        {linkSendingId === q.id ? "Enviando..." : "Enviar Link"}
                      </button>
                    )}
                    {q.availableNextStatuses?.length > 0 && (
                      <select
                        className="bc-select bc-btn--sm"
                        value=""
                        disabled={savingId === q.id}
                        onChange={(e) => {
                          const v = e.target.value;
                          e.target.value = "";
                          if (v) onAdvance(q, v);
                        }}
                      >
                        <option value="">
                          {savingId === q.id ? "Salvando..." : "Alterar status"}
                        </option>
                        {q.availableNextStatuses.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

window.QuoteFilters = QuoteFilters;
window.QuoteTable = QuoteTable;
window.fmtBRL = fmtBRL;
window.fmtDate = fmtDate;
