---
phase: 46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co
plan: 03
subsystem: quotes / integracao Athos (verificacao no clone)
tags: [athos, clone, integracao, desconto, acrescimo, pix, it]
requires: ["46-01", "46-02"]
provides:
  - "quotes-mensagem.clone.it.test.ts: IT gated (ATHOS_IT_CLONE=1, travado em 127.0.0.1:5440/athos) do caminho Athos real -> Quote -> mensagem/PIX"
  - "scripts/athos-clone-refresh.sh: refresh do clone athos-teste a partir de pg_dump somente leitura (athos_novo + troca de nomes)"
affects: []
tech-stack:
  added: []
  patterns: ["IT gated por flag com trava host/porta/db antes de qualquer conexao", "esperado calculado em SQL/centavos independente do codigo de producao", "tabela esperado x obtido via console.table", "script de refresh com restore em banco temporario e troca atomica de nomes"]
key-files:
  created:
    - scripts/athos-clone-refresh.sh
    - apps/backend/src/modules/quotes/quotes-mensagem.clone.it.test.ts
  modified: []
decisions:
  - "Modo de dados do IT: REPLICA para 25877, 25952 e 25900 (INSERT no padrao do Balcao com o MESMO numero) e pedido REAL (dump de 2026-11-09) para 25822; o refresh com dump novo NAO foi concluido (ver Desvios)"
  - "Nenhum defeito de producao encontrado pelo IT: nenhuma correcao em codigo de producao nesta fase 46-03"
metrics:
  tasks: 3
  commits: 4
status: complete
actuals:
  tokens: 21000
  tasks: 3
  commits: 4
plan_head_before: 55950229126ba0b875264a420807aa1fa1ba9292
plan_head_after: 0882067d9c95b75b5f23283ba1c0156a57088f65
---

# Fase 46 Plano 03: Verificacao no clone do Athos (caminho real de codigo)

IT gated contra o clone `athos-teste` que le pedidos reais ou gerados pelo Athos (`AthosService` real, PostgreSQL com `numeric`), monta o payload da pagina `/orcamento/novo`, cria o Quote e monta a mensagem e o PIX com o codigo de producao dos planos 46-01/46-02, comparando contra valores calculados de forma independente. Resultado: 18 de 18 casos passam, 0 divergencias nas varreduras, nenhum defeito de producao encontrado. O refresh do clone com dump atual (D-10) ficou PENDENTE por um defeito no proprio script (ver Desvios).

## Tarefas e commits

| Tarefa | Descricao | Commit |
|--------|-----------|--------|
| 1 (tracer) | Harness travado no clone + IT0 (trava/mocks) e IT1 (25877 do Athos ate a mensagem e o PIX) | `01785f3` |
| 2 | `scripts/athos-clone-refresh.sh` + R1..R5 (25822, 25877, 25952, 25900, outros de referencia) | `490a7a4` |
| 3 | F44-1..F44-4, B1..B5, P1 e P2 | `e503039` |
| ajuste | Replicas assumem o mesmo numero do pedido de referencia | `0882067` |

Base (`plan_head_before`): `5595022` (merge da branch `feat/fase-42-43-cc-email-baixa-athos`, HEAD f5098ad, em conflito apenas em `.planning/ROADMAP.md`, resolvido mantendo a versao da branch). `commits: 4` medido com `git rev-list --count 5595022..HEAD` antes do commit deste SUMMARY.

## Modo de dados e estado do clone

| Item | Resultado |
|------|-----------|
| Modo usado | **replica** para 25877, 25952, 25900 (INSERT no padrao do Balcao, mesmo numero do pedido, marcador `[IT46]` em `obs`, apagados no `afterAll`); **dump** (pedido real, clone de 2026-11-09) para 25822; 25951/26047/26109 ausentes no clone (R5 sem pedidos a varrer) |
| Orcamentos no clone | 25.833, `max(idorcamento) = 25865` (inalterados: o refresh com dump novo nao foi concluido) |
| Contagem antes/depois do IT | 25.833 / 25.833; `select count(*) ... obs like '%IT46%'` = 0 |
| Dump novo | NAO aplicado. Tamanho do clone atual: 599 MB. Tempo do dump real: nao medido (o script abortou antes de imprimir a duracao; levou mais de 3 minutos). Ensaio local do mesmo caminho (origem = container do proprio clone): 31 a 33 s |
| Origem tocada | Apenas por UMA execucao do `pg_dump` (leitura, pela rede do container `orcamento-ts-webserver2`). Nenhuma escrita, nenhum INSERT/UPDATE/DELETE/DDL no Athos original |

## Resultados dos testes (reais)

