---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 07
subsystem: infra
tags: [homologacao, migration, prisma, efi, athos-teste, boleto, release-gate]

requires:
  - phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
    provides: "50-01..50-06: previa e geracao do boleto atualizado, baixa Athos com encargos, taxas padrao, e-mail e tela do operador"
provides:
  - "Gates da fase verdes (suite backend, tsc backend/frontend, next build, prisma validate)"
  - "Migration 20261117120000 validada num Postgres descartavel local (aplicacao real + reaplicacao idempotente + diff com o schema)"
  - "50-ROTEIRO-HOMOLOGACAO.md: roteiro passo a passo da homologacao D-17 com travas de seguranca"
  - "Registro da homologacao D-17 (aprovada) e da decisao de liberacao em producao (liberar)"
affects: []

actuals:
  tokens: 4200
  tasks: 3
  commits: 1
plan_head_before: 10f20630af0cb78ffc58265f248ec212aa1fd4eb
plan_head_after: 2ada51737f0fccb14b030e434c931e5739cdaa21

key-files:
  created:
    - .planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-ROTEIRO-HOMOLOGACAO.md
  modified: []

key-decisions:
  - "Decisao de liberacao em producao (Task 3, 2026-11-17): LIBERAR. O merge e o deploy sao feitos pelo usuario; nenhum agente faz deploy."
  - "A3, A5 e A5b nao foram confirmadas formalmente na homologacao; o usuario aceitou esse risco ao liberar."

patterns-established:
  - "Migration validada em container Postgres descartavel (127.0.0.1:5450) com URL conferida antes de qualquer comando Prisma, nunca nos bancos em uso"

requirements-completed: [BA-11]

status: complete
---

# Phase 50 Plan 07: Homologacao e liberacao Summary

**Gates verdes, migration 20261117120000 validada num Postgres descartavel local, roteiro de homologacao D-17 entregue, homologacao aprovada pelo usuario e liberacao em producao decidida ("liberar"), com A3/A5/A5b nao confirmadas formalmente.**

## Performance

- **Tasks:** 3 (1 auto, 1 checkpoint:human-verify, 1 checkpoint:decision)
- **Commits:** 1 de codigo/docs do plano (roteiro) mais o commit final de docs do plano

## Accomplishments

- **Gates:** suite backend 1171 passed, 28 skipped, 0 failed (piso 1141); `tsc --noEmit` backend e frontend com exit 0; `next build` do frontend com exit 0; `prisma validate` valido.
- **Migration:** container novo `orcamento-homolog-fase50` em `127.0.0.1:5450` (postgres:16-alpine). `prisma migrate deploy` aplicou todas as migrations, inclusive `20261117120000_add_cobranca_boleto_atualizado`. A reaplicacao so do SQL da Fase 50 com `ON_ERROR_STOP=1` terminou sem erro (idempotente). A query de colunas retornou 17 (esperado 17). Nenhum banco em uso (5435, 5438) nem Athos de producao foi tocado.
- **migrate diff x schema:** nenhum objeto da Fase 50 aparece. A unica diferenca e pre-existente e sem relacao com a fase: `ALTER COLUMN ... DROP DEFAULT` em `CobrancaEmailEnvio.nfseEmitidaIds` e `nfeNumeros`.
- **Roteiro:** `50-ROTEIRO-HOMOLOGACAO.md` com travas de seguranca, subida do ambiente local (banco 5450 e clone `athos-teste` 127.0.0.1:5440), massa de teste, passos, SQL de conferencia no clone, tabela esperado x obtido e limpeza.

## Task Commits

1. **Task 1: gates, migration descartavel e roteiro** - `2ada517` (docs)
2. **Task 2: homologacao D-17** - checkpoint humano, sem commit
3. **Task 3: decisao de liberacao** - checkpoint de decisao, sem commit

## Homologacao D-17 (Task 2)

Homologacao D-17 aprovada pelo usuario em 2026-11-17 (resposta: 'aprovado'); tabela esperado x obtido e marcacoes A3/A5/A5b nao foram informadas.

Consequencia registrada: as hipoteses da pesquisa **A3** (EFI aceita vencimento hoje), **A5** (Athos aceita juros/multa/atraso gravados) e **A5b** (nomes dos itens "Juros de mora" e "Multa por atraso" na EFI) **nao foram confirmadas formalmente** na homologacao. Nenhum resultado foi inferido nem inventado.

## Decisao de liberacao em producao (Task 3)

- **Decisao: `liberar`** (usuario, 2026-11-17).
- O usuario aceitou o risco conhecido de que A3, A5 e A5b nao foram confirmadas formalmente.
- **Merge e deploy sao feitos pelo usuario.** Nenhum agente fez deploy, merge, reinicio de container ou acesso a banco/container de producao.
- Ao fazer o deploy: a migration `20261117120000` e aplicada no banco de producao via `prisma migrate deploy` no bootstrap do backend; a tela `/configuracoes/cobranca` passa a valer (taxas padrao 0,99% a.m. e multa 2%); o botao "Atualizar" passa a criar boletos reais e a cancelar os originais na EFI (definitivo); a baixa Athos grava juros, multa e atraso do snapshot quando `ATHOS_BAIXA_AUTO` esta ligado.
- Sugestao de acompanhamento pos-deploy (nao exigida): no primeiro uso real, conferir o boleto novo na EFI e a baixa no Athos, ja que A3/A5/A5b ficam como pontos a observar.

## Limpeza pendente

O usuario nao pediu remocao, entao ficam de pe e precisam ser removidos por ele quando quiser:

- Container descartavel `orcamento-homolog-fase50` (127.0.0.1:5450): `docker rm -f orcamento-homolog-fase50`.
- Clone `athos-teste` (127.0.0.1:5440), opcional: `docker stop athos-teste`.

## Deviations from Plan

None - o plano foi executado como escrito. Os checkpoints foram tratados como pedido (Task 2 aprovada, Task 3 decidida pelo usuario).

## Known Stubs

None.

## Threat Flags

None.

## Issues Encountered

None.

## Self-Check: PASSED

- Roteiro existe: `.planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-ROTEIRO-HOMOLOGACAO.md`.
- Commit `2ada517` e ancestral de HEAD.
- Container `orcamento-homolog-fase50` publicado so em `127.0.0.1:5450`.
