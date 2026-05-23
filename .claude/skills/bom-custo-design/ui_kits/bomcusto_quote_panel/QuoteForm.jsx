// QuoteForm.jsx — "Novo Orçamento" form, faithful to /orcamento/novo
const QuoteForm = ({ onCancel, onSubmit }) => {
  const [form, setForm] = React.useState({
    numero: "",
    cliente: "",
    telefone: "",
    email: "",
    vendedor: "",
    validade: "7 dias",
    prazoEntrega: "",
    condPagamento: "À vista",
    observacoes: "",
  });
  const [submitted, setSubmitted] = React.useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handle = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!form.cliente || !form.telefone || !form.vendedor || !form.prazoEntrega) return;
    onSubmit({
      ...form,
      idorcamento: 12500 + Math.floor(Math.random() * 50),
      updatedAt: new Date().toISOString(),
      total: 480 + Math.floor(Math.random() * 800),
      statusKey: "PENDENTE",
    });
  };

  return (
    <form
      onSubmit={handle}
      className={`bc-form ${submitted ? "was-validated" : ""}`}
      noValidate
    >
      <div className="bc-lookup">
        <label className="bc-label">Número do Orçamento</label>
        <div className="bc-lookup__row">
          <input
            type="text"
            className="bc-input bc-input--lg bc-input--center"
            placeholder="Digite o número"
            value={form.numero}
            onChange={set("numero")}
          />
          <button type="button" className="bc-btn bc-btn--primary bc-btn--lg">
            <i className="bi bi-search" /> Carregar
          </button>
        </div>
      </div>

      <div className="bc-grid bc-grid--3">
        <div className="bc-field bc-span-2">
          <label className="bc-label">
            Nome do Cliente <span className="bc-req">*</span>
          </label>
          <input
            className={`bc-input ${submitted && !form.cliente ? "is-invalid" : ""}`}
            value={form.cliente}
            onChange={set("cliente")}
          />
          {submitted && !form.cliente && (
            <div className="bc-fb">Nome do cliente é obrigatório.</div>
          )}
        </div>
        <div className="bc-field">
          <label className="bc-label">
            Telefone <span className="bc-req">*</span>
          </label>
          <input
            className={`bc-input ${submitted && !form.telefone ? "is-invalid" : ""}`}
            value={form.telefone}
            onChange={set("telefone")}
            placeholder="(12) 99648-4918"
          />
        </div>
      </div>

      <div className="bc-grid bc-grid--2">
        <div className="bc-field">
          <label className="bc-label">E-mail</label>
          <input
            className="bc-input"
            type="email"
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div className="bc-field">
          <label className="bc-label">
            Vendedor <span className="bc-req">*</span>
          </label>
          <input
            className={`bc-input ${submitted && !form.vendedor ? "is-invalid" : ""}`}
            value={form.vendedor}
            onChange={set("vendedor")}
          />
        </div>
      </div>

      <div className="bc-grid bc-grid--3">
        <div className="bc-field">
          <label className="bc-label">
            Validade <span className="bc-req">*</span>
          </label>
          <input
            className="bc-input"
            value={form.validade}
            onChange={set("validade")}
          />
        </div>
        <div className="bc-field">
          <label className="bc-label">
            Prazo de Entrega <span className="bc-req">*</span>
          </label>
          <input
            type="date"
            className={`bc-input ${submitted && !form.prazoEntrega ? "is-invalid" : ""}`}
            value={form.prazoEntrega}
            onChange={set("prazoEntrega")}
          />
        </div>
        <div className="bc-field">
          <label className="bc-label">Condição de Pagamento</label>
          <select
            className="bc-input bc-select"
            value={form.condPagamento}
            onChange={set("condPagamento")}
          >
            <option>À vista</option>
            <option>30 dias</option>
            <option>2x sem juros</option>
            <option>3x sem juros</option>
          </select>
        </div>
      </div>

      <div className="bc-field">
        <label className="bc-label">Observações da Proposta</label>
        <textarea
          className="bc-input"
          rows={3}
          value={form.observacoes}
          onChange={set("observacoes")}
        />
      </div>

      <div className="bc-card-section">
        <h5>Itens do Orçamento</h5>
        <div className="bc-table-wrap">
          <table className="bc-table bc-table--bordered">
            <thead>
              <tr>
                <th>Descrição</th>
                <th style={{ textAlign: "center" }}>Quantidade</th>
                <th style={{ textAlign: "right" }}>Valor Unit.</th>
                <th style={{ textAlign: "right" }}>Desconto</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Carimbo automático Trodat 4913 — texto + cor azul</td>
                <td style={{ textAlign: "center" }}>2</td>
                <td style={{ textAlign: "right" }}>R$ 95,00</td>
                <td style={{ textAlign: "right" }}>R$ 0,00</td>
                <td style={{ textAlign: "right" }}>R$ 190,00</td>
              </tr>
              <tr>
                <td>Gravação a laser em caneca cerâmica</td>
                <td style={{ textAlign: "center" }}>10</td>
                <td style={{ textAlign: "right" }}>R$ 22,00</td>
                <td style={{ textAlign: "right" }}>R$ 0,00</td>
                <td style={{ textAlign: "right" }}>R$ 220,00</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" style={{ textAlign: "right", fontWeight: 700 }}>
                  Total
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  R$ 410,00
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bc-form-actions">
        <button type="button" className="bc-btn bc-btn--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="bc-btn bc-btn--primary">
          <i className="bi bi-check-circle" /> Gerar Orçamento
        </button>
      </div>
    </form>
  );
};

window.QuoteForm = QuoteForm;
