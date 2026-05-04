# Sistema de Orcamento BomCusto

## What This Is

Sistema interno de gestao de orcamentos da Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criacao de orcamentos, aprovacao por link publico, cobranca PIX, emissao de NFS-e e comunicacao via Chatwoot. Operacao estavel em ambientes Docker com fluxo de migration confiavel e procedimentos de update reproduziveis.

## Core Value

Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## Last Shipped Milestone: v1.3 Estabilidade de Migrations no Docker Compose

Shipped em 2026-05-03.

Entregas principais:
- wait-for-db.js garante prontidao do banco antes de migration e start
- bootstrap-runtime.sh padroniza sequencia de startup do backend
- Healthcheck pg_isready no compose VPS com gate service_healthy
- UPDATE_RUNBOOK.md para update/rollback reproduzivel na VPS
- verify-deploy-health.ps1 para validacao pos-deploy

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
- checkmark Fluxo de migration confiavel no Docker Compose -- v1.3
- checkmark Sequenciamento de startup com banco pronto antes do backend -- v1.3
- checkmark Observabilidade de falhas de migration nos logs -- v1.3
- checkmark Runbook de update reproduzivel para VPS -- v1.3

### Active (Next Milestone)

- [ ] RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- [ ] Relatorios e exportacao CSV de orcamentos
- [ ] Notificacoes em tempo real (WebSocket)
- [ ] Templates de mensagem configuraveis pelo painel

### Out of Scope

- Refactor completo de dominio de orcamentos
- Troca de ORM (Prisma permanece)
- Mudanca de provedor de banco
- Reescrita de pipeline de deploy para Kubernetes

## Context

- Monorepo com NestJS + Prisma + PostgreSQL + Next.js
- Deploy em VPS via Docker Compose com Portainer webhook
- Banco principal remoto; ambiente local com compose opcional
- Historico: v1.0 MVP, v1.1 Aprovacao Athos, v1.2 Mensagens/UX, v1.3 Migration Stability -- todos arquivados

## Constraints

- Banco: Nunca destruir dados em producao para resolver migration
- Compatibilidade: Preservar schema e payload legado onde ja integrado
- Operacao: Solucao deve funcionar com docker compose pull/up sem passos manuais ocultos
- Seguranca: Sem segredos em codigo

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Autenticacao via x-internal-api-key + guard NestJS | Simples, sem OAuth overhead | checkmark Validado -- v1.0 |
| Prisma migrate deploy em producao | Idempotente por design | checkmark Validado -- v1.3 |
| wait-for-db.js antes de migration | Elimina race condition postgres/backend | checkmark Validado -- v1.3 |
| Runbook manual para VPS | Sem infra CI capaz de executar docker compose | checkmark Validado -- v1.3 |
| Monorepo npm workspaces | Compartilhamento de tipos sem publicacao | checkmark Validado -- historico |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-03 after v1.3 milestone*