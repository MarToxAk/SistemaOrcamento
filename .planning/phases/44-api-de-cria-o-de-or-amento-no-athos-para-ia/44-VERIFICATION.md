---
phase: 44-api-de-cria-o-de-or-amento-no-athos-para-ia
verified: 2026-11-09T15:10:00Z
status: human_needed
score: 9/11 must-haves verified
covered_files:
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-01-PLAN.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-01-SUMMARY.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-02-PLAN.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-02-SUMMARY.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-03-PLAN.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-03-SUMMARY.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-04-PLAN.md"
  - ".planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-04-SUMMARY.md"
  - "apps/backend/prisma/migrations/20261109120000_add_athos_orcamento_ia/migration.sql"
  - "apps/backend/prisma/schema.prisma"
  - "apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts"
  - "apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.ts"
  - "apps/backend/src/modules/integrations/athos/athos-orcamento.clone.it.test.ts"
  - "apps/backend/src/modules/integrations/athos/athos-orcamento.controller.ts"
  - "apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts"
  - "apps/backend/src/modules/integrations/athos/athos.module.ts"
  - "apps/backend/src/modules/integrations/athos/dto/buscar-produtos-orcamento.dto.ts"
  - "apps/backend/src/modules/integrations/athos/dto/create-athos-orcamento.dto.ts"
covered_digest: "v4:sha256:d12a57edd2951f58caca206d20d67e4ead81e6bd20576a6b29b616d3ce5d0337"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "ORC-09: duas chamadas concorrentes com a mesma Idempotency-Key colidem no indice unico de AthosOrcamentoIa (P2002) e apenas uma grava no Athos"
    test: "Com o banco do Sistema real (migration 20261109120000_add_athos_orcamento_ia aplicada pelo prisma migrate deploy do deploy), disparar 2 POSTs simultaneos com a mesma Idempotency-Key e o mesmo corpo, com a escrita ligada."
    expected: "Um unico orcamento no Athos; a segunda chamada devolve replay:true ou 409 IDEMPOTENCY_EM_PROCESSAMENTO; AthosOrcamentoIa com 1 linha para a chave."
    why_human: "Todos os testes usam Prisma falso (unit e IT usam Map em memoria que lanca P2002 por codigo). O indice unico real, a migration aplicada e a corrida real nunca foram exercitados (a fase proibiu migrate/db push)."
human_verification:
  - test: "A1 - GRANTs de producao (44-RESEARCH A1)"
    expected: "O usuario do Athos configurado em ATHOS_PG_USER tem INSERT em orcamento, orcamento_item, orcamento_forma_pagamento, DELETE em orcamento_forma_pagamento e USAGE nas 4 sequences (Passo de has_table_privilege do roteiro). Sem isso o POST responde 500 PERMISSAO_NEGADA."
    why_human: "Somente o Athos real mostra os privilegios. O unico GRANT confirmado era INSERT em orcamento. Nenhum agente pode conectar ao Athos de producao."
  - test: "A2 - Exibicao no Balcao com statusimpressao=false e sem linha em monitoramento"
    expected: "Um orcamento criado pela API (marcado [IA]) aparece normalmente na tela de orcamentos do Balcao.exe, com itens, desconto e forma PIX corretos, e pode ser aberto sem erro."
    why_human: "Comportamento do aplicativo desktop Balcao.exe. O clone so prova gravacao, nao exibicao."
  - test: "A3 - Visibilidade conforme o terminal escolhido (ATHOS_ORCAMENTO_ID_TERMINAL)"
    expected: "O orcamento aparece no(s) terminal(is) em que o operador espera ve-lo."
    why_human: "Depende da configuracao de terminais/usuarios do Athos de producao. Os ids de producao (funcionario/vendedor/terminal) nem foram escolhidos (testes no clone usam 1/1/1)."
  - test: "A4 - Execucao do SQL no PostgreSQL 9.0.5 real"
    expected: "Simulacao e criacao respondem sem ERRO_BANCO no Athos 9.0.5 real (recursos: SET TRANSACTION READ ONLY, SET LOCAL statement_timeout, ANY($1::int[]), cast(current_time(0) as time), ILIKE com parametro ::text, RETURNING)."
    why_human: "O clone e PG14. A compatibilidade foi provada apenas por varredura estatica de texto (S11) e por conhecimento da versao; nunca por execucao em 9.0.5."
  - test: "Roteiro de verificacao manual em producao (44-ROTEIRO-VERIFICACAO-MANUAL.md, Passos 0-9)"
    expected: "Executado pelo usuario e o numero do orcamento de teste visto no Balcao registrado. O checkpoint foi respondido 'aprovado' SEM esse numero e sem evidencia de execucao (ver 44-04-SUMMARY.md, Task 3). Tratar o roteiro como NAO executado."
    why_human: "Item bloqueante de producao; so o usuario pode executa-lo. ATHOS_ORCAMENTO_ESCRITA nasce false nos composes, logo nada grava em producao ate o usuario ligar a flag."
