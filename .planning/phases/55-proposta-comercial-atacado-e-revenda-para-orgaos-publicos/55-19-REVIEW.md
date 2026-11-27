---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
reviewed: 2026-11-27T21:30:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/backend/src/modules/propostas/dto/propostas.dto.ts
  - apps/backend/src/modules/propostas/propostas.service.ts
  - apps/backend/src/modules/propostas/propostas.controller.ts
  - apps/backend/src/modules/propostas/propostas.config.test.ts
  - apps/frontend/src/lib/propostas-rotas.ts
  - apps/frontend/scripts/checar-propostas-rotas.mjs
  - apps/frontend/src/app/configuracoes/propostas/page.tsx
  - apps/frontend/src/app/configuracoes/propostas/dados-bancarios-form.tsx
  - apps/frontend/src/app/contas-receber/admin-shell.tsx
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# 55-19: Code Review Report (commit 1100219, dados bancarios da proposta)

**Depth:** standard. Scope: only the source changes of commit 1100219.

## Summary

The implementation is sound on the mechanics. Route ordering is correct: `GET/PATCH config` are declared before `@Get(":id")` and `@Patch(":id")`. The HTTP test hits `/api/propostas/config` through the real controller and gets 200, which proves ParseUUIDPipe is not triggered. Auth is covered by `@AdminOnly()` on the class, the global InternalAuthGuard, and `@Throttle(THROTTLE_SENSITIVE)` on PATCH. The proxy allow-list is correctly narrow: exact lowercase `config`, GET and PATCH only, and the checker covers POST, DELETE, PUT, an extra segment and uppercase. There is no XSS. React escapes the output, and the Handlebars template uses `{{ }}` for all bank fields (there is no `{{{`). The PDF path reads the updated row with no caching: `capturarSnapshot` calls `prisma.propostaConfig.findUnique` on every launch and every preview, and the oficial PDF uses the snapshot saved at launch. HEAD contains no real bank data.

The real problem is in git history, not in the tree. The rest are validation weaknesses and audit gaps.

## Critical Issues

### CR-01: Real agency and account numbers are still in the local git history (not yet pushed)

**File:** commits `8636fbe`, `c3f1fac`, `2fa07b1`, `a51d10d` (`55-CONTEXT.md`, `55-02-PLAN.md`)
**Issue:** `git grep -E "<CONTA>|<AGENCIA>"` on those commits finds `Ag <AGENCIA> / Cc <CONTA>` in plain text, in the CONTEXT D-18 line and in the 55-02-PLAN seed description. Commits `7f29dfc` and `1100219` remove the values from the HEAD tree, so `git grep` on HEAD is clean. The history is not clean. `git branch -r --contains` shows none of those four commits on any remote ref (`origin/feat/fase-52-chatwoot-csat` contains 8195aa0 and later, which are sanitized), so the data has not leaked yet. The GitHub repo is PUBLIC, so pushing or opening a PR with this history publishes the real account. The purpose of 7f29dfc and this commit is defeated at that point.
**Fix:** Before any `git push` or PR of this branch, rewrite the history. Squash or `git filter-repo --replace-text` to replace `<AGENCIA>` and `<CONTA>` in those four commits, then confirm with `git log --all -S<CONTA>` returning nothing. Rotating or accepting the exposure is a business decision. If any earlier push already carried these commits (for example another branch or fork), treat the data as published.

## Warnings

### WR-01: documentoTitular regex accepts garbage (no digit count, no check digits)

**File:** `apps/backend/src/modules/propostas/dto/propostas.dto.ts:201`
**Issue:** `/^[0-9./\- ]{11,20}$/` only checks the character set and length 11-20, so `...........`, `-----------`, `123.456.789-0` (10 digits) and `12345678901234567890` all pass. `formatarDocumento` (propostas-pdf.util.ts:220) formats only when the digit count is exactly 14 or 11. Any other count is printed as bare digits, and a string of only separators becomes `""` with a fallback to the raw string. The wrong value is printed on a public-body proposal, with the bank details next to it. The DTO does not enforce the stated intent ("CPF ou CNPJ invalido"). The test only covers `"123"`.
**Fix:** Strip the mask and validate digits, ideally with check digits:
```ts
@Matches(/^(\d{11}|\d{14}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/, { message: "CPF ou CNPJ invalido" })
```
Optionally add a custom CPF/CNPJ check-digit validator. Add tests for `"..........."`, 10 digits and 15 digits.

### WR-02: agencia and conta regexes accept dangling separators and an unbalanced check digit

