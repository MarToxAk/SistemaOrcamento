// StatusPill.jsx — canonical status pill + inline pedido/payment badges
const STATUS_MAP = {
  PENDENTE:             { label: "Pendente",          cls: "s-pendente" },
  ENVIADO:              { label: "Enviado",           cls: "s-enviado" },
  APROVADO:             { label: "Aprovado",          cls: "s-aprovado" },
  EM_PRODUCAO:          { label: "Em Produção",       cls: "s-producao" },
  PRONTO_PARA_ENTREGA:  { label: "Pronto p/ Entrega", cls: "s-pronto" },
  ENTREGUE:             { label: "Entregue",          cls: "s-entregue" },
  CANCELADO:            { label: "Cancelado",         cls: "s-cancelado" },
  RECUSADO:             { label: "Recusado",          cls: "s-recusado" },
};

const StatusPill = ({ statusKey }) => {
  const s = STATUS_MAP[statusKey] || { label: statusKey, cls: "s-pendente" };
  return <span className={`bc-pill ${s.cls}`}>{s.label}</span>;
};

const PedidoBadge = ({ orderNumber }) => (
  <span className={`bc-badge ${orderNumber ? "b-success" : "b-secondary"}`}>
    Pedido: {orderNumber ? `#${orderNumber}` : "não gerado"}
  </span>
);

const PaymentBadge = ({ paid }) => (
  <span className={`bc-badge ${paid ? "b-success-subtle" : "b-warning"}`}>
    <i className={`bi ${paid ? "bi-check-circle" : "bi-hourglass-split"}`} />
    {paid ? " Pagamento confirmado" : " Aguardando pagamento"}
  </span>
);

const ApprovalBadge = ({ approved }) =>
  approved ? (
    <span className="bc-badge b-success">
      <i className="bi bi-check-circle" /> Cliente aprovou
    </span>
  ) : (
    <span className="bc-badge b-warning">
      <i className="bi bi-hourglass-split" /> Aguardando aprovação
    </span>
  );

window.StatusPill = StatusPill;
window.PedidoBadge = PedidoBadge;
window.PaymentBadge = PaymentBadge;
window.ApprovalBadge = ApprovalBadge;
window.STATUS_MAP = STATUS_MAP;
