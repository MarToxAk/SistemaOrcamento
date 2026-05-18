---
slug: docker-smb-mount-fix
date: 2026-05-18
status: in-progress
---

# Upload SMB não funciona em Docker (Linux)

## Diagnóstico

**Causa raiz 1:** `athos-anexo.util.ts` usa `path.win32.join()` e `\\\\192.168.3.203\\html\\...`
(UNC path Windows). Em Linux, `fs.mkdir("\\\\...")` tenta criar diretório local — não acessa o share SMB.

**Causa raiz 2:** No Docker, o share SMB não está montado como filesystem dentro do container.
Mesmo com acesso de rede (Tailscale), `node:fs` não resolve UNC paths no Linux.

**Invariante:** O Athos ERP (Windows) precisa do path UNC `\\192.168.3.203\html\Anexo\contapagar\{id}\{file}`
armazenado na tabela `anexo.caminhoanexo`. Logo, o path de escrita (Docker/Linux) e o path do banco (UNC) devem ser diferentes.

## Solução

1. `athos-anexo.util.ts` — separar `writeDirectoryPath`/`writeFullPath` (Linux) de `dbFullPath` (UNC para banco)
2. `athos.service.ts` — usar write paths para `mkdir`/`writeFile`, `dbFullPath` para INSERT
3. `docker-compose.vps.yml` — adicionar volume CIFS montado em `/mnt/samba/contapagar`
4. `stack.env.example` — documentar variáveis `SMB_USER`, `SMB_PASS`, `ATHOS_SMB_MOUNT_PATH`

## Variáveis de ambiente

- `ATHOS_SMB_MOUNT_PATH` — path Linux dentro do container (ex: `/mnt/samba/contapagar`).
  Quando ausente (dev Windows), usa o UNC path diretamente.
