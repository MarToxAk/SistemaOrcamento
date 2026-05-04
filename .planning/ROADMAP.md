# Roadmap - Sistema de Orcamento BomCusto

Version: 1.3
Date: 2026-05-03

---

## Milestones

- [x] v1.0 MVP - Phases 1-5 (shipped 2026-05-02)
- [x] v1.1 Aprovacao Athos - Phase 6 (shipped 2026-05-03)
- [x] v1.2 Mensagens e UX do Cliente - Phases 7-8 (shipped 2026-05-03)
- [ ] v1.3 Estabilidade de Migrations no Docker Compose - Phases 9-10 (in progress)

---

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-05-02</summary>

Full details: .planning/milestones/v1.0-ROADMAP.md

- [x] Phase 1: Seguranca e Autenticacao
- [x] Phase 2: Confiabilidade de Integracoes
- [x] Phase 3: Correcoes de Fluxo e Qualidade de Dados
- [x] Phase 4: Testes e CI
- [x] Phase 5: UX do Painel e Area do Cliente

</details>

<details>
<summary>v1.1 Aprovacao Athos (Phase 6) - SHIPPED 2026-05-03</summary>

Full details: .planning/milestones/v1.1-ROADMAP.md

- [x] Phase 6: Aprovacao de Orcamento pelo Cliente com Associacao Athos (4 planos)

</details>

<details>
<summary>v1.2 Mensagens e UX do Cliente (Phases 7-8) - SHIPPED 2026-05-03</summary>

Full details: .planning/milestones/v1.2-ROADMAP.md

- [x] Phase 7: Mensagens Automaticas ao Cliente via Chatwoot (2 planos)
- [x] Phase 8: UX das Paginas Publicas do Cliente (2 planos)

</details>

### v1.3 Estabilidade de Migrations no Docker Compose

## Phase 9 - Fluxo de Migration Idempotente
Status: complete (v1.3)
Goal: Eliminar falhas de migration em atualizacoes de container garantindo execucao idempotente e sincronizada com prontidao do banco.

Requirements covered: MIG-01, MIG-02, MIG-03
Depends on: Phase 8
Plans: 2 plans

Plans:
- [x] 09-01-PLAN.md - Diagnosticar causa raiz e ajustar comando/entrypoint de migration
- [x] 09-02-PLAN.md - Implementar readiness gate e logs acionaveis para falhas de migration

Success criteria:
1. Atualizacao via docker compose nao falha com erro de migration previamente aplicada
2. Backend so tenta migration apos Postgres aceitar conexoes
3. Falhas de migration apresentam mensagem objetiva e acao sugerida

---

## Phase 10 - Operacao Segura de Update
Status: not started
Goal: Padronizar rotina de deploy/update para reduzir risco operacional e validar o estado do banco apos cada release.

Requirements covered: MIG-04, OPS-01, OPS-02
Depends on: Phase 9
Plans: 2 plans

Plans:
- [ ] 10-01-PLAN.md - Definir fluxo de update e restart sem loop
- [ ] 10-02-PLAN.md - Criar checklist de verificacao pos-deploy (schema + health)

Success criteria:
1. Stack sobe sem loop de restart em cenario de banco com startup lento
2. Runbook de update permite execucao reproduzivel na VPS
3. Checklist de validacao confirma schema aplicado e API saudavel

---

## Backlog (Future)

- Relatorios e exportacao CSV de orcamentos
- Notificacoes em tempo real (WebSocket) para mudanca de status
- Refactor gradual de quotes.service.ts
- Migrar PDF de Puppeteer para Gotenberg
- Redis para cache do token EFI
- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- Templates de mensagem configuraveis pelo painel
- Historico de mensagens enviados ao cliente

---
Roadmap v1.3 - 2026-05-03
