// StatusBoard.jsx — the public /status production board
const PRODUCTION_COLUMNS = [
  { key: "APROVADO",            label: "Aprovado" },
  { key: "EM_PRODUCAO",         label: "Em Produção" },
  { key: "PRONTO_PARA_ENTREGA", label: "Pronto p/ Entrega" },
];

const StatusBoard = ({ quotes }) => {
  return (
    <div className="bc-board">
      {PRODUCTION_COLUMNS.map((col) => {
        const items = quotes.filter((q) => q.statusKey === col.key);
        return (
          <div className="bc-board__col" key={col.key}>
            <header className="bc-board__head">
              <span>{col.label}</span>
              <span className="bc-board__count">{items.length}</span>
            </header>
            <ul className="bc-board__list">
              {items.length === 0 && (
                <li className="bc-board__empty">Nenhum nesta etapa.</li>
              )}
              {items.map((q) => {
                const paid = Boolean(q.orderNumber || q.paymentConfirmedAt);
                return (
                  <li
                    key={q.id}
                    className={`bc-board__card ${paid ? "is-paid" : ""}`}
                  >
                    <div className="bc-board__num">#{q.idorcamento}</div>
                    <div className="bc-board__client">{q.cliente}</div>
                    <div className="bc-board__meta">
                      Vendedor: <b>{q.vendedor || "—"}</b>
                    </div>
                    <div className="bc-board__row">
                      <PaymentBadge paid={paid} />
                      <span className="bc-board__total">{fmtBRL(q.total)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

window.StatusBoard = StatusBoard;
