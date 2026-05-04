# Phase 18 — Plan 01 SUMMARY

**Phase:** 18-correcoes-nfse-rps-tomador
**Plan:** 01
**Status:** complete
**Commit:** c38a5d5
**Date:** 2026-05-04

---

## What Was Built

Correções cirúrgicas em dois arquivos da integração NFS-e iiBrasil:

### Fix 1: RPS off-by-one (RPS-01, RPS-02)
- **Arquivo:** `apps/backend/src/modules/integrations/nfse/nfse.service.ts`
- **Mudança:** `rpsNumero = infoNfse.proximoRps` → `rpsNumero = infoNfse.proximoRps + 1`
- `getInfoNfse()` retorna o último número RPS emitido; código agora incrementa corretamente
- Log atualizado: mostra `ultimoRPS` (valor da API) e `rpsNumero` (valor a emitir)
- Fallback para `internalNumber` quando API indisponível mantido sem alteração (RPS-02 ✓)

### Fix 2: buscarTomador diagnóstico e NotFoundException (TOM-01, TOM-02, TOM-03)
- **Arquivo:** `apps/backend/src/modules/integrations/nfse/nfse.service.ts`
- Adicionado `NotFoundException` ao import do NestJS
- Reescrito bloco try/catch de `buscarTomador()`:
  - Log de `lookupId`, `externalQuoteId` e `internalNumber` antes de chamar Athos
  - `NotFoundException` capturado separadamente com mensagem `[Tomador] orcamento "X" nao encontrado no Athos`
  - Log de `idcliente` retornado após busca bem-sucedida do orcamento
  - Check `clienteId > 0` em vez de truthy (corrige falha silenciosa quando `idcliente = 0`)
  - Log de `tipo`, `nome` e `documento` quando cliente encontrado
  - Log de aviso quando `buscarClientePorId` retorna null

### Fix 3: Log identifierColumn no Athos (TOM-02)
- **Arquivo:** `apps/backend/src/modules/integrations/athos/athos.service.ts`
- Log `[Athos] buscarOrcamentoPorNumero: numero="X" identifierColumn="Y"` após detecção dinâmica da coluna

---

## Verification Checklist

- [x] `rpsNumero = infoNfse.proximoRps + 1` presente em nfse.service.ts (linha 493)
- [x] `NotFoundException` importado em nfse.service.ts (linha 1)
- [x] Catch separado para `NotFoundException` em buscarTomador
- [x] Check `clienteId > 0` em vez de truthy
- [x] `[Tomador]` logs em 6 pontos do método
- [x] Log `[Athos] identifierColumn` em athos.service.ts (linha 348)
- [x] `npx tsc --noEmit` → exit 0 (sem erros de tipo)
- [x] Commit `c38a5d5` — 2 arquivos, 73 inserções, 39 deleções

---

## Requirements Addressed

| REQ-ID | Status | Notes |
|--------|--------|-------|
| RPS-01 | ✅ done | `proximoRps + 1` na emissão |
| RPS-02 | ✅ done | Fallback internalNumber inalterado |
| TOM-01 | ✅ done | buscarTomador com lookup correto e check `> 0` |
| TOM-02 | ✅ done | Logs [Tomador] e [Athos] com identifierColumn |
| TOM-03 | ✅ done | idcliente=0 gera warn em vez de skip silencioso |
| REG-01 | ✅ done | Emissão sem externalQuoteId inalterada (try/catch externo preservado) |
| REG-02 | ✅ done | Lógica de desconto e NFSC-01..05 não modificados |

---

## Files Modified

- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — RPS fix + buscarTomador rewrite
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — identifierColumn log

## Files Created

- `scripts/fix_nfse_18.py` — Script auxiliar de aplicação dos fixes (pode ser deletado)
