# Plan 39-01 Summary — Spikes de Introspecção (COMP-07)

**Status:** Complete
**Date:** 2026-06-30
**Requirement:** COMP-07

## What was delivered

`39-SPIKES.md` com as 3 queries de introspecção e os **resultados reais** rodados contra o banco de referência `192.168.3.198/athos` (usuário read-only `usuario_leitura`). O checkpoint humano (D-01 modo b) foi resolvido rodando as queries diretamente da máquina local do operador, que alcança a LAN do `192.168.3.198` — as queries (b)/(c) foram adaptadas para PostgreSQL 9.0 (via `pg_catalog`, pois o `information_schema` desta versão difere).

## Spike results

| Spike | Resultado | Decisão p/ Fase 40 |
|-------|-----------|--------------------|
| (a) domínio `quantidade` | `numeric(9,3)`, **sem CHECK** | DTO: `@IsNumber()` + `@Min(0.001)`; sem 23514 de domínio; max 999999.999 |
| (b) constraints | só **PK** (`idprodutocomposto`) + **FK** em `idprodutomaster`; **sem UNIQUE** em `(master,detail)`; `idprodutodetail` **sem FK** | Duplicata: pré-check **na aplicação** (23505 não dispara); validação manual de `idprodutodetail` **obrigatória**; PK serial → `RETURNING` |
| (c) triggers/rules | **0 triggers, 0 rules** | INSERT com `(master, detail, quantidade)` seguro, sem colunas extras |

## Achado crítico (cross-cutting)

**Athos roda PostgreSQL 9.0.5 (32-bit).** Confirma a causa do bug do conta_pagar (`pg_sequence_last_value` é PG 10+, PR #44). Introspecção futura deve usar `pg_catalog`, não `information_schema` (colunas diferem).

## Verification

- `39-SPIKES.md` existe com os 4 blocos de spike (a/b/c-1/c-2) preenchidos com resultados reais — nenhum placeholder `[AGUARDANDO...]` restante.
- ROADMAP critério #4 atendido.

## Notes for downstream (Fase 40)

Todas as 3 incógnitas que gatilhavam o DTO/INSERT de escrita estão resolvidas. A Fase 40 pode finalizar os decorators de `quantidade` e a lista de colunas do INSERT sem novas dúvidas de schema. Pré-requisito externo permanece: **write GRANT** em `produto_composto` (+ sequence) antes da verificação da Fase 40.