---

# Phase 44: API de criacao de orcamento no Athos para IA - Verification Report

**Phase Goal:** Uma IA (agente externo) consegue montar e gravar um orcamento real no Athos via API REST protegida por `x-internal-api-key`: (1) buscar produtos com preco e custo, (2) [removido por D-04: pagamento sempre PIX via env], (3) criar o orcamento (com desconto por item e global) em UMA transacao em `orcamento` + `orcamento_item` + `orcamento_forma_pagamento` com `RETURNING idorcamento`, (4) consultar o orcamento criado. SQL compativel com PostgreSQL 9.0.5. Testes de integracao somente no clone.
**Verified:** 2026-11-09
**Status:** human_needed
**Re-verification:** No - initial verification

## Resumo

O codigo entrega o objetivo no ambiente que pode ser verificado aqui (codigo + clone PG14). Nao ha gap de implementacao (zero BLOCKER). O status e `human_needed` porque o objetivo final ("orcamento real no Athos, visivel no Balcao") so se prova em producao, e o checkpoint humano foi "aprovado" sem evidencia de execucao. As premissas A1-A4 permanecem NAO CONFIRMADAS e nao foram tratadas como verificadas.

## Evidencia executada pelo verificador

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0, 0 erros |
| `npm --prefix apps/backend run test -- --no-coverage` (NODE_ENV=test) | 56 suites passed, 1 skipped (IT); 807 passed, 10 skipped (IT sem ATHOS_IT_CLONE) |
| IT no clone (127.0.0.1:5440, comando exato do pedido) | 1 suite, 10/10 passed (IT1..IT10) |
| Propriedade de arredondamento (script em scratchpad, 20.000 casos aleatorios de `calcularOrcamento`, 100% limite) | 19.909 aceitos, 91 recusados com `CalcOrcamentoError`, 0 violacoes: soma das linhas = bruto; soma dos descontos = descontoC; soma dos finais = liquido = bruto - desconto; nenhuma linha com desconto/final negativo; total da linha = round half-up de qtd x valor; percentual = round(desc/bruto*100,3). Rateio de 2,98 em [10,00; 20,00; 30,01] = [0,50; 0,99; 1,49] somando 2,98 |

Somente o clone 127.0.0.1:5440 foi tocado. Nenhum `.env` lido. Nenhum prisma migrate/db push. Nenhum codigo-fonte editado.

## Observable Truths

