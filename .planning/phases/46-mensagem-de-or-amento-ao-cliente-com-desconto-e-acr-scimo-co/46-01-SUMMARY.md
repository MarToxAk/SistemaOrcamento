---
phase: 46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co
plan: 01
subsystem: quotes / integracao Athos
tags: [athos, quotes, desconto, acrescimo, total-liquido, pix]
requires: []
provides:
  - "resolveItemPricing com quantidade (preco original = valoritem + valordesconto/quantidade)"
  - "mapped.totais { valor, descontors, descontoPercentual, valoracrescimo, liquido } em AthosService.buscarOrcamentoPorNumero"
  - "resolveQuoteTotal (quote-totals.util.ts) ligado ao QuotesService.create"
affects: [46-02, 46-03]
tech-stack:
  added: []
  patterns: ["pg falso roteado por SQL nos testes", "util puro de total liquido"]
key-files:
  created:
    - apps/backend/src/modules/quotes/quote-totals.util.ts
    - apps/backend/src/modules/quotes/quote-totals.util.test.ts
    - apps/backend/src/modules/quotes/quotes.service.total-liquido.test.ts
    - apps/backend/src/modules/integrations/athos/athos.service.itens-desconto.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.service.test.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
    - apps/backend/src/modules/quotes/dto/create-quote.dto.ts
    - apps/frontend/src/app/orcamento/novo/page.tsx
decisions:
  - "valordesconto do Athos e o TOTAL da linha: preco original = valoritem + valordesconto/quantidade; desconto da linha = valordesconto + orcamentodesconto (D-01, D-05)"
  - "Total do Quote = valor - descontors + valoracrescimo; cabecalho tratado como BRUTO quando descontors e informado ou quando valor coincide com o bruto dos itens (D-02)"
  - "Desconto maior que a linha: total da linha travado em 0 na leitura do Athos e no Quote (D-04)"
metrics:
  tasks: 3
  commits: 3
status: complete
actuals:
  tokens: 10166
  tasks: 3
  commits: 3
plan_head_before: f365415
plan_head_after: 62daba83df03e22752b45c54f1dbc8f75a032eca
---

# Fase 46 Plano 01: Preco original do item e total liquido do Quote

Correcao do calculo que alimenta a mensagem e o PIX: o preco original do item agora dilui o `valordesconto` (total da linha) pela quantidade, o Athos expoe o cabecalho em `mapped.totais`, e o Quote grava o total liquido (`valor - descontors + valoracrescimo`) em vez do `valor` bruto do cabecalho.

## Tarefas e commits

| Tarefa | Descricao | Commit |
|--------|-----------|--------|
| 1 (tracer) | Orcamento 25877 de ponta a ponta (pg falso -> payload da pagina -> Quote) e `resolveItemPricing` com quantidade | `8edd390` |
| 2 | Matriz P1..P8 e L1..L8, total da linha travado em 0, `mapped.totais`, acrescimo na pagina `/orcamento/novo` | `d89dfa0` |
| 3 | `resolveQuoteTotal` (Q1..Q10) ligado ao `QuotesService.create`, DTO `descontors`, integracao C1..C6 | `62daba8` |

Base do plano (`plan_head_before`): `f365415` (merge da branch com os planos da fase 46 no worktree). `commits: 3` medido com `git rev-list --count f365415..HEAD` (antes do commit deste SUMMARY).

## Resultados dos testes (reais)

Baseline medido antes de qualquer alteracao (HEAD `f365415`): `athos.service.test` + `quotes.service.unit` + `quotes.service.chatwoot` = 3 suites, **84 passed, 0 failed**.

Depois do plano:

| Comando | Resultado |
|---------|-----------|
| `quotes.service.total-liquido` (T1 + C1..C6) | 7 passed, 0 failed |
| `quote-totals.util` (Q1..Q10) | 10 passed, 0 failed |
| `athos.service.itens-desconto` (L1..L8) | 8 passed, 0 failed |
| `athos.service.test` | 51 passed, 0 failed (41 antigos + 10 novos: P1..P8, com P7 expandido em 3 valores) |
| `athos.service.test` + `quotes.service.unit` + `quotes.service.chatwoot` | 94 passed, 0 failed (84 antes) |
| Suite completa do backend (`jest --no-coverage`) | 927 passed, 10 skipped, 0 failed; 64 suites passed, 1 skipped (baseline do plano: 892 passed, 10 skipped, 61 suites passed, 1 skipped) |
| `tsc --noEmit` backend | exit 0, sem `error TS` |
| `tsc --noEmit` frontend | exit 0, sem `error TS` |

### Evidencia RED (testes vistos falhando antes da correcao)

- T1 (tracer 25877) no HEAD: `expect(item.valor).toBe(0.95)` -> `Received: 60.65` (a soma antiga do TOTAL da linha ao unitario).
- `athos.service.itens-desconto.test.ts` antes de `mapped.totais`: suite nao compilou (`TS2339: Property 'totais' does not exist`), cobrindo L3 e L5; L6 (desconto maior que a linha) devolveria total negativo pela formula antiga.
- C2 (cabecalho BRUTO 25952): `Expected: 524.7  Received: 583`.
- C3 (acrescimo 7,50): `Expected: 137.5  Received: 130`.
- `quote-totals.util.test.ts` antes do util: `TS2307: Cannot find module './quote-totals.util'`.
- Observacao honesta: C1, C4, C5 e C6 ja passavam no HEAD (o payload da pagina ja trazia valor liquido e os avisos/zero-lock ja existiam); servem como travas de regressao, como o plano previa ("comportamento atual preservado").

