# Phase 9 Research - Fluxo de Migration Idempotente

## Goal

Planejar uma implementacao segura para rodar migrations Prisma em ambiente Docker Compose sem falhas por banco nao pronto ou por atualizacao incremental.

## Findings

### 1. Comando atual no runtime
- Arquivo: apps/backend/Dockerfile
- Runtime usa comando unico com `prisma:generate`, `prisma:deploy` e `start` em sequencia.
- Risco: `prisma migrate deploy` pode iniciar antes de o Postgres aceitar conexoes.

### 2. Compose atual em VPS
- Arquivo: deploy/docker-compose.vps.yml
- `depends_on` existe, mas sem gate de healthcheck para o Postgres.
- Risco: ordem de start nao garante prontidao real do banco.

### 3. Idempotencia de migrations
- `prisma migrate deploy` e apropriado para producao e aplica apenas migrations pendentes.
- Nao deve usar `prisma migrate dev` nem reset em producao.

### 4. Observabilidade de erro
- Sem etapa dedicada de wait, logs misturam falha de conectividade e falha de migration.
- Melhor pratica: script de readiness com timeout e mensagem acionavel.

## Recommended Strategy

1. Inserir wait-for-db explicito antes de migration no bootstrap do backend.
2. Manter `prisma migrate deploy` como unica forma de aplicar migrations em runtime.
3. Adicionar healthcheck no servico Postgres e condicionar backend a esse estado.
4. Padronizar mensagem de erro para diferenciar:
   - banco indisponivel
   - migration com conflito

## Risks and Mitigations

- Risco: loop de restart mascarar causa real.
  - Mitigacao: erro final com texto padrao orientando revisar DATABASE_URL e logs do Postgres.
- Risco: comando de startup muito longo e dificil de manter.
  - Mitigacao: extrair bootstrap para script unico versionado no backend.

## Phase Coverage

- MIG-01: coberto por idempotencia + compose/update seguro
- MIG-02: coberto por wait-for-db + healthcheck
- MIG-03: coberto por mensagens de erro acionaveis

## Out of Scope in Phase 9

- Runbook detalhado e checklist de operacao pos-deploy (Phase 10)
- Mudanca de provider de banco
