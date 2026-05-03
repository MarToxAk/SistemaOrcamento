# Sistema de Orçamento BomCusto

## What This Is

Sistema interno de gestão de orçamentos para a empresa Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criação de orçamentos por carimbos/gravações/brindes, aprovação pelo cliente via token, cobrança PIX, emissão de NFS-e e comunicação via Chatwoot. Operado pela equipe interna; clientes acessam apenas páginas de status e aprovação.

## Core Value

Orçamentos criados, aprovados e cobrados sem intervenção manual — integrações (NFS-e, EFI PIX, Chatwoot) devem funcionar de forma confiável e visível, nunca silenciosamente.

## Current Milestone: v1.2 Mensagens e UX do Cliente

**Goal:** Padronizar comunicação com o cliente via Chatwoot em cada etapa do serviço, com mensagens amigáveis e emojis, e reformular as páginas públicas para experiência mais acolhedora.

**Target features:**
- Mensagens automáticas com emojis: aprovação, PIX parcial/total/parcelado, mudanças de status
- Redesign das páginas `/approve` e `/status` com identidade visual Bom Custo
- Status do serviço visível e descritivo para o cliente

---

## Current State

**Versão atual:** v1.1 (shipped 2026-05-03)

Sistema completo e funcional em produção. Fluxo completo:
- Criação/importação de orçamentos (manual ou via Athos ERP)
- Envio manual de link de aprovação ao cliente via Chatwoot
- Página pública de aprovação com itens e total em BRL
- Aprovação registrada em tempo real
- Emissão de NFS-e com endereço manual do tomador
- Cobrança PIX com webhook HMAC validado

Stack: NestJS + Prisma + PostgreSQL (backend), Next.js App Router (frontend), Docker + Tailscale (produção), GitHub Actions CI.

## Requirements

### Validated

- ✓ Criação de orçamentos com itens e carimbos — fase 0
- ✓ Geração de PDF e upload MinIO — fase 0
- ✓ Envio via Chatwoot + link de aprovação por token — fase 0
- ✓ Emissão de NFS-e via SOAP iiBrasil — fase 0
- ✓ Cobrança PIX via EFI Pay com webhooks — fase 0
- ✓ Integração read-only Athos ERP e PDV — fase 0
- ✓ Deploy CI/CD via GitHub Actions + VPS Tailscale — fase 0
- ✓ Autenticação global via x-internal-api-key + guard NestJS — v1.0
- ✓ Webhooks EFI validados com HMAC-SHA256 — v1.0
- ✓ Fail-fast de variáveis de ambiente críticas — v1.0
- ✓ Rate limiting global — v1.0
- ✓ Logger estruturado em todas as integrações — v1.0
- ✓ enviarParaCliente assíncrono (fire-and-forget) — v1.0
- ✓ pg.Pool para Athos (max 5 conexões) — v1.0
- ✓ Health check com status das integrações — v1.0
- ✓ Máquina de estados íntegra (approveByToken via changeStatus) — v1.0
- ✓ Paginação take=50, max 200, retorna total — v1.0
- ✓ isAssociated como campo booleano real no response — v1.0
- ✓ 33 testes automatizados (Jest) + CI GitHub Actions — v1.1
- ✓ Filter pills, toast feedback, validação de form — v1.0
- ✓ Badges de integração (NFS-e, PIX, aprovação) no painel — v1.0
- ✓ Páginas do cliente para aprovação e status — v1.0
- ✓ Página de aprovação com itens e total em BRL — v1.1
- ✓ Link de aprovação correto (/orcamento/ não /api/quotes/) — v1.1
- ✓ Endereço manual do tomador na emissão NFS-e — v1.1
- ✓ Envio manual de link ao cliente (botão "Enviar", não auto-dispatch) — v1.1

### Active (Next Milestone)

- [ ] RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- [ ] Relatórios e exportação CSV de orçamentos
- [ ] Notificações em tempo real (WebSocket) para mudança de status

### Out of Scope

- Sistema de estoque — gerenciado pelo Athos ERP
- Emissão de NF-e (produto) — apenas NFS-e (serviço) está no escopo
- App mobile — sistema web responsivo é suficiente
- Multi-tenant / multi-empresa — sistema é mono-empresa (Bom Custo)
- Pagamentos além de PIX (cartão próprio) — EFI já suporta parcelamentos

## Context

- Empresa pequena (~5 usuários internos), atendimento via Chatwoot
- Municípios: Ilhabela-SP — NFS-e iiBrasil com regras tributárias da reforma 2026 (IBS/CBS)
- Stack: NestJS + Prisma + PostgreSQL (backend), Next.js App Router (frontend), Docker + Tailscale (produção)
- Autenticação usa Chatwoot como único IdP — não deve haver acesso fora do contexto do Chatwoot
- Refactor gradual de `quotes.service.ts` (~1700 linhas) no backlog

## Constraints

- **Autenticação**: Apenas via Chatwoot — sem cadastro próprio de usuários no sistema
- **Compatibilidade**: Payload legado de orçamentos deve ser mantido (não quebrar integrações existentes)
- **NFS-e**: Lógica de hash, alíquotas e template XML não podem ser alterados (validado em produção)
- **Banco**: Banco de produção é remoto (VPS) — migrations devem ser feitas com cuidado
- **Athos/PDV**: Read-only — nunca escrever nestes bancos externos

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Chatwoot como único IdP | Equipe já usa Chatwoot; não criar mais um sistema de login | ✓ Validado em produção |
| NestJS global guard com API key interna | Simples, sem OAuth próprio; frontend passa key via header | ✓ Funciona bem |
| Envio manual (botão "Enviar") | Operador quer controle — não auto-disparar ao criar orçamento | ✓ Confirmado em UAT v1.1 |
| Endereço manual no modal NFS-e | Tomador sem cadastro no Athos precisa de campos editáveis | ✓ Gap fechado v1.1 |
| Extrair sub-services de `quotes.service.ts` | God class com ~1700 linhas — refactor gradual | — Backlog |

---
*Last updated: 2026-05-03 — v1.1 milestone shipped (Phase 6)*
