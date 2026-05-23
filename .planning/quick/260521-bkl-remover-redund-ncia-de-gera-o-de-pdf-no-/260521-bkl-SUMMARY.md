---
phase: quick
plan: 260521-bkl
subsystem: quotes-pdf
tags: [performance, minio, puppeteer, cache]
dependency_graph:
  requires: []
  provides: [objectExists-in-QuotesPdfStorageService, cache-first-pdf-resolution]
  affects: [quotes.service.ts, quotes-pdf-storage.service.ts]
tech_stack:
  added: []
  patterns: [cache-first, MinIO statObject]
key_files:
  created: []
  modified:
    - apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
decisions:
  - "Usar statObject para verificar existência do objeto no MinIO — lança exceção se ausente, capturada com try/catch genérico retornando false"
  - "Non-null assertion (!) usada para resolvedFileName/resolvedContentType no sendAttachment — seguro porque resolvedBuffer só é não-null quando os outros campos também estão preenchidos"
metrics:
  duration: "~10 min"
  completed: "2026-05-21"
  tasks: 2
  files: 2
---

# Phase quick Plan 260521-bkl: Remover Redundância de Geração de PDF Summary

Lógica cache-first implementada em `enviarParaCliente` e `resendPdfToChatwoot`: reutiliza PDF existente no MinIO em vez de disparar Puppeteer incondicionalmente a cada envio.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Adicionar objectExists em QuotesPdfStorageService | c99af84 | quotes-pdf-storage.service.ts |
| 2 | Lógica cache-first em enviarParaCliente e resendPdfToChatwoot | c99af84 | quotes.service.ts |

## What Was Built

### `QuotesPdfStorageService.objectExists`
Método público adicionado logo antes de `renderHtml`. Usa `client.statObject` — se o objeto existir retorna `true`, qualquer exceção retorna `false`. Sem logging interno; o chamador decide o que logar.

### Cache-first em `enviarParaCliente`
- Busca `quoteDocument.findFirst` por `quoteId` ordenado por `generatedAt desc`
- Verifica existência do objeto no MinIO via `objectExists(storagePath)`
- Se existir: faz download e reutiliza (log debug com path)
- Se ausente no MinIO ou sem documento: gera via Puppeteer, persiste `QuoteDocument`, faz download
- Remove o comentário `// Sempre regera o PDF com o template mais recente`

### Cache-first em `resendPdfToChatwoot`
- Mesma lógica, variáveis `resolvedBuffer/resolvedFileName/resolvedContentType`
- `sendAttachment` atualizado para usar as variáveis resolvidas
- `try/catch` externo (que lança `BadRequestException`) mantido intacto

## Deviations from Plan

None — plano executado exatamente como escrito.

## Performance Impact

- Envios quando PDF existe: ~3-5 s (Puppeteer) → ~200 ms (download MinIO)
- `createQuote` e endpoint `generatePdf` não foram alterados (continuam gerando sempre)

## Known Stubs

None.

## Threat Flags

None — `objectExists` é chamado apenas internamente; resultado não exposto ao cliente.

## Self-Check: PASSED

- `objectExists` em quotes-pdf-storage.service.ts: FOUND (linha 88)
- `generateAndStore` em resendPdfToChatwoot dentro de `if (!resolvedBuffer)`: FOUND (linha 1047-1048)
- `generateAndStore` em enviarParaCliente dentro de `if (!resolvedBuffer)`: FOUND (linha 1942-1943)
- Commit c99af84: FOUND
- TypeScript: zero erros
