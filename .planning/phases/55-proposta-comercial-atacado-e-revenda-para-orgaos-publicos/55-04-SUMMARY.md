---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 04
subsystem: integrations/athos
tags: [athos, postgres-9.0.5, write, proposta, kill-switch, idempotencia, tracer]
requires: ["55-01", "55-03"]
provides:
  - AthosOrcamentoService.criarOrcamentoProposta (escrita da proposta no Athos, preco final sem desconto)
  - AthosOrcamentoService.exigirEscritaPropostaAtiva (gate publico PROPOSTA_ESCRITA_ATIVA)
  - AthosOrcamentoService.buscarOrcamentoPorRefProposta (recuperacao READ ONLY por ref)
  - tipos ItemPropostaAthosInput, CriarOrcamentoPropostaInput, OrcamentoPropostaResultado e constante MARCADOR_OBS_PROPOSTA
  - constantes SQL exportadas (SQL_INSERIR_ORCAMENTO, SQL_INSERIR_ITEM, SQL_LIMPAR_PAGAMENTO, SQL_INSERIR_PAGAMENTO, SQL_LER_PRODUTOS_PROPOSTA, SQL_BUSCAR_ORCAMENTO_POR_REF, SQL_LER_DATA_HORA_ORCAMENTO)
affects: [55-08, 55-11, 55-12, 55-16]
tech-stack:
  added: []
  patterns: [transacao so com INSERT/DELETE, kill-switch exato "true" antes de conectar, idempotencia por marcador no obs, classificacao de SQL por regex no teste]
key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-orcamento-proposta.service.test.ts
    - apps/backend/src/modules/integrations/athos/athos-proposta.clone.it.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts
key-decisions:
  - "Metodo novo criarOrcamentoProposta reusa o esqueleto transacional de criarOrcamento sem altera-lo (assinatura, SQL_LER_PRODUTOS e testes da Fase 44 intactos)."
  - "Flag PROPOSTA_ESCRITA_ATIVA e o unico gate de escrita da proposta; o campo escrita de resolverConfigOrcamentoAthos (flag da IA) e ignorado, nos dois sentidos."
  - "Alem do limite por linha, o total do cabecalho tambem e validado contra numeric(9,3) antes de conectar (VALOR_FORA_DO_LIMITE), para nao depender do 22003 do banco."
  - "Idempotencia: busca de orfao por LIKE '[PROPOSTA] ref:<hex>%' dentro da transacao, depois das validacoes e antes do primeiro INSERT."
requirements-completed: [P55-ATHOS, P55-PRECO]
duration: 40 min
completed: 2026-11-27
status: complete
commits: 4
plan_head_before: c83639c8df1faa12503fbb7ba6de97ca5300a6cd
plan_head_after: cd2982050f34d2966d47fd156723dec0cd4be42a
actuals:
  tokens: 19000
  tasks: 2
  commits: 4
coverage:
  - deliverable: "Gravacao da proposta no Athos com preco final em valoritem e desconto 0 (D-03), atras de kill-switch proprio (D-30)"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/backend/src/modules/integrations/athos/athos-orcamento-proposta.service.test.ts#criarOrcamentoProposta,gate PROPOSTA_ESCRITA_ATIVA"
        status: pass
      - kind: test
        ref: "apps/backend/src/modules/integrations/athos/athos-proposta.clone.it.test.ts#tracer,dois itens,variante ROLLBACK"
        status: pass
  - deliverable: "Cliente e produto validados na mesma transacao, idempotencia por ref e recuperacao, erros sem vazar mensagem do pg"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/backend/src/modules/integrations/athos/athos-orcamento-proposta.service.test.ts#validacoes,idempotencia por ref e recuperacao,mapeamento de erros do pg"
        status: pass
      - kind: test
        ref: "apps/backend/src/modules/integrations/athos/athos-proposta.clone.it.test.ts#idempotencia real,cliente inexistente"
        status: pass
---

# Phase 55 Plan 04: Escrita da proposta no Athos Summary

Metodo novo `criarOrcamentoProposta` que grava a proposta como orcamento no Athos com o formato do Balcao para preco alterado (preco final em `valoritem`, desconto 0), kill-switch proprio `PROPOSTA_ESCRITA_ATIVA` independente da flag da IA, cliente e produtos validados na mesma transacao e idempotencia por marcador `[PROPOSTA] ref:<12 hex>` no `obs`, sem tocar em `criarOrcamento` da Fase 44.

