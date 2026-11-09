---
phase: 44-api-de-cria-o-de-or-amento-no-athos-para-ia
plan: 01
subsystem: api
tags: [nestjs, athos, postgres-9.0.5, orcamento, bigint, tdd, integration-test]
status: complete
requires:
  - phase: 43
    provides: sanitizarTextoAthos, padrao de pool/assertHostPermitido/mapearErroPg (somente leitura, nao alterado)
provides:
  - POST /api/athos/orcamentos (orcamento + orcamento_item + 1 linha PIX em transacao unica)
  - AthosOrcamentoService, OrcamentoAthosError, resolverConfigOrcamentoAthos, montarObsOrcamento
  - athos-orcamento-calc.util (aritmetica inteira: paraMilli, linhaCentavos, ratear, percentualMilli, calcularOrcamento)
  - IT HTTP real no clone athos-teste gated por ATHOS_IT_CLONE=1
affects: [44-02, 44-03, 44-04]
tech-stack:
  added: []
  patterns:
    - "Dinheiro em BigInt: milesimos (preco/quantidade) e centavos (linhas/totais), half-up por linha"
    - "Leituras e validacoes antes do primeiro INSERT (RULE de INSERT em orcamento trava conf_inicial)"
    - "Flag de escrita desligada por padrao + trava de host em NODE_ENV=test + IT com trava dupla host/porta/db"
key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.test.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.controller.ts
    - apps/backend/src/modules/integrations/athos/dto/create-athos-orcamento.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.clone.it.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.module.ts
key-decisions:
  - "Flag ATHOS_ORCAMENTO_ESCRITA e checada ANTES de resolver as demais envs: ambiente com escrita desligada responde sempre 503 ESCRITA_DESABILITADA (D-03), mesmo sem os ids do autor definidos"
  - "O servico tambem recusa (422 VALOR_INVALIDO) campos de 44-02 (idcliente, descontoTotalRS, simular, valorUnitario, descontoRS) em vez de ignora-los; o DTO ja os recusa com 400"
  - "AthosOrcamentoService implementa OnModuleDestroy e encerra o pool pg (sem isso o Jest ficava com handle aberto apos o IT)"
  - "Servico usa os primitivos do util (linhaCentavos etc.); a troca para calcularOrcamento fica para 44-02, quando desconto entrar"
requirements-completed: [ORC-02, ORC-03, ORC-04, ORC-05, ORC-08, ORC-10]
duration: ~35min
completed: 2026-11-09
estimate:
  tokens: 95000
  raw_tokens: 95000
  tasks: 2
  confidence: low
actuals:
  tokens: 14500
  tasks: 2
  commits: 4
plan_head_before: 0f194b97b76d8853897a16db433371e94013edfa
plan_head_after: f813b4433e6d96df8cc76f6a7e4be091cea43ea2
---

# Phase 44 Plan 01: Orcamento ponta a ponta no Athos para IA Summary

POST /api/athos/orcamentos grava, em uma unica transacao no clone athos-teste, cabecalho + itens pelo preco do Athos + uma linha de pagamento PIX, com aritmetica monetaria inteira (BigInt) e escrita desligada por padrao.

## O que foi entregue

- **Task 1 (tracer)**: DTO, controller (`athos/orcamentos`, guard global `x-internal-api-key`, `@Throttle(THROTTLE_SENSITIVE)`), `AthosOrcamentoService` e registro no `AthosModule`. Sequencia SQL da secao interfaces do plano: `BEGIN`, `SET LOCAL statement_timeout = 15000`, LER_CONFIG, LER_PRODUTOS, `INSERT orcamento ... RETURNING idorcamento, senhabalcao`, N x `INSERT orcamento_item`, `DELETE`+`INSERT orcamento_forma_pagamento`, `COMMIT`. Erros `{statusCode, codigo, mensagem, detalhes?}`; `mapearErroPg` (42501 com GRANT sugerido, 22003, 57014, demais ERRO_BANCO sem texto do driver).
- **Task 2 (TDD)**: `ratear` (maior resto, empate para a linha mais ao fim), `percentualMilli`/`percentualTexto`, `calcularOrcamento` (preco abaixo do cadastro vira desconto, limites de linha/global/percentual por comparacao exata em inteiros, `VALOR_FORA_DO_LIMITE`). 29 testes com os casos-ouro 25378 (2.28/0.70, 35.059) e 25483 (0.023).

