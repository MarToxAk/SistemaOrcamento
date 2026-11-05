---
phase: 42-e-mail-de-boleto-com-destinatarios-em-copia-cc
fixed_at: 2026-11-05T00:00:00Z
review_path: .planning/phases/42-e-mail-de-boleto-com-destinatarios-em-copia-cc/42-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-11-05
**Source review:** .planning/phases/42-e-mail-de-boleto-com-destinatarios-em-copia-cc/42-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01..WR-05; Info fora do escopo)
- Fixed: 4
- Skipped: 1 (WR-01, decisão do usuário)

Verificação executada no checkout principal (`/root/SistemaOrcamento`, sem worktree, branch `main`):
`npm --prefix apps/backend run test -- cobranca --no-coverage` (6 suites, 61 testes passando),
`npx tsc --noEmit -p apps/backend/tsconfig.json` e `npx tsc --noEmit -p apps/frontend/tsconfig.json` sem erros.

## Fixed Issues

### WR-02: Botão "Enviar e-mail" bloqueado se o GET do padrão pendurar

**Files modified:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** 3d0cfc3
**Applied fix:** `carregarCcPadrao` usa `AbortController` com timeout de 8 s (`EMAIL_CC_PADRAO_TIMEOUT_MS`); ao estourar cai no ramo de aviso e o `finally` limpa o timer e libera `emailCcCarregando`.

### WR-03: "Salvar como padrão" após falha de carga sobrescreve o padrão

**Files modified:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** 49634de
**Applied fix:** checkbox desabilitado enquanto carrega ou quando há `emailCcPadraoAviso`; `emailCcSalvarPadrao` é resetado para `false` na falha (HTTP e exceção); o PUT é pulado se houver aviso; mensagem explicativa exibida. Marcado como lógica de UI: requer verificação humana rápida no modal.

### WR-04: `normalizarListaCc` frouxa e sem teste de regressão

**Files modified:** `apps/backend/src/modules/cobranca/email-envio.service.ts`, `apps/backend/src/modules/cobranca/email-envio.service.test.ts`, `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** 74e02d8
**Applied fix:** `EMAIL_RE` agora rejeita espaços, caracteres de controle (incl. CR/LF), `< > , ;`, aspas, parênteses, colchetes e barra invertida (espelhada no frontend). Testes novos 12b (CRLF, vírgula, `<>`, aspas, espaço, NUL via `enviarBoletoENotas`, sem chamar `sendMail`) e 12c (`normalizarListaCc` isolada, sem DTO, e aceita endereços comuns como `o'brien@x.com`). Observação: `EMAIL_RE` também valida o destinatário principal, que fica igualmente mais estrito. Requer verificação humana (mudança de regra de validação).

### WR-05: `idclienteAthos` > 2^31-1 gera 500

**Files modified:** `apps/backend/src/modules/cobranca/email-envio.service.ts`, `apps/backend/src/modules/cobranca/email-envio.service.test.ts`, `apps/frontend/src/app/api/cobranca/email/cc-padrao/[idclienteAthos]/route.ts`
**Commit:** 042eb6f
**Applied fix:** `assertIdCliente` (serviço) e `lerIdCliente` (proxy) limitam a 2147483647; o controller herda a validação via serviço (400). Teste 20 ampliado com 2147483648 e 99999999999; teste 20b cobre o limite exato.

## Skipped Issues

### WR-01: Proxy `/api/cobranca/email/enviar` sem `requireAdminSession`

**File:** `apps/frontend/src/app/api/cobranca/email/enviar/route.ts:5-47`
**Reason:** skipped - decisão do usuário (instrução explícita de não corrigir).
**Original issue:** o proxy que realmente envia boleto/NFS-e/NF-e não exige sessão admin, enquanto `cc-padrao` exige; o `cc` amplia o vetor de envio a destinatários arbitrários.

---

_Fixed: 2026-11-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
