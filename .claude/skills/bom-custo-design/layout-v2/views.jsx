// views.jsx — ListView, KanbanView, FormView, DetailView

const FilterBar = ({ value, onChange, counts }) => {
  const opts = [
    { v: '',                     label: 'Todos'             },
    { v: 'PENDENTE',             label: 'Pendentes'         },
    { v: 'ENVIADO',              label: 'Enviados'          },
    { v: 'APROVADO',             label: 'Aprovados'         },
    { v: 'EM_PRODUCAO',          label: 'Em produção'       },
    { v: 'PRONTO_PARA_ENTREGA',  label: 'Pronto p/ entrega' },
    { v: 'ENTREGUE',             label: 'Entregues'         },
  ];
  return (
    <nav className="bc2-filters">
      {opts.map((o) => (
        <button
          key={o.v || '_all'}
          className={`bc2-fbtn ${value === o.v ? 'is-on' : ''}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
          {counts[o.v] !== undefined && <span className="bc2-fbtn__count">{counts[o.v]}</span>}
        </button>
      ))}
    </nav>
  );
};

const ListView = ({ onOpenDetail, onNew }) => {
  const [filter, setFilter] = React.useState('');
  const [query, setQuery] = React.useState('');

  const counts = React.useMemo(() => {
    const c = { '': QUOTES.length };
    QUOTES.forEach((q) => { c[q.status] = (c[q.status] || 0) + 1; });
    return c;
  }, []);

  const rows = QUOTES.filter((q) =>
    (!filter || q.status === filter) &&
    (!query || q.cliente.toLowerCase().includes(query.toLowerCase()) || String(q.id).includes(query))
  );

  return (
    <>
      <TopBar
        title="Orçamentos"
        sub="Consulte, filtre e acompanhe seus orçamentos em tempo real"
        onNew={onNew}
        onSearch={setQuery}
      />
      <StatsRow />
      <section className="bc2-card">
        <header className="bc2-card__head">
          <FilterBar value={filter} onChange={setFilter} counts={counts} />
          <div className="bc2-card__head-right">
            <button className="bc2-iconbtn" title="Exportar"><i className="bi bi-download" /></button>
            <button className="bc2-iconbtn" title="Imprimir"><i className="bi bi-printer" /></button>
            <div className="bc2-segment">
              <button className="is-on"><i className="bi bi-list-ul" /></button>
              <button><i className="bi bi-grid" /></button>
            </div>
          </div>
        </header>

        <div className="bc2-tablewrap">
          <table className="bc2-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Vendedor</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th>Atualizado</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className={q.paid ? 'is-paid' : ''} onClick={() => onOpenDetail(q.id)}>
                  <td className="num">#{q.id}</td>
                  <td>
                    <div className="bc2-cell-strong">{q.cliente}</div>
                  </td>
                  <td className="num">{q.items}</td>
                  <td>{q.vendedor}</td>
                  <td className="num bc2-cell-strong">{fmtBRL(q.total)}</td>
                  <td><StatusPill statusKey={q.status} compact /></td>
                  <td><PaidIndicator paid={q.paid} order={q.order} /></td>
                  <td className="bc2-cell-soft">
                    {fmtDate(q.updated)}
                    <span className="bc2-cell-faint"> · {fmtTime(q.updated)}</span>
                  </td>
                  <td>
                    <button className="bc2-iconbtn bc2-iconbtn--sm" title="Abrir">
                      <i className="bi bi-chevron-right" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="bc2-empty">Nenhum orçamento corresponde aos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="bc2-card__foot">
          <div className="bc2-pager">
            <span>1–{rows.length} de {QUOTES.length}</span>
            <button className="bc2-iconbtn bc2-iconbtn--sm"><i className="bi bi-chevron-left" /></button>
            <button className="bc2-iconbtn bc2-iconbtn--sm"><i className="bi bi-chevron-right" /></button>
          </div>
        </footer>
      </section>
    </>
  );
};

const KanbanView = ({ onOpenDetail }) => {
  const cols = [
    { key: 'APROVADO',            label: 'Aprovado',           tone: 'success' },
    { key: 'EM_PRODUCAO',         label: 'Em produção',         tone: 'info'    },
    { key: 'PRONTO_PARA_ENTREGA', label: 'Pronto p/ entrega',   tone: 'amber'   },
  ];
  return (
    <>
      <TopBar title="Painel de produção" sub="Visão em tempo real para a oficina e o caixa" />
      <div className="bc2-kanban">
        {cols.map((col) => {
          const items = QUOTES.filter((q) => q.status === col.key);
          return (
            <div key={col.key} className="bc2-kcol">
              <header className={`bc2-kcol__head bc2-kcol__head--${col.tone}`}>
                <span className="bc2-kcol__title">{col.label}</span>
                <span className="bc2-kcol__count">{items.length}</span>
              </header>
              <ul className="bc2-kcol__list">
                {items.length === 0 && <li className="bc2-kcol__empty">Vazio.</li>}
                {items.map((q) => (
                  <li key={q.id} className={`bc2-kcard ${q.paid ? 'is-paid' : ''}`} onClick={() => onOpenDetail(q.id)}>
                    <div className="bc2-kcard__top">
                      <span className="bc2-kcard__num">#{q.id}</span>
                      <PaidIndicator paid={q.paid} order={q.order} />
                    </div>
                    <div className="bc2-kcard__client">{q.cliente}</div>
                    <div className="bc2-kcard__meta">
                      <span><i className="bi bi-person" /> {q.vendedor}</span>
                      <span><i className="bi bi-box-seam" /> {q.items} itens</span>
                    </div>
                    <div className="bc2-kcard__foot">
                      <span className="bc2-kcard__total">{fmtBRL(q.total)}</span>
                      <span className="bc2-kcard__date">{fmtDate(q.updated)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
};

const FormView = ({ onCancel, onSubmit }) => {
  const [f, setF] = React.useState({
    cliente: '', telefone: '', email: '',
    vendedor: 'Marcos Almeida', validade: '7 dias',
    prazoEntrega: '', condPagamento: 'À vista', observacoes: '',
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <TopBar title="Novo orçamento" sub="Preencha os dados do cliente e os itens da proposta" />
      <form className="bc2-form" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
        <div className="bc2-form__grid">

          <section className="bc2-card">
            <header className="bc2-card__head">
              <h3 className="bc2-card__title"><span className="bc2-num">01</span> Cliente</h3>
              <button type="button" className="bc2-link"><i className="bi bi-search" /> Buscar no Athos</button>
            </header>
            <div className="bc2-formgrid bc2-formgrid--3">
              <label className="bc2-field bc2-field--span-2">
                <span className="bc2-label">Nome do cliente <em>*</em></span>
                <input className="bc2-input" value={f.cliente} onChange={set('cliente')} placeholder="Ex.: Pousada Mar Azul" />
              </label>
              <label className="bc2-field">
                <span className="bc2-label">Telefone <em>*</em></span>
                <input className="bc2-input" value={f.telefone} onChange={set('telefone')} placeholder="(12) 99648-4918" />
              </label>
              <label className="bc2-field bc2-field--span-2">
                <span className="bc2-label">E-mail</span>
                <input className="bc2-input" type="email" value={f.email} onChange={set('email')} placeholder="cliente@email.com" />
              </label>
              <label className="bc2-field">
                <span className="bc2-label">Vendedor <em>*</em></span>
                <input className="bc2-input" value={f.vendedor} onChange={set('vendedor')} />
              </label>
            </div>
          </section>

          <section className="bc2-card">
            <header className="bc2-card__head">
              <h3 className="bc2-card__title"><span className="bc2-num">02</span> Condições</h3>
            </header>
            <div className="bc2-formgrid bc2-formgrid--3">
              <label className="bc2-field">
                <span className="bc2-label">Validade da proposta</span>
                <input className="bc2-input" value={f.validade} onChange={set('validade')} />
              </label>
              <label className="bc2-field">
                <span className="bc2-label">Prazo de entrega <em>*</em></span>
                <input className="bc2-input" type="date" value={f.prazoEntrega} onChange={set('prazoEntrega')} />
              </label>
              <label className="bc2-field">
                <span className="bc2-label">Condição de pagamento</span>
                <select className="bc2-input" value={f.condPagamento} onChange={set('condPagamento')}>
                  <option>À vista</option>
                  <option>30 dias</option>
                  <option>2x sem juros</option>
                  <option>3x sem juros</option>
                </select>
              </label>
              <label className="bc2-field bc2-field--span-3">
                <span className="bc2-label">Observações da proposta</span>
                <textarea className="bc2-input" rows={3} value={f.observacoes} onChange={set('observacoes')} placeholder="Texto livre que aparece no PDF…" />
              </label>
            </div>
          </section>

          <section className="bc2-card">
            <header className="bc2-card__head">
              <h3 className="bc2-card__title"><span className="bc2-num">03</span> Itens</h3>
              <button type="button" className="bc2-btn bc2-btn--ghost bc2-btn--sm"><i className="bi bi-plus-lg" /> Adicionar item</button>
            </header>
            <div className="bc2-tablewrap">
              <table className="bc2-table bc2-table--inset">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th className="num">Qtd</th>
                    <th className="num">Unit.</th>
                    <th className="num">Desconto</th>
                    <th className="num">Total</th>
                    <th aria-label="" />
                  </tr>
                </thead>
                <tbody>
                  {QUOTE_ITEMS_SAMPLE.map((it, i) => (
                    <tr key={i}>
                      <td>{it.desc}</td>
                      <td className="num">{it.qty}</td>
                      <td className="num">{fmtBRL(it.unit)}</td>
                      <td className="num">{fmtBRL(0)}</td>
                      <td className="num bc2-cell-strong">{fmtBRL(it.total)}</td>
                      <td><button type="button" className="bc2-iconbtn bc2-iconbtn--sm"><i className="bi bi-trash" /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="bc2-tfoot-label">Total</td>
                    <td className="num bc2-tfoot-value">{fmtBRL(QUOTE_ITEMS_SAMPLE.reduce((a,b)=>a+b.total,0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <aside className="bc2-form__aside">
          <section className="bc2-card bc2-card--sticky">
            <header className="bc2-card__head"><h3 className="bc2-card__title">Resumo</h3></header>
            <dl className="bc2-summary">
              <div><dt>Subtotal</dt><dd>{fmtBRL(QUOTE_ITEMS_SAMPLE.reduce((a,b)=>a+b.total,0))}</dd></div>
              <div><dt>Desconto</dt><dd>—</dd></div>
              <div><dt>Acréscimos</dt><dd>—</dd></div>
              <div className="bc2-summary__total"><dt>Total</dt><dd>{fmtBRL(QUOTE_ITEMS_SAMPLE.reduce((a,b)=>a+b.total,0))}</dd></div>
            </dl>
            <div className="bc2-form__actions">
              <button type="button" className="bc2-btn bc2-btn--ghost" onClick={onCancel}>Cancelar</button>
              <button type="submit" className="bc2-btn bc2-btn--primary"><i className="bi bi-check2" /> Gerar orçamento</button>
            </div>
            <p className="bc2-form__hint">
              <i className="bi bi-info-circle" /> Ao gerar, um PDF é montado e um link de aprovação é preparado para o cliente.
            </p>
          </section>
        </aside>
      </form>
    </>
  );
};

const DetailView = ({ quoteId, onBack }) => {
  const q = QUOTES.find((x) => x.id === quoteId) || QUOTES[0];
  return (
    <>
      <TopBar
        title={<>Orçamento <span className="bc2-num bc2-num--big">#{q.id}</span></>}
        sub={`${q.cliente} · atualizado em ${fmtDate(q.updated)}`}
      />
      <div className="bc2-detail">
        <main className="bc2-detail__main">
          <div className="bc2-detail__chips">
            <button className="bc2-btn bc2-btn--ghost bc2-btn--sm" onClick={onBack}>
              <i className="bi bi-arrow-left" /> Lista
            </button>
            <StatusPill statusKey={q.status} />
            <PaidIndicator paid={q.paid} order={q.order} />
          </div>

          <section className="bc2-card">
            <header className="bc2-card__head">
              <h3 className="bc2-card__title">Itens</h3>
              <div className="bc2-card__head-right">
                <span className="bc2-cell-soft">{q.items} itens</span>
              </div>
            </header>
            <div className="bc2-tablewrap">
              <table className="bc2-table bc2-table--inset">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th className="num">Qtd</th>
                    <th className="num">Unit.</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {QUOTE_ITEMS_SAMPLE.slice(0, Math.min(q.items, QUOTE_ITEMS_SAMPLE.length)).map((it, i) => (
                    <tr key={i}>
                      <td>{it.desc}</td>
                      <td className="num">{it.qty}</td>
                      <td className="num">{fmtBRL(it.unit)}</td>
                      <td className="num bc2-cell-strong">{fmtBRL(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3} className="bc2-tfoot-label">Total da proposta</td><td className="num bc2-tfoot-value">{fmtBRL(q.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="bc2-card">
            <header className="bc2-card__head"><h3 className="bc2-card__title">Histórico</h3></header>
            <ol className="bc2-timeline">
              <li><b>Hoje · {fmtTime(q.updated)}</b><span>Status alterado para <em>{STATUS_MAP[q.status]?.label}</em></span></li>
              <li><b>Ontem · 14:02</b><span>PDF gerado e enviado via Chatwoot</span></li>
              <li><b>Ontem · 13:55</b><span>Orçamento criado por {q.vendedor}</span></li>
            </ol>
          </section>
        </main>

        <aside className="bc2-detail__aside">
          <section className="bc2-card">
            <header className="bc2-card__head"><h3 className="bc2-card__title">Cliente</h3></header>
            <dl className="bc2-kv">
              <div><dt>Nome</dt><dd>{q.cliente}</dd></div>
              <div><dt>Vendedor</dt><dd>{q.vendedor}</dd></div>
              <div><dt>Condição</dt><dd>À vista</dd></div>
              <div><dt>Validade</dt><dd>7 dias</dd></div>
              <div><dt>Entrega</dt><dd>25/05/2026</dd></div>
            </dl>
          </section>

          <section className="bc2-card">
            <header className="bc2-card__head"><h3 className="bc2-card__title">Ações</h3></header>
            <div className="bc2-actions">
              <button className="bc2-btn bc2-btn--primary"><i className="bi bi-send" /> Enviar via Chatwoot</button>
              <button className="bc2-btn bc2-btn--ghost"><i className="bi bi-file-earmark-pdf" /> Gerar PDF</button>
              <button className="bc2-btn bc2-btn--ghost"><i className="bi bi-receipt" /> Emitir NFS-e</button>
              <button className="bc2-btn bc2-btn--ghost"><i className="bi bi-arrow-right-circle" /> Avançar status</button>
            </div>
          </section>

          <section className="bc2-card">
            <header className="bc2-card__head"><h3 className="bc2-card__title">Aprovação</h3></header>
            <div className="bc2-approval">
              <div className="bc2-approval__row">
                <i className="bi bi-check-circle-fill" style={{ color: 'var(--success)' }} />
                <div>
                  <b>Cliente aprovou</b>
                  <div className="bc2-cell-soft">há 2 dias · via link</div>
                </div>
              </div>
              <a className="bc2-link" href="#">Copiar link de aprovação <i className="bi bi-box-arrow-up-right" /></a>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
};

Object.assign(window, { ListView, KanbanView, FormView, DetailView });
