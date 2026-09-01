---
id: 260820-smb-ip-dinamico
status: complete
description: IP do share SMB de anexos (192.168.3.203) movido de hardcoded para .env via SMB_HOST
date: 2026-08-20
---

# Quick Task 260820-smb-ip-dinamico — IP do SMB dinamico via .env

## Resumo

O IP `192.168.3.203` (servidor do share SMB `\\<ip>\html\Anexo\contapagar`, usado para
gravar anexos de conta a pagar do Athos) estava hardcoded em dois lugares:
`athos-smb.util.ts` (`SMB_SHARE`) e `athos-anexo.util.ts` (`SMB_UNC_ROOT`). Isso impedia
apontar para outro servidor sem alterar codigo — provavel causa raiz do "problema em
mandar anexo" relatado (se o servidor SMB mudou de IP ou esta inacessivel do ambiente
atual, nao havia como reconfigurar via .env).

O IP `192.168.3.198` (banco de referencia read-only do Athos, usado em spikes de
introspecao de `produto_composto`) ja era 100% dinamico via `ATHOS_PG_HOST` em todo o
codebase — nao precisou de mudanca.

## O que foi feito

- `athos-smb.util.ts`: `SMB_SHARE` (const de modulo) virou `getSmbShare()`, montado a
  partir de `getSmbHost()` (le `process.env.SMB_HOST`, default `"192.168.3.203"` para
  nao quebrar ambientes sem a var setada). Usado em `createClient()` e `getSmbDebugInfo()`.
- `athos-anexo.util.ts`: `SMB_UNC_ROOT` (const) virou `getSmbUncRoot()`, mesma logica
  (`process.env.SMB_HOST`, mesmo default). Usado em `buildContaPagarAnexoPaths()` para
  montar o path UNC gravado na tabela `anexo.caminhoanexo`.
- `deploy/stack.env.example`: adicionada `SMB_HOST=192.168.3.203` (mesma secao das
  demais vars `SMB_*`).
- Teste novo em `athos-anexo.util.test.ts` confirmando que `SMB_HOST` customizado reflete
  no `dbFullPath` gerado.

## Decisoes

- Ambos os arquivos (`athos-smb.util.ts` e `athos-anexo.util.ts`) leem a MESMA variavel
  `SMB_HOST` — precisam apontar para o mesmo servidor, ja que um grava fisicamente o
  arquivo (`smbWriteContaPagarFile`) e o outro monta o path UNC que fica salvo no banco
  do Athos (`anexo.caminhoanexo`) para o ERP Windows abrir o arquivo depois.
- Default mantido como `192.168.3.203` (valor atual em producao) para nao quebrar
  ambientes onde a env var ainda nao foi configurada.
- Os exemplos hardcoded no Swagger (`athos.controller.ts`, docstrings/`@ApiResponse`)
  NAO foram alterados — sao apenas texto de documentacao da API, nao configuracao
  funcional.

## Verificacao Automatizada

- `cd apps/backend && npx tsc --noEmit -p tsconfig.build.json` — passou sem erros.
- `cd apps/backend && npx jest athos-anexo.util.test.ts athos.controller.test.ts athos.service.test.ts` — 68/68 testes passaram.

## Pendente (acao humana)

Se o problema real de "manda anexo" for o servidor SMB estar em outro IP/inacessivel
nesse ambiente, definir `SMB_HOST` no `.env` (ou `deploy/stack.env`) com o IP correto e
reiniciar o backend. Isso NAO foi verificado neste quick task (requer acesso real ao
share SMB, fora do alcance do agente).

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/integrations/athos/athos-smb.util.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-anexo.util.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-anexo.util.test.ts
- FOUND: deploy/stack.env.example
- FOUND: .planning/quick/260820-smb-ip-dinamico/SUMMARY.md
