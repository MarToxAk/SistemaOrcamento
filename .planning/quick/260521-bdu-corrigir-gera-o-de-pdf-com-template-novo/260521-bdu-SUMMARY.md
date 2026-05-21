---
phase: quick
plan: 260521-bdu
subsystem: backend/pdf
tags: [pdf, build, template, dist]
dependency_graph:
  requires: []
  provides: [dist/quotes-pdf.template.js, dist/quotes-pdf-storage.service.js]
  affects: [docker-compose, pdf-generation]
tech_stack:
  added: []
  patterns: [tsc-build, handlebars-template-extraction]
key_files:
  created:
    - apps/backend/dist/src/modules/quotes/quotes-pdf.template.js
    - apps/backend/dist/src/modules/quotes/quotes-pdf.template.js.map
  modified:
    - apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js
    - apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js.map
decisions:
  - dist/ esta no .gitignore — apenas o build local foi corrigido; proxima docker build usara os fontes TS atuais e compilara corretamente
metrics:
  duration: ~2min
  completed_date: "2026-05-21"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 260521-bdu: Corrigir Geração de PDF com Template Novo — Summary

## One-liner

Recompilou o backend TypeScript para gerar `dist/quotes-pdf.template.js` com o template v2 (Mulish, header vermelho), eliminando o HTML inline antigo do `dist/quotes-pdf-storage.service.js`.

## What Was Done

### Causa Raiz

O arquivo `dist/src/modules/quotes/quotes-pdf-storage.service.js` havia sido compilado antes da extração do template HTML para `quotes-pdf.template.ts`. Por isso:
- `dist/quotes-pdf.template.js` não existia
- `dist/quotes-pdf-storage.service.js` ainda continha o HTML antigo inline (sem Mulish, sem header vermelho)

Em produção o container Docker roda `node dist/src/main.js`, ignorando completamente o TypeScript fonte — portanto o template v2 nunca chegava ao PDF gerado.

### Solução

Executou-se `npm --workspace @bomcusto/backend run build` (que invoca `tsc -p tsconfig.build.json`), recompilando todos os arquivos TypeScript incluindo o novo `quotes-pdf.template.ts`.

### Verificações Executadas

| Verificação | Resultado |
|------------|-----------|
| `dist/quotes-pdf.template.js` criado | PASS |
| `QUOTES_PDF_HTML_TEMPLATE.includes('Mulish')` | PASS |
| Ausência de `bootstrap@5.3.2` no service compilado | PASS (0 ocorrências) |
| `require('quotes-pdf.template')` presente no service | PASS (1 ocorrência) |

## Commits

- `024ebdf` — fix(pdf): corrigir geração com template v2 — Puppeteer e logging (fontes TS, commitado anteriormente)
- dist/ não commitado (está no .gitignore; é artefato de build)

## Deviations from Plan

### Task 2 — Commit diferente do esperado

O plano previa commitar os arquivos dist/ junto com os fontes TS. Ao verificar com `git check-ignore apps/backend/dist/`, confirmou-se que `dist/` está no `.gitignore`. Por isso:
- Os dist/ NÃO foram commitados (correto para arquivos gerados/ignorados)
- Os fontes TS já estavam commitados em `024ebdf` (commit anterior à execução desta quick task)
- STATE.md foi atualizado com a referência ao commit `024ebdf`

## Impacto

O próximo `docker compose build` compilará automaticamente o TypeScript e gerará os artefatos corretos no dist/, fazendo com que todos os PDFs gerados usem o template v2 (fonte Mulish, header vermelho, layout moderno).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum novo surface introduzido.

## Self-Check

- [x] `apps/backend/dist/src/modules/quotes/quotes-pdf.template.js` existe
- [x] Template contém "Mulish" — template v2 confirmado
- [x] `quotes-pdf-storage.service.js` NÃO contém "bootstrap@5.3.2"
- [x] `quotes-pdf-storage.service.js` contém "quotes-pdf.template" via require
- [x] STATE.md atualizado com entrada 260521-bdu

## Self-Check: PASSED
