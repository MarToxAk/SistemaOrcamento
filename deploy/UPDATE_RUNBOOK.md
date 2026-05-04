# Runbook de Update - Stack VPS

## Pre-check

1. Confirmar acesso ao host VPS e permissao para executar Docker.
2. Confirmar que o arquivo de ambiente da stack esta atualizado.
3. Confirmar imagem alvo de backend/frontend e disponibilidade no registry.
4. Validar stack atual:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=80`

Criterio de falha imediata:
- Container backend em restart loop antes do update.
- Erros recorrentes de banco/rede nos logs sem acao de mitigacao definida.

## Update passo a passo

1. Atualizar imagens:
   - `docker compose -f deploy/docker-compose.vps.yml pull`
2. Aplicar update da stack:
   - `docker compose -f deploy/docker-compose.vps.yml up -d`
3. Verificar estado dos containers:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
4. Inspecionar logs do backend apos subida:
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=120`

Criterio de sucesso:
- Backend e frontend em estado running.
- Sem erro `DB_READINESS_FAILED` ou `MIGRATION_DEPLOY_FAILED` nos logs do backend.

## Validacao imediata

1. Confirmar backend ativo via endpoint de health:
   - `curl -i http://localhost:4001/health`
   - fallback: `curl -i http://localhost:4001/api/health`
2. Confirmar que nao ha loop de restart:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
3. Confirmar logs sem erro critico de startup/migration:
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=120`

## Rollback tatico

Quando usar:
- Backend em loop de restart apos update.
- Falha de migration nao transitiva apos tentativas de recovery.

Passos:
1. Ajustar `BACKEND_IMAGE` e `FRONTEND_IMAGE` para ultima tag estavel conhecida no arquivo de ambiente.
2. Reaplicar stack:
   - `docker compose -f deploy/docker-compose.vps.yml pull`
   - `docker compose -f deploy/docker-compose.vps.yml up -d`
3. Revalidar:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=120`

## Troubleshooting rapido

- Erro de readiness (`DB_READINESS_FAILED`):
  - Revisar `DATABASE_URL`, status do Postgres e conectividade de rede interna.
- Erro de migration (`MIGRATION_DEPLOY_FAILED`):
  - Revisar migrations pendentes e logs do backend para detalhe tecnico.
- Health endpoint sem 200:
  - Verificar se backend iniciou completamente e se a rota de health esta acessivel.

## Checklist pos-deploy

1. Executar script de verificacao:
   - `powershell -ExecutionPolicy Bypass -File scripts/verify-deploy-health.ps1`
2. Esperado:
   - containers essenciais running
   - logs sem `DB_READINESS_FAILED` e `MIGRATION_DEPLOY_FAILED`
   - endpoint health com HTTP 200