## Verificacao

| Verificacao | Resultado |
|---|---|
| IT no clone (`athos-orcamento.clone`, ATHOS_IT_CLONE=1) | 2 passed, 0 skipped |
| `athos-orcamento` (IT + calc) | 2 suites, 31 passed |
| `athos-orcamento-calc` | 29 passed (minimo 20) |
| `npm --prefix apps/backend run test -- athos` (sem ATHOS_IT_CLONE) | 25 suites passed + 1 skipped (IT); 452 passed, 2 skipped (baseline 423; +29 do calc) |
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| `grep -rliE 'INSERT INTO orcamento'` (fora de testes) | somente `athos-orcamento.service.ts` |
| IPs de producao / senha do clone nos arquivos novos | nenhum (grep exit 1) |
| Fase 43 (`athos-conta-receber-baixa.*`) vs d006b37 | sem diferenca |
| util sem import de Nest/pg/Prisma; sem parseFloat/Math.round | 0 ocorrencias |
| Orcamentos `[IA]%` remanescentes no clone apos IT | 0 (afterAll limpa pelos ids criados) |

Nenhuma conexao com o Athos original; escrita somente no clone 127.0.0.1:5440/athos.

## Decisions Made

Ver `key-decisions` no frontmatter.

## Deviations from Plan

### Auto-fixed / ajustes

**1. [Rule 3 - Bloqueio] Worktree sem os planos da Fase 44**
- **Found during:** inicio da execucao
- **Issue:** o worktree partiu de `f2ea8ed` (main) e o commit `ab4b325` com os planos estava so na branch `feat/fase-42-43-cc-email-baixa-athos`; `.planning/phases/44-*` nao existia.
- **Fix:** `git merge ab4b325` (conflito apenas em `.planning/ROADMAP.md`, resolvido tomando a versao de `ab4b325`); a arvore resultante ficou identica a `ab4b325`. Commit `0f194b9` (anterior ao primeiro commit de tarefa; `plan_head_before` aponta para ele).

**2. [Rule 1 - Bug] Handle aberto no Jest apos o IT**
- **Found during:** Task 1, primeira execucao verde do IT ("Jest did not exit one second after the test run")
- **Issue:** o pool `pg` do servico nunca era encerrado ao fechar o app.
- **Fix:** `OnModuleDestroy` com `pool.end()` em `AthosOrcamentoService`.
- **Commit:** afc3abb

**3. [Ajuste de ordem] Flag antes da resolucao das envs**
- O plano lista (a) resolver config e (b) checar flag; a implementacao checa a flag primeiro, de modo que "ATHOS_ORCAMENTO_ESCRITA diferente de true -> 503 sem abrir conexao" vale mesmo quando os ids do autor ainda nao foram definidos (estado normal de um deploy com a escrita desligada). `resolverConfigOrcamentoAthos` continua exportada e devolvendo `escrita`.

**4. [Rule 2 - Seguranca] Recusa de campos nao suportados no servico**
- `criarOrcamento` recusa com 422 `VALOR_INVALIDO` (detalhes.campos) qualquer campo de 44-02 recebido via chamada direta, para nunca aceitar silenciosamente um campo que ignoraria. 44-02 remove essa trava ao implementar os campos.

Fora isso, o plano foi executado como escrito.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superficie nova alem da prevista no `<threat_model>` do plano (POST protegido por guard global, escrita atras de flag, trava de host).

## Notas para os proximos planos

- 44-02: trocar o calculo inline do servico por `calcularOrcamento` (descontos, `conf_vendas.permitedescontode`), implementar `simular`, remover `rejeitarCamposNaoSuportados`, documentar as envs no deploy.
- STATE.md e ROADMAP.md nao foram alterados neste worktree (execucao paralela; atualizacao fica com o orquestrador).
- Comando do IT: `ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos ATHOS_PG_USER=postgres ATHOS_PG_PASS=<senha-do-clone> ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 npm --prefix apps/backend run test -- athos-orcamento.clone --no-coverage`

## Self-Check: PASSED

- Arquivos criados presentes (util, util.test, service, controller, dto, IT) e `athos.module.ts` modificado.
- Commits na branch: a hash dos commits de tarefa (test IT, feat Task 1, test calc, feat Task 2) consta na lista de commits do retorno; `git rev-list --count` de `plan_head_before..HEAD` = 4 antes deste commit de documentacao.
