#!/bin/sh
set -eu

if [ -n "${SMB_USER:-}" ] && [ -n "${SMB_PASS:-}" ] && [ -n "${ATHOS_SMB_MOUNT_PATH:-}" ]; then
  echo "[bootstrap] montando SMB share em ${ATHOS_SMB_MOUNT_PATH}"
  mkdir -p "${ATHOS_SMB_MOUNT_PATH}"
  if mount -t cifs //192.168.3.203/html/Anexo/contapagar "${ATHOS_SMB_MOUNT_PATH}" \
    -o "username=${SMB_USER},password=${SMB_PASS},vers=3.0,uid=1000,gid=1000,iocharset=utf8,file_mode=0664,dir_mode=0775"; then
    echo "[bootstrap] SMB share montado com sucesso"
  else
    echo "[bootstrap] AVISO: falha ao montar SMB share — uploads de anexos nao funcionarao"
  fi
else
  echo "[bootstrap] SMB_USER/SMB_PASS/ATHOS_SMB_MOUNT_PATH nao definidos — ignorando mount SMB"
fi

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
