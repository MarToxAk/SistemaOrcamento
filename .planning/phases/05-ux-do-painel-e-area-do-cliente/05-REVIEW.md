---
phase: 05-ux-do-painel-e-area-do-cliente
reviewed: 2026-05-01T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - apps/frontend/src/app/orcamento/page.tsx
  - apps/frontend/src/app/orcamento/novo/page.tsx
  - apps/backend/src/modules/quotes/quotes.service.ts
  - apps/frontend/src/app/orcamento/[id]/page.tsx
  - apps/frontend/src/app/api/quotes/[id]/approve/route.ts
  - apps/frontend/src/app/orcamento/[id]/approve/page.tsx
  - apps/frontend/src/app/orcamento/[id]/status/page.tsx
findings:
  critical: 5
  warning: 7
  info: 3
  total: 15
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The phase implements filter pills, Bootstrap form validation, integration status badges, and customer-facing approval/status pages. The core business logic in `quotes.service.ts` is broadly sound (parameterised Prisma queries, token invalidation before state change), but there are several issues that must be addressed before shipping:

Five critical findings were identified: an XSS vector in the toast builder, an open-redirect/iframe-injection via an unvalidated URL query parameter, a security-significant partial Chatwoot bypass in the new-quote page, a partial-success data-loss path in `approveByToken`, and missing origin validation on every `postMessage` listener. Seven warnings cover logic correctness issues (race condition in validation, unreachable idempotency branch, dead variable, validation mismatch) and code quality issues (massive code duplication, `console.warn` in a service, weak `type` cast). Three informational items are noted as well.

---

## Critical Issues

### CR-01: XSS via `innerHTML` in `showToast` — user-controlled string injected without sanitisation

**File:** `apps/frontend/src/app/orcamento/page.tsx:132`

**Issue:** `showToast(message, type)` interpolates the `message` argument directly into `wrapper.innerHTML`. The `message` value is taken verbatim from two sources:

1. `data?.error || "Erro ao buscar orçamentos do contato."` — where `data` is a parsed JSON body from the backend API (line 271). A compromised or misbehaving backend can inject arbitrary HTML/JS.
2. `data?.message || data?.error || "Falha ao atualizar status."` (line 302) — same path, from `/api/quotes/<id>/status` response.

If an error message contains `<img src=x onerror=alert(1)>`, it executes in the user's browser with full page privileges.

**Fix:**
```typescript
// Replace the innerHTML assignment with safe DOM construction:
const body = document.createElement("div");
body.className = "toast-body";
body.textContent = message;          // textContent is XSS-safe

const closeBtn = document.createElement("button");
closeBtn.type = "button";
closeBtn.className = "btn-close btn-close-white me-2 m-auto";
closeBtn.setAttribute("data-bs-dismiss", "toast");
closeBtn.setAttribute("aria-label", "Fechar");

const flex = document.createElement("div");
flex.className = "d-flex";
flex.appendChild(body);
flex.appendChild(closeBtn);
wrapper.appendChild(flex);
```

---

### CR-02: Open redirect / arbitrary iframe injection via unvalidated `pdfUrl` query parameter

**File:** `apps/frontend/src/app/orcamento/[id]/page.tsx:182-185`, `apps/frontend/src/app/orcamento/[id]/page.tsx:621-630`

**Issue:** The page reads the `pdfUrl`, `nfseUrl`, or `documentUrl` query-string parameter and assigns it to `externalPdfUrl` without any validation:

```typescript
const externalUrl = params.get("pdfUrl") ?? params.get("nfseUrl") ?? params.get("documentUrl");
if (externalUrl) {
  setExternalPdfUrl(externalUrl);
}
```

This value is then used verbatim as the `src` of an `<iframe>` (line 626) and as the `href` of an `<a target="_blank">` link (line 618). Any actor that can craft a link to this page (e.g., send a WhatsApp message with a crafted URL) can load an arbitrary origin inside an iframe in the operator's session, or redirect the "Nova Aba" link to a phishing site. Because the page is already authenticated (Chatwoot-validated), the victim's session is live.

**Fix:**
```typescript
// Validate that externalUrl is an https URL on an expected domain
function isSafeExternalUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
    // Optionally: restrict to known domains (storage bucket hostname)
  } catch {
    return false;
  }
}

const externalUrl = params.get("pdfUrl") ?? params.get("nfseUrl") ?? params.get("documentUrl");
if (isSafeExternalUrl(externalUrl)) {
  setExternalPdfUrl(externalUrl);
}
```

---

### CR-03: Chatwoot validation partially bypassed in new-quote page — form visible without Chatwoot context

