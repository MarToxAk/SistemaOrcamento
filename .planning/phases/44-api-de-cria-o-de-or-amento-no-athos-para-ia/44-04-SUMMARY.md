---
phase: 44-api-de-cria-o-de-or-amento-no-athos-para-ia
plan: 04
subsystem: api
tags: [athos, orcamento, busca-produtos, leitura, roteiro-manual, nestjs, pg-9.0.5]
requires:
  - phase: 44-02
    provides: simulacao, descontos, envs ATHOS_ORCAMENTO_* no deploy
  - phase: 44-03
    provides: Idempotency-Key, auditoria AthosOrcamentoIa, teste HTTP do controller
provides:
  - GET /api/athos/orcamentos/produtos (busca parametrizada) e GET /api/athos/orcamentos/:id
  - AthosOrcamentoService.buscarProdutos e buscarOrcamento (transacao READ ONLY)
  - BuscarProdutosOrcamentoQueryDto
  - IT5..IT10 no clone (ciclo completo)
  - 44-ROTEIRO-VERIFICACAO-MANUAL.md (Passo 0 a 9, so SELECT)
affects: []
tech-stack:
  added: []
  patterns: [leitura em transacao READ ONLY + statement_timeout + ROLLBACK, escape de LIKE no valor do parametro sem clausula ESCAPE]
key-files:
  created:
    - apps/backend/src/modules/integrations/athos/dto/buscar-produtos-orcamento.dto.ts
    - .planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-ROTEIRO-VERIFICACAO-MANUAL.md
  modified:
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.controller.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.test.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.controller.test.ts
    - apps/backend/src/modules/integrations/athos/athos-orcamento.clone.it.test.ts
key-decisions:
  - "Leituras (busca e GET :id) rodam em BEGIN + SET TRANSACTION READ ONLY + SET LOCAL statement_timeout + ROLLBACK: o proprio banco recusa escrita, e nao dependem de ATHOS_ORCAMENTO_ESCRITA nem das envs de autor."
  - "Parametros de texto da busca com cast ::text (colunas de tipos diferentes no mesmo $n nao quebram a inferencia); escape de \\ % _ no VALOR, nenhuma clausula ESCAPE (PG 9.0, standard_conforming_strings off)."
  - "Valor legado fora do formato (mais de 3 casas) em orcamento antigo: valorLiquido cai para o texto de valor em vez de inventar numero."
  - "Roteiro consulta funcionario_usuario so por idfuncionariousuario e usuario (a tabela tem coluna senha)."
requirements-completed: [ORC-01, ORC-07, ORC-10]
status: awaiting-human-checkpoint
duration: ~45min
completed: 2026-11-09
commits: 4
plan_head_before: c4926285ffcf7a8745ab125fbbb43a6cf36de084
plan_head_after: 7f347f8625ccc702c112d76030d6fc12c4c3e3c4
actuals:
  tokens: 15400
  tasks: 2
  commits: 4
---

# Phase 44 Plan 04: Leituras para a IA, ciclo completo no clone e roteiro de producao Summary

**Busca de produtos parametrizada (ILIKE por token, idproduto exato, sem custo) e consulta do orcamento por numero em transacao READ ONLY, ciclo completo provado no clone athos-teste e roteiro de verificacao manual (Passo 0 a 9, so SELECT) aguardando o checkpoint humano em producao.**

## Status

Tasks 1 e 2 concluidas e commitadas. **Task 3 (checkpoint:human-verify, gate blocking) pendente:** o usuario executa o
`44-ROTEIRO-VERIFICACAO-MANUAL.md` no Athos real e responde "aprovado" com o `idorcamento`/`senhabalcao` visto no Balcao.
Nenhum agente tocou o Athos de producao. As divergencias das premissas A1-A4 (44-RESEARCH) serao registradas aqui apos a resposta.

## Accomplishments

- **GET produtos:** `buscarProdutos(q, limit)` com um bloco `ILIKE` por token (maximo 5, AND), `OR p.idproduto = $k` so quando `q` e inteiro que cabe em int4,
  ordenacao por CASE (exatos primeiro), limite 1..50 (padrao 20), so `statusproduto = true` e `COALESCE(vendeproduto, true)`. Resposta sem custo
  (`descontoMaximo` informativo, D-04), numeric como texto.
- **GET :id:** cabecalho + itens + pagamentos no mesmo cliente; `status` aberto/convertido/outro; `valorLiquido` em milesimos inteiros; id fora de 1..2147483647 ou
  inexistente -> 404 `ORCAMENTO_INEXISTENTE` (o id invalido nem abre conexao).
- **Controller:** `@Get("produtos")` antes de `@Get(":id")`; DTO de query com `@Max(50)`; nenhuma rota de formas de pagamento (D-04).
- **IT no clone:** IT5 (desconto + fracao, invariantes por SQL nas 3 tabelas: `descontors` = soma de `orcamentodesconto`, `desconto` = round(descontors / valor * 100, 3),
  `valor` = soma das linhas arredondadas, `valor - descontors` = soma dos finais = pagamento = recebido), IT6 (simulacao com escrita desligada nao grava), IT7 (busca com preco igual a
  `precovendaproduto`), IT8 (leitura do orcamento do IT5), IT9 (404), IT10 (401). Clone limpo apos o IT (0 orcamentos `[IA]`).
