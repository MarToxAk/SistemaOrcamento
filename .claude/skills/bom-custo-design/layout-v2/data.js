// data.js — mock quotes + sidebar nav for the layout v2 prototype
window.SIDEBAR_ITEMS = [
  { id: 'overview', icon: 'bi-grid-1x2',     label: 'Visão Geral'  },
  { id: 'quotes',   icon: 'bi-file-earmark-text', label: 'Orçamentos', active: true, badge: 12 },
  { id: 'board',    icon: 'bi-kanban',       label: 'Produção'      },
  { id: 'clients',  icon: 'bi-people',       label: 'Clientes'      },
  { id: 'reports',  icon: 'bi-bar-chart',    label: 'Relatórios'    },
  { id: 'invoices', icon: 'bi-receipt',      label: 'NFS-e'         },
];

window.STAT_CARDS = [
  { icon: 'bi-hourglass-split', tone: 'warn',    label: 'Pendentes hoje',    value: '12',          delta: '+3'  },
  { icon: 'bi-check-circle',    tone: 'success', label: 'Aprovados / semana', value: '8',           delta: '+2'  },
  { icon: 'bi-tools',           tone: 'info',    label: 'Em produção',        value: '5',           delta: '—'   },
  { icon: 'bi-cash-stack',      tone: 'accent',  label: 'Faturado em maio',   value: 'R$ 18.420',   delta: '+12%'},
];

window.QUOTES = [
  { id: 12450, cliente: 'Pousada Mar Azul',       vendedor: 'Marcos',   total: 1240.00, status: 'APROVADO',           order: '4821', paid: true,  updated: '2026-05-19T10:11', items: 3 },
  { id: 12451, cliente: 'Padaria Ilhabela',       vendedor: 'Aline',    total:  380.00, status: 'EM_PRODUCAO',        order: '4823', paid: true,  updated: '2026-05-19T09:02', items: 1 },
  { id: 12452, cliente: 'Construtora Perequê',    vendedor: 'Marcos',   total: 2150.90, status: 'PENDENTE',           order: null,   paid: false, updated: '2026-05-20T11:42', items: 5 },
  { id: 12453, cliente: 'Escola Sítio Bela',      vendedor: 'Aline',    total:  720.00, status: 'ENVIADO',            order: null,   paid: false, updated: '2026-05-20T13:14', items: 2 },
  { id: 12454, cliente: 'Mercado Vista Mar',      vendedor: 'Marcos',   total: 1535.00, status: 'PRONTO_PARA_ENTREGA',order: '4825', paid: true,  updated: '2026-05-20T15:00', items: 4 },
  { id: 12455, cliente: 'Restaurante Cheiro Verde',vendedor: 'Aline',   total:   95.00, status: 'PENDENTE',           order: null,   paid: false, updated: '2026-05-20T16:21', items: 1 },
  { id: 12456, cliente: 'Náutica Ilhabela',       vendedor: 'Marcos',   total: 3210.00, status: 'EM_PRODUCAO',        order: '4827', paid: true,  updated: '2026-05-19T17:55', items: 7 },
  { id: 12457, cliente: 'Café da Vó Lúcia',       vendedor: 'Aline',    total:  640.00, status: 'APROVADO',           order: null,   paid: false, updated: '2026-05-20T08:30', items: 2 },
  { id: 12458, cliente: 'Pousada do Sol',          vendedor: 'Marcos',   total: 1820.00, status: 'ENTREGUE',           order: '4820', paid: true,  updated: '2026-05-15T18:10', items: 6 },
  { id: 12459, cliente: 'Estúdio Maré',            vendedor: 'Aline',    total:  280.00, status: 'CANCELADO',          order: null,   paid: false, updated: '2026-05-17T11:05', items: 1 },
  { id: 12460, cliente: 'Surf Shop Bonete',        vendedor: 'Marcos',   total:  910.00, status: 'PRONTO_PARA_ENTREGA',order: '4828', paid: true,  updated: '2026-05-20T17:42', items: 3 },
  { id: 12461, cliente: 'Igreja Matriz Perequê',   vendedor: 'Aline',    total: 1450.00, status: 'APROVADO',           order: '4829', paid: true,  updated: '2026-05-20T18:01', items: 4 },
];

window.QUOTE_ITEMS_SAMPLE = [
  { desc: 'Carimbo automático Trodat 4913 — texto + cor azul',  qty: 2,   unit: 95.00,  total: 190.00 },
  { desc: 'Gravação a laser em caneca cerâmica',                qty: 10,  unit: 22.00,  total: 220.00 },
  { desc: 'Cartão de visita — 4×0 cores, papel couché 250g',   qty: 500, unit:  1.66,  total: 830.00 },
  { desc: 'Adesivo vinil recortado — logo 8×8cm',               qty: 100, unit:  1.00,  total: 100.00 },
];

window.STATUS_MAP = {
  PENDENTE:             { label: 'Pendente',           tone: 'warn'    },
  ENVIADO:              { label: 'Enviado',            tone: 'info'    },
  APROVADO:             { label: 'Aprovado',           tone: 'success' },
  EM_PRODUCAO:          { label: 'Em Produção',        tone: 'info'    },
  PRONTO_PARA_ENTREGA:  { label: 'Pronto p/ Entrega',  tone: 'amber'   },
  ENTREGUE:             { label: 'Entregue',           tone: 'neutral' },
  CANCELADO:            { label: 'Cancelado',          tone: 'danger'  },
};

window.fmtBRL = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
window.fmtDate = (iso) => new Date(iso).toLocaleDateString('pt-BR');
window.fmtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