## Accomplishments

- `criarOrcamentoProposta`: gate exato "true" antes de qualquer conexao; validacao pura (cliente int4 positivo, ref 12 hex minusculos, 1 a 200 itens, quantidade/preco/custo por `paraMilli`/`paraCentavos`, linhas por `calcularLinhasProposta` sem desconto nem rateio); transacao BEGIN, timeout, leituras (config, produtos, orfao), INSERT orcamento, leitura de data e hora do proprio orcamento (Pitfall 13), INSERT por item, DELETE+INSERT de pagamento, COMMIT.
- D-03 provado no clone: preco 2,90 sobre cadastro >= 3,00 gravado como `valoritem 2.900`, `valordesconto 0`, `orcamentodesconto 0`, `orcamentovalorfinalitem 5.80`, cabecalho `valor 5.80`, `desconto 0`, `descontors 0`, `statusorcamento` nulo, uma linha de pagamento de 5.80.
- Dois itens (preco de 3,46 e quantidade 1.333 x 3.33 = 4.44 half-up): `valor` do cabecalho = soma de `orcamentovalorfinalitem` = `SUM(round(quantidadeitem * valoritem, 2))` = 14.82.
- Idempotencia real no clone: segunda chamada com o mesmo ref devolve `recuperado: true` com o mesmo `idorcamento`, `senhabalcao`, data e hora; existe exatamente 1 orcamento com aquele `obs` e 1 item.
- `exigirEscritaPropostaAtiva()` publico (para o 55-08 chamar antes de reservar a proposta) e `buscarOrcamentoPorRefProposta(ref)` em transacao READ ONLY (recusa ref fora do formato sem conectar).
- Variante ROLLBACK no clone (sem o servico, com as constantes SQL exportadas): o Athos aceita preco 2.90 com desconto 0 e o ROLLBACK deixa 0 linhas em `orcamento` e `orcamento_item`.
- Teste unitario classifica TODAS as instrucoes da sequencia feliz: somente SELECT/BEGIN/COMMIT/ROLLBACK/SET e INSERT/DELETE nas tres tabelas; falha se aparecer WITH, UPDATE ou outra tabela.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | criarOrcamentoProposta + unit + IT no clone | cf94f78 |
| 2 RED | testes de gate, validacoes, idempotencia, recuperacao, erros | 55231da |
| 2 GREEN | exigirEscritaPropostaAtiva, buscarOrcamentoPorRefProposta, exports | 511bbfd |
| 2 | IT: dois itens, idempotencia, cliente inexistente, flag, ROLLBACK | cd29820 |

## TDD Gate Compliance

| Gate | Commit | Note |
|------|--------|------|
| RED (task 2) | 55231da `test(55-04)` | A suite nao compilou (TS2551: `exigirEscritaPropostaAtiva` e `buscarOrcamentoPorRefProposta` inexistentes); 0 testes executados. |
| GREEN (task 2) | 511bbfd `feat(55-04)` | 66 passed. |
| REFACTOR | none | sem limpeza necessaria. |

Avaliacao semantica do RED: a falha foi de compilacao (membros ausentes), nao de assertiva. Nos blocos de validacao, transacao e idempotencia os testes passariam contra o codigo da tarefa 1, porque o tracer ja implementava a passos (a)-(g) por completo, como o plano pede; o RED real e o do gate publico, da busca por ref e das constantes exportadas. Jest nao e reporter TAP/JUnit, entao `check tdd-red-evidence` nao se aplica e nenhuma evidencia foi fabricada. Task 1 e `type="tracer"` (sem `tdd="true"`), com os testes escritos junto da implementacao e verificados em seguida.

## Tracer feedback gate

A tarefa 1 nao carrega `gate="blocking-human"`. Os dois comandos `<verify>` foram executados ponta a ponta (unit e IT no clone, 1 teste executado, nao skipped) antes do commit e passaram; a tarefa 2 os reexecutou depois (66 unit, 6 IT). Expansao liberada.

## Verification