- **Roteiro:** Passos 0-9 com "O que esperar" e "Como reverter", so SELECT, GRANTs em prosa, sem chave real.

## Testes

- `athos-orcamento.service`: 55 passed (R1..R8 novos; RED commitado antes do GREEN).
- `athos-orcamento.controller`: 11 passed (C9..C11 novos; 3 falhavam no RED com 404).
- IT no clone (comando completo da Task 2): **10 passed, 0 skipped**, somente contra 127.0.0.1:5440.
- `npm run test -- athos --no-coverage`: 529 passed, 4 skipped (IT sem ATHOS_IT_CLONE), 28 suites.
- Suite completa do backend: **807 passed, 10 skipped, 56 suites passed** (supera o piso de 773 do plano; a base inclui as Fases 42/43 da main).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: 0 erros.
- Gates do roteiro: 10 secoes `## Passo`; 0 linhas iniciadas por SQL de escrita/permissao; `version()` 3x, `has_table_privilege` 4x, `ATHOS_ORCAMENTO_ESCRITA` 5x,
  URL `orcamentoapi.bomcustoilhabela.com.br` 2x, nenhuma chave real.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Conflitos de merge ao trazer f8c43c2**
- **Found during:** passo inicial de merge (commit de merge separado, `c492628`)
- **Issue:** o worktree partiu da main (com Fases 42/43) e f8c43c2 parte de a72316d: conflitos em `.env.example`, `.planning/ROADMAP.md`, `athos.module.ts`,
  `deploy/docker-compose.box.vps.yml`, `deploy/docker-compose.vps.yml` e `deploy/stack.env.example`.
- **Fix:** em todos os trechos conflitantes o lado da main era vazio (so insercoes da Fase 44), entao removi os marcadores mantendo as duas versoes. Nao usei `--theirs`
  no arquivo inteiro para nao descartar o conteudo das Fases 42/43 da main.
- **Commit:** c492628 (merge; fora dos 4 commits do plano)

**2. [Rule 2 - Critical] Erros de leitura nao reaproveitam `mapearErroPg`**
- **Found during:** Task 1
- **Issue:** `mapearErroPg` fala em "criar o orcamento" e manda conceder GRANT de INSERT; para uma leitura isso enganaria a IA e o DBA.
- **Fix:** `mapearErroLeitura` (42501 -> `PERMISSAO_NEGADA` de SELECT, 57014 -> `ATHOS_INDISPONIVEL`, demais -> `ERRO_BANCO` generico sem vazar texto do pg), coberto por R7b.
- **Files modified:** athos-orcamento.service.ts, athos-orcamento.service.test.ts
- **Commit:** 202b969 / 8839a0a

**3. [Rule 1 - Bug prevention] Selecao de produtos do IT com preco minimo 10**
- **Found during:** Task 2
- **Issue:** com precos baixos o desconto global do IT5 (R$ 0,47) poderia ultrapassar `conf_vendas.permitedescontode` e quebrar o IT por motivo alheio.
- **Fix:** o IT escolhe dinamicamente produtos com `precovendaproduto >= 10` (continua nunca usando ids fixos).
- **Commit:** 331f038

**4. [Rule 2 - Critical] Roteiro nao seleciona `funcionario_usuario.senha`**
- **Issue:** a tabela do clone tem colunas `usuario` e `senha`; um `SELECT *` do roteiro exporia a senha.
- **Fix:** o Passo 2 consulta apenas `idfuncionariousuario, usuario` e avisa para nunca consultar a coluna de senha.
- **Commit:** 7f347f8

Fora isso, o plano foi executado como escrito. `q` so com espacos responde 400 `VALOR_INVALIDO` (o DTO ja barra vazio; espacos passariam).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. As duas rotas GET novas ficam atras do guard global (`x-internal-api-key`, C11/IT10), a busca e 100% parametrizada (T-44-21), limite 1..50 (T-44-22),
sem custo na resposta (T-44-23).

## Pendente (Task 3 - checkpoint humano)

Roteiro `44-ROTEIRO-VERIFICACAO-MANUAL.md`, Passos 0 a 9 em producao. Registrar aqui, apos a resposta do usuario: `idorcamento`/`senhabalcao` do teste visto no Balcao e
divergencias em A1 (GRANTs), A2 (exibicao com `statusimpressao` falso), A3 (visibilidade por terminal) e A4 (compatibilidade com o PostgreSQL 9.0.5).

## Self-Check: PASSED

- FOUND: dto/buscar-produtos-orcamento.dto.ts, 44-ROTEIRO-VERIFICACAO-MANUAL.md, athos-orcamento.service.ts (buscarProdutos, buscarOrcamento), athos-orcamento.controller.ts
- FOUND commits: 8839a0a, 202b969, 331f038, 7f347f8 (ancestrais de HEAD)
