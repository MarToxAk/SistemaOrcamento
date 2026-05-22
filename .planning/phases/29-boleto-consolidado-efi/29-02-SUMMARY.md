---
phase: 29-boleto-consolidado-efi
plan: "02"
subsystem: payments-frontend
tags: [nextjs, modal, boleto, efi, proxy, route-handler, react-state]

# Dependency graph
requires:
  - phase: 29-01
    provides: POST /cobranca/boleto backend endpoint com nomeArquivo
provides:
  - Route Handler proxy POST /api/cobranca/boleto (Next.js, server-side x-internal-api-key)
  - Modal 4 estados em /contas-receber/[idcliente]/page.tsx (confirm/loading/success/error)
affects:
  - apps/frontend/src/app/api/cobranca/boleto/route.ts
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route Handler proxy POST: backendFetch + validacao body + propagacao status HTTP do backend"
    - "Modal 4 estados via useState<'idle'|'confirm'|'loading'|'success'|'error'> — sem Bootstrap Modal JS"
    - "ESC key via useEffect keydown listener — nao fecha em estado loading"
    - "Linha digitavel copiavel: navigator.clipboard + setTimeout 2000ms para feedback visual"
    - "Datas identicas pre-preenchem campo readOnly + badge info; datas divergentes mostram alert-danger"

key-files:
  created:
    - apps/frontend/src/app/api/cobranca/boleto/route.ts
  modified:
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx

key-decisions:
  - "backendFetch ja injeta x-internal-api-key automaticamente — Route Handler nao precisa adicionar header manualmente"
  - "void navigator.clipboard.writeText() para suprimir aviso de floating Promise no TypeScript strict"
  - "boletoResult.nomeArquivo incluido no atributo download do link Abrir Boleto (D-24)"
  - "Modal adota padrao do pdf-modal-backdrop de orcamento/[id]/page.tsx — React state overlay sem Bootstrap JS"

# Metrics
duration: 20min
completed: 2026-05-22
---

# Phase 29 Plan 02: Boleto Consolidado EFI — Frontend Summary

**Route Handler proxy POST /api/cobranca/boleto + modal React de 4 estados em /contas-receber/[idcliente] conectando selecao de titulos ao fluxo completo de geracao de boleto EFI**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-22T00:35:00Z
- **Completed:** 2026-05-22T00:55:00Z
- **Tasks:** 2 (+ checkpoint aguardando verificacao humana)
- **Files modified:** 2

## Accomplishments

- Route Handler `POST /api/cobranca/boleto` criado como proxy server-side: valida body (idclienteAthos, idcontasReceber[], expireAt), delega ao backend via backendFetch (injeta x-internal-api-key automaticamente), propaga status HTTP
- Botao "Gerar Boleto" conectado a `abreBoletoModal()` — substitui TODO Phase 29
- Estado 1 (confirmacao): detecta datas identicas vs divergentes, pre-preenche campo readonly ou exibe alert-danger, valida data passada com `is-invalid` + `invalid-feedback`, botao Confirmar desabilitado quando `expireAtInvalido`
- Estado 2 (loading): spinner centralizado, botoes ocultos, backdrop nao fecha
- Estado 3 (sucesso): exibe valor + vencimento formatados, linha digitavel com `font-family: ui-monospace`, botao Copiar com feedback "Copiado! ✔" por 2s, botao "Abrir Boleto" com `target="_blank" rel="noopener noreferrer"` e `download={nomeArquivo}`
- Estado 4 (erro): mensagem principal + detalhe HTTP como secundario, botao "Tentar Novamente" volta ao Estado 1
- CSS `.boleto-modal-*` adicionado ao bloco style existente (fadeIn 150ms + slideUp 150ms)
- ESC fecha modal nos estados 1, 3, 4 — nao fecha em estado 2 (loading)
- Zero ocorrencias de `fw-bold` no modal — apenas `fw-semibold`
- TypeScript compila sem erros

## Task Commits

1. **Task 1: Route Handler proxy POST /api/cobranca/boleto** - `8e31084` (feat)
2. **Task 2: Modal boleto 4 estados em /contas-receber/[idcliente]** - `377c749` (feat)

## Files Created/Modified

- `apps/frontend/src/app/api/cobranca/boleto/route.ts` - Proxy POST com validacao de body e propagacao de status HTTP
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` - Modal 4 estados + onClick conectado + CSS boleto-modal-*

## Decisions Made

- `backendFetch` ja injeta `x-internal-api-key` automaticamente via `internalHeaders()` — Route Handler nao duplica o header
- `void navigator.clipboard.writeText()` para suprimir aviso de floating Promise (TypeScript strict)
- `boletoResult.nomeArquivo` incluido no atributo `download` do link "Abrir Boleto" conforme D-24
- Padrao modal do projeto (pdf-modal-backdrop) replicado: React state overlay, sem Bootstrap Modal JS

## Deviations from Plan

None — plano executado exatamente como escrito. As duas tasks foram commitadas separadamente conforme especificado.

## Issues Encountered

None — TypeScript compilou limpo na primeira execucao para ambas as tasks.

## Known Stubs

None — todos os campos da resposta do backend (linkBoleto, barcodeLinhaDigitavel, valor, expireAt, nomeArquivo) sao exibidos diretamente sem stub ou placeholder.

## Threat Surface Scan

Nenhum novo endpoint de rede ou caminho de auth alem dos documentados no threat_model do plano:
- T-29F-01: x-internal-api-key server-side via backendFetch — nunca exposta ao browser
- T-29F-02: validacao de body no Route Handler antes de repassar ao backend
- T-29F-03: target="_blank" com rel="noopener noreferrer" no botao "Abrir Boleto"
- T-29F-04: Estado loading oculta botoes — multiplos cliques impossiveis

## Self-Check

- [x] `apps/frontend/src/app/api/cobranca/boleto/route.ts` existe
- [x] Commit `8e31084` existe
- [x] Commit `377c749` existe
- [x] `abreBoletoModal` aparece no onClick do botao "Gerar Boleto"
- [x] `boletoModalState` tem 11 ocorrencias (>= 8 exigidos)
- [x] `boleto-modal-backdrop` aparece no JSX e no CSS
- [x] Zero ocorrencias de `fw-bold` no arquivo
- [x] `target="_blank"` presente no botao "Abrir Boleto"
- [x] `navigator.clipboard` presente no botao Copiar
- [x] `barcodeLinhaDigitavel` presente no input readOnly e no onClick do botao Copiar

## Self-Check: PASSED

---

*Phase: 29-boleto-consolidado-efi*
*Completed: 2026-05-22*