**File:** `apps/frontend/src/app/orcamento/novo/page.tsx:265-278`

**Issue:** In the list and detail pages the validation timeout sets `validationState` to `"invalid"` when the page is in an iframe but no Chatwoot message arrives within 3.5 s. In the new-quote page the same timeout block is:

```typescript
const validationTimeout = window.setTimeout(() => {
  const isInIframe = window.parent !== window;
  if (!isInIframe) {
    setValidationMessage("Esta página deve ser acessada através do Chatwoot");
    setValidationState("invalid");
  }
  // ← No "else if (!validated)" branch
}, 3500);
```

If the page is embedded in an iframe but the Chatwoot message is delayed or never arrives (network issue, wrong message format), the page stays in `"checking"` state indefinitely only if there is no `conversationId` — however, the second `useEffect` (lines 281-289) transitions to `"valid"` as soon as `conversationId > 0`, which can be set from the URL query parameter alone (line 165). An attacker can embed the form in their own iframe and pass `?conversationId=1` to get the form to render without real Chatwoot validation.

**Fix:** Mirror the two-branch timeout that the list and detail pages use:
```typescript
const validationTimeout = window.setTimeout(() => {
  const isInIframe = window.parent !== window;
  if (!isInIframe) {
    setValidationMessage("Esta página deve ser acessada através do Chatwoot");
    setValidationState("invalid");
  } else if (!validated) {
    setValidationMessage("Não foi possível validar o contexto da conversa no Chatwoot");
    setValidationState("invalid");
  }
}, 3500);
```

And the `validated` flag must be set to `true` only from the postMessage handler, not from URL params.

---

### CR-04: `approveByToken` token invalidated before `changeStatus` — partial success leaves quote in broken state

**File:** `apps/backend/src/modules/quotes/quotes.service.ts:1629-1635`

**Issue:** The method first invalidates the token and sets `approved = true`:

```typescript
await this.prisma.quote.update({
  where: { id: quote.id },
  data: { approvalToken: null, approved: true, approvedAt: new Date() },
});

// This can throw BadRequestException if the quote status is e.g. CANCELADO
const updated = await this.changeStatus(quote.id, "APROVADO", "Aprovacao pelo cliente");
```

If `changeStatus` throws (e.g., quote was cancelled between the token lookup and this point, or quote is already APROVADO and thus not in allowed transitions for a second call), the customer receives an error response but the token is already consumed and `approved = true` is already written. The quote status is not updated to APROVADO. The customer cannot retry (token is gone). The internal state is inconsistent: `approved = true` but `status != APROVADO`.

**Fix:** Wrap both operations in a single Prisma `$transaction` and perform the status transition within the transaction, rolling back the token invalidation if the transition fails:
```typescript
const updated = await this.prisma.$transaction(async (tx) => {
  await tx.quote.update({
    where: { id: quote.id },
    data: { approvalToken: null, approved: true, approvedAt: new Date() },
  });
  // changeStatus must accept a tx parameter, or re-implement inline here
  const newStatus: QuoteStatus = "APROVADO";
  const allowed = statusTransitions[quote.status];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestException(
      `Transicao invalida: ${statusLabels[quote.status]} -> Aprovado`,
    );
  }
  return tx.quote.update({
    where: { id: quote.id },
    data: {
      status: newStatus,
      editedAt: new Date(),
      statusHistory: { create: { oldStatus: quote.status, newStatus, changedByName: "Aprovacao pelo cliente" } },
    },
    include: { customer: true, items: { where: { parentItemId: null }, orderBy: { sequence: "asc" }, include: { children: { orderBy: { sequence: "asc" } } } }, stamps: { orderBy: { number: "asc" } }, documents: { orderBy: { generatedAt: "desc" }, take: 1 } },
  });
});
```

---

### CR-05: `postMessage` listeners accept messages from any origin (`"*"`)

**File:** `apps/frontend/src/app/orcamento/page.tsx:197-213`, `apps/frontend/src/app/orcamento/novo/page.tsx:231-244`, `apps/frontend/src/app/orcamento/[id]/page.tsx:136-147`

**Issue:** All three `handleMessage` event listeners accept `MessageEvent` without checking `event.origin`. A malicious page that has embedded (or convinced the user to open) one of these pages in an iframe can `postMessage` a crafted payload that includes a fake `conversation.id` and optionally a fake `contact.name`, `contact.phone`, etc. This bypasses Chatwoot authentication entirely, sets `validationState = "valid"`, and prefills form fields with attacker-chosen values (in the new-quote page).

