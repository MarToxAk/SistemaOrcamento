// chrome.jsx — Sidebar, TopBar, StatCards, StatusPill (shared chrome)

const Sidebar = ({ activeView, onNavigate }) => (
  <aside className="bc2-sidebar">
    <div className="bc2-sidebar__brand">
      <img src="assets/logo-primary.png" alt="Bom Custo" />
      <div className="bc2-sidebar__brand-text">
        <div className="bc2-sidebar__brand-name">Bom Custo</div>
        <div className="bc2-sidebar__brand-sub">Papelaria &amp; Gráfica</div>
      </div>
    </div>

    <nav className="bc2-sidebar__nav">
      {SIDEBAR_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bc2-navitem ${activeView === item.id ? 'is-active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <i className={`bi ${item.icon}`} />
          <span className="bc2-navitem__label">{item.label}</span>
          {item.badge !== undefined && (
            <span className="bc2-navitem__badge">{item.badge}</span>
          )}
        </button>
      ))}
    </nav>

    <div className="bc2-sidebar__foot">
      <button type="button" className="bc2-navitem">
        <i className="bi bi-gear" />
        <span className="bc2-navitem__label">Configurações</span>
      </button>
      <div className="bc2-user">
        <div className="bc2-user__avatar">MA</div>
        <div className="bc2-user__meta">
          <div className="bc2-user__name">Marcos Almeida</div>
          <div className="bc2-user__role">Vendedor · Loja 07</div>
        </div>
      </div>
    </div>
  </aside>
);

const TopBar = ({ title, sub, onNew, onSearch }) => (
  <header className="bc2-topbar">
    <div className="bc2-topbar__left">
      <h1 className="bc2-topbar__title">{title}</h1>
      {sub && <p className="bc2-topbar__sub">{sub}</p>}
    </div>
    <div className="bc2-topbar__right">
      <label className="bc2-search">
        <i className="bi bi-search" />
        <input
          type="text"
          placeholder="Buscar por cliente, número ou pedido…"
          onChange={(e) => onSearch?.(e.target.value)}
        />
        <span className="bc2-search__kbd">⌘K</span>
      </label>
      <button type="button" className="bc2-iconbtn" title="Notificações">
        <i className="bi bi-bell" />
        <span className="bc2-iconbtn__dot" />
      </button>
      {onNew && (
        <button type="button" className="bc2-btn bc2-btn--primary" onClick={onNew}>
          <i className="bi bi-plus-lg" /> Novo orçamento
        </button>
      )}
    </div>
  </header>
);

const StatCard = ({ icon, label, value, delta, tone }) => (
  <div className={`bc2-stat bc2-stat--${tone}`}>
    <div className="bc2-stat__icon"><i className={`bi ${icon}`} /></div>
    <div className="bc2-stat__body">
      <div className="bc2-stat__label">{label}</div>
      <div className="bc2-stat__row">
        <div className="bc2-stat__value">{value}</div>
        {delta && <div className="bc2-stat__delta">{delta}</div>}
      </div>
    </div>
  </div>
);

const StatsRow = () => (
  <div className="bc2-stats">
    {STAT_CARDS.map((c) => <StatCard key={c.label} {...c} />)}
  </div>
);

const StatusPill = ({ statusKey, compact }) => {
  const s = STATUS_MAP[statusKey] || { label: statusKey, tone: 'neutral' };
  return (
    <span className={`bc2-pill bc2-pill--${s.tone} ${compact ? 'is-compact' : ''}`}>
      <span className="bc2-pill__dot" />
      {s.label}
    </span>
  );
};

const PaidIndicator = ({ paid, order }) => (
  <div className="bc2-paid">
    <i className={`bi ${paid ? 'bi-check-circle-fill' : 'bi-hourglass-split'}`}
       style={{ color: paid ? 'var(--success)' : 'var(--warn)' }} />
    <div>
      <div className="bc2-paid__top">
        {paid ? 'Pago' : 'Aguardando'}
        {order && <span className="bc2-paid__order"> · #{order}</span>}
      </div>
      <div className="bc2-paid__sub">{paid ? 'no caixa' : 'pagamento'}</div>
    </div>
  </div>
);

Object.assign(window, { Sidebar, TopBar, StatCard, StatsRow, StatusPill, PaidIndicator });
