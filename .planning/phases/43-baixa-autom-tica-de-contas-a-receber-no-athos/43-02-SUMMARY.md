---
phase: 43-baixa-autom-tica-de-contas-a-receber-no-athos
plan: 02
subsystem: api
tags: [nestjs, pg, athos, cobranca, efi, baixa, encargos, juros, multa]
status: complete-with-pending-validation

requires: ["43-01"]
provides:
  - "athos-baixa-encargos.util.ts: diasEntre, calcularEncargosTitulo, decidirValoresBaixa, CONF_FINANCEIRO_COLUNAS, PERCENTUAL_MULTA_PADRAO (funcoes puras)"
  - "baixarTitulos le conf_financeiro na transacao e grava juros, multa, atraso e valorpago; valorPagoEfi e modo no contrato"
  - "extrairDadosPagamentoEfi com valorPago/fonteValor (payment.paid_value, centavos)"
  - "ATHOS_BAIXA_MULTA_PERCENTUAL (padrao 2)"
affects: [43-03, 43-04]

actuals:
  tokens: 31000
  tasks: 3
  commits: 2
plan_head_before: 3ad6d9ab0aad8ce90bb8ef3854be557870202b72
plan_head_after: 911414de3d722226888fa40a510e385ce1eddb9d
commits: 2

key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.ts
    - apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.test.ts
    - .planning/phases/43-baixa-autom-tica-de-contas-a-receber-no-athos/43-INTROSPECCAO-ATHOS.md
    - .env.example
    - deploy/stack.env.example
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml

key-decisions:
  - "Checkpoint de introspeccao resolvido pelo usuario como SEM DADOS REAIS: nenhuma conexao ao Athos (nem somente leitura). Unica evidencia: 2 casos capturados."
  - "Formula de juros: dias = atraso inteiro; taxa diaria = taxajurosmes/30 arredondada a 3 casas (% ao dia); meio para cima em centavos. Multa = percentual x principal, meio para cima. Reproduz os 2 casos centavo a centavo com taxajurosmes = 1 (ou 0,99) e carencia 0."
  - "Percentual de multa: coluna de conf_financeiro desconhecida; configuravel por ATHOS_BAIXA_MULTA_PERCENTUAL (padrao 2, constante PERCENTUAL_MULTA_PADRAO)."
  - "Valor pago (D-02): tres ramos (com_encargos, nominal, VALOR_INCOMPATIVEL), tolerancia R$0,10; comparacao com a EFI so quando nenhum titulo ja estava REC."
  - "ATRASO_REQUER_ENCARGOS permanece apenas para 0 < atraso <= carencia (regiao nunca observada); pagamento em atraso fora da carencia passa a ser baixado."

requirements-completed: [BX-06 (parcial: formula validada so contra 2 casos; ver Pendencias)]
completed: 2026-11-06
---

# Phase 43 Plan 02: Encargos de atraso e valor pago na baixa Summary

**Titulos pagos em atraso passam a ser baixados com juros, multa e atraso calculados (formula reproduzindo os 2 casos reais capturados do Athos) e o valor gravado respeita o que a EFI informa; sem dados reais de conf_financeiro a formula fica marcada como pendente de validacao.**

## Tarefas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | Checkpoint de introspeccao: resolvido por decisao do usuario (sem dados reais, sem conexao ao Athos) | (documentado em 4f1161f) |
| 2 | Util de encargos (TDD, 22 testes) + decisoes derivadas documentadas | 4f1161f |
| 3 | Leitura de conf_financeiro na transacao, decisao de valores, valorPagoEfi no orquestrador | 911414d |

## A formula foi reproduzida?

SIM para os dois casos disponiveis, NAO validada contra dados reais.

| principal | atraso | juros Athos | multa Athos | valorpago Athos | resultado do codigo |
|-----------|--------|-------------|-------------|-----------------|---------------------|
| 457,00 | 10 | 1,51 | 9,14 | 467,65 | identico |
| 252,93 | 10 | 0,83 | 5,06 | 258,82 | identico |

Variantes testadas (em `athos-baixa-encargos.util.test.ts`, teste "variantes descartadas"):
- adotada: base 30, taxa diaria em milesimos de % (1%/30 = 0,033% ao dia), meio para cima: 1,5081 -> 1,51 e 0,83467 -> 0,83.
- descartadas: taxa diaria sem arredondar (1,52 e 0,84), truncamento (1,50), arredondar para cima (0,84 no segundo caso), base 365/12 (1,50), base 30,4 (1,50).
- multa: 2% com meio para cima (9,14 e 5,0586 -> 5,06; truncar daria 5,05).

LIMITES (a formula e sub-determinada com 2 pontos):
1. `taxajurosmes` e `carenciadiascobrancajuros` sao lidos de conf_financeiro em tempo de execucao, mas a formula foi validada ASSUMINDO taxajurosmes = 1 (ou 0,99, que da o mesmo valor diario de 3 casas) e carencia 0.
2. A unidade de `taxajurosmes` e presumida em percentual (1 = 1%). Se for fracao (0,01), os juros saem 100x menores. O guarda-corpo e a EFI: com `payment.paid_value` informado, a baixa so grava se bater com principal + encargos (+-0,10) ou com o principal; senao falha VALOR_INCOMPATIVEL sem escrever.
3. A coluna do percentual de multa e desconhecida; usa `ATHOS_BAIXA_MULTA_PERCENTUAL` (padrao 2).
4. Atraso positivo ate a carencia nunca foi observado: nao se calcula, rejeita com `ATRASO_REQUER_ENCARGOS` (baixa manual).

