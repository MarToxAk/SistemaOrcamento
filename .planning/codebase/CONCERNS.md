# CONCERNS.md
_Last updated: 2026-05-15 | Focus: concerns_

## Summary

The codebase is functional and well-structured overall, but carries two critical security vulnerabilities (EFI webhook bypass and timing-unsafe token comparison), one severe maintainability problem (QuotesService god object at 2 142 lines), and several medium-risk reliability and performance gaps. Immediate action is warranted on the security items before any public payment traffic increases.

---

## Security

### CRITICAL — EFI Webhook Guard bypasses silently when secret is unconfigured
- `EFI_WEBHOOK_SECRET` env var is optional; when absent the guard appears to pass all requests through.
- Any actor can POST forged payment-confirmed webhooks, crediting orders without real payment.
- **Fix:** make the guard throw a 500 (not 200/pass) if the secret is missing, and add the var to `.env.example` as required.

### HIGH — Timing-unsafe token comparison in Athos controller
- The Athos integration controller uses plain `!==` for bearer-token comparison.
- The rest of the app uses Node's `crypto.timingSafeEqual`. Inconsistency creates a timing-oracle attack surface.
- **Fix:** replace with `timingSafeEqual` and add a unit test for the comparison path.

---

## Performance

### MEDIUM — Athos schema discovery runs 3-6 `information_schema` queries per request
- No caching layer; repeated discovery on hot paths is wasteful.
- **Fix:** cache the schema result in memory (or Redis if available) with a TTL.

### MEDIUM — `SELECT *` on all Athos tables; full item tree loaded for list endpoints
- List endpoints load the entire item hierarchy even when only top-level data is needed.
- **Fix:** add explicit column selects and paginate tree queries.

---

## Reliability

### MEDIUM — Circular `forwardRef` between `QuotesService` and `EfiService`
- NestJS circular dependencies are fragile; a refactor can silently break injection order.
- **Fix:** extract shared logic into a third service (`PaymentHelperService`) to break the cycle.

### MEDIUM — PDV integration is a non-functional stub wired into production
- The PDV (point-of-sale) module is present and injected but returns mock/empty data.
- Customers may see PDV-related UI without any real behavior behind it.
- **Fix:** feature-flag or remove the stub until the integration is implemented.

### LOW — `enviarParaCliente` fire-and-forget uses `console.error` instead of `Logger`
- Errors in the email dispatch path are swallowed and only surfaced via `console.error`.
- These will be invisible in production log aggregators that read NestJS `Logger` output.
- **Fix:** replace `console.error` with `this.logger.error(...)` and consider surfacing failures.

---

## Maintainability

### HIGH — `QuotesService` is a god object (~2 142 lines, 8+ responsibilities)
- Owns quote creation, PDF generation, email dispatch, status transitions, EFI payment linking, Athos sync, and item pricing — all in one class.
- **Fix:** extract at minimum `QuotePdfService`, `QuoteEmailService`, and `QuoteStatusService`. The EFI and Athos coupling should go through their own services.

---

## Dependency Risks

| Package | Risk | Notes |
|---------|------|-------|
| `next@^16.2.5` | Medium | Listed as a backend (NestJS) dependency — Next.js is a frontend framework. Likely a stale/erroneous entry adding ~45 MB. |
| `puppeteer` | Low-Medium | ~300 MB install; used for PDF generation. Consider `puppeteer-core` + system Chromium, or switch to `pdfmake` / `PDFKit` for smaller footprint. |

---

## Known TODOs / FIXMEs

Search results from codebase (`TODO`, `FIXME`, `HACK`, `XXX`):
- PDV stub marked as TODO internally
- Several `// TODO: paginar` comments on list endpoints
- `// FIXME: circular dep` comment near the `forwardRef` usage

---

## Priority Recommendations

1. **[CRITICAL]** Fix EFI webhook guard to reject requests when `EFI_WEBHOOK_SECRET` is absent — payment fraud vector.
2. **[HIGH]** Replace timing-unsafe `!==` in Athos controller with `timingSafeEqual`.
3. **[HIGH]** Begin splitting `QuotesService` — start with `QuotePdfService` extraction (smallest surface, highest isolation).
4. **[MEDIUM]** Cache Athos schema discovery; add explicit column lists to list queries.
5. **[MEDIUM]** Feature-flag or remove the PDV stub to avoid confusing production users.
