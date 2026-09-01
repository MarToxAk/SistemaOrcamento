---
id: 260901-mrr
status: complete
description: Corrigir bug de anexo Athos - SMB_HOST nao chegava ao container + IP de producao estava errado
date: 2026-09-01
---

# Quick Task 260901-mrr — SMB_HOST ponta a ponta + IP corrigido

## Resumo

O erro de producao (`ETIMEDOUT 192.168.3.203:445` ao anexar conta a pagar 519) tinha
DUAS causas independentes, ambas resolvidas nesta task:

1. **Bug de codigo/deploy (novo, encontrado nesta investigacao):** `deploy/docker-compose.vps.yml`
   repassava `SMB_USER`, `SMB_PASS` e `SMB_DOMAIN` ao container do backend, mas **nao repassava
   `SMB_HOST`**. Ou seja, mesmo com `SMB_HOST` definido em `deploy/stack.env` (feito na quick task
   `260820-smb-ip-dinamico`), o valor nunca chegava ao processo Node em producao — o backend caia
   sempre no default hardcoded `192.168.3.203`. Todo o trabalho da task 260820 estava inerte no
   caminho de deploy.
2. **IP errado (causa raiz real do ETIMEDOUT):** o IP configurado em todo lugar
   (`192.168.3.203`) estava incorreto. O IP correto do servidor de anexos e `192.168.33.203`
   (dígito extra "3"). Confirmado com `Test-NetConnection -ComputerName 192.168.33.203 -Port 445`
   → `TcpTestSucceeded: True`.

## O que foi feito

- `deploy/docker-compose.vps.yml`: adicionado `SMB_HOST: ${SMB_HOST}` ao bloco `environment:`
  do servico `backend`, junto das demais vars `SMB_*`.
- `apps/backend/src/modules/integrations/athos/athos-smb.util.test.ts` (novo): 3 casos
  provando que `SMB_HOST` controla `getSmbDebugInfo().share` (a conexao SMB2 real, nao so o
  path UNC gravado no banco) — fechando uma lacuna Nyquist que a task 260820 tinha deixado
  (so testou `getSmbUncRoot()`).
- `.env.example` (raiz): documentado o bloco `SMB_HOST`/`SMB_USER`/`SMB_PASS`/`SMB_DOMAIN`/
  `ATHOS_SMB_MOUNT_PATH` com comentario explicando o proposito.
- `.env` (raiz, gitignored, nao versionado): `SMB_HOST=192.168.33.203` declarado explicitamente.
- `deploy/stack.env` (producao, gitignored, nao versionado): `SMB_HOST` corrigido de
  `192.168.3.203` para `192.168.33.203`.

## Verificacao Automatizada

- `cd apps/backend && npx jest athos-smb.util.test.ts athos-anexo.util.test.ts` — 8/8 passaram.
- `grep SMB_HOST deploy/docker-compose.vps.yml` — confirma repasse ao container.
- `git check-ignore -q .env && git check-ignore -q deploy/stack.env` — ambos permanecem fora
  do versionamento; nenhum segredo foi impresso no transcript ou commitado.

## Verificacao Manual (checkpoint humano resolvido)

- `Test-NetConnection -ComputerName 192.168.33.203 -Port 445` → `TcpTestSucceeded: True`.
- IP correto fornecido pelo usuario e aplicado em `.env` e `deploy/stack.env`.

## Fora de Escopo (infraestrutura)

Nao aplicavel mais: o que parecia ser um problema de infra inacessivel (`ETIMEDOUT`) era, na
verdade, o IP configurado errado (`192.168.3.203` em vez de `192.168.33.203`). Com o IP correto,
a porta 445 esta acessivel a partir deste ambiente.

## Pendente (acao humana)

- Reiniciar o backend em producao para aplicar `deploy/stack.env`:
  `docker compose -f deploy/docker-compose.vps.yml up -d backend`
- Reenviar o anexo da conta a pagar 519 apos o restart para confirmar fim-a-fim.
- Reiniciar o backend local (processo Nest) para aplicar o novo `.env`.

## Nota sobre execucao

O executor rodou em worktree isolado (`isolation="worktree"`). O worktree havia sido criado a
partir de um `origin/HEAD` desatualizado em relacao a branch de trabalho local
(`fix/orcamento-total-desconto-zerado`), causando conflitos extensos e nao relacionados
(cobranca, nfse, prisma schema) num `git merge --no-ff` direto. Resolvido com
`git cherry-pick` dos dois commits relevantes (`439818b`, `7097fbf`) direto sobre o HEAD atual,
sem conflitos. O worktree e a branch temporaria foram removidos apos o cherry-pick.

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/integrations/athos/athos-smb.util.test.ts
- FOUND: deploy/docker-compose.vps.yml (SMB_HOST presente)
- FOUND: .env.example (bloco SMB documentado)
- CONFIRMED: .env e deploy/stack.env atualizados com IP correto (nao versionados)