## Verificacao

- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0, sem "error TS".
- `npm --prefix apps/backend run test -- athos-baixa-encargos`: 22 passed.
- `npm --prefix apps/backend run test -- athos-conta-receber-baixa`: 34 passed (baseline pos 43-01: 22).
- `npm --prefix apps/backend run test -- cobranca`: 9 suites, 92 passed (baseline pos 43-01: 88).
- `npm --prefix apps/backend run test -- athos`: 22 suites, 363 passed (baseline: 21 suites, 325).
- `grep -c "PENDENTE-"` em 43-INTROSPECCAO-ATHOS.md: 0 (marcadores trocados por NAO-COLETADO).
- Nenhum `192.168.` nos arquivos novos; testes so com pg falso; nenhuma conexao de rede; nenhum acesso ao Athos real.
- Escrita em conta_recebida/livro_registro_io continua confinada ao servico Athos de baixa.

## Deviations from Plan

**1. [Decisao do usuario - resolve checkpoint] Task 1 sem dados reais**
- O plano exigia Q1-Q13 e Q5 com >= 10 casos dourados; o usuario proibiu qualquer conexao ao Athos. Secoes marcadas NAO-COLETADO e tabela "Decisoes derivadas" preenchida com o que se sabe e o que e desconhecido.

**2. [Decisao do usuario] Multa por env/constante**
- Em vez de ler a coluna de multa de conf_financeiro (desconhecida), `ATHOS_BAIXA_MULTA_PERCENTUAL` (padrao 2). `CONF_FINANCEIRO_COLUNAS` tem so `taxaJurosMes` e `carenciaDias`; a consulta le apenas essas duas colunas.

**3. [Decisao do usuario] ATRASO_REQUER_ENCARGOS nao foi removido**
- O criterio "grep ATRASO_REQUER_ENCARGOS = 0" do plano nao e atendido: o codigo permanece para a regiao de carencia nao validada (nao existe mais para atraso comum). Testes 26 e util cobrem.

**4. [Escala dos testes]** Gate "minimo de 10 casos dourados / 22 testes do util" substituido por 2 casos dourados reais + testes de variantes descartadas (o util tem 22 testes no total).

**5. [Nota] Ciclo RED/GREEN em commit unico por tarefa** (como no 43-01). Os testes foram escritos antes e falhavam (suite nao compilava) antes da implementacao.

**6. [Rule 3 - ambiente]** symlinks `node_modules` e `apps/backend/node_modules` no worktree (nao versionados), como no 43-01.

**7. [Ambiente]** o arquivo de ledger `gsd-plan-head-before-43-02` nao pode ser gravado (guarda do worktree); `plan_head_before` e `commits` foram medidos com `git rev-list --count 3ad6d9a..HEAD` = 2 (commits de codigo; o commit docs vem depois).

Nenhuma deviation de Rule 1 ou Rule 4.

## Auth gates

Nenhum.

## Known Stubs

Nenhum stub de UI/dados. Pendencias de validacao (nao stubs) listadas abaixo.

## Pendencias para o usuario

1. **Validar a formula com dados reais do Athos** (depende de coletar Q4 e Q5 de `43-INTROSPECCAO-ATHOS.sql`, somente leitura, quando o usuario permitir): confirmar valor e unidade de `taxajurosmes`, `carenciadiascobrancajuros`, a coluna do percentual de multa, e reproduzir pelo menos 10 baixas com atraso. Ate la, a baixa de titulo em atraso e uma hipotese apoiada em 2 casos. Alternativa sem tocar no banco: usar `simular: true` na verificacao guiada do plano 43-04 e comparar com uma baixa em atraso feita manualmente no Athos.
2. Recomendacao: manter `ATHOS_BAIXA_AUTO=false` na primeira subida (ja previsto no 43-01) e, se quiser bloquear temporariamente a baixa de pagamentos em atraso, ficar de olho em `fonteValor` no log: `nao_informado` significa que a EFI nao informou o valor e a baixa gravou os encargos calculados sem confronto.
3. Confirmar o campo `payment.paid_value` (centavos) no payload real da EFI; se a unidade ou o campo forem outros, o resultado seguro e `VALOR_INCOMPATIVEL` (falha fechada) ou `nao_informado` (usa o calculado).
4. **Titulos de valor negativo/zero (abatimentos)**: continuam rejeitados com `TITULO_NAO_POSITIVO` sem escrever (ja existia no 43-01). Decisao do usuario se quer baixa automatica desses titulos exige observar como o Athos grava (Q8).
5. Tamanhos de `livro_registro_io.descricao` (100) e `log.mensagem` (255) seguem provisorios (Q1 nao coletada); log so grava em baixa retroativa e estorno (43-04).
6. Unica fonte de log: a baixa em atraso nao grava log extra alem do da baixa retroativa.

## Threat Flags

Nenhum novo alem do threat_model do plano (T-43-10..T-43-13 mitigados dentro das limitacoes acima; T-43-10 mitigado parcialmente: validacao com 2 casos em vez de 10+).

## Self-Check: PASSED

- Arquivos criados e modificados existem; commits 4f1161f e 911414d presentes no historico da branch.