**Fix:**
```typescript
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL,
  // add staging origins as needed
].filter(Boolean);

const handleMessage = (event: MessageEvent) => {
  if (!ALLOWED_ORIGINS.includes(event.origin)) return; // reject unknown origins
  // ... rest of handler
};
```

---

## Warnings

### WR-01: `approveByToken` — quote already APROVADO causes `changeStatus` to throw, client-facing page reports error despite success

**File:** `apps/backend/src/modules/quotes/quotes.service.ts:1635`

**Issue:** `statusTransitions["APROVADO"]` is `["EM_PRODUCAO", "CANCELADO"]`. If `approveByToken` is called on a quote that is already `APROVADO` (e.g., race condition, double-submit, or second approval link click after token regeneration), `changeStatus` will throw `BadRequestException("Transicao de status invalida: Aprovado -> Aprovado")`. The frontend approval page (`approve/page.tsx:57-62`) does try to detect this idempotency case, but it does so by checking whether the backend error message contains the string `"aprovado"` — a locale-fragile and brittle heuristic. Meanwhile CR-04 means the token is already gone, so the second call will fail at `if (!quote.approvalToken)` rather than reaching the idempotency check.

**Fix:** In `approveByToken`, add an explicit early-return guard before the state machine:
```typescript
if (quote.status === "APROVADO") {
  return { approved: true, quoteId: quote.id, status: "APROVADO" };
}
```

---

### WR-02: Dead variable `nextStatus` after `changeStatus` call in `approveByToken`

**File:** `apps/backend/src/modules/quotes/quotes.service.ts:1636`

**Issue:**
```typescript
const updated = await this.changeStatus(quote.id, "APROVADO", "Aprovacao pelo cliente");
const nextStatus = "APROVADO" as QuoteStatus;  // ← assigned but never read
```
`nextStatus` is assigned but never used. This is dead code that likely indicates a refactor was left incomplete.

**Fix:** Remove the dead `nextStatus` declaration.

---

### WR-03: `condPagamento` `<select>` marked `required` but has a default value — validation never fires

**File:** `apps/frontend/src/app/orcamento/novo/page.tsx:678`

**Issue:** The `<select>` for `condPagamento` is `required` and has `value={form.condPagamento}`. Its initial value is `""` (empty string from `DADOS_EXEMPLO`). However, all four `<option>` elements have non-empty `value` attributes (`"À vista"`, `"30 dias"`, `"2x"`, `"3x"`) — there is no `<option value="">` placeholder. So when the form first renders with `condPagamento = ""`, the browser renders the select with no visible selection but `checkValidity()` may treat it as valid because the empty string is not one of the options and browsers' native handling of this edge case varies. Additionally, Bootstrap's `was-validated` styling will never show `invalid-feedback` for this field because there is no `<div class="invalid-feedback">` sibling, making the required constraint unenforceable in the UI.

**Fix:** Add a disabled placeholder option and an invalid-feedback message:
```tsx
<select className="form-select" id="condPagamento" value={form.condPagamento}
  onChange={e => setForm(f => ({...f, condPagamento: e.target.value}))} required>
  <option value="" disabled>Selecione...</option>
  <option value="À vista">À vista</option>
  <option value="30 dias">30 dias</option>
  <option value="2x">2x sem juros</option>
  <option value="3x">3x sem juros</option>
</select>
<div className="invalid-feedback">Selecione uma condição de pagamento.</div>
```

---

### WR-04: Status page and approve page fetch quote detail without authentication — information disclosure

**File:** `apps/frontend/src/app/orcamento/[id]/status/page.tsx:33`, `apps/frontend/src/app/orcamento/[id]/approve/page.tsx:26`

**Issue:** Both customer-facing pages call `/api/quotes/${encodeURIComponent(id)}` with no authentication token. This is intentional for customer UX, but the backend GET endpoint returns the full quote body including `cliente.email`, `cliente.telefone`, `observacoes`, all line items, totals, and the `chatwootConversationUrl`. Anyone who knows (or guesses) a valid `id` can retrieve this PII without any credential. The `id` is a UUID which has high entropy, but the `internalNumber` (a sequential integer, also accepted as identifier) is enumerable.

**Fix:** For the public-facing status and approve pages, create a dedicated backend endpoint that returns only the minimum data needed (quote number, client first name, status, total) and requires the approval token as a credential. Do not rely on UUID obscurity as a security boundary.

---

### WR-05: `console.warn` left in production service code

**File:** `apps/backend/src/modules/quotes/quotes.service.ts:842`

