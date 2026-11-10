---
phase: 45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail
plan: 02
subsystem: cobranca
tags: [aviso-vencimento, idempotencia, nestjs, jest, prisma]
requires:
  - phase: 45-01
    provides: util de janelas, orquestrador processarCiclo (tracer), e-mail de aviso, tabela cobrancaAvisoVencimento
provides:
  - orquestrador do aviso completo (retomada atomica, sem_email terminal, cache por cliente, teto e pausa, previa detalhada)
  - testes U1..U7 (util) e S1..S17 (servico)
affects: [45-03, 45-04, 45-05]
tech-stack:
  added: []
  patterns:
    - "reserva (create) antes do envio; retomada de erro por updateMany condicional (compare-and-swap)"
    - "cache de cadastro por cliente por ciclo (Map de Promise)"
key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.util.test.ts
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.service.test.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.service.ts
key-decisions:
  - "Linha em enviando nunca e retomada; se o update para enviado falhar apos o sendMail, a linha fica enviando (nao vira erro) para nunca duplicar o e-mail"
  - "Teto de 100 envios checado antes de ler o cadastro do proximo cliente (so conta tentativas SMTP; dry-run nao conta)"
  - "Pausa de 250 ms depois de cada tentativa de envio real; nunca em dry-run"
requirements-completed: [AVISO-01, AVISO-02, AVISO-04, AVISO-07]
status: complete
commits: 2
plan_head_before: f92e61d705244ef30b758c7bcd35704a5d3b04d2
plan_head_after: 4c894c03ea56d4b6b155e97a9fd90b7e9d1acfdb
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 45 Plan 02: Orquestrador do aviso completo Summary

Orquestrador do aviso de vencimento com retomada atomica de falha SMTP (updateMany condicional, maximo 3 tentativas), cliente sem e-mail registrado uma unica vez, cache de cadastro por cliente, teto de 100 envios com pausa e previa (dry-run) detalhada sem escrita.

## O que foi feito

- **Task 1 (60cf0db):** testes U1..U7 do util (20 casos com a tabela parametrizada) provando janelas disjuntas, datas (virada de mes/ano, 30/02 invalido) e mascara; testes S1..S7 do servico (forma da consulta, fuso 23:30 de Sao Paulo, catch-up so do A+7, cache, teto, pausa, defesa no laco). Servico: cache `Map<cliente, Promise>`, teto `AVISO_MAX_ENVIOS_POR_CICLO` com `warn` "teto", `aguardar(AVISO_INTERVALO_ENVIO_MS)` apos cada envio, `warn` quando a consulta devolve 500 candidatos.
- **Task 2 (4c894c0):** `reservar()` (create -> P2002 -> findUnique -> updateMany condicional), `podeRetomar()`, linha `sem_email` terminal (tentativas 0, erro = motivo), `lookup: "falha"` nao grava nada, um warn por cliente por ciclo, erro de envio saneado (regex de e-mail removido, 300 chars), previa com log `[dry-run] boleto=.. tipo=.. dias=.. destinatario=<mascarado> cc=<n>`; testes S8..S17.

## Verificacao (saida real)

- `npm --prefix apps/backend run test -- cobranca-aviso-vencimento --no-coverage`: 3 suites, 46 passed (7 tracer + 20 util + 19 servico; S8 e parametrizado em 3 casos e U1 em 14).
- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 14 suites, 199 passed.
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: sem erros.
- ESLint nao executado: o repo nao tem `eslint.config.*` (ESLint 10 recusa rodar).

## Deviations from Plan

**1. [Rule 3 - Blocking] Base do worktree desatualizada**
- HEAD estava em f2ea8ed (arvore limpa); executado `git reset --hard f92e61d` conforme instrucao do orquestrador.

**2. [Rule 3 - Blocking] node_modules**
- `apps/backend/node_modules` so contem `@types`; as dependencias estao hoistadas em `/root/SistemaOrcamento/node_modules`. Criado `node_modules/` na raiz do worktree com symlink por entrada, copiando `.prisma`, `@prisma` e `prisma` (gerado ja contem `CobrancaAvisoVencimento`, nao foi necessario `prisma generate`). Nao versionado.

**3. [Rule 2 - Robustez] Falha ao gravar "enviado" apos o sendMail**
- O codigo de 45-01 colocava `sendMail` e `update enviado` no mesmo `try`: se o update falhasse, a linha virava `erro` e seria retomada, duplicando o e-mail. Separados: falha do update apos envio apenas loga e deixa a linha `enviando` (nunca retomada). Falha ao gravar `erro` tambem so loga.

**4. Ledger de commits**
- O arquivo-ledger de HEAD inicial nao foi criado (comando recusado pela guarda de worktree); `plan_head_before` e o SHA de reset f92e61d conhecido, `commits` medido por `git rev-list --count f92e61d..HEAD` = 2.

**5. TDD RED nao observado para o util**
- O util ja existia correto desde 45-01; os testes U1..U7 passaram de primeira (nenhum ajuste de util necessario). Para o servico, os testes S1..S7 passaram com a implementacao da Task 1 escrita antes dos testes de forma incremental.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum: sem novos endpoints, escrita no Athos ou acesso a arquivos. Mitigacoes T-45-09..T-45-12 cobertas por S3, S5, S6, S10..S15, S13 e S17.

## Self-Check: PASSED

- Arquivos: util.test.ts, service.test.ts, service.ts presentes; commits 60cf0db e 4c894c0 no historico do worktree.