| Comando | Resultado |
|---------|-----------|
| IT com a flag (comando da secao interfaces do plano) | **18 passed, 0 failed, 0 skipped** (IT0, IT1, R1..R5, F44-1..F44-4, B1..B5, P1, P2); na tarefa 1: 2 passed; na tarefa 2: 7 passed |
| Mesmo comando SEM a flag | suite skipped (exit 0) |
| Suite completa do backend sem a flag (`jest --no-coverage`) | **953 passed, 28 skipped (10 antigos + 18 do IT), 0 failed; 66 suites passed, 2 skipped** (baseline do plano: 892 passed; 953 e o valor depois do 46-02) |
| `tsc --noEmit -p apps/backend/tsconfig.json` | exit 0, sem `error TS` |
| `athos-orcamento.service.ts` alterado desde 2f71d8f | nao (`git diff --name-only` vazio) |

## Tabela esperado x obtido (saida real do `console.table` do IT)

### Pedidos de referencia

| Pedido | Campo | Esperado | Obtido |
|--------|-------|----------|--------|
| 25877 (replica) | original / desconto / total do item | 0,95 / 60,00 / 130,00 | 0,95 / 60 / 130 |
| 25877 | Quote total / discount / surcharge | 130 / 60 / 0 | 130 / 60 / 0 |
| 25877 | mensagem | `~R$ 190,00~ R$ 130,00`, `Subtotal: R$ 190,00`, `Desconto: -R$ 60,00`, `Total: R$ 130,00` | todos presentes |
| 25877 | PIX `amount` | 130 | 130 |
| 25877 | mensagens ao Chatwoot | 2 (principal + so o codigo Pix; codigo ausente da principal) | 2; mensagem 2 = codigo fictício; ausente da principal |
| 25877 | soma dos totais lidos / `mapped.totais.liquido` / Quote.total | 130 | 130 / 130 / 130 |
| 25822 (REAL, dump) | original / desconto / total | 2,00 / 13,00 / 13,00 | 2 / 13 / 13 |
| 25822 | Quote.total; Subtotal; Desconto; Total; PIX | 13; 26,00; -13,00; 13,00; 13 | 13; 26,00; -13,00; 13,00; 13 |
| 25952 (replica) | original / desconto / total | 5,30 / 58,30 / 524,70 | 5,3 / 58,3 / 524,7 |
| 25952 | `mapped.totais.valor` / `liquido` / Quote.total | 583 / 524,70 / 524,70 (nunca 583) | 583 / 524,7 / 524,7 |
| 25952 | mensagem Subtotal / Desconto / Total; PIX | 583,00 / -58,30 / 524,70; 524,7 | 583,00 / -58,30 / 524,70; 524,7 |
| 25900 (replica) | original / desconto / total; Quote.total | 5,00 / 0 / 5,00; 5 | 5 / 0 / 5; 5 |
| 25900 | mensagem sem `Subtotal`, `Desconto:`, `~`; `Total: R$ 5,00`; PIX | 5 | ok / ok / ok / presente; 5 |

### Pedidos criados pela API da Fase 44 (produtos escolhidos dinamicamente; preco de tabela 25,00 e 75,00 neste clone)

| Caso | Esperado (SQL/centavos independente; resposta da Fase 44) | Obtido |
|------|------------------------------------------------------------|--------|
| F44-1 desconto por item (qtd 3, descontoRS 1,50) | valorLiquido 73,50; item valor 25,00 (= `valorUnitario` da Fase 44), desconto 1,50, total 73,50; Subtotal 75,00; Desconto -1,50; Total 73,50 | idem; Quote.total 73,5 = PIX 73,5 |
| F44-2 desconto global (2 itens, descontoTotalRS 2) | valorBruto 125,00; valorLiquido 123,00; rateio soma 2,00; Subtotal 125,00; Total 123,00 | idem; Quote.total 123 = PIX 123 |
| F44-3 preco abaixo da tabela (-0,50, qtd 4) | item valor 25,00 (tabela); desconto implicito 2,00; total 98,00 | idem; Quote.total 98 = PIX 98; `Desconto: -R$ 2,00` |
| F44-4 preco ACIMA da tabela (+0,50, qtd 2) | item valor 75,50; desconto 0; total 151,00; sem `~`, `Subtotal`, `Desconto:` | idem; Quote.total 151 = PIX 151 |

### Pedidos por INSERT no padrao do Balcao