**Issue:**
```typescript
console.warn(
  `[Chatwoot] Contexto incompleto: conversationId=${payload.conversationId}, chatwootContactId=${payload.chatwootContactId}`,
);
```
`console.warn` bypasses the NestJS `Logger` abstraction, so this message will not respect log-level configuration, structured logging, or log-rotation. In production it writes to stdout unstructured.

**Fix:**
```typescript
this.logger.warn(
  `Contexto Chatwoot incompleto: conversationId=${payload.conversationId}, chatwootContactId=${payload.chatwootContactId}`,
);
```

---

### WR-06: Massive code duplication of Chatwoot handshake logic across three files

**File:** `apps/frontend/src/app/orcamento/page.tsx:40-75`, `apps/frontend/src/app/orcamento/novo/page.tsx:68-118`, `apps/frontend/src/app/orcamento/[id]/page.tsx:54-92`

**Issue:** The functions `parseIncomingMessagePayload`, `parseObjectMaybe`, and `normalizeChatwootPayload` are copy-pasted verbatim across all three files (with minor variations). The `normalizeChatwootPayload` in `novo/page.tsx` has an additional branch for bare contact objects (lines 112-115) that is absent in the other two files, meaning divergence has already begun. When a bug is found in one copy it must be fixed in all three.

**Fix:** Extract these helpers to a shared module, e.g. `apps/frontend/src/lib/chatwoot.ts`, and import from it in all three pages.

---

### WR-07: `type` field in `backendFetch` is not type-safe — silently swallows wrong Content-Type header override

**File:** `apps/frontend/src/lib/backend-client.ts:10`

**Issue:**
```typescript
const headers = internalHeaders(init?.headers as Record<string, string> | undefined);
```
The `as Record<string, string>` cast discards the actual type of `init?.headers`, which can be a `Headers` instance or a `[string, string][]` array. If a caller passes a `Headers` object (valid for `RequestInit`), the cast silently treats it as a plain object; `internalHeaders` then spreads it, which only copies enumerable own properties from a `Headers` instance — none, because `Headers` stores entries internally. The `Content-Type` header set by callers such as `approve/route.ts` would be lost.

**Fix:**
```typescript
function internalHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("x-internal-api-key", process.env.INTERNAL_API_KEY ?? "");
  return h;
}
```

---

## Info

### IN-01: `key={idx}` used throughout list renders — unstable keys if list is re-ordered

**File:** `apps/frontend/src/app/orcamento/novo/page.tsx:703`, `apps/frontend/src/app/orcamento/[id]/page.tsx:484`, `apps/frontend/src/app/orcamento/[id]/page.tsx:503`

**Issue:** Items tables and stamp lists use array indices as React keys. Since items are rendered read-only in these views the practical impact is low, but if ordering ever changes the reconciler will re-render unnecessarily. In the carimbo edit list (`novo/page.tsx:735`, `novo/page.tsx:790`) `key={idx}` causes state to persist in the wrong input when the array is reordered.

**Fix:** Use a stable identifier (`item.sequenciaitem`, `carimbo.numero`) as the key.

---

### IN-02: Italiano comment leak — "Validazione" in production code

**File:** `apps/frontend/src/app/orcamento/novo/page.tsx:265`

**Issue:** The comment reads `// Validazione: verificar se está no Chatwoot após timeout` — "Validazione" is Italian, not Portuguese or English. Minor but inconsistent with project language.

**Fix:** Change to `// Validação: verificar se está no Chatwoot após timeout`.

---

### IN-03: `recomputed` result of raw query in `mergeDuplicates` is fetched but never used

**File:** `apps/backend/src/modules/quotes/quotes.service.ts:1062-1064`

**Issue:**
```typescript
const recomputed = await tx.$queryRaw<...>`
  SELECT COALESCE(SUM("finalPrice"::numeric),0) AS subtotal FROM "QuoteItem" WHERE "quoteId" = ${keepId}
`;
// recomputed is never read; the update below (line 1067) ignores it
await tx.quote.update({ where: { id: keepId }, data: { updatedAt: new Date() } });
```
The subtotal is computed but the `Quote.total` / `Quote.subtotal` fields are not updated from it. The merged quote retains stale totals from the kept record.

**Fix:** Either use the computed subtotal to update the quote's financials, or remove the dead query:
```typescript
// Option A: Update totals from recomputed sum
const [recomputed] = await tx.$queryRaw<Array<{subtotal: string}>>`...`;
await tx.quote.update({
  where: { id: keepId },
  data: { subtotal: new Prisma.Decimal(recomputed.subtotal), updatedAt: new Date() },
});

// Option B: Remove the unused query entirely
await tx.quote.update({ where: { id: keepId }, data: { updatedAt: new Date() } });
```

---

_Reviewed: 2026-05-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
