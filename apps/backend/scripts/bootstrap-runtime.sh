#!/bin/sh
set -eu

case " ${NODE_OPTIONS-} " in
  *" --openssl-legacy-provider "*)
    ;;
  *)
    export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider"
    ;;
esac

echo "[bootstrap] waiting for PostgreSQL readiness"
node apps/backend/scripts/wait-for-db.js

echo "[bootstrap] running prisma generate"
npm --workspace @orcamento/backend run prisma:generate -- --schema prisma/schema.prisma

echo "[bootstrap] running prisma migrate deploy"
if ! npm --workspace @orcamento/backend run prisma:deploy -- --schema prisma/schema.prisma; then
  echo "MIGRATION_DEPLOY_FAILED: prisma migrate deploy falhou."
  echo "Acao recomendada: revisar migrations pendentes e logs do backend/postgres."
  exit 1
fi

echo "[bootstrap] seeding pdf templates"
npx ts-node --project apps/backend/tsconfig.json apps/backend/scripts/seed-pdf-templates.ts \
  || echo "[bootstrap] seed-pdf-templates falhou ou ts-node nao disponivel — rode manualmente"

echo "[bootstrap] starting backend"
npm --workspace @orcamento/backend run start