| # | Truth | Status | Evidencia |
|---|-------|--------|-----------|
| 1 | ORC-01: GET `/api/athos/orcamentos/produtos?q=&limit=` busca por descricao/referencia/codigo de barras (ILIKE por token, E entre tokens) + idproduto exato, so ativos/vendaveis, retorna preco (`precovendaproduto`), estoque, fracao, unidade, SEM custo; limite 20 padrao, max 50 | VERIFIED | `buscarProdutos` (service:720-773); DTO `@Max(50)`; resposta sem campo de custo; IT7 passou (preco igual a `precovendaproduto`); C9 (limit 60 e q ausente -> 400) |
| 2 | ORC-02 (redefinido por D-04): pagamento sempre PIX; uma unica linha em `orcamento_forma_pagamento` com `idformapagamento = ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO` (padrao 5), condicao 0, valor = valorrecebido = liquido; forma validada (status true, tipodeforma 1/4); DTO recusa `idformapagamento`; nenhum endpoint formas-pagamento | VERIFIED | service:188, 639-640; IT1/IT5 conferem n_pag=1 e valor=recebido=liquido; C5 (400 para idformapagamento); grep nao encontra rota formas-pagamento |
| 3 | ORC-03: POST grava `orcamento` + `orcamento_item` + `orcamento_forma_pagamento` em UMA transacao (BEGIN...COMMIT, ROLLBACK em erro), id via `RETURNING idorcamento, senhabalcao`, sem MAX(id)+1/currval | VERIFIED | service:458, 612-643, 646-654; IT1 confere as 3 tabelas no clone |
| 4 | ORC-04 / D-04: desconto por item (`descontoRS`), preco abaixo do cadastro tratado como desconto, desconto global rateado por maior resto; limites (linha, soma de liquidos, `conf_vendas.permitedescontode`); `descontomaximo` do produto NAO bloqueia; aritmetica em inteiros (BigInt); invariantes do Balcao | VERIFIED | calc.util.ts inteiro; `descontomaximo` so informativo (service:564); IT5 prova os invariantes por SQL nas 3 tabelas; propriedade de 20.000 casos sem violacao |
| 5 | ORC-05: erros de regra chegam como `{statusCode, codigo, mensagem, detalhes?}`, sem texto do driver pg | VERIFIED | `OrcamentoAthosError`, `mapearErroPg`/`mapearErroLeitura` (mensagens fixas); C7, S6-S8, D4 |
| 6 | ORC-06: `simular:true` roda `BEGIN; SET TRANSACTION READ ONLY`, mesmas validacoes/calculos, ROLLBACK, nunca alcanca INSERT, funciona com escrita desligada, idorcamento/senhabalcao null | VERIFIED | service:430-437, 458-460, 605-609 (ponto unico de decisao antes do primeiro INSERT; banco recusa escrita); IT6 (contagem de orcamento inalterada, escrita desligada); S2/S3 |
| 7 | ORC-07: GET `/api/athos/orcamentos/:id` devolve cabecalho, itens, pagamentos; inexistente -> 404 `ORCAMENTO_INEXISTENTE`; rota `produtos` declarada antes de `:id` | VERIFIED | service:776-838; controller:29-56; IT8, IT9; C9/C10 |
| 8 | ORC-08: escrita so com `ATHOS_ORCAMENTO_ESCRITA` exatamente `"true"` (senao 503 sem abrir conexao); trava de host em NODE_ENV=test; envs de autor obrigatorias e validadas; composes com escrita `:-false`; guard global 401 | VERIFIED | service:431-437 e 446; unico lugar com INSERT/DELETE em `orcamento*` em todo `apps/backend/src` (grep); compose vps/box e `.env.example`/`stack.env.example` com `ATHOS_ORCAMENTO_ESCRITA=false`; IT2 (flag desligada nao grava), IT10/C1/C2/C11 (401) |
| 9 | ORC-09: Idempotency-Key reserva-primeiro, replay sem duplicata, 409 reutilizada/em processamento, 400 formato invalido, auditoria em `AthosOrcamentoIa`, simulacao nao consome chave, migration aditiva | VERIFIED (codigo e logica) | idempotencia.service.ts; I1-I11, C3/C4/C8; IT3 (replay sem duplicata) e IT4 (409) rodaram no clone com Prisma em memoria; schema.prisma + migration `IF NOT EXISTS`. Corrida real no indice unico: ver truth 10 |
| 10 | ORC-09 (comportamento real): a colisao concorrente no indice unico real do banco do Sistema impede duplicata | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Codigo presente e ligado, mas so exercitado com Prisma falso; migration nunca aplicada (proibicao da fase). Ver `behavior_unverified_items` |
| 11 | Objetivo em producao: o orcamento criado via API no Athos REAL aparece no Balcao e o SQL roda no PostgreSQL 9.0.5 real (A1-A4, ORC-10 parte producao) | ? UNCERTAIN | Nao verificavel aqui; checkpoint "aprovado" sem evidencia. Ver `human_verification`. Parte estatica de ORC-10 (S11: varredura de 12 padroes proibidos em todos os SQL emitidos, unit + 10 ITs, roteiro so SELECT) esta VERIFIED |

