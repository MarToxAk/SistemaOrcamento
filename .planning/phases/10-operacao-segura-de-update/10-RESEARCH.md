# Phase 10 Research - Operacao Segura de Update

## Goal

Definir abordagem pratica para update em VPS com Docker Compose, evitando loop de restart e formalizando verificacao pos-release.

## Inputs Considered

- deploy/docker-compose.vps.yml com healthcheck no Postgres e depends_on condicional no backend.
- bootstrap runtime do backend introduzido na fase 9 (wait-for-db + migrate deploy + start).
- limitacao registrada na fase 9: cold start end-to-end nao executado no ambiente de desenvolvimento atual.

## Findings

### 1. Risco principal residual (MIG-04)
Mesmo com readiness gate, ainda existe risco operacional de restart em loop por:
- variavel de ambiente incorreta,
- falha de conectividade externa,
- migration inconsistente no startup.

### 2. Gap operacional (OPS-01)
README tem orientacao geral de deploy, mas nao traz runbook passo a passo com:
- pre-check,
- update,
- validacao,
- rollback tatico.

### 3. Gap de verificacao (OPS-02)
Falta checklist padronizado para confirmar rapidamente:
- containers up e saudaveis,
- health endpoint do backend,
- logs sem erro critico,
- migrations no estado esperado.

## Recommended Planning Strategy

1. Plano 10-01 (wave 1): consolidar runbook operacional versionado em `deploy/` e alinhar referencia no README.
2. Plano 10-02 (wave 2): criar checklist pos-deploy executavel (script + comandos) e integrar no runbook.

## Validation Targets

- MIG-04: procedimento explicito para detectar e tratar loop de restart.
- OPS-01: runbook reproduzivel com comandos ordenados e criterios de sucesso/falha.
- OPS-02: checklist com saidas esperadas para health/schema.

## Risks and Mitigations

- Risco: runbook desatualizado em relacao ao compose.
  - Mitigacao: apontar comandos para arquivos canonical (`deploy/docker-compose.vps.yml`, `deploy/stack.env.example`).

- Risco: checklist depende de ferramenta ausente no host.
  - Mitigacao: fornecer comandos fallback (docker compose + curl + logs) e saidas esperadas.

## Out of Scope in Phase 10

- Deploy totalmente automatico com rollback inteligente.
- Mudancas arquiteturais fora do fluxo operacional (schema/modelo de dados).
