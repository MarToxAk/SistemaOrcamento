# Sistema de Orcamento BomCusto

## What This Is

Sistema interno de gestao de orcamentos da Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criacao de orcamentos, aprovacao por link publico, cobranca PIX, emissao de NFS-e e comunicacao via Chatwoot. Operacao estavel em ambientes Docker com fluxo de migration confiavel e procedimentos de update reproduziveis.

## Core Value

Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## Last Shipped Milestone: v1.5 — Correcao NFS-e (Encoding + UI de Desconto)

Shipped em 2026-05-04.

Entregas principais:
- Strings de serviço NFS-e restauradas para UTF-8 (sem mojibake em nfse.service.ts)
- Proxy Next.js `/api/quotes/[id]/nfse` repassa body do POST ao backend
- Modal de emissão NFS-e com switch + 3 campos bidirecionais de desconto (%, R$, Valor total)
- Valor total pré-preenchido com valor base; campo bloqueado contra valor acima do base

## Current Milestone: (a definir — execute /gsd-new-milestone)

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
- checkmark Webhook EFI sem HMAC obrigatorio + idempotencia -- v1.4
- checkmark Conciliacao Athos real (verificarPagamentoPorOrcamento) -- v1.4
- checkmark Fire-and-forget checagem Athos em getById/enviarParaCliente -- v1.4
- checkmark Desconto controlado (percentual/valor) na emissao NFS-e -- v1.4
- checkmark Encoding UTF-8 correto nas strings de servico NFS-e -- v1.5
- checkmark Proxy Next.js NFS-e repassa body do POST ao backend -- v1.5
- checkmark UI de desconto bidirecional no modal de emissao NFS-e -- v1.5
- checkmark Sequenciamento de startup com banco pronto antes do backend -- v1.3
- checkmark Observabilidade de falhas de migration nos logs -- v1.3
- checkmark Runbook de update reproduzivel para VPS -- v1.3

### Active (Next Milestone)

(Próximo milestone a definir via /gsd-new-milestone)

### Out of Scope

- Reintroduzir n8n para roteamento de pagamentos
- Listener PG LISTEN/NOTIFY externo ao backend principal
- Recalculo retroativo de NFS-e ja emitida
- Refactor completo de dominio de orcamentos
- Troca de ORM (Prisma permanece)
- Mudanca de provedor de banco
- Reescrita de pipeline de deploy para Kubernetes

## Context

- Monorepo com NestJS + Prisma + PostgreSQL + Next.js
- Deploy em VPS via Docker Compose com Portainer webhook
- Banco principal remoto; ambiente local com compose opcional
- Historico: v1.0 MVP, v1.1 Aprovacao Athos, v1.2 Mensagens/UX, v1.3 Migration Stability -- todos arquivados
- Webhook EFI ja existe em /api/integrations/efi/webhook/payment e /pix, hoje com guard HMAC
- Endpoint /api/quotes/:id/payment-status existe, mas AthosService.verificarPagamentoPorOrcamento ainda retorna stub (paid=false)
- Emissao NFS-e hoje envia DescontoIncondicionado/DescontoCondicionado fixos em 0.00 no XML

## Constraints

- Banco: Nunca destruir dados em producao para resolver migration
- Compatibilidade: Preservar schema e payload legado onde ja integrado
- Operacao: Solucao deve funcionar com docker compose pull/up sem passos manuais ocultos
- Seguranca: Sem segredos em codigo
- Integracao: Fluxo deve ficar 100% no backend desta aplicacao (sem n8n)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Autenticacao via x-internal-api-key + guard NestJS | Simples, sem OAuth overhead | checkmark Validado -- v1.0 |
| Prisma migrate deploy em producao | Idempotente por design | checkmark Validado -- v1.3 |
| wait-for-db.js antes de migration | Elimina race condition postgres/backend | checkmark Validado -- v1.3 |
| Runbook manual para VPS | Sem infra CI capaz de executar docker compose | checkmark Validado -- v1.3 |
| Monorepo npm workspaces | Compartilhamento de tipos sem publicacao | checkmark Validado -- historico |
| Remover obrigatoriedade de assinatura no webhook EFI | Necessidade operacional de receber notificacao sem bloqueio por segredo | -- Pendente (v1.4) |
| Conciliar pagamento pelo Athos ao abrir/enviar orcamento | Reduz divergencia entre estado do caixa e estado do orcamento | -- Pendente (v1.4) |
| Desconto NFS-e controlado por flag e tipo | Dar flexibilidade fiscal sem alterar emissao padrao | -- Pendente (v1.4) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via /gsd-transition):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via /gsd-complete-milestone):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-04 after v1.5 milestone*