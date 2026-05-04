---
phase: 17-correcao-desconto-nfse
plan: 01
subsystem: ui
tags: [react, nextjs, typescript, nfse, desconto]

# Dependency graph
requires:
  - phase: 16-ui-desconto-nfse
    provides: Modal NFS-e com switch de desconto e 3 campos bidirecionais
provides:
  - Calculos de desconto no modal NFS-e funcionando com base correta (total real do orcamento)
  - POST body de emissao NFS-e tipado corretamente (boolean + number)
affects: [nfse, desconto, modal-emissao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "quote.body?.totais?.valor — caminho correto para acessar total do orcamento no QuoteDetail"
    - "Record<string, string | number | boolean> — tipo correto para body de POST com campos heterogeneos"

key-files:
  created: []
  modified:
    - apps/frontend/src/app/orcamento/[id]/page.tsx

key-decisions:
  - "Corrigir path quote?.totais?.valor para quote?.body?.totais?.valor em 6 pontos do modal NFS-e"
  - "Alterar tipo do body de Record<string, string> para Record<string, string | number | boolean> para suportar boolean e number sem coercao"

patterns-established:
  - "Bug path errado (quote.totais vs quote.body.totais): verificar sempre o tipo QuoteDetail antes de acessar campos aninhados"
  - "Tipos de POST body devem refletir os tipos reais enviados — nunca usar Record<string, string> quando ha boolean/number"

requirements-completed: [NFSC-01, NFSC-02, NFSC-03, NFSC-04, NFSC-05]

# Metrics
duration: 10min
completed: 2026-05-04
---

# Phase 17 Plan 01: Correcao Desconto NFS-e Summary

**Dois bugs corrigidos em page.tsx: path quote.totais->quote.body.totais (6 pontos) e tipo do POST body string->string|number|boolean com descontoAtivo boolean real**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-04T00:00:00Z
- **Completed:** 2026-05-04T00:10:00Z
- **Tasks:** 2 de 3 (Task 3 e checkpoint:human-verify — aguarda verificacao manual)
- **Files modified:** 1

## Accomplishments

- Corrigidas 6 ocorrencias do path errado `quote?.totais?.valor` para `quote?.body?.totais?.valor` — base de calculo deixou de ser sempre 0
- Tipo do body de `handleEmitirNfse` alterado para `Record<string, string | number | boolean>` — suporta os campos de desconto sem coercao implicita
- `descontoAtivo` agora e enviado como `true` (boolean) em vez de `"true"` (string) — igualdade estrita no backend sera satisfeita
- `descontoPorcentagem` e `descontoValor` convertidos com `Number()` antes do POST — backend recebe numeros, nao strings

## Task Commits

1. **Task 1: Corrigir as 6 ocorrencias do path errado quote?.totais?.valor** - `9bc9f6a` (fix)
2. **Task 2: Corrigir coercao de tipos no POST body de handleEmitirNfse** - `b4138e1` (fix)

_(Task 3 e checkpoint:human-verify — nao ha commit automatizado)_

## Files Created/Modified

- `apps/frontend/src/app/orcamento/[id]/page.tsx` - Correcao dos 6 paths errados de totais e tipagem correta do POST body NFS-e

## Decisions Made

- Corrigir quote?.totais?.valor para quote?.body?.totais?.valor em todos os 6 pontos do modal de desconto — o campo `totais` existe somente dentro de `body` conforme o tipo QuoteDetail
- Usar Record<string, string | number | boolean> no body do POST para evitar coercao implicita de boolean e number para string

## Deviations from Plan

None - plano executado exatamente como especificado.

## Issues Encountered

None — as duas correcoes foram diretas, sem dependencias ausentes ou erros de compilacao.

## Threat Surface Scan

Nenhuma nova superficie de rede, autenticacao ou schema introduzida. Apenas correcao de tipos no frontend.

## Known Stubs

Nenhum — os campos corrigidos agora apontam para dados reais do orcamento.

## User Setup Required

None - sem configuracao externa necessaria.

## Next Phase Readiness

- Verificacao manual no browser necessaria (Task 3 checkpoint:human-verify)
- Apos aprovacao: calculos de desconto funcionais e NFS-e com descontoIncondicionado > 0 nos logs do backend

---
*Phase: 17-correcao-desconto-nfse*
*Completed: 2026-05-04*
