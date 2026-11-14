---
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
plan: 02
subsystem: backend (cobranca, integrations/athos)
tags: [contas-a-receber, ordenacao, boletos, athos, somente-leitura, jest]
requires: []
provides:
  - "dataPagamento em GET cobranca/boleto/dashboard"
  - "expireAt e dataPagamento em POST cobranca/boleto/titulos-em-uso"
  - "total_pago por cliente em GET athos/contas-receber/dashboard"
affects: [48-03, 48-04, 48-05]
tech-stack:
  added: []
  patterns: ["4a consulta isolada com try/catch proprio no mesmo PoolClient", "SELECT fixo com ids como parametro (= ANY($1))"]
key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca.service.titulos-em-uso.test.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts
decisions:
  - "dataPagamento so existe quando status = pago; vem de athosBaixaDataPagamento (null em pagos antes da Fase 43)"
  - "total_pago do cliente = soma de conta_recebida.valorpago de todo o periodo (mesma definicao de historico.totalPago)"
  - "Nenhuma rota, parametro ou ordenacao no servidor (D-08); ordenacao continua no navegador"
metrics:
  tasks: 2
  commits: 4
  files: 5
status: complete
actuals:
  tokens: 21000
  tasks: 2
  commits: 4
plan_head_before: cce6fdf6a61d2de4aec6f3faac3cef936771c145
plan_head_after: c6b9689
completed: 2026-11-14
---

# Fase 48 Plano 02: campos de leitura para ordenacao (dataPagamento, expireAt, total_pago) Resumo

Acrescentou, somente leitura, os tres dados que a ordenacao "Pago/Data" da Fase 48 precisa: data de pagamento do boleto (painel e aba do cliente), vencimento do boleto na aba do cliente e total pago por cliente na lista de clientes. Nenhuma regra, rota ou ordenacao no servidor mudou.

## O que foi feito

**Tarefa 1 (tracer, boletos):**
- `buscarBoletosDashboard()` devolve `dataPagamento` em cada linha: `b.status === "pago" ? (b.athosBaixaDataPagamento ?? null) : null`. Ordem, filtros e demais campos iguais.
- `buscarTitulosComBoletoAtivo()` devolve `expireAt` e `dataPagamento` (mesma regra); o `select` do boleto ganhou `expireAt` e `athosBaixaDataPagamento`. Filtro de status (pendente, pago) igual.
- Os proxies Next `boleto/dashboard` e `boleto/titulos-em-uso` repassam o JSON inteiro; nao foram alterados. Controller nao alterado.

**Tarefa 2 (clientes):**
- `buscarDashboardContasReceber()` devolve `total_pago: number | null` em cada cliente, via 4a consulta depois do recebido no mes, no mesmo client, com try/catch proprio e so quando ha clientes:
  `SELECT cr.idcliente, COALESCE(SUM(cre.valorpago), 0) AS total_pago FROM conta_receber cr JOIN conta_recebida cre ON cre.idcontareceber = cr.idcontareceber WHERE cr.idcliente = ANY($1) GROUP BY cr.idcliente`
  com `[ids]` (inteiros positivos dos clientes ja carregados). Cliente ausente no resultado recebe 0; falha gera `logger.warn` e `total_pago: null` em todos, sem afetar summary nem os demais campos.
- A consulta principal (LIMIT 100 e ORDER BY), os agregados e o recebido no mes nao foram tocados.

## Commits

| Commit | Descricao |
|--------|-----------|
| 8a81224 | test(48-02): testes de dataPagamento e expireAt nos boletos (RED) |
| cf7bb17 | feat(48-02): dataPagamento e expireAt nas respostas de boleto (GREEN) |
| fe7ece1 | test(48-02): testes de total_pago por cliente (RED) |
| c6b9689 | feat(48-02): total_pago por cliente na lista de contas a receber (GREEN) |

(mais o commit de documentacao deste SUMMARY)

## Verificacao

- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 22 suites, 306 testes, todos passando (inclui o teste "D5 contrato mantido"). Novos: 3 em `buscarBoletosDashboard - dataPagamento` e 5 em `titulos-em-uso`.
- `npm --prefix apps/backend run test -- athos.service.dashboard --no-coverage`: 14 testes passando (9 antigos, 5 novos em "total_pago por cliente (Fase 48)").
- `npm --prefix apps/backend run test -- integrations/athos --no-coverage`: 26 suites passando, 1 suite ignorada (preexistente), 491 testes passando, 10 ignorados (preexistentes).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceite: `athosBaixaDataPagamento` 3 linhas e `dataPagamento` 4 linhas em cobranca.service.ts; `cr.idcliente = ANY($1)` 1 ocorrencia (grep -F); `LIMIT 100` 2 ocorrencias (consulta principal intacta); `total_pago` 9 ocorrencias; nenhum diff em `cobranca.controller.ts` nem em `apps/frontend/src/app/api`.

## Validacao do SELECT no clone athos-teste (somente leitura)

Executado apenas no container `athos-teste` (PostgreSQL 14 do clone), nunca no Athos de producao, com `psql -Atc` de SELECT:
- Com tres ids (`ANY(ARRAY[...])`): o SELECT do plano rodou sem erro e retornou 3 linhas (uma por cliente).
- Com os ids dos clientes devedores (AVC/VEN, LIMIT 100): 31 clientes com titulo em aberto no clone; o SELECT devolveu total para 29 deles (os 2 restantes nunca pagaram e recebem 0 no servico); menor total 420,09 e maior 15103,64. Nenhum dado de cliente (nome, id) registrado aqui.
- Observacao: o clone e PG14, nao 9.0.5; os recursos usados (`= ANY(array)`, `COALESCE`, `SUM`, `GROUP BY`, JOIN) existem desde o 8.x, conforme a nota do plano.

## Desvios do plano

- **[Processo] Worktree:** o worktree foi criado em commit antigo (8cba258); foi feito `git reset --hard cce6fdf` (HEAD da branch principal), como orientado. `node_modules` (raiz e `apps/backend`) foram ligados por symlink ao repo principal e nao foram commitados.
- **[TDD] Commits separados RED/GREEN:** cada tarefa ficou em dois commits (teste falhando e implementacao) em vez de um so por tarefa, conforme o fluxo TDD (`tdd="true"`).
- **Contagem de consultas:** os tres testes existentes que afirmavam 3 consultas passaram para 4, e o titulo do teste de "tres" para "quatro consultas", como previsto no plano.
- Nenhum bug, funcionalidade critica ou bloqueio adicional encontrado (regras 1 a 4 nao acionadas).

## Stubs conhecidos

Nenhum.

## Flags de ameaca

Nenhuma superficie nova: so campos novos em rotas existentes (T-48-03 mitigada: SQL fixo e ids como parametro, conferido por teste; T-48-04: consulta isolada e validada so no clone; T-48-05: sem rota nova).

## Self-Check: PASSED

Arquivos e commits conferidos (8a81224, cf7bb17, fe7ece1, c6b9689 presentes no historico; cinco arquivos de codigo/teste existentes).
