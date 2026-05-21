# Phase 27: Discussion Log

**Date:** 2026-05-21
**Phase:** Dashboard de Contas a Receber — Read-Only

---

## Areas Discussed

### 1. Localização no Frontend

**Question:** Onde fica a página no sistema?

**Options presented:**
- 1a. Nova rota `/contas-receber` com item de menu próprio no header
- 1b. Tab dentro do painel principal `/`
- 1c. Tab/seção dentro de `/orcamento`

**Decision:** 1a — Nova rota dedicada com item de menu próprio no header.

---

### 2. Atualização em Tempo Real

**Question:** Estratégia de atualização — real-time SSE ou polling ou manual?

**Context surfaced:** O trigger `tg_alterarcontareceber` é BEFORE (não envia pg_notify). O `notify_n8n()` só existe em `relacao_orcamento_venda`. Adicionar trigger AFTER em `conta_receber` exigiria DDL em produção Athos.

**Options presented:**
- 2a. Criar trigger AFTER + SSE (requer DDL em produção)
- 2b. Polling a cada 60s no frontend
- 2c. Sem real-time — botão "Atualizar" manual

**Decision:** 2c — Botão Atualizar manual. Sem DDL em produção, sem polling.

---

### 3. Escopo do Resultado

**Question:** Limite de clientes devedores retornados?

**Options presented:**
- 3a. Retornar tudo sem limite (volume baixo esperado)
- 3b. Top 100 por `total_atrasado DESC`
- 3c. Filtros obrigatórios no frontend

**Decision:** 3b — Top 100 clientes por inadimplência.

---

## Decisions Made by Claude (Discretion)

- Fallback de nome: `COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente)` — padrão validado em `buscarClientes()`
- Dois endpoints separados: `/dashboard` (agregado) + `/cliente/:id/titulos` (lazy, detalhes por cliente) — evita payload gigante
- Badge threshold: 0 dias / 1-30 / 31-90 / > 90 — padrão de semáforo visual consistente com resto do sistema
- Barra de progresso oculta quando `limitecredito = 0` — evita divisão por zero

## Deferred Ideas

- Real-time SSE (`CONTA_RECEBER_MUTATION`) — requer DDL em produção Athos
- Filtros de período e valor mínimo
- Exportação CSV da inadimplência
- Ações de cobrança (read-only nesta fase)
