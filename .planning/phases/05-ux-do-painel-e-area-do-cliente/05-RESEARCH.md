# Phase 5: UX do Painel e Área do Cliente — Research

**Researched:** 2026-05-01
**Domain:** React/Next.js 14 App Router frontend UX — Bootstrap 5, client-side state, public customer pages
**Confidence:** HIGH (all findings verified from codebase; no external library lookups required — Bootstrap 5 is already installed via CDN)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-04.1 | Página `/status` deve exibir status atual do orçamento sem autenticação | Requires new `app/orcamento/[id]/status/page.tsx` — no such page exists today |
| FR-04.2 | Página de aprovação deve funcionar apenas com token válido e não-expirado | Backend `POST /api/quotes/:id/approve?token=` already exists; needs a frontend page |
| FR-04.3 | Após aprovação, cliente deve ver confirmação clara com próximos passos | Frontend page must handle success/error state from approve endpoint |
| FR-07.1 | Tela de lista de orçamentos deve ter filtros funcionais e feedback de carregamento | `orcamento/page.tsx` has no filter UI; backend `list()` already accepts `?status=` |
| FR-07.2 | Formulário de criação deve validar campos obrigatórios antes de submeter | `novo/page.tsx` uses `required` HTML attributes but no Bootstrap validation classes or visual error state |
| FR-07.3 | Status das integrações deve ser visível no painel — NFS-e emitida, PIX pago, etc. | Backend `mapQuoteBody` does NOT return `nfseNumero`/`nfseLink`/`paymentConfirmedAt` in response; needs backend + frontend changes |
</phase_requirements>

---

## Summary

Phase 5 is a frontend-heavy UX improvement pass across three distinct areas: the internal operator panel (quote list + form), the quote detail page (integration badges), and new customer-facing public pages for approval and status viewing.

The existing codebase is in a functional but incomplete state for these requirements. The operator panel (`/orcamento`) shows quotes from a contact filtered by `chatwootContactId` or `conversationId` but has no UI filter controls for status — the backend already accepts `?status=` as a comma-separated list, so adding filter buttons is a pure frontend concern. The new quote form (`/orcamento/novo`) uses HTML5 `required` attributes but applies no Bootstrap validation classes (`was-validated`, `is-invalid`, `invalid-feedback`) so invalid submission gives no visual highlight to users. The detail page (`/orcamento/[id]`) handles NFS-e emission in-session but shows no persistent badge for past emissions because `nfseNumero`/`nfseLink` are not returned by `mapQuoteBody`.

The customer-facing approval flow is **backend-only today**. The endpoint `POST /api/quotes/:id/approve?token=` returns JSON but there is no frontend page at `/orcamento/:id/approve`. Customers receive a raw JSON success or error response. This page must be built from scratch as a public, mobile-friendly Next.js route. Similarly, `FR-04.1` references a customer-facing status page at `/status/:id` — this does not exist; the existing `/status/page.tsx` is the production monitor for operators.

**Primary recommendation:** Build three things in this order: (1) add filter controls and toast feedback to the internal panel, (2) activate Bootstrap 5 form validation on the creation form, (3) build the two customer-facing public pages. All use Bootstrap 5 via CDN — no new dependencies needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Status filter on quote list | Browser/Client | — | State already lives in React; filter triggers refetch with `?status=` query param |
| Toast/alert feedback | Browser/Client | — | Bootstrap 5 Toast API is client-side JS; no server involvement |
| Form validation (new quote) | Browser/Client | API/Backend (DTO) | First line in browser; backend DTO is second line. Phase 5 adds browser-side only |
| Integration status badges (NFS-e, PIX) | API/Backend + Browser | — | `mapQuoteBody` must expose `nfseNumero`, `paymentConfirmedAt`; browser renders badges |
| Customer approval page | Browser/Client | API/Backend | Public page calls existing `POST /api/quotes/:id/approve?token=`; no auth guard |
| Customer status page | Browser/Client | API/Backend | Public page calls existing `GET /api/quotes/:id`; needs a no-auth frontend proxy route |

---

## Current State Inventory — What Exists vs What's Missing

### 5.1 — Internal Panel Filters + Feedback