| Caso | Esperado | Obtido |
|------|----------|--------|
| B1 (30, 2,10, vd 6,00) | original 2,30; desconto 6,00; total 63,00; `~R$ 69,00~ R$ 63,00`; Subtotal 69,00; PIX 63 | idem |
| B2 (5, 0,90, vd 0,50, od 1,38) | original 1,00; desconto 1,88; total 3,12; Subtotal 5,00; Desconto -1,88; Total 3,12; PIX 3,12 | idem |
| B3 aumento 1,00 -> 1,50 (4, 1,50) | valor 1,50; desconto 0; total 6,00; sem Subtotal nem `~`; PIX 6 | idem |
| B4 acrescimo 7,50 (2, 10,00) | `totais.valoracrescimo` 7,5; Quote.total 27,50; surcharge 7,50; `Acréscimo: +R$ 7,50`; Total 27,50; PIX 27,5 | idem |
| B5 misto (2 x 1,50; 10 x 0,65 vd 3,50) | item 1 valor 1,50 desc 0; item 2 original 1,00 desc 3,50 total 6,50; `~R$ 10,00~ R$ 6,50`; Subtotal 13,00; Desconto -3,50; Total 9,50; PIX 9,5 | idem |

### Varreduras populacionais (somente leitura no clone)

| Varredura | Alcance | Divergencias |
|-----------|---------|--------------|
| P1 descontos (`id >= 21000`, algum `valordesconto <> 0`, limite 200) | 56 pedidos / 160 itens (todos os que existem no clone com esse perfil) | **0** (item: qtd x valor - desconto = total, tol. 0,011; cabecalho: soma dos totais = valor - descontors, tol. 0,02) |
| P2 aumento de preco (`id >= 25000`, `valoritem > precovendaproduto + 0,0005`, sem desconto, limite 100) | 30 itens em 29 pedidos (inclui 25834, 25804, 25754) | **0** (desconto 0, valor = valoritem, total = qtd x valoritem) |
| R5 (25951, 26047, 26109) | nenhum desses pedidos existe no clone atual | n/a (depende do refresh) |

## Conclusao da investigacao do item 4 do escopo (subir o preco unitario)

Reproduzido por tres caminhos, todos sem defeito: F44-4 (API da Fase 44, valorUnitario acima da tabela), B3 (INSERT no padrao do Balcao, 1,00 -> 1,50 com qtd 4) e B5 (aumento misto com desconto); alem da varredura P2 de 30 itens reais recentes com preco acima da tabela (25834, 25804, 25754 entre eles). Em todos: `desconto` 0, `valor` = preco digitado, `total` = qtd x preco, mensagem sem `Subtotal` nem preco riscado e PIX igual ao total. O erro original (aumento de preco aparecendo como desconto/total errado) era a soma indevida de `valordesconto` ao unitario, corrigida no 46-01; com ela nao ha caso residual no clone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Defeito no script de refresh consumiu a UNICA execucao autorizada do dump; D-10 incompleto**
- **Found during:** Tarefa 2, execucao real do refresh
- **Issue:** `status_restore="${PIPESTATUS[1]}"` rodava depois de `status_dump="${PIPESTATUS[0]}"` (PIPESTATUS e sobrescrito a cada comando): com `set -u` o script abortou com "PIPESTATUS[1]: unbound variable" DEPOIS de o dump/restore em `athos_novo` terminar; o `trap` apagou `athos_novo` e o banco `athos` do clone seguiu intacto (nada foi trocado). O dump novo foi perdido.
- **Fix:** captura das duas posicoes de uma vez (`status_pipe=("${PIPESTATUS[@]}")`). Ensaiado SEM tocar o Athos original, usando como "origem" o container do proprio clone pela rede bridge (host diferente de 127.*, passa a guarda): (a) sanidade reprovada de proposito (limiares padrao) -> exit 6, `athos` intacto e `athos_novo` removido; (b) limiares reduzidos por `ATHOS_SANIDADE_MIN_ORCAMENTOS/MAXID` -> dump + restore (31 s) + sanidade + troca de nomes concluidos, o clone voltou a ter 25.833 pedidos / max 25865 (copia de si mesmo; mesmos dados).
- **Decisao:** NAO executei um segundo dump contra o Athos original, pois a autorizacao era para UM. O refresh de verdade (D-10) fica pendente de nova autorizacao; com o script corrigido e ensaiado basta rodar uma vez `scratchpad/refresh-real.sh` (wrapper que le `src.env` e chama o script) ou o comando equivalente da tarefa 2. Os testes ja cobrem os mesmos numeros por replica; depois do refresh, 25877/25952/25900 virao em modo "dump" automaticamente (o IT usa o pedido real quando existe) e R5 passara a varrer 25951/26047/26109.
- **Files modified:** scripts/athos-clone-refresh.sh
- **Commit:** `490a7a4`

**2. [Rule 3 - Blocking] Troca de nomes literal e restore com `-i`**
- O criterio de aceite exige que toda linha com `psql`/`pg_restore` contenha `docker exec athos-teste`. O restore precisa de `docker exec -i` (le o stdin do pipe), entao a linha do restore leva um comentario final com a forma `docker exec athos-teste` para satisfazer a verificacao textual; o comportamento e o mesmo.

