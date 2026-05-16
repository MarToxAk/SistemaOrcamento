#!/usr/bin/env python3
"""
Script para adicionar filtro "Somente carimbos" à página /status
Modifica: apps/frontend/src/app/status/page.tsx
"""

import re

def add_filter_to_status_page():
    file_path = "apps/frontend/src/app/status/page.tsx"
    
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 1. Remover statusSavingId e adicionar os novos estados
    old_states = '''  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [efiStatus, setEfiStatus] = useState<{ enabled: boolean; message?: string } | null>(null);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);'''
    
    new_states = '''  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [efiStatus, setEfiStatus] = useState<{ enabled: boolean; message?: string } | null>(null);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("TODOS");
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState<string>("TODOS");
  const [onlyWithBadge, setOnlyWithBadge] = useState<boolean>(false);'''
    
    content = content.replace(old_states, new_states)
    
    # 2. Adicionar as constantes BADGE_TYPES e BADGE_LABELS após STATUS_FILTER_LABELS
    status_labels_end = content.find('const STATUS_FILTER_LABELS: Record<string, string> = {')
    if status_labels_end != -1:
        # Find the closing brace da constante
        labels_brace = content.find('};', status_labels_end)
        if labels_brace != -1:
            insert_pos = labels_brace + 2
            badge_constants = '''\nconst BADGE_TYPES = ["PAGO_CAIXA", "PIX_CONFIRMADO", "AGUARDANDO"];
const BADGE_LABELS: Record<string, string> = {
  PAGO_CAIXA: "Pago no Caixa",
  PIX_CONFIRMADO: "PIX Confirmado",
  AGUARDANDO: "Aguardando pagamento",
    const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
  #!/usr/bin/env python3
  import re

  file_path = "apps/frontend/src/app/status/page.tsx"
  with open(file_path, "r", encoding="utf-8") as f:
      content = f.read()

  # 1. Remove statusSavingId, add filter states
  old_states = '''  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
    const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);'''
  new_states = '''  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("TODOS");
    const [selectedBadgeFilter, setSelectedBadgeFilter] = useState<string>("TODOS");
    const [onlyWithBadge, setOnlyWithBadge] = useState<boolean>(false);'''
  content = content.replace(old_states, new_states)

  # 2. Add BADGE constants
  old_ls = '''};
  const LS_LAST_PAYMENT'''
  new_ls = '''};
  const BADGE_TYPES = ["PAGO_CAIXA", "PIX_CONFIRMADO", "AGUARDANDO"];
  const BADGE_LABELS: Record<string, string> = {
    PAGO_CAIXA: "Pago no Caixa",
    PIX_CONFIRMADO: "PIX Confirmado",
    AGUARDANDO: "Aguardando pagamento",
  };
  const LS_LAST_PAYMENT'''
  content = content.replace(old_ls, new_ls)

  # 3. Add helper functions after fetchRef
  old_fetch = '  const fetchRef = useRef<(() => Promise<void>) | null>(null);'
  new_fetch = '''  const fetchRef = useRef<(() => Promise<void>) | null>(null);

    function getBadgeType(quote: QuoteRow): string {
      const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
      const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
      if (paidInCashier) return "PAGO_CAIXA";
      if (quote.paymentConfirmedAt) return "PIX_CONFIRMADO";
      return "AGUARDANDO";
    }

    function hasBadge(quote: QuoteRow): boolean {
      const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);
      const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
      return paidInCashier || Boolean(quote.paymentConfirmedAt);
    }'''
  content = content.replace(old_fetch, new_fetch)

  # 4. Remove handleStatusChange function
  pattern = r'\n  async function handleStatusChange\(quote: QuoteRow, nextStatus: string\) \{[\s\S]*?\n  \}\n'
  content = re.sub(pattern, '\n', content)

  # 5. Update visibleQuotes
  old_visible = '''const visibleQuotes =
      selectedStatusFilter === "TODOS"
        ? quotes
        : quotes.filter((quote) => quote.statusKey === selectedStatusFilter);'''
  new_visible = '''const visibleQuotes = quotes.filter((quote) => {
      const statusMatch = selectedStatusFilter === "TODOS" || quote.statusKey === selectedStatusFilter;
      const badgeMatch = selectedBadgeFilter === "TODOS" || getBadgeType(quote) === selectedBadgeFilter;
      const badgeExistsMatch = !onlyWithBadge || hasBadge(quote);
      return statusMatch && badgeMatch && badgeExistsMatch;
    });'''
  content = content.replace(old_visible, new_visible)

  # 6. Remove statusBusy line
  content = content.replace('    const statusBusy = statusSavingId === quote.id;\n', '')

  # 7. Remove edit select from status column
  pattern_sel = r'            \{quote\.availableNextStatuses\.length > 0 && \([\s\S]*?</select>\s*\)\}\n'
  content = re.sub(pattern_sel, '', content)

  # 8. Add badge filters UI
  old_ui = '''            </label>
              <button type="button" className="btn btn-sm btn-outline-secondary"'''
  new_ui = '''            </label>
              <label className="d-flex align-items-center gap-2 small text-muted" htmlFor="badge-filter-select">
                <span>Carimbos:</span>
                <select
                  id="badge-filter-select"
                  className="form-select form-select-sm"
                  style={{ minWidth: 180 }}
                  value={selectedBadgeFilter}
                  onChange={(event) => setSelectedBadgeFilter(event.target.value)}
                >
                  <option value="TODOS">Todos</option>
                  {BADGE_TYPES.map((badgeType) => (
                    <option key={badgeType} value={badgeType}>
                      {BADGE_LABELS[badgeType] ?? badgeType}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-check form-check-inline ms-2">
                <input
                  id="only-badge-checkbox"
                  type="checkbox"
                  className="form-check-input"
                  checked={onlyWithBadge}
                  onChange={(event) => setOnlyWithBadge(event.target.checked)}
                />
                <label className="form-check-label small text-muted" htmlFor="only-badge-checkbox">
                  Somente carimbos
                </label>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary"'''
  content = content.replace(old_ui, new_ui)

  with open(file_path, "w", encoding="utf-8") as f:
      f.write(content)
  print(f"✓ Arquivo {file_path} modificado!")
    const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);
    return paidInCashier || Boolean(quote.paymentConfirmedAt);
  }
'''
        content = content[:insert_pos] + functions + content[insert_pos:]
    
    # 4. Atualizar o filtro visibleQuotes
    old_visible = '''const visibleQuotes =
    selectedStatusFilter === "TODOS"
      ? quotes
      : quotes.filter((quote) => quote.statusKey === selectedStatusFilter);'''
    
    new_visible = '''const visibleQuotes = quotes.filter((quote) => {
    const statusMatch = selectedStatusFilter === "TODOS" || quote.statusKey === selectedStatusFilter;
    const badgeMatch = selectedBadgeFilter === "TODOS" || getBadgeType(quote) === selectedBadgeFilter;
    const badgeExistsMatch = !onlyWithBadge || hasBadge(quote);
    return statusMatch && badgeMatch && badgeExistsMatch;
  });'''
    
    content = content.replace(old_visible, new_visible)
    
    # 5. Adicionar o select de carimbos na UI - adicionar após </label> do status filter
    status_select_end = content.find('</select>\n            </label>')
    if status_select_end != -1:
        # Encontrar o segundo </label> (depois do select de status)
        first_label_end = content.find('</label>', status_select_end - 100)
        
        # Agora encontrar o próximo que é do select de status
        # Buscar o padrão específico do select de status
        status_select_pattern = r'(<label className="d-flex align-items-center gap-2 small text-muted" htmlFor="status-filter-select">.*?</select>\s*</label>)'
        match = re.search(status_select_pattern, content, re.DOTALL)
        if match:
            insert_pos = match.end()
            
            # Adicionar select de carimbos
            badge_select = '''
            <label className="d-flex align-items-center gap-2 small text-muted" htmlFor="badge-filter-select">
              <span>Carimbos:</span>
              <select
                id="badge-filter-select"
                className="form-select form-select-sm"
                style={{ minWidth: 180 }}
                value={selectedBadgeFilter}
                onChange={(event) => setSelectedBadgeFilter(event.target.value)}
              >
                <option value="TODOS">Todos</option>
                {BADGE_TYPES.map((badgeType) => (
                  <option key={badgeType} value={badgeType}>
                    {BADGE_LABELS[badgeType] ?? badgeType}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-check form-check-inline ms-2">
              <input
                id="only-badge-checkbox"
                type="checkbox"
                className="form-check-input"
                checked={onlyWithBadge}
                onChange={(event) => setOnlyWithBadge(event.target.checked)}
              />
              <label className="form-check-label small text-muted" htmlFor="only-badge-checkbox">
                Somente carimbos
              </label>
            </div>'''
            
            content = content[:insert_pos] + badge_select + content[insert_pos:]
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"✓ Arquivo {file_path} modificado com sucesso!")

if __name__ == "__main__":
    add_filter_to_status_page()