**File:** `apps/backend/src/modules/propostas/dto/propostas.dto.ts:198-199`
**Issue:** The trailing `[0-9Xx]?` is optional, so the pattern also matches strings ending in a separator: `1234-`, `1234.`, `98765-` and `1 2 3`. Realistic formats do pass (`1234`, `<AGENCIA>`, `1234-5`, `13005559-4`, `123456-X`, `001.12345678-9`), so false negatives are not a concern. False positives are: a typo such as `1234-` is saved as `completa=true` and printed on the PDF. A lowercase `x` check digit is stored as typed (`12345-x`) instead of being normalized.
**Fix:** Require the check digit after a separator, or end on an alphanumeric:
```ts
/^[0-9](?:[0-9.\- ]{0,14}[0-9Xx])?$/   // agencia (ends on digit or X)
/^[0-9](?:[0-9.\- ]{0,22}[0-9Xx])?$/   // conta
```
Normalize with `.toUpperCase()` in the `@Transform`. Add test cases for the trailing separator.

### WR-03: Changing the receiving account has no audit trail or confirmation (payment-redirect risk)

**File:** `apps/backend/src/modules/propostas/propostas.service.ts:1196-1208`
**Issue:** The PATCH overwrites the bank account printed on commercial proposals for public bodies. The only trace is `atualizadoEm`, so the previous value and the author are lost. The edit is protected only by the shared admin password (`CONFIG_PANEL_PASSWORD`) and shared API keys, with no per-user identity. If the password leaks or the wrong digits are typed, an attacker or a typo changes where clients pay and nothing records the previous account. The UI also saves immediately with no summary of the change.
**Fix:** At minimum, log the change with the old and new values masked (`this.logger.warn("PropostaConfig alterada", { antes: mascarar(old), depois: mascarar(novo) })`) and consider a `PropostaConfigHistorico` table. In the UI, add a confirm step that shows the new agencia and conta before saving.

## Info

### IN-01: The UI warning text is narrower than what `completa` actually checks

**File:** `apps/frontend/src/app/configuracoes/propostas/dados-bancarios-form.tsx:134-137`
**Issue:** `completa` is false when any of the five fields is empty (service `paraConfigBancaria`), but the banner says "Enquanto agencia e conta estiverem vazias". Correct for the seed, misleading if only titular is empty. Related: a 401 from the backend itself (wrong admin key) is shown as "Sessao expirada. Recarregue...", which would send the user in a loop.
**Fix:** Reword to "enquanto algum campo estiver vazio" and use a different message for a backend 401.

### IN-02: Redundant `.trim()` in the service

**Category:** necessity
**File:** `apps/backend/src/modules/propostas/propostas.service.ts:1198-1204`
**Issue:** The DTO `@Transform(aparar)` already trims every string before validation (`transform: true` in main.ts and in the test), so the five `.trim()` calls in `salvarConfigBancaria` cannot change anything when the controller is the only caller. This is defense in depth for non-HTTP callers, but there are none. Low value, harmless.
**Fix:** Keep as a cheap guard or remove. The comment already says the values are validated by the DTO.

### IN-03: Test gaps

**File:** `apps/backend/src/modules/propostas/propostas.config.test.ts`
**Issue:** Not covered: valid realistic formats (`1234-5`, `123456-X`); invalid separators-only agencia or documento (see WR-01 and WR-02); a wrong or missing internal key (only the missing admin key is tested); lengths above 16 and 24 (`@MaxLength`); non-string values (a number for `agencia`); a missing field (partial PATCH, which should be 400 under the all-required DTO); the 401 test does not prove the guard runs before the DTO (a 400 is not distinguishable here). There is no test that a PATCH followed by `capturarSnapshot` returns the new value: `propostas.ciclo.test.ts:171` only injects the fake row directly. There are no frontend tests for the form (`algumVazio`, `alterado`, error mapping, the array `message`).
**Fix:** Add the cases above. The ciclo test should call the service PATCH then the snapshot capture.

### IN-04: The seed still carries the company CNPJ, now in the public repo

**File:** `apps/backend/prisma/migrations/20261128130000_add_proposta_comercial/migration.sql:114`
**Issue:** The seed inserts `62.391.927/0001-57` and the company name. A company CNPJ is public registry data and is printed on every proposal, so this is not a leak. It is noted only because the stated goal is that the DB holds all bank-related data. No action needed. The edited comment in the migration changes the file content of an already-applied migration. If the migration was applied elsewhere, Prisma's checksum will flag the drift (`migrate deploy` fails or `migrate dev` asks for a reset). The edit is comment-only, but the checksum covers the whole file.
**Fix:** Confirm the migration has not been applied in any environment, or revert the comment edit and keep the pointer in the activation script instead.

---

_Reviewed: 2026-11-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
