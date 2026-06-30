# Phase 9: Fluxo de Migration Idempotente - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning
**Source:** /gsd-plan-phase 9

<domain>
## Phase Boundary

Corrigir o fluxo de startup do backend em container para evitar falha de migration durante update do Docker Compose. O resultado esperado e que migrations rodem apenas quando o banco estiver pronto, de forma idempotente e com logs acionaveis.
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- D-01: Manter Prisma como mecanismo de migration (`prisma migrate deploy`) sem reset de banco.
- D-02: Corrigir problema no fluxo Docker/Compose atual, sem migrar para outra plataforma de deploy.
- D-03: Falhas de migration devem retornar log tecnico claro com acao recomendada.
- D-04: Nao usar comandos destrutivos em producao (sem `prisma migrate reset`, sem drop de schema).

### Claude's Discretion
- Definir formato do script de readiness (shell ou node) desde que funcione no runtime atual.
- Definir local exato do run command/entrypoint no backend para maximizar observabilidade.
</decisions>

<canonical_refs>
## Canonical References

### Deploy e runtime
- deploy/docker-compose.vps.yml - Orquestracao dos servicos em producao.
- apps/backend/Dockerfile - Comando de startup do backend no container.
- apps/backend/package.json - Scripts Prisma e start usados no runtime.

### Escopo de fase
- .planning/ROADMAP.md - Fase 9 e requisitos MIG-01, MIG-02, MIG-03.
- .planning/REQUIREMENTS.md - Requisitos do milestone v1.3.
</canonical_refs>

<specifics>
## Specific Ideas

- Adicionar etapa explicita de wait-for-db antes do `prisma migrate deploy`.
- Garantir que timeout de readiness gere erro explicito e facil de diagnosticar.
- Adicionar healthcheck no Postgres para sincronizar startup no compose.
</specifics>

<deferred>
## Deferred Ideas

- Runbook operacional completo de update (fica para fase 10).
- Checklist pos-deploy com verificacao manual detalhada (fica para fase 10).
</deferred>

---
*Phase: 09-fluxo-de-migration-idempotente*
*Context gathered: 2026-05-03 via plan-phase*