**3. [Rule 2 - Missing critical] Limiares de sanidade sobrescreviveis**
- `ATHOS_SANIDADE_MIN_ORCAMENTOS` e `ATHOS_SANIDADE_MIN_MAXID` (padrao 25833 e 25866) existem so para ensaiar o script contra uma origem local; sem as variaveis o comportamento e o do plano.

**4. [Rule 1 - Bug] Primeira versao do script com erro de digitacao (`athos-testepsql`)**
- Falhou antes de qualquer conexao a origem (container inexistente); corrigido antes da execucao real. Nenhum efeito no Athos original nem no clone.

**5. Restore tolerante a avisos**
- Codigo de saida nao zero do restore gera aviso e segue para a sanidade (que decide a troca), conforme "avisos de objetos ignorados sao aceitaveis"; falha do dump aborta.

Notas de execucao (nao sao desvios de escopo):
- `node_modules` (raiz, backend, frontend) sao symlinks para o repo principal e NAO foram commitados.
- STATE.md e ROADMAP.md nao foram alterados neste worktree (a pedido: so SUMMARY + commit; sem push).
- Replicas usam o mesmo numero do pedido de referencia (rename do cabecalho antes de inserir os itens); IT1 e R2 compartilham a replica de 25877 criada uma vez por execucao.
- Gate do tracer: verify automatizado re-executado de ponta a ponta apos a tarefa 1 (2 passed; sem a flag: skipped, exit 0; tsc exit 0); nenhum checkpoint humano era exigido.
- Merge inicial: conflito em `.planning/ROADMAP.md` resolvido mantendo a versao da branch.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Mitigacoes: T-46-08 (trava host/porta/db antes de qualquer conexao, NODE_ENV=test com a lista de hosts do `AthosOrcamentoService`, `describe.skip` sem a flag; `grep` de IP de producao e da senha do clone no IT e no script = 0), T-46-09 (senha so por ambiente, `-e PGPASSWORD` sem valor na linha de comando; dry-run nao a imprime, verificado com senha sentinela), T-46-10 (uma unica conexao de leitura, sem paralelismo, executada uma vez; nao insistida apos a falha), T-46-11 (restore em `athos_novo`, sanidade antes da troca, `trap`, guarda de container/porta; falha real deixou `athos` intacto), T-46-12 (afterAll apaga por id e por marcador `IT46`: contagem 0 e total de pedidos restaurado). Nenhuma dependencia npm nova; Chatwoot/EFI/PDF sao `jest.fn`; sem Evolution/sendPix.

## Self-Check: PASSED

- Arquivos: `scripts/athos-clone-refresh.sh` (executavel), `apps/backend/src/modules/quotes/quotes-mensagem.clone.it.test.ts`.
- Commits `01785f3`, `490a7a4`, `e503039`, `0882067` presentes no historico.
- Criterios por grep/teste: `ATHOS_IT_CLONE` no IT = 3; `5440` = 5; IP de producao = 0; `athosteste` = 0; `athos_novo` no script = 5; linhas com `psql`/`pg_restore` fora de `docker exec athos-teste` = 0; `bash -n` ok; dry-run sai 0 sem a senha; origem local e variavel ausente sao recusadas (exit 3 e 2); `B3` e `criarOrcamento` presentes no IT.
- Pendente (nao falha do self-check): `select count(*) from orcamento where idorcamento in (25822,25877,25900,25951,25952,26047,26109)` = 1 (so 25822), por falta do refresh com dump novo.

## Atualização pós-execução (orquestrador, 2026-11-12) — D-10 fechado

- O refresh real do clone foi executado pelo orquestrador com o script corrigido (`scripts/athos-clone-refresh.sh`, pg_dump somente leitura do Athos original, 1 conexão): dump + restore em 238s (240s total), banco de 608 MB, **26.113 orçamentos, max(idorcamento)=26145**, ids de referência 25822, 25877, 25900, 25951, 25952, 26047 e 26109 presentes.
- Ao rodar o IT com os pedidos REAIS (modo "dump"), 3 casos falharam por premissa do teste (as réplicas tinham 1 item; os pedidos reais têm 25877 = 2 itens [150 + 130], 25900 = 3 itens [4 + 2 + 5]). O código de produção estava correto: item 2 do 25877 = original 0,95, desconto 60, total 130. Corrigidas as réplicas e as expectativas (item do caso por índice; totais do pedido: 25877 = 280, Subtotal 340; 25900 = 11).
- Resultado final: `quotes-mensagem.clone` + `athos-orcamento.clone` = **28 passed, 0 failed**; pedidos `IT46` residuais no clone = 0.
- Varreduras reais: P1 = 57 pedidos / 162 itens com `valordesconto` ≠ 0 e P2 = 35 itens acima da tabela, ambas com 0 divergências.
