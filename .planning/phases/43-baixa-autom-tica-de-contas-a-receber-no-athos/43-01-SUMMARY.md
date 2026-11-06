---
phase: 43-baixa-autom-tica-de-contas-a-receber-no-athos
plan: 01
subsystem: api
tags: [nestjs, pg, athos, cobranca, efi, baixa, contas-a-receber]
status: complete

requires: []
provides:
  - "AthosContaReceberBaixaService.baixarTitulos - baixa transacional unica reproduzindo Baixar Contas (conta_recebida RETURNING, livro_registro_io, conta_receber REC, boleto REC, cliente aviso1-3=false, log retroativo)"
  - "BaixaAthosError/BaixaAthosCodigo e helpers puros hojeSaoPaulo, sanitizarTextoAthos, montarDescricaoLivro, formatarValorAthos"
  - "CobrancaBaixaAthosService.executarAposPagamento (nunca lanca), resolverConfigBaixaAthos, extrairDadosPagamentoEfi"
  - "Gancho dispararBaixaAthos no webhook EFI e em verificarPagamentoBoleto (reconciliacao)"
  - "Variaveis ATHOS_BAIXA_AUTO, ATHOS_BAIXA_ID_FORMA_PAGAMENTO, ATHOS_BAIXA_ID_LIVRO_REGISTRO, ATHOS_BAIXA_ID_FUNCIONARIO"
affects: [43-02, 43-03, 43-04]

actuals:
  tokens: 19770
  tasks: 3
  commits: 3
plan_head_before: 236e0144b424f10129afabc9dfce60e4dd4aa316
plan_head_after: 92ccd2fc1c5783831b415086d0633bf1bd0ff267
commits: 3

tech-stack:
  added: []
  patterns:
    - "Transacao pg manual (BEGIN/COMMIT/ROLLBACK + release no finally) copiada de AthosProdutoCompostoService"
    - "Orquestrador que nunca lanca devolvendo ResultadoExecucaoBaixa; gancho com try/catch de defesa em profundidade"
    - "Trava AMBIENTE_TESTE_HOST_REAL: em NODE_ENV=test so aceita host local/mock (D-07)"
    - "Simulacao em transacao READ ONLY, sem FOR UPDATE, encerrada com ROLLBACK"

key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.tracer.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.baixa-hook.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.module.ts
    - apps/backend/src/modules/cobranca/cobranca.module.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - .env.example
    - deploy/stack.env.example
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml

key-decisions:
  - "Titulo em atraso (vencimento anterior a dataPagamento) e rejeitado com ATRASO_REQUER_ENCARGOS sem escrever; encargos reais ficam para 43-02 (BX-06). Nunca grava encargos zero em titulo atrasado."
  - "Falha na baixa nunca desfaz o pago nem propaga: orquestrador devolve status falha com codigo e o log traz so cobrancaId, origem, codigo e ids de titulos"
  - "Data do pagamento: payment.paid_at, payment.received_by_bank_at, paid_at (nessa ordem), convertida para America/Sao_Paulo; sem dado ou invalida usa hoje; futura e limitada a hoje"
  - "Webhook consulta GET /v1/charge/{id} apos marcar pago (falha isolada, so warn) para obter o payload com a data real"

requirements-completed: [BX-01, BX-02, BX-03, BX-04, BX-05, BX-11]

duration: ~35min
completed: 2026-11-06
---

# Phase 43 Plan 01: Baixa automatica no Athos (nucleo + gancho) Summary

**Boleto EFI pago (webhook ou reconciliacao) dispara baixa transacional unica no Athos reproduzindo "Baixar Contas", com idempotencia, validacoes antes de escrever, data real do pagamento, simulacao somente leitura e trava de host em teste; tudo provado com pg falso, sem tocar o Athos real.**

## Tarefas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | Tracer: webhook paid -> gancho -> servico transacional -> SQL (D-01, D-04, D-05, D-08, D-09) | c4b6388 |
| 2 | Nucleo transacional: 22 testes + variaveis ATHOS_BAIXA_* no deploy | 3533148 |
| 3 | Gancho completo: flag, data real EFI, reconciliacao, 15 testes do orquestrador e 10 do gancho | 92ccd2f |

## Verificacao

- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0, sem "error TS" (baseline 0).
- `npm --prefix apps/backend run test -- cobranca`: 9 suites, 88 passed (baseline 61 em 6 suites; minimo do plano 78).
- `npm --prefix apps/backend run test -- athos`: 21 suites, 325 passed (baseline 286 em 18 suites; nada regrediu).
- Suites novas: athos-conta-receber-baixa 22 passed (minimo 18); tracer 2 passed; orquestrador 15 passed (minimo 8); gancho 10 passed (minimo 7).
- Gate de escrita confinada: `grep -rliE 'INSERT INTO (conta_recebida|livro_registro_io)'` fora de testes lista somente `athos-conta-receber-baixa.service.ts`.
- Gate D-07: os dois testes que usam o servico real contem `jest.mock("pg"`; nenhum arquivo novo contem `192.168.`.
- Invariantes: `status: "pago"` aparece 1 vez em cobranca.service.ts; `cobranca-reconciliation.job.ts` sem alteracao.
- Nenhuma conexao de rede foi aberta pelos testes; nenhum acesso ao Athos real em nenhum momento; nenhuma migration; nenhuma dependencia npm nova.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] node_modules ausente no worktree**
- **Found during:** preparacao (baseline de testes)
- **Issue:** o worktree nasceu sem node_modules (nao versionado), impedindo jest e tsc.
- **Fix:** symlinks locais `node_modules` e `apps/backend/node_modules` apontando para o checkout principal. Nao foram adicionados ao git (staging sempre arquivo a arquivo).
- **Commit:** nenhum (ambiente)

**2. [Organizacao] Regras da Task 2 e orquestrador completo implementados ja no commit da Task 1**
- **Found during:** Task 1
- **Issue:** o servico Athos e o orquestrador tem estrutura unica; implementar so o "caminho minimo" na Task 1 e reescrever na Task 2 e 3 geraria retrabalho sem ganho.
- **Fix:** o commit da Task 1 ja contem validacoes completas, retroativa, simulacao, trava de host, `resolverConfigBaixaAthos`, flag `ATHOS_BAIXA_AUTO` e `extrairDadosPagamentoEfi`. Os commits das Tasks 2 e 3 trazem os testes (22 casos na Task 2; 25 na Task 3), a documentacao de deploy e o complemento do gancho (consulta da cobranca no webhook e gancho na reconciliacao). O resultado final e o mesmo contrato do plano.
- **Commit:** c4b6388

**3. [Rule 2 - Critical] Casos de teste adicionais alem dos listados no behavior**
- Adicionados: 13b (constantes invalidas sem conexao), 15b (FOR UPDATE fora da simulacao), 17b (falha de conexao nao vaza detalhes), 17c (SQL sem recursos pos-9.0 e sem interpolacao), 7b (constantes por env), H1b, H5b, H7b e casos extras de `extrairDadosPagamentoEfi`. Reforcam T-43-05/T-43-07 e a compatibilidade PG 9.0.5.

**4. [Nota] Ciclo RED/GREEN em commit unico por tarefa**
- Os testes foram escritos antes da implementacao em cada tarefa, mas cada tarefa foi commitada uma vez (teste + implementacao), nao em commits separados RED e GREEN.

Nenhuma deviation de Rule 1 ou Rule 4.

## Auth gates

Nenhum.

## Known Stubs

Nenhum stub de UI/dados. Pontos intencionalmente incompletos, resolvidos por planos seguintes:
- `juros`, `multa` e `atraso` sao gravados como 0 apenas para titulo em dia; titulo em atraso e rejeitado (ATRASO_REQUER_ENCARGOS) ate o plano 43-02 calcular encargos de `conf_financeiro`.
- Limite de 100 caracteres da descricao do livro e provisorio ate 43-02 confirmar o tamanho real da coluna.
- Falha na baixa so fica no log estruturado; registro duravel e retentativa sao do plano 43-03.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: db-write | athos-conta-receber-baixa.service.ts | Nova escrita em tabelas financeiras do Athos (ja prevista no threat_model do plano: T-43-01..T-43-09 mitigados). Exige GRANT de escrita ao usuario ATHOS_PG_USER antes de ligar em producao. |

## Pendencias para o usuario / DBA

1. Conceder INSERT/UPDATE (e USAGE nas sequences) ao usuario de `ATHOS_PG_USER` nas tabelas da baixa antes de ligar `ATHOS_BAIXA_AUTO` em producao (sem isso a baixa falha com PERMISSAO_NEGADA, sem desfazer o pago).
2. Primeira subida em producao: usar `ATHOS_BAIXA_AUTO=false` ate a verificacao guiada do plano 43-04. O padrao dos compose e `true` (D-01).
3. Confirmar o campo real da data de pagamento no payload da EFI (a fonte usada fica no log como `fonteData`).
4. Nenhuma baixa foi testada contra o Athos real (D-07); a validacao com dados reais e manual e guiada (43-04).

## Self-Check: PASSED

- Arquivos criados e modificados existem (verificados via git diff --stat contra 236e014: 13 arquivos).
- Commits c4b6388, 3533148 e 92ccd2f presentes no historico da branch do worktree.