- `npm --prefix apps/backend run test -- src/modules/integrations/athos/athos-orcamento`: 6 suites passaram + 1 skipped (IT da Fase 44), 181 testes; inclui athos-orcamento-proposta.service (66), athos-orcamento.service, athos-orcamento-calc.util, athos-orcamento-idempotencia.service, athos-orcamento.controller e athos-orcamento-proposta-leitura.
- IT no clone (`athos-proposta.clone.it.test.ts`): 6 passed, 0 skipped. Nenhuma sobra no clone (`obs LIKE '[PROPOSTA]%'` = 0 apos as execucoes).
- `tsc --noEmit` do backend limpo.
- `git diff --quiet 8636fbe` nos tres arquivos de teste da Fase 44: exit 0 (sem alteracao).
- Acceptance: `async criarOrcamentoProposta` = 1; assinatura de `criarOrcamento` da Fase 44 = 1 (inalterada); `exigirEscritaPropostaAtiva` = 2 ocorrencias; `buscarOrcamentoPorRefProposta` = 1; `^export const SQL_INSERIR_ORCAMENTO` = 1.
- Limite de verificacao (registrado no plano): o clone e PostgreSQL 14 e producao e 9.0.5; a compatibilidade do SQL novo com 9.0.5 e verificada por revisao do texto (somente construcoes ja usadas na Fase 44: parametros `$n`, `ANY($1::int[])`, `RETURNING`, `to_char`, `LIKE`, `SET LOCAL statement_timeout`; sem CTE, sem UPDATE, sem advisory lock). O primeiro lancamento real (plano 55-12) e a unica execucao em 9.0.5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Validacao do total do cabecalho contra numeric(9,3)**
- **Found during:** Task 1 (escrita de `valor` do cabecalho)
- **Issue:** `calcularLinhasProposta` limita cada linha, mas a soma de ate 200 linhas pode estourar `orcamento.valor numeric(9,3)`; o plano so previa o limite por linha.
- **Fix:** o total (`brutoC`) maior ou igual a `LIMITE_LINHA_CENTAVOS` e recusado com `VALOR_FORA_DO_LIMITE` 422 na validacao pura, antes de conectar (coberto por teste unitario). Tambem validei o custo por item contra o mesmo teto (valorcustoitem numeric(9,3)).
- **Files modified:** `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts`
- **Commit:** cf94f78

**2. [Rule 1 - Bug no teste] Asserts do teste de proposta**
- **Found during:** Task 1 e Task 2
- **Issue:** contagem de escritas esperada como 5 para 1 item (sao 4) e leitura de `err.message` (que em `HttpException` e o nome da classe) em vez de `getResponse().mensagem`.
- **Fix:** corrigidos no proprio teste novo; nenhum teste da Fase 44 tocado.
- **Commits:** cf94f78, 511bbfd

**Total deviations:** 2 (1 no codigo entregue, 1 em teste novo). **Impact:** nenhum no escopo; reforca T-55-11.

Nota de ambiente (nao e desvio): `npm ci --ignore-scripts` e `prisma:generate` no worktree, sem arquivo versionado alterado. `STATE.md` e `ROADMAP.md` nao foram tocados (orquestrador).

## Known Stubs

None.

## Threat Flags

None. A superficie de escrita nova (T-55-09 a T-55-13) esta mitigada como planejado: flag exata checada antes de conectar (testada), `assertHostPermitido` em NODE_ENV=test (testado com host fora de localhost), IT so no clone com trava dupla 127.0.0.1:5440, somente parametros `$n`, mensagens fixas em portugues sem texto do pg (testado), transacao so com INSERT/DELETE sem CTE e sem I/O externo. O deploy da flag desligada por padrao fica no plano 55-16; a ativacao em producao e o checkpoint do plano 55-12.

## Next Phase Readiness

Pronto para o 55-08 (lancamento e recuperacao): chamar `exigirEscritaPropostaAtiva()` antes de reservar a proposta, `criarOrcamentoProposta` para gravar e `buscarOrcamentoPorRefProposta` para recuperar um COMMIT cujo reconhecimento se perdeu.

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-orcamento-proposta.service.test.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-proposta.clone.it.test.ts
- FOUND commits: cf94f78, 55231da, 511bbfd, cd29820
