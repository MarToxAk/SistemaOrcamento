---
slug: docker-smb-mount-fix
date: 2026-05-20
status: complete
---

# Resumo — Upload de anexo Athos em Docker com Samba

## O que foi feito

- Backend ajustado para priorizar escrita em filesystem montado quando `ATHOS_SMB_MOUNT_PATH` estiver definido.
- Integração SMB2 via `SMB_USER`/`SMB_PASS` permanece como fallback apenas quando não existe mount path configurado.
- Compose de deploy atualizado para injetar `ATHOS_SMB_MOUNT_PATH` no backend e mapear bind mount host->container.
- `stack.env.example` atualizado com `ATHOS_SMB_HOST_MOUNT_PATH` e `ATHOS_SMB_MOUNT_PATH`.

## Arquivos alterados

- `apps/backend/src/modules/integrations/athos/athos-anexo.util.ts`
- `apps/backend/src/modules/integrations/athos/athos.service.ts`
- `deploy/docker-compose.vps.yml`
- `deploy/stack.env.example`

## Validacao

- Testes focados do modulo Athos executados com sucesso.
- Resultado observado: `Pass: 35, Fail: 0`.