**What exists (`apps/frontend/src/app/orcamento/page.tsx`):**
- Fetches quotes filtered by `chatwootContactId` or `conversationId` only
- Status column renders color-coded text based on keyword matching
- Inline `setQuotesError` displays errors in a static `alert-danger` div that persists until next action
- No loading state while status change is in progress (the row just shows "Salvando..." in the select)
- No filter UI for status — all quotes for the contact are shown at once
- Response shape from backend changed in Phase 3: `list()` now returns `{ total, data: [...] }` not a plain array — **current frontend code does `Array.isArray(data)` which will now be `false` since the shape changed to `{ total, data }`.** This is a silent bug.

**What's missing:**
- Status filter buttons/tabs (e.g., "Todos", "PENDENTE", "APROVADO", "EM_PRODUCAO")
- Toast notification on successful status change (currently silent on success)
- The list page must be updated to unwrap `data.data` after Phase 3 changes the response shape

**Backend support:**
- `GET /api/quotes?status=APROVADO` — already works; accepts comma-separated values too
- `GET /api/quotes?status=APROVADO,EM_PRODUCAO` — multi-status filter supported [VERIFIED: quotes.service.ts:113-129]

### 5.2 — Form Validation (New Quote)

**What exists (`apps/frontend/src/app/orcamento/novo/page.tsx`):**
- Form has `noValidate` on the `<form>` element and `required` attributes on inputs
- Submit handler checks `itensInvalidos` but only sets a global `setErro` banner at the top
- No Bootstrap 5 `was-validated` class toggling
- No `is-invalid` / `invalid-feedback` per-field error display
- Required fields: `clienteNome`, `telefone`, `vendedor`, `validade`, `prazoEntrega`, `condPagamento`
- `condPagamento` has a fixed `<select>` with a default value — it can never be invalid

**What's missing:**
- Toggle `was-validated` class on the form element on submit attempt
- Per-field `is-invalid` class and `<div class="invalid-feedback">` messages
- Empty string check for `clienteNome` and `vendedor` before submit (they are `required` but the form bypasses HTML5 validation via `noValidate`)

**Bootstrap 5 form validation pattern (verified from existing code patterns in codebase):**
```tsx
// On submit attempt: add class to form to trigger Bootstrap validation CSS
formRef.current?.classList.add("was-validated");
// Only submit if form.checkValidity() returns true
if (!formRef.current?.checkValidity()) { event.stopPropagation(); return; }
```
The form already uses `noValidate` which suppresses browser bubbles but Bootstrap CSS reads `was-validated` + `:invalid` pseudo-class to show red borders and `.invalid-feedback` text. [VERIFIED: Bootstrap 5 docs pattern, consistent with `form.needs-validation` class already on the form element in novo/page.tsx line 600]

### 5.3 — Integration Status Badges

**What exists in backend schema (`schema.prisma`):**
- `nfseNumero String?` — filled when NFS-e is emitted [VERIFIED: schema.prisma:120]
- `nfseLink String?` — URL to view the NFS-e [VERIFIED: schema.prisma:122]
- `nfseEmitidaEm DateTime?` — timestamp of NFS-e emission [VERIFIED: schema.prisma:123]
- `paymentConfirmedAt DateTime?` — timestamp when EFI payment confirmed [VERIFIED: schema.prisma:95]
- `paidTotal Decimal` — amount paid via EFI [VERIFIED: schema.prisma:90]
- `approved Boolean` — true after customer approval [VERIFIED: schema.prisma:118]
- `documents QuoteDocument[]` — PDF documents array [VERIFIED: schema.prisma:113]

**What `mapQuoteBody` DOES NOT expose (verified by reading lines 1179-1231 of quotes.service.ts):**
- `nfseNumero` — NOT in the return object
- `nfseLink` — NOT in the return object
- `nfseEmitidaEm` — NOT in the return object
- `paymentConfirmedAt` — NOT in the return object
- `paidTotal` — NOT in the return object
- `approved` / `approvedAt` — NOT in the return object

**Impact:** Badges cannot be rendered without backend changes. `mapQuoteBody` must be extended to expose these fields. This is a backend-side change (quotes.service.ts) that unlocks the frontend badges.

