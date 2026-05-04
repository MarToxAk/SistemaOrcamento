# Milestones - Sistema de Orcamento BomCusto

---

## v1.0 - MVP: Seguranca, Confiabilidade e UX

Shipped: 2026-05-02
Phases: 1-5 | Plans: 8

Delivered: Sistema seguro, com integracoes confiaveis, UX polida e fluxo de aprovacao do cliente.

Archive: .planning/milestones/v1.0-ROADMAP.md

---

## v1.1 - Aprovacao de Orcamento com Associacao Athos

Shipped: 2026-05-03
Phases: 6 | Plans: 4

Delivered: Fluxo completo de aprovacao de orcamento via link publico integrado ao Athos.

Archive: .planning/milestones/v1.1-ROADMAP.md

---

## v1.2 - Mensagens e UX do Cliente

Shipped: 2026-05-03
Phases: 7-8 | Plans: 4

Delivered: Mensagens automaticas Chatwoot por eventos de orcamento e redesign das paginas publicas de aprovacao/status.

Archive: .planning/milestones/v1.2-ROADMAP.md

---

## v1.3 - Estabilidade de Migrations no Docker Compose

Shipped: 2026-05-03
Phases: 9-10 | Plans: 4

Delivered: Eliminado race condition de migration no Docker Compose com readiness check, bootstrap deterministico e runbook operacional de update com script de verificacao pos-deploy.

Key accomplishments:
- wait-for-db.js garante que o banco aceita conexoes antes de qualquer step de migration
- bootstrap-runtime.sh padroniza sequencia de startup do backend em producao
- Healthcheck pg_isready no compose com gate service_healthy para o backend
- UPDATE_RUNBOOK.md com fluxo reproduzivel de update/rollback para VPS
- verify-deploy-health.ps1 verifica status, logs criticos e health endpoint pos-deploy

Archive: .planning/milestones/v1.3-ROADMAP.md

---

## v1.3 - Estabilidade de Migrations no Docker Compose

Shipped: 2026-05-03
Phases: 9-10 | Plans: 4

Delivered: Eliminado race condition de migration no Docker Compose com readiness check, bootstrap deterministico e runbook operacional de update com script de verificacao pos-deploy.

Key accomplishments:
- wait-for-db.js garante que o banco aceita conexoes antes de qualquer step de migration
- bootstrap-runtime.sh padroniza sequencia de startup do backend em producao
- Healthcheck pg_isready no compose com gate service_healthy para o backend
- UPDATE_RUNBOOK.md com fluxo reproduzivel de update/rollback para VPS
- verify-deploy-health.ps1 verifica status, logs criticos e health endpoint pos-deploy

Archive: .planning/milestones/v1.3-ROADMAP.md
