# 05-04 SUMMARY — Customer Approve & Status Pages

## What Was Built

### `api/quotes/[id]/approve/route.ts` (NEW)
- Next.js BFF proxy `POST` handler using `backendFetch`
- Extracts `?token=` from request URL and forwards `encodeURIComponent(token)` to backend
- Returns backend response JSON and status code transparently

### `orcamento/[id]/approve/page.tsx` (NEW)
- `"use client"` customer-facing approval page
- States: `loading-quote` → `idle` → `submitting` → `success` / `error` / `no-token`
- Loads quote on mount to get `quoteNumber` and `clientName`; **never auto-POSTs on load**
- Idempotency: if response contains "aprovado" message, shows success state
- If already approved (data.approved === true), skips to success immediately
- Colors: bg `#f9f7ed`, header gradient, button `#7dc8aa` / hover `#6ab594`
- Logo: `/media/logo_new.svg`
- CTA: "Aprovar Orçamento" / loading: "Aprovando..." spinner
- Success: "Orçamento Aprovado!" + "Recebemos sua aprovação..."
- Contact: WhatsApp link `(12) 99648-4918`

### `orcamento/[id]/status/page.tsx` (NEW)
- `"use client"` customer-facing status view
- States: `loading` → `loaded` / `error`
- Large status pill (`.status-pill { font-size: 1.1rem }`) using `STATUS_CLASS` badge lookup
- Displays quoteNumber, clientName, statusLabel, updatedAt (pt-BR locale)
- Contact footer with WhatsApp link

## Files Created
- `apps/frontend/src/app/api/quotes/[id]/approve/route.ts`
- `apps/frontend/src/app/orcamento/[id]/approve/page.tsx`
- `apps/frontend/src/app/orcamento/[id]/status/page.tsx`

## Decisions
- Token passed via `?token=` query param (not body) to match backend `@Query("token")` decorator
- `encodeURIComponent(token)` in both proxy route and customer page fetch for security
- Approve page loads quote data first (GET) before showing approve button — better UX context