**Score:** 9/11 truths verified (1 present, behavior-unverified; 1 uncertain/human)

## Required Artifacts

| Artifact | Status | Detalhes |
|---|---|---|
| `athos-orcamento.service.ts` (912 linhas) | VERIFIED | criarOrcamento, buscarProdutos, buscarOrcamento, resolverConfigOrcamentoAthos, montarObsOrcamento; usa `sanitizarTextoAthos` por import |
| `athos-orcamento-calc.util.ts` (256) | VERIFIED | BigInt, rateio maior resto, limites |
| `athos-orcamento.controller.ts` (88) | VERIFIED | `@Controller("athos/orcamentos")`, sem `@Public()`, `@Throttle` no POST |
| `athos-orcamento-idempotencia.service.ts` (177) | VERIFIED | reserva-primeiro, auditoria, replay |
| `dto/create-athos-orcamento.dto.ts`, `dto/buscar-produtos-orcamento.dto.ts` | VERIFIED | whitelist + forbidNonWhitelisted (main.ts:33-37) |
| `athos.module.ts` | VERIFIED | controller e 2 services registrados |
| `schema.prisma` model `AthosOrcamentoIa` + migration `20261109120000_add_athos_orcamento_ia` | VERIFIED (nao aplicada) | aditiva, `IF NOT EXISTS`, indice unico em `idempotencyKey` |
| `athos-orcamento.clone.it.test.ts` (408) | VERIFIED | `describe.skip` sem `ATHOS_IT_CLONE=1`; 10 testes passaram |
| `.env.example`, `deploy/stack.env.example`, `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml` | VERIFIED | 5 envs repassadas; escrita `:-false`, forma `:-5`; IDs de autor vazios por padrao (CONFIG_INVALIDA ate o usuario definir) |
| `44-ROTEIRO-VERIFICACAO-MANUAL.md` | VERIFIED (existe) / NAO EXECUTADO | 10 secoes `## Passo`; 0 linhas de SQL de escrita |

## Key Links

| From | To | Status |
|---|---|---|
| controller POST | `idempotencia.executar` -> `criarOrcamento(dto, opts)` (ref) | WIRED |
| controller GET produtos / :id | `buscarProdutos` / `buscarOrcamento` | WIRED |
| service | calc util (`calcularOrcamento` com limite de `conf_vendas`) | WIRED |
| AthosModule | controller + services | WIRED |
| idempotencia | `prisma.athosOrcamentoIa` create/findUnique/update/delete | WIRED (contra Prisma falso nos testes) |
| composes | envs lidas por `resolverConfigOrcamentoAthos` | WIRED |

## Prohibitions

| Prohibicao | Status | Evidencia |
|---|---|---|
| Nunca tocar o Athos original | OK | trava `assertHostPermitido` (service:366) em NODE_ENV=test + trava dupla host/porta/db no IT; so 127.0.0.1:5440 usado |
| Sem ler `.env` | OK | IT e testes usam env de linha de comando e `ConfigService` falso |
| SQL 9.0.5: sem ON CONFLICT/FILTER/json/CTE de escrita/LATERAL/GENERATED/lock_timeout/unaccent/ESCAPE literal/currval/MAX(id) | OK | grep manual no service sem ocorrencias + teste S11 |
| Nao alterar arquivos da Fase 43 | OK | ultimo commit em `athos-conta-receber-baixa.service.ts` e `5e170fe` (43-04) |
| Sem float para dinheiro | OK | BigInt; `Number()` usado so para ids/limit; `toFixed` so na conversao de entrada com checagem de casas |
| Sem dependencia npm nova | OK | nenhum commit de 44 em `package.json`/lockfile |
| Sem forma de pagamento escolhida pela IA / sem endpoint de formas | OK | DTO sem o campo; sem rota |
| Sem custo exposto na busca | OK | `ProdutoOrcamentoResultado` sem custo (custo so e lido internamente para `valorcustoitem`) |
| Roteiro sem SQL de escrita | OK | grep: 0 |
| Sem chamada ao Prisma entre INSERT e COMMIT no Athos | OK | Prisma antes (reserva) e depois (auditoria); nunca dentro de `criarOrcamento` |
| Sem migrate/db push nesta fase | OK | nada executado; migration so como arquivo |