**What `mapQuoteBody` DOES expose:**
- `latestPdfUrl` — already there (first document's publicUrl) [VERIFIED: quotes.service.ts:1186]
- `statusKey` — current status [VERIFIED: quotes.service.ts:1184]

**Backend change needed:** Add to `mapQuoteBody` return object (requires the method to accept `nfseNumero`, `nfseLink`, `nfseEmitidaEm`, `paymentConfirmedAt`, `paidTotal`, `approved` from the quote record — these fields are already in the Prisma `Quote` model, just not included in the method signature).

**Frontend badge design (Bootstrap 5):**
```tsx
// NFS-e badge
{quote.nfseNumero && (
  <span className="badge bg-success me-1">
    <i className="bi bi-file-check me-1" />NFS-e #{quote.nfseNumero}
  </span>
)}
// PIX pago badge
{quote.paymentConfirmedAt && (
  <span className="badge bg-primary me-1">
    <i className="bi bi-check-circle me-1" />PIX Pago
  </span>
)}
// PDF gerado badge
{quote.latestPdfUrl && (
  <span className="badge bg-secondary me-1">
    <i className="bi bi-file-pdf me-1" />PDF
  </span>
)}
```

### 5.4 — Customer-Facing Pages

**What exists today:**
- `POST /api/quotes/:id/approve?token=` — backend endpoint, decorated `@Public()`, returns JSON directly [VERIFIED: quotes.controller.ts:104-109]
- `GET /api/quotes/:id` — backend endpoint, **NOT public** (protected by auth guard from Phase 1)
- No frontend page at `/orcamento/:id/approve` — customers hitting the approval link see raw JSON
- No frontend page at `/orcamento/:id/status` (or `/status/:id`) — the `/status/page.tsx` is the PRODUCTION MONITOR, requires Chatwoot context

**Two new pages needed:**

**Page A: `/orcamento/[id]/approve/page.tsx`** (customer approval)
- PUBLIC — no Chatwoot validation, no auth guard
- Reads `token` from URL query string: `?token=xxx`
- On load: calls `POST /api/quotes/:id/approve?token=xxx` via a BFF proxy route
- Shows loading state, then success or error
- Success: "Orçamento aprovado! Em breve entraremos em contato."
- Error: "Token inválido ou expirado. Por favor, solicite um novo link."
- Must be mobile-friendly (customer opens from WhatsApp link)

**Page B: `/orcamento/[id]/status/page.tsx`** (customer status view)
- PUBLIC — no Chatwoot validation, no auth guard
- Reads `token` from URL query string for identity verification (or could be open — see Open Questions)
- Calls `GET /api/quotes/:id` to display status and basic info
- Shows: status pill, customer name, quote number, total, estimated delivery date
- Must be mobile-friendly

**BFF proxy routes needed:**
- `POST apps/frontend/src/app/api/quotes/[id]/approve/route.ts` — proxies to backend without auth header
- `GET apps/frontend/src/app/api/quotes/[id]/route.ts` — already exists but uses `backendFetch` which injects `x-internal-api-key`. For public customer pages this is correct since the BFF handles auth, not the browser.

**Critical note on auth:** The existing `backendFetch` in `lib/backend-client.ts` injects `x-internal-api-key` header. The `/approve` endpoint is `@Public()` so this header is ignored by the guard. The customer-facing status page will call `GET /api/quotes/:id` via the BFF, which adds the internal key — this is fine since the BFF is server-side. The customer page itself is public.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Bootstrap 5 | 5.3.2 | CSS + Toast + form validation states | Already loaded via CDN in all pages |
| Bootstrap Icons | 1.11.1 | Icon set (bi-check-circle, bi-file-check, etc.) | Already loaded via CDN |
| React 18 + Next.js 14 | 18.3.1 / 14.2.35 | UI framework | Already in project |
| TypeScript 5.6 | 5.6 | Type safety | Already in project |

### Bootstrap 5 Toast API (built-in, no extra library)
Bootstrap 5 includes a JavaScript Toast component. Since Bootstrap bundle JS is already loaded via CDN (`bootstrap.bundle.min.js`), toasts are available through `window.bootstrap.Toast`.

**Bootstrap Toast pattern for React (verified compatible with CDN approach):**
```tsx
// In a React component — trigger toast imperatively after an action
function showToast(message: string, type: "success" | "danger") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute("role", "alert");
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(el);
  const toast = new (window as any).bootstrap.Toast(el, { delay: 3500 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}
```

Toast container to add to each page:
```html
<div id="toast-container" class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index:1100"></div>
```

[ASSUMED] — Bootstrap Toast imperative API with CDN is standard but the exact React integration pattern (DOM manipulation outside React) is an assumption. Alternative: maintain a React state array of toasts rendered as Bootstrap markup. Either works.

### Bootstrap 5 Form Validation (built-in)
Bootstrap 5 CSS automatically applies red borders to `:invalid` inputs when the parent form has `.was-validated`. [VERIFIED: Bootstrap 5 forms pattern consistent with `needs-validation` class already on the form at novo/page.tsx:600]

---

## Architecture Patterns

### System Architecture Diagram

```
Customer Browser (mobile)
  │ GET /orcamento/:id/approve?token=xxx
  ▼
Next.js App Router (Frontend Server)
  │ /orcamento/[id]/approve/page.tsx (PUBLIC, no Chatwoot check)
  │ Calls: POST /api/quotes/:id/approve?token=xxx (BFF route)
  ▼
Next.js BFF Route
  │ apps/frontend/src/app/api/quotes/[id]/approve/route.ts
  │ backendFetch("/quotes/:id/approve?token=xxx", POST)
  ▼
NestJS Backend
  │ QuotesController.approve() → @Public() → QuotesService.approveByToken()
  │ Validates token, calls changeStatus(APROVADO), invalidates token
  ▼
PostgreSQL (Prisma)
  └── Quote.approved = true, Quote.status = APROVADO, token nulled

---

Operator Browser (in Chatwoot iframe)
  │ /orcamento?chatwootContactId=123
  ▼
Next.js App Router
  │ /orcamento/page.tsx — filter buttons change ?status= query
  │ Calls: GET /api/quotes?status=APROVADO&chatwootContactId=123
  ▼
Next.js BFF → NestJS → Prisma → response with { total, data: [...] }
  └── List re-renders with filtered results, toast shown on status change
```

### Recommended Project Structure (new files)
```
apps/frontend/src/app/
├── orcamento/
│   ├── page.tsx                    MODIFY — add filter UI, toast feedback, fix { total, data } unwrap
│   ├── novo/page.tsx               MODIFY — add was-validated / is-invalid / invalid-feedback
│   ├── [id]/
│   │   ├── page.tsx                MODIFY — add integration badges (nfseNumero, paymentConfirmedAt)
│   │   ├── approve/
│   │   │   └── page.tsx            CREATE — customer approval page (public, mobile-first)
│   │   └── status/
│   │       └── page.tsx            CREATE — customer status page (public, mobile-first)
│   └── andamento/page.tsx          NO CHANGE (redirects to /status)
├── api/
│   └── quotes/
│       └── [id]/
│           └── approve/
│               └── route.ts        CREATE — BFF proxy for POST approve (no auth header needed for @Public)

apps/backend/src/modules/quotes/
└── quotes.service.ts               MODIFY — extend mapQuoteBody() to expose nfseNumero, nfseLink,
                                             nfseEmitidaEm, paymentConfirmedAt, paidTotal, approved
```

### Anti-Patterns to Avoid

- **Polling for approval status:** Do not add a polling loop to the customer approval page. The page should call approve once on load and show the result. Idempotent re-visits should show the "already approved" state gracefully.
- **Using `alert()` / `confirm()` for feedback:** The codebase already avoids these. Continue using Bootstrap alerts and toasts.
- **Adding Chatwoot validation to customer pages:** The approve and status pages are PUBLIC. Do not add `postMessage` Chatwoot validation to them — customers do not have Chatwoot context.
- **New external libraries for toasts:** Bootstrap 5 has built-in Toast support. Do not add react-toastify, notistack, or similar.
- **Using router.push() before showing feedback:** The form in `novo/page.tsx` redirects after 600ms. Maintain this pattern for approval success too.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom notification system | Bootstrap 5 Toast API | Already loaded via CDN; 5 lines of imperative JS |
| Form validation UI | Custom error markup system | Bootstrap 5 `.was-validated` + `.is-invalid` + `.invalid-feedback` | CSS is already loaded; pattern is established |
| Status badge components | Custom React component library | Bootstrap `.badge` classes | Already used in status/page.tsx; consistent with codebase |
| Loading spinners | CSS animation | Bootstrap `.spinner-border` | Already used in every page in the codebase |
| Mobile responsive layout | Custom CSS grid | Bootstrap `.container`, `.row`, `.col-*` | Already used everywhere |

---

## Common Pitfalls

### Pitfall 1: list() response shape changed in Phase 3 — frontend not updated
**What goes wrong:** `orcamento/page.tsx` line 223 does `Array.isArray(data)` — after Phase 3, the backend returns `{ total, data: [...] }`. So `Array.isArray(data)` is now `false` and the list always shows "Nenhum orçamento encontrado".
**Why it happens:** Phase 3 added pagination and changed the list response shape. The frontend was not updated simultaneously.
**How to avoid:** In Plan 5.1, the first action must be to fix the data unwrapping: `const quotes = Array.isArray(data) ? data : (data?.data ?? [])`.
**Warning signs:** Empty list even when quotes exist for the contact.

### Pitfall 2: `mapQuoteBody` does not include integration fields
**What goes wrong:** Frontend tries to read `quote.nfseNumero` but it is always `undefined` because `mapQuoteBody` does not project it.
**Why it happens:** The `mapQuoteBody` method signature (lines 1099-1147) does not include `nfseNumero`, `nfseLink`, `paymentConfirmedAt`, etc. They're in the database but not returned.
**How to avoid:** The backend task for Plan 5.3 must come BEFORE the frontend badge task. The method signature needs to expand and the Prisma include in `getById` / `list` must select these fields.
**Warning signs:** Badges never appear even for quotes where NFS-e was emitted.

### Pitfall 3: Customer approval page — GET vs POST confusion
**What goes wrong:** A developer might implement the customer approval page as a React `useEffect` that fires `GET /api/quotes/:id/approve?token=xxx` but the endpoint is `POST`.
**Why it happens:** Approval links are often `GET` for simplicity (browser navigation), but the backend uses `POST` to avoid accidental approvals from link previews.
**How to avoid:** The approval page should render a visible "Aprovar Orçamento" button that the customer clicks. The button handler does `fetch(..., { method: "POST" })`. Do not auto-submit on page load.
**Warning signs:** The approval never triggers, or it triggers twice (once from link preview crawlers).

### Pitfall 4: Token in URL — approve route is on the backend, not the BFF
**What goes wrong:** The approval link generated by `enviarParaCliente` points to `${APP_BASE_URL}/api/quotes/${id}/approve?token=...` — this is the BACKEND URL. Customers receive a link to the backend, not the frontend.
**Why it happens:** `approvalLink` in quotes.service.ts:1496 uses `APP_BASE_URL` + `/api/quotes/:id/approve`. If `APP_BASE_URL` is the frontend URL (port 3000) this goes through the BFF. If it is the backend URL (port 4000) it skips the frontend entirely.
**How to avoid:** Confirm `APP_BASE_URL` env var value in production. The recommended approach is to use the frontend URL so the customer lands on a proper HTML page (`/orcamento/:id/approve?token=xxx`), not a JSON endpoint. The `approvalLink` generation should be changed to point to the frontend page, and the frontend page calls the backend via BFF.
**Warning signs:** Customer gets a JSON response `{ "message": "Orçamento aprovado." }` instead of a styled confirmation page.

### Pitfall 5: Bootstrap Toast requires bootstrap.bundle.min.js to be fully loaded
**What goes wrong:** Calling `new window.bootstrap.Toast(el)` before Bootstrap JS loads throws `Cannot read properties of undefined`.
**Why it happens:** `<Script strategy="beforeInteractive">` with Bootstrap JS is set in each page, but "beforeInteractive" in Next.js App Router means "before page hydration" — it is generally loaded, but calling the Toast API in a `useEffect` that fires immediately may race with script execution.
**How to avoid:** Use `typeof (window as any).bootstrap !== 'undefined'` guard. Or use a small state-based toast (React state array + Bootstrap markup) which avoids the imperative API entirely.
**Warning signs:** `Uncaught TypeError: Cannot read properties of undefined (reading 'Toast')`.

### Pitfall 6: Status filter that changes URL but doesn't preserve chatwootContactId
**What goes wrong:** Adding filter buttons that set a `status` state in React and refetch — but discarding the `chatwootContactId` context.
**Why it happens:** The list page builds its query from `chatwootContactId` OR `conversationId` state. Filter buttons must append to this query, not replace it.
**How to avoid:** Build the query in one place: `const query = new URLSearchParams(); if (chatwootContactId) query.set(...); if (activeFilter) query.set("status", activeFilter);`
**Warning signs:** Filter shows all quotes from all contacts instead of filtered quotes from the current contact.

---

## Code Examples

### Status Filter Buttons (Bootstrap nav pills pattern)
```tsx
// Source: Bootstrap 5 nav-pills pattern, verified compatible with existing page structure
const STATUS_FILTERS = [
  { label: "Todos", value: "" },
  { label: "Pendente", value: "PENDENTE" },
  { label: "Enviado", value: "ENVIADO" },
  { label: "Aprovado", value: "APROVADO" },
  { label: "Em Produção", value: "EM_PRODUCAO" },
  { label: "Entregue", value: "ENTREGUE" },
  { label: "Cancelado", value: "CANCELADO" },
];

const [activeFilter, setActiveFilter] = useState("");

// In JSX, above the table:
<ul className="nav nav-pills mb-3 flex-wrap gap-1">
  {STATUS_FILTERS.map((f) => (
    <li key={f.value} className="nav-item">
      <button
        type="button"
        className={`nav-link ${activeFilter === f.value ? "active" : ""}`}
        onClick={() => setActiveFilter(f.value)}
      >
        {f.label}
      </button>
    </li>
  ))}
</ul>
```

### Bootstrap 5 Form Validation (novo/page.tsx)
```tsx
// Source: Bootstrap 5 forms documentation pattern, consistent with `needs-validation` already on form
const formRef = useRef<HTMLFormElement>(null);

function gerarOrcamento(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  form.classList.add("was-validated"); // triggers Bootstrap red-border + invalid-feedback display

  if (!form.checkValidity()) {
    return; // Stop if any required field is empty
  }
  // ...existing submit logic
}

// In each required field:
<input
  type="text"
  className="form-control"
  required
  value={form.cliente}
  onChange={...}
/>
<div className="invalid-feedback">Nome do cliente é obrigatório.</div>
```

### Integration Status Badges (detail page)
```tsx
// Source: Bootstrap 5 badges, consistent with status-pill pattern in status/page.tsx
// Shown in the detail page header/summary area
<div className="d-flex flex-wrap gap-2 mt-2">
  {quote.latestPdfUrl && (
    <span className="badge bg-secondary">
      <i className="bi bi-file-pdf me-1" />PDF Gerado
    </span>
  )}
  {quote.nfseNumero && (
    <a href={quote.nfseLink ?? "#"} target="_blank" rel="noreferrer"
       className="badge bg-success text-decoration-none">
      <i className="bi bi-file-check me-1" />NFS-e #{quote.nfseNumero}
    </a>
  )}
  {quote.paymentConfirmedAt && (
    <span className="badge bg-primary">
      <i className="bi bi-check-circle me-1" />PIX Confirmado
    </span>
  )}
  {quote.approved && (
    <span className="badge bg-info text-dark">
      <i className="bi bi-person-check me-1" />Aprovado pelo Cliente
    </span>
  )}
</div>
```

### Customer Approval Page Structure (mobile-first)
```tsx
// Source: Pattern derived from existing customer-facing requirements (FR-04.2, FR-04.3)
// apps/frontend/src/app/orcamento/[id]/approve/page.tsx
"use client";
export default function ApprovePage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const tokenRef = useRef<string>("");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    tokenRef.current = search.get("token") ?? "";
  }, []);

  async function handleApprove() {
    setState("loading");
    try {
      const res = await fetch(
        `/api/quotes/${encodeURIComponent(params.id)}/approve?token=${encodeURIComponent(tokenRef.current)}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "Falha na aprovação.");
      setState("success");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  }
  // ...render: Bootstrap card centered, button, success/error states
}
```

---

## Backend Changes Required (Phase 5 dependencies)

### Change 1: Extend `mapQuoteBody` to expose integration fields

The `mapQuoteBody` private method signature must include additional fields from the Quote model:

Fields to add to the method parameter type:
- `nfseNumero: string | null`
- `nfseLink: string | null`
- `nfseEmitidaEm: Date | null`
- `paymentConfirmedAt: Date | null`
- `paidTotal: Prisma.Decimal`
- `approved: boolean`
- `approvedAt: Date | null`

These must be added to:
1. The method signature (lines 1099-1147)
2. The return object (after line 1179)
3. The Prisma `include`/`select` in `list()` (the `args` object, lines 142-160) — currently the `Quote` fields are all included by default via `findMany` with no field exclusion, so they ARE fetched; the issue is only that `mapQuoteBody` doesn't use them

**Verification:** Reading quotes.service.ts lines 142-171, the `list()` function uses `prisma.quote.findMany(args)` where `args.include` fetches `customer`, `items`, `stamps`, `documents` but does NOT select individual scalar fields — Prisma returns ALL scalar fields by default. So `nfseNumero`, `paymentConfirmedAt`, etc. ARE already in the fetched data object; `mapQuoteBody` just doesn't pass them through. [VERIFIED: Prisma default behavior — all scalar fields included unless `select` is used]

### Change 2: Add `approve` BFF route

Create `apps/frontend/src/app/api/quotes/[id]/approve/route.ts`:
```ts
import { backendFetch } from "@/lib/backend-client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  const url = new URL(_req.url);
  const token = url.searchParams.get("token") ?? "";
  try {
    const res = await backendFetch(
      `/quotes/${encodeURIComponent(id)}/approve?token=${encodeURIComponent(token)}`,
      { method: "POST" }
    );
    const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```

---

## Files to Create / Modify — Summary per Plan

### Plan 5.1 (Painel interno — filtros + feedback)
| File | Action | What changes |
|------|--------|--------------|
| `apps/frontend/src/app/orcamento/page.tsx` | MODIFY | Fix `{ total, data }` unwrap; add status filter pills; add toast on success; add toast-container div |

### Plan 5.2 (Formulário — validação client-side)
| File | Action | What changes |
|------|--------|--------------|
| `apps/frontend/src/app/orcamento/novo/page.tsx` | MODIFY | Add `was-validated` on submit; add `is-invalid`/`invalid-feedback` per required field |

### Plan 5.3 (Badges de integrações)
| File | Action | What changes |
|------|--------|--------------|
| `apps/backend/src/modules/quotes/quotes.service.ts` | MODIFY | Extend `mapQuoteBody` signature and return to include `nfseNumero`, `nfseLink`, `paymentConfirmedAt`, `paidTotal`, `approved`, `approvedAt` |
| `apps/frontend/src/app/orcamento/[id]/page.tsx` | MODIFY | Read new fields from response; render integration badges section |

### Plan 5.4 (Páginas do cliente)
| File | Action | What changes |
|------|--------|--------------|
| `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` | CREATE | Customer approval page — public, mobile-first |
| `apps/frontend/src/app/orcamento/[id]/status/page.tsx` | CREATE | Customer status view — public, mobile-first |
| `apps/frontend/src/app/api/quotes/[id]/approve/route.ts` | CREATE | BFF proxy for POST approve |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 5 is frontend UX + backend field projection. No new external services, CLIs, or infrastructure tools required. All dependencies (Bootstrap 5, Next.js, NestJS, Prisma) are already installed and verified running.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `list()` returns plain array | `list()` returns `{ total, data: [...] }` | Phase 3 | Frontend must unwrap `data.data`, handle `total` |
| Token approval via backend redirect | Token approval via frontend page (Phase 5) | Phase 5 | Customer sees styled page instead of JSON |
| NFS-e state tracked in session only | NFS-e state persisted in DB fields | Already in schema | Phase 5 exposes these fields to frontend |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (no Jest yet — Phase 4 adds Jest) |
| Config file | `apps/backend/jest.config.js` (created in Phase 4) |
| Quick run command | `npm test` (from apps/backend) |
| Full suite command | `npm test` (from apps/backend) |

**Note:** Phase 4 (Testes e CI) is not yet implemented. Phase 5 is frontend/UX work. Most validations are manual UAT checks. The backend change to `mapQuoteBody` (Plan 5.3) should be verified with a quick integration test or manual API call.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FR-04.1 | Customer status page renders without auth | manual smoke | n/a | No |
| FR-04.2 | Approval page rejects expired/invalid token | manual | curl POST with bad token | No |
| FR-04.3 | Success screen shown after approval | manual smoke | n/a | No |
| FR-07.1 | Status filter updates list without page reload | manual smoke | n/a | No |
| FR-07.2 | Required field blank → red border + message | manual smoke | n/a | No |
| FR-07.3 | NFS-e badge appears in detail when nfseNumero set | manual (seed data) | n/a | No |

### Wave 0 Gaps
- No test files to create for this phase (frontend UX — manual verification per UAT criteria)
- Phase 4 must be completed for automated test coverage of backend changes

*(If Phase 4 is done first: add test for `mapQuoteBody` field projection to `quotes.service.spec.ts`)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (customer pages are intentionally public) | — |
| V3 Session Management | No | — |
| V4 Access Control | Yes — customer pages must NOT receive auth headers that could bypass rate limits | BFF proxy: `backendFetch` injects `x-internal-api-key`; this is acceptable since the BFF is server-side |
| V5 Input Validation | Yes — `token` param in approve route | Backend already validates token via `approveByToken`; frontend sanitizes with `encodeURIComponent` |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Link preview auto-click (WhatsApp/Telegram crawl approval link) | Tampering | Approval is POST, not GET — crawlers don't POST. Customer must click a button |
| Token brute force | Tampering | Rate limiting from Phase 1 applies to `/api/quotes/:id/approve`. Token is 24 hex chars (randomBytes(12)) = 2^96 space |
| Approval page XSS via quote data | XSS | React escapes all rendered strings by default; no `dangerouslySetInnerHTML` needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bootstrap Toast imperative DOM approach works without React state management | Code Examples | Low — fallback is React state array of toasts, equally simple |
| A2 | `APP_BASE_URL` env var points to the frontend URL (port 3000), not the backend | Pitfall 4 | HIGH — if it points to backend, approval links skip the frontend entirely; must be confirmed before Plan 5.4 |
| A3 | Customer status page (`/orcamento/:id/status`) should be open (no token required) | Plan 5.4 | Medium — if status data is considered private, token verification is needed |

---

## Open Questions

1. **Approval link URL — frontend or backend?**
   - What we know: `approvalLink` in `enviarParaCliente` uses `APP_BASE_URL + /api/quotes/:id/approve`. If `APP_BASE_URL=http://localhost:3000`, the link goes through the Next.js BFF and then to the backend — but `3000/api/quotes/:id/approve` is a BFF route, not a page. The customer gets a JSON response.
   - What's unclear: The intent of the approval flow — should the link go to a frontend page (`/orcamento/:id/approve?token=`) or directly to the backend JSON endpoint?
   - Recommendation: Change the link generated in `enviarParaCliente` to point to the frontend page URL, and make the frontend page call the backend approve endpoint via BFF. This requires also changing `approvalLink` construction in `quotes.service.ts`.

2. **Customer status page — authentication model**
   - What we know: FR-04.1 says "sem autenticação". The approval token is single-use. If the status page requires no token, any person with the quote ID can view the customer's quote.
   - What's unclear: Whether quote IDs are meant to be opaque (UUIDs are hard to guess) or if there's a privacy concern with open status pages.
   - Recommendation: Use the approval token as a view token for the status page too — pass it in the URL. After approval the token is invalidated per Phase 3 plan, so long-term status access may require a separate "view token" or open access. Confirm with project owner.

3. **`was-validated` resets on re-render**
   - What we know: Adding `was-validated` class to the DOM form element works for first submit. In React, if the form unmounts and remounts, the class is lost.
   - What's unclear: Whether the form ever unmounts during the validation flow.
   - Recommendation: Track validation attempt in React state (`const [submitted, setSubmitted] = useState(false)`) and apply `was-validated` as a className: `className={\`needs-validation \${submitted ? "was-validated" : ""}\`}`.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `apps/frontend/src/app/orcamento/page.tsx` — filter absence confirmed
- Codebase direct read — `apps/frontend/src/app/orcamento/novo/page.tsx` — validation absence confirmed
- Codebase direct read — `apps/backend/src/modules/quotes/quotes.service.ts` (mapQuoteBody, lines 1099-1231) — missing fields confirmed
- Codebase direct read — `apps/backend/prisma/schema.prisma` — nfseNumero, paymentConfirmedAt fields confirmed
- Codebase direct read — `apps/backend/src/modules/quotes/quotes.controller.ts` — @Public() on approve confirmed
- Codebase direct read — `packages/shared/src/index.ts` — type divergence confirmed
- Codebase directory listing — no `/approve` or customer `/status/:id` page confirmed absent

### Secondary (MEDIUM confidence)
- Bootstrap 5 form validation CSS behavior — consistent with `needs-validation` class already present in novo/page.tsx, validated by pattern recognition
- Bootstrap 5 Toast API — consistent with bootstrap.bundle.min.js already loaded in all pages

### Tertiary (LOW confidence — ASSUMED)
- Toast imperative DOM approach with React — A1 in Assumptions Log

---

## Metadata

**Confidence breakdown:**
- Current UI state: HIGH — verified by reading all relevant source files
- Missing backend fields: HIGH — verified by reading mapQuoteBody output vs schema
- Customer page absence: HIGH — verified by directory listing
- Bootstrap 5 patterns: MEDIUM — consistent with existing codebase usage, not externally fetched
- Phase 3 response shape change: HIGH — verified by reading list() return on line 171

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (stable stack — 30 days)
