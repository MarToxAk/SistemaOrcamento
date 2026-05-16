#!/usr/bin/env python3
import re

file_path = "apps/frontend/src/app/status/page.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove statusSavingId, add filter states  
old_states = "  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);\n  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);"
new_states = "  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);\n  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>(\"TODOS\");\n  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState<string>(\"TODOS\");\n  const [onlyWithBadge, setOnlyWithBadge] = useState<boolean>(false);"
content = content.replace(old_states, new_states)

# 2. Add BADGE constants
badge_const = "const BADGE_TYPES = [\"PAGO_CAIXA\", \"PIX_CONFIRMADO\", \"AGUARDANDO\"];\nconst BADGE_LABELS: Record<string, string> = {\n  PAGO_CAIXA: \"Pago no Caixa\",\n  PIX_CONFIRMADO: \"PIX Confirmado\",\n  AGUARDANDO: \"Aguardando pagamento\",\n};"
old_ls = "};\nconst LS_LAST_PAYMENT"
content = content.replace(old_ls, "};\n" + badge_const + "\nconst LS_LAST_PAYMENT")

# 3. Add helper functions after fetchRef
old_fetch = "  const fetchRef = useRef<(() => Promise<void>) | null>(null);"
functions_code = "  const fetchRef = useRef<(() => Promise<void>) | null>(null);\n\n  function getBadgeType(quote: QuoteRow): string {\n    const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);\n    const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);\n    if (paidInCashier) return \"PAGO_CAIXA\";\n    if (quote.paymentConfirmedAt) return \"PIX_CONFIRMADO\";\n    return \"AGUARDANDO\";\n  }\n\n  function hasBadge(quote: QuoteRow): boolean {\n    const orderNumber = quote.orderNumber ?? (quote.saleExternalId != null ? String(quote.saleExternalId) : null);\n    const paidInCashier = quote.paidInCashier ?? Boolean(orderNumber);\n    return paidInCashier || Boolean(quote.paymentConfirmedAt);\n  }"
content = content.replace(old_fetch, functions_code)

# 4. Remove handleStatusChange function
pattern = r"\n  async function handleStatusChange\(quote: QuoteRow, nextStatus: string\) \{[\s\S]*?\n  \}\n"
content = re.sub(pattern, "\n", content)

# 5. Update visibleQuotes
old_visible = "const visibleQuotes =\n    selectedStatusFilter === \"TODOS\"\n      ? quotes\n      : quotes.filter((quote) => quote.statusKey === selectedStatusFilter);"
new_visible = "const visibleQuotes = quotes.filter((quote) => {\n    const statusMatch = selectedStatusFilter === \"TODOS\" || quote.statusKey === selectedStatusFilter;\n    const badgeMatch = selectedBadgeFilter === \"TODOS\" || getBadgeType(quote) === selectedBadgeFilter;\n    const badgeExistsMatch = !onlyWithBadge || hasBadge(quote);\n    return statusMatch && badgeMatch && badgeExistsMatch;\n  });"
content = content.replace(old_visible, new_visible)

# 6. Remove statusBusy line
content = content.replace("    const statusBusy = statusSavingId === quote.id;\n", "")

# 7. Remove edit select from status column
pattern_sel = r"            \{quote\.availableNextStatuses\.length > 0 && \([\s\S]*?</select>\s*\)\}\n"
content = re.sub(pattern_sel, "", content)

# 8. Add badge filters UI
old_ui = "            </label>\n            <button type=\"button\" className=\"btn btn-sm btn-outline-secondary\""
new_ui = "            </label>\n            <label className=\"d-flex align-items-center gap-2 small text-muted\" htmlFor=\"badge-filter-select\">\n              <span>Carimbos:</span>\n              <select\n                id=\"badge-filter-select\"\n                className=\"form-select form-select-sm\"\n                style={{ minWidth: 180 }}\n                value={selectedBadgeFilter}\n                onChange={(event) => setSelectedBadgeFilter(event.target.value)}\n              >\n                <option value=\"TODOS\">Todos</option>\n                {BADGE_TYPES.map((badgeType) => (\n                  <option key={badgeType} value={badgeType}>\n                    {BADGE_LABELS[badgeType] ?? badgeType}\n                  </option>\n                ))}\n              </select>\n            </label>\n            <div className=\"form-check form-check-inline ms-2\">\n              <input\n                id=\"only-badge-checkbox\"\n                type=\"checkbox\"\n                className=\"form-check-input\"\n                checked={onlyWithBadge}\n                onChange={(event) => setOnlyWithBadge(event.target.checked)}\n              />\n              <label className=\"form-check-label small text-muted\" htmlFor=\"only-badge-checkbox\">\n                Somente carimbos\n              </label>\n            </div>\n            <button type=\"button\" className=\"btn btn-sm btn-outline-secondary\""
content = content.replace(old_ui, new_ui)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print(f"OK - {file_path} foi modificado!")