## Verificacoes independentes pedidas

- **SQL incompativel com PG 9.0.5:** nenhum encontrado na leitura manual. Todos os recursos usados existem no 9.0: `$n` parametros, `RETURNING`, `ANY($1::int[])`, `SET TRANSACTION READ ONLY`, `SET LOCAL statement_timeout`, `ILIKE`, `cast(current_time(0) as time)`, `to_char`, `EXISTS`. A busca nao usa `ESCAPE` literal (escape aplicado ao VALOR do parametro; padrao do LIKE e a barra invertida). Limite: nunca executado em 9.0.5 real (A4).
- **Injecao de SQL:** todos os valores de usuario vao como parametros `$n`. A unica interpolacao em template e a lista de blocos `($n::text ...)` com indices numericos gerados internamente; nenhum texto do usuario entra no SQL. `obs` e sanitizada (`sanitizarTextoAthos`) e parametrizada.
- **Escrita sem `ATHOS_ORCAMENTO_ESCRITA="true"`:** impossivel pelo codigo. `criarOrcamento` recusa antes de qualquer conexao quando `!simular && flag !== "true"`; a unica rota que chega a INSERT passa por esse guard; a simulacao roda em transacao `READ ONLY` imposta pelo proprio banco; GETs usam `lerSomenteLeitura` (READ ONLY). Unico ponto de escrita em `orcamento*` no backend.
- **Arredondamento/desconto:** invariantes provados por SQL no clone (IT5) e por propriedade em 20.000 casos aleatorios; sem violacao.
- **Corrida de idempotencia:** com chave, o desenho reserva-primeiro e correto no codigo (P2002 -> replay/409), mas so foi exercitado com Prisma falso (ver truth 10). Veja avisos abaixo.

## Anti-Patterns / Avisos (nao bloqueantes)

| Severidade | Item | Impacto |
|---|---|---|
| WARNING | Reserva `processando` sem TTL: se o processo morrer entre a reserva e o fim do `criar`, aquela Idempotency-Key fica presa em 409 `IDEMPOTENCY_EM_PROCESSAMENTO` para sempre (recuperacao manual por SQL no banco do Sistema) | Operacional, raro; nao compromete o Athos |
| WARNING | Sem `Idempotency-Key` nao ha deduplicacao: dois POSTs iguais criam dois orcamentos (o `ref` do obs so ajuda a localizar). Desenho documentado, mas a IA deve sempre enviar a chave | Risco de duplicata se o agente nao enviar o header |
| WARNING | Se o COMMIT no Athos for efetivado mas a conexao cair antes do ack, o servico faz ROLLBACK (inocuo), libera a reserva e responde erro; a retentativa criaria duplicata | Borda rara; mitigado pelo `ref` no obs para reconciliacao |
| INFO | ROADMAP.md ainda mostra os 4 planos como `[ ]` e `44-VALIDATION.md` esta `status: draft`; bookkeeping do orquestrador | Sem impacto no codigo |
| INFO | Debt markers (TBD/FIXME/XXX): nenhum nos arquivos da fase | - |

## Gaps Summary

Nenhum gap de implementacao (0 FAILED, 0 BLOCKER). Pendencias sao exclusivamente de validacao em producao e na corrida real de idempotencia, listadas em `human_verification` e `behavior_unverified_items`. O endpoint nao deve ser ligado em producao (`ATHOS_ORCAMENTO_ESCRITA=true`) antes de o usuario executar o roteiro `44-ROTEIRO-VERIFICACAO-MANUAL.md`, escolher os ids de autor/terminal e registrar o numero do orcamento de teste visto no Balcao.

---

_Verified: 2026-11-09_
_Verifier: Claude (gsd-verifier)_
