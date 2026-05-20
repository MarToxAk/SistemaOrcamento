#!/bin/sh
set -eu

echo "[bootstrap] waiting for PostgreSQL readiness"
node apps/backend/scripts/wait-for-db.js

echo "[bootstrap] running prisma generate"
npm --workspace @bomcusto/backend run prisma:generate -- --schema prisma/schema.prisma

echo "[bootstrap] running prisma migrate deploy"
if ! npm --workspace @bomcusto/backend run prisma:deploy -- --schema prisma/schema.prisma; then
  echo "MIGRATION_DEPLOY_FAILED: prisma migrate deploy falhou."
  echo "Acao recomendada: revisar migrations pendentes e logs do backend/postgres."
  exit 1
fi

echo "[bootstrap] starting backend"
npm --workspace @bomcusto/backend run start