## Esperado x obtido (casos reais)

| Orcamento | Esperado | Obtido (leitura Athos fake -> Quote) |
|-----------|----------|--------------------------------------|
| 25822 (qtd 13, 1,00, valordesconto 13,00) | original 2,00, desconto 13,00, total 13,00 | 2, 13, 13 (L1, P1) |
| 25877 (qtd 200, 0,65, valordesconto 60,00) | original 0,95, desconto 60,00, total 130,00; Quote unitPrice 0,95, discount 60, finalPrice 130, total 130 | identico (L2, P2, T1); antes: 60,65 por unidade |
| 25952 (5,30, orcamentodesconto 58,30, final 524,70, cabecalho 583,00/58,30) | item 5,30 / 58,30 / 524,70; Quote total 524,70 (nunca 583,00) com payload da pagina e com cabecalho bruto | identico (L3, P3, C1, C2, Q1, Q2) |
| 25900 (5,00 contra tabela 1,00) e 1,00 -> 1,50 qtd 4 | desconto 0; totais 5,00 e 6,00 | identico (L4, P4, C4) |
| Regressao qtd 1 (#21716, #21717/#21659, #21718) | mesmos valores de antes | identico (P5) |
| #3701 seq 1 / #9414 seq 2 | 1,00 e 1,88 / 3,00 e 2,65 | identico (P6) |
| Acrescimo 7,50 sobre valor 100,00 / 130,00 | total 107,50 / 137,50 | identico (L5, Q5, C3) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueio] Formula de `resolveItemPricing` escrita com variavel intermediaria**
- **Found during:** Tarefa 1 (criterio de aceite por grep)
- **Issue:** o criterio `grep -c 'bruto.valorItem + bruto.descontoItem'` = 0 colidia com a formula natural `bruto.valorItem + bruto.descontoItem / bruto.quantidade`.
- **Fix:** `descontoPorUnidade = bruto.descontoItem / bruto.quantidade` e `valorOriginal = bruto.valorItem + descontoPorUnidade`. Comportamento identico; com quantidade invalida `descontoPorUnidade` e 0 (original = valoritem).
- **Files modified:** apps/backend/src/modules/integrations/athos/athos.service.ts
- **Commit:** `8edd390`

**2. [Ajuste de execucao] Helper `payloadComoPaginaNovo` ja aceita `valoracrescimo`**
- Introduzido no arquivo de teste da tarefa 1 (usado so em C3, tarefa 3) para nao reescrever o helper depois; espelha o `gerarOrcamento` da pagina apos a tarefa 2.

Fora isso, plano executado como escrito. Nenhum pacote instalado, nenhuma escrita ou conexao ao Athos (todos os testes usam `jest.mock("pg")` e Prisma em memoria).

## Observacoes

- **Quem monta o payload do Quote:** apenas `apps/frontend/src/app/orcamento/novo/page.tsx` (confirmado no plano e nos testes). A pagina agora guarda `data.totais.valoracrescimo` e envia `totais.valoracrescimo` (somente quando > 0); `totais.valor` continua sendo a soma dos totais dos itens (liquido, sem acrescimo) para nao contar o acrescimo duas vezes.
- Quotes ja gravados com total bruto nao foram migrados (fora do escopo); reenviar pela pagina atualiza o Quote pelo mesmo `externalQuoteId`.
- Ambiente do worktree: `node_modules` (raiz, `apps/backend`, `apps/frontend`) sao symlinks para o repo principal e aparecem como nao rastreados no `git status` (nao foram commitados). Conflito de merge inicial em `.planning/ROADMAP.md` resolvido mantendo a versao da branch `feat/fase-42-43-cc-email-baixa-athos`.
- STATE.md e ROADMAP.md nao foram alterados neste worktree (a pedido: so SUMMARY + commit; sem push).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Mitigacoes do threat_model: T-46-01 (arredondamento a duas casas no util, teste Q8; casos reais C1/C2) e T-46-02 (divergencia cabecalho x itens segue em `logger.error`, teste C5) implementadas e cobertas.

## Self-Check: PASSED

- Arquivos criados presentes: quote-totals.util.ts, quote-totals.util.test.ts, quotes.service.total-liquido.test.ts, athos.service.itens-desconto.test.ts.
- Commits `8edd390`, `d89dfa0`, `62daba8` presentes no historico da branch.
- Criterios de aceite por grep: `descontoItem / ` = 1; `bruto.valorItem + bruto.descontoItem` = 0; `descontoPercentual` = 2; `valoracrescimo` na pagina = 5; `resolveQuoteTotal` no service = 2; `descontors` no DTO = 3; `Divergencia de total` = 1; `computeAndValidateFinalItemPrice` = 3.
