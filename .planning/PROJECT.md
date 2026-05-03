# Sistema de Orcamento BomCusto

## What This Is

Sistema interno de gestao de orcamentos da Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criacao de orcamentos, aprovacao por link publico, cobranca PIX, emissao de NFS-e e comunicacao via Chatwoot. O foco atual e garantir operacao estavel em ambientes Docker sem quebra em atualizacoes.

## Core Value

Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## Last Shipped Milestone: v1.2 Mensagens e UX do Cliente

Shipped em 2026-05-03.

Entregas principais:
- Mensagens automaticas ao cliente via Chatwoot em eventos-chave
- Melhoria de UX das paginas publicas de aprovacao e status
- Ajustes de layout responsivo e estados de aprovacao

## Current Milestone: v1.3 Estabilidade de Migrations no Docker Compose

Goal: Corrigir e padronizar o fluxo de migrations para que atualizacoes via Docker Compose sejam previsiveis, idempotentes e sem downtime evitavel.

Target features:
- Subida do stack com espera explicita de prontidao do banco
- Execucao de migrations idempotente em cenarios de update
- Logs e falhas claras para diagnostico rapido de migration
- Guia operacional de update com passos reprodutiveis

---

## Requirements

### Validated

- checkmark Criacao de orcamentos com itens e carimbos -- fase 0
- checkmark Geracao de PDF e upload MinIO -- fase 0
- checkmark Envio via Chatwoot + link de aprovacao por token -- fase 0
- checkmark Emissao de NFS-e via SOAP iiBrasil -- fase 0
- checkmark Cobranca PIX via EFI Pay com webhooks -- fase 0
- checkmark Integracao read-only Athos ERP e PDV -- fase 0
- checkmark Deploy CI/CD via GitHub Actions + VPS Tailscale -- fase 0
- checkmark Autenticacao global via x-internal-api-key + guard NestJS -- v1.0
- checkmark Webhooks EFI validados com HMAC-SHA256 -- v1.0
- checkmark Fail-fast de variaveis de ambiente criticas -- v1.0
- checkmark Rate limiting global -- v1.0
- checkmark Logger estruturado em todas as integracoes -- v1.0
- checkmark enviarParaCliente assicrono (fire-and-forget) -- v1.0
- checkmark pg.Pool para Athos (max 5 conexoes) -- v1.0
- checkmark Health check com status das integracoes -- v1.0
- checkmark Maquina de estados integra (approveByToken via changeStatus) -- v1.0
- checkmark Paginacao take=50, max 200, retorna total -- v1.0
- checkmark isAssociated como campo booleano real no response -- v1.0
- checkmark Testes automatizados Jest + CI GitHub Actions -- v1.1
- checkmark Paginas publicas de aprovacao e status aprimoradas -- v1.2
- checkmark Mensagens automaticas Chatwoot por eventos -- v1.2

### Active (v1.3)

- [ ] Fluxo de migration confiavel em update de Docker Compose
- [ ] Sequenciamento de startup com banco pronto antes do backend
- [ ] Observabilidade de falhas de migration para operacao
- [ ] Runbook de update para ambiente VPS

### Out of Scope

- Refactor completo de dominio de orcamentos
- Troca de ORM (Prisma permanece)
- Mudanca de provedor de banco
- Reescrita de pipeline de deploy

## Context

- Monorepo com NestJS + Prisma + PostgreSQL + Next.js
- Deploy em VPS via Docker Compose
- Banco principal e remoto; ambiente local com compose opcional
- Historico recente: v1.2 entregue e arquivado

## Constraints

- Banco: Nunca destruir dados em producao para resolver migration
- Compatibilidade: Preservar schema e payload legado onde ja integrado
- Operacao: Solucao deve funcionar com docker compose pull/up sem passos manuais ocultos
- Seguranca: Sem segredos em codigo

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Milestone v1.3 focado em migration stability | Falha em update via compose bloqueia operacao | -- Em execucao |
| Sem pesquisa externa para v1.3 | Problema localizado em infraestrutura existente | -- Em execucao |
| Priorizar idempotencia e readiness checks | Evita quebra em restart e deploy incremental | -- Em execucao |

## Evolution

This document evolves at phase transitions and milestone boundaries.

After each phase transition:
1. Requirements invalidadas? mover para Out of Scope com motivo
2. Requirements validadas? mover para Validated com referencia de fase
3. Novas necessidades? adicionar em Active
4. Decisoes novas? registrar em Key Decisions
5. What This Is continua correto? atualizar se houver drift

After each milestone:
1. Revisao completa das secoes
2. Revalidar Core Value
3. Auditar Out of Scope
4. Atualizar Context com estado real do sistema

---
Last updated: 2026-05-03 after starting milestone v1.3
