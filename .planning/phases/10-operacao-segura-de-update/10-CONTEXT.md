# Phase 10: Operacao Segura de Update - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning
**Source:** /gsd-plan-phase 10

<domain>
## Phase Boundary

Padronizar a operacao de update em VPS para reduzir risco de restart em loop e garantir verificacao objetiva do estado do backend e do schema apos cada release.
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- D-01: Fase 10 deve transformar o update operacional em procedimento reprodutivel (runbook versionado no repositorio).
- D-02: Validacao pos-deploy deve incluir saude da API e estado de migration/schema.
- D-03: O fluxo deve ser executavel com Docker Compose atual, sem migrar stack para outra plataforma.
- D-04: Em caso de falha, o procedimento deve indicar rollback tatico e coleta de logs minimos para diagnostico.

### Claude's Discretion
- Definir formato do runbook (markdown + comandos shell) mantendo foco em operacao manual assistida.
- Definir checklist automatizavel em script ou comandos documentados para verificacao rapida.
</decisions>

<canonical_refs>
## Canonical References

### Dependencias da fase
- .planning/phases/09-fluxo-de-migration-idempotente/09-VERIFICATION.md - resultado e limitacoes da fase anterior.
- .planning/phases/09-fluxo-de-migration-idempotente/09-UAT.md - evidencias de testes e item de cold start pendente.

### Configuracao de deploy
- deploy/docker-compose.vps.yml - composicao atual da stack em producao.
- deploy/stack.env.example - variaveis exigidas para startup e readiness.
- README.md - secao de deploy atual usada pela operacao.

### Escopo oficial
- .planning/ROADMAP.md - objetivo e sucesso da fase 10.
- .planning/REQUIREMENTS.md - requisitos MIG-04, OPS-01, OPS-02.
</canonical_refs>

<specifics>
## Specific Ideas

- Criar runbook de update com fluxo principal, rollback e troubleshooting rapido.
- Definir checklist pos-deploy com comandos de health, logs e verificacao de migrations aplicadas.
- Incluir criterio claro para detectar/reagir a restart loop apos deploy.
</specifics>

<deferred>
## Deferred Ideas

- Automacao completa de deploy com rollback automatico.
- Migracao de stack para orquestrador diferente de Docker Compose.
</deferred>

---
*Phase: 10-operacao-segura-de-update*
*Context gathered: 2026-05-03 via plan-phase*
