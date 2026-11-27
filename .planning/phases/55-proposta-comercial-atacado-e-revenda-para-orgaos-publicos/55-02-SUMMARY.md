---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 02
subsystem: database
tags: [prisma, postgres, migration, proposta, pdf-template]
status: complete

requires:
  - phase: 54
    provides: padrao de migration aditiva/idempotente e script validar-migration-descartavel.sh
provides:
  - enum PdfTemplateFamilia e coluna PdfTemplate.familia (default ORCAMENTO)
  - enum PropostaStatus e models Proposta (30 colunas), PropostaItem (18), PropostaConfig (7)
  - seed do singleton PropostaConfig com dados bancarios do Santander
  - script de validacao com migrations pre-requisito opcionais (retrocompativel)
  - Prisma Client regenerado com os novos modelos
affects: [55-05, 55-06, 55-07, 55-08, 55-11, 55-13]

actuals:
  tokens: 9000
  tasks: 3
  commits: 2
plan_head_before: 40ff1b1ac80df9fc1ca2d9b66d7cab2b5039426f
plan_head_after: 79f524b66983ba8838d9d3a12deabb9c01a67720

tech-stack:
  added: []
  patterns:
    - "Migration com enum em bloco DO + pg_type, ADD COLUMN IF NOT EXISTS, FK em bloco DO + pg_constraint, seed com ON CONFLICT DO NOTHING"
    - "Script de validacao aceita pastas pre-requisito (4o argumento em diante) para validar ALTER TABLE"

key-files:
  created:
    - apps/backend/prisma/migrations/20261128120000_add_pdf_template_familia/migration.sql
    - apps/backend/prisma/migrations/20261128130000_add_proposta_comercial/migration.sql
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/scripts/validar-migration-descartavel.sh

key-decisions:
  - "LANCANDO e estado interno transitorio de reserva (compare-and-set do 55-08), nao um quinto status de negocio de D-06"
  - "Dados bancarios em PropostaConfig (tabela, semeada pela migration); dados da empresa seguem em env EMPRESA_* (desvio registrado do Responsibility Map)"
  - "Proposta.pdfSnapshot (Json) guarda a fonte do PDF emitido para regeneracao identica (D-09, D-18)"
  - "PropostaItem sem unique em (propostaId, sequencia) para permitir renumeracao"

requirements-completed: [P55-CICLO, P55-PDF, P55-CLI]
---

# Phase 55 Plan 02: Modelo de dados de propostas e familia de templates Summary

Schema Prisma e duas migrations aditivas e idempotentes para a familia de templates de PDF (ORCAMENTO | PROPOSTA) e as tabelas Proposta, PropostaItem e PropostaConfig (com seed do Santander), validadas duas vezes em Postgres descartavel.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | schema.prisma e as duas migrations | 2fa07b1 |
| 2 | script de validacao com pre-requisitos | 79f524b |
| 3 | validacao das tabelas e regeneracao do Prisma Client | sem commit (somente verificacao; nenhum arquivo alterado) |

## Verification

- `prisma validate` OK; `prisma generate` OK (Prisma Client 5.22.0); `tsc --noEmit` do backend sem erros.
- DDL de referencia gerado por `prisma migrate diff` (schema do HEAD anterior para o novo) conferido campo a campo com as migrations: colunas, tipos, defaults, indices e FK identicos.
- Script de validacao: regressao Fase 54 (`NfseLiberacao 13`) OK; `PdfTemplate 9` com pre-requisito 20260622000000 OK; `Proposta 30`, `PropostaItem 18`, `PropostaConfig 7` OK, todos aplicados duas vezes sem erro.
- Prisma Client gerado expoe PropostaStatus, PdfTemplateFamilia, proposta, propostaItem e propostaConfig.
- Nenhum DROP/UPDATE nas migrations; Athos nao foi tocado; nenhuma exclusao de arquivo nos commits.

## Deviations from Plan

None - plan executed exactly as written. Observacoes de ambiente: `node_modules` ausente no worktree, instalado com `npm ci` (conforme environment_notes); realinhei manualmente as colunas do model PdfTemplate (cosmetico, 6 linhas) em vez de rodar `prisma format`, que reformataria linhas nao relacionadas do schema.

## Known Stubs

None.

## Threat Flags

None. Nova superficie limitada a tabelas no banco do Sistema ja cobertas pelo threat_model (T-55-03, T-55-05).

## Notes for downstream plans

- Aplicar as migrations em producao e etapa humana do plano 55-11 (bootstrap-runtime.sh); este plano so validou em Postgres descartavel.
- `Proposta.pdfSnapshot` nunca deve ser devolvido nas respostas da API.

## Self-Check: PASSED

- FOUND: apps/backend/prisma/migrations/20261128120000_add_pdf_template_familia/migration.sql
- FOUND: apps/backend/prisma/migrations/20261128130000_add_proposta_comercial/migration.sql
- FOUND: commits 2fa07b1 e 79f524b no historico do branch
