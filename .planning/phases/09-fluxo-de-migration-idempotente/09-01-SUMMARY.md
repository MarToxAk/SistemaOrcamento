# 09-01 SUMMARY - Bootstrap runtime com wait-for-db

## Status
COMPLETE

## Artifacts Created / Modified
- apps/backend/scripts/wait-for-db.js
- apps/backend/scripts/bootstrap-runtime.sh
- apps/backend/Dockerfile

## Changes Delivered
- Adicionado readiness check do Postgres com timeout e retry via WAIT_FOR_DB_TIMEOUT_MS e WAIT_FOR_DB_INTERVAL_MS.
- Fluxo de startup passou a falhar com mensagem acionavel em casos de banco indisponivel.
- Dockerfile runtime agora copia scripts do backend, aplica permissao de execucao e inicia via bootstrap-runtime.sh.
- Comando de migration em producao permaneceu prisma migrate deploy.

## Decisions Honored
- D-01: manter Prisma migrate deploy em producao.
- D-02: corrigir startup no Docker/Compose sem trocar plataforma.
- D-03: erro de migration/readiness com mensagem tecnica acionavel.
- D-04: sem comandos destrutivos de banco.

## Verification
- Select-String wait-for-db: DB_READINESS_FAILED, WAIT_FOR_DB_TIMEOUT_MS e process.exit(1) encontrados.
- Select-String Dockerfile/bootstrap: bootstrap-runtime.sh, wait-for-db.js, prisma:deploy e chmod +x encontrados.
- Build backend: npm --workspace @bomcusto/backend run build concluido sem erros.
