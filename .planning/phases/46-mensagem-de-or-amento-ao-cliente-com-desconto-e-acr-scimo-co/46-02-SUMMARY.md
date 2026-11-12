---
phase: 46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co
plan: 02
subsystem: quotes / mensagem WhatsApp via Chatwoot
tags: [quotes, mensagem, desconto, acrescimo, pix, chatwoot]
requires: ["46-01"]
provides:
  - "quote-message.util.ts (formatarBRL, formatarLinhaItem, calcularResumoValores, montarLinhasTotal)"
  - "buildPaymentMessage com item riscado, Subtotal/Desconto/Acrescimo/Total"
  - "enviarPixCopiaECola: Pix Copia e Cola em mensagem separada"
affects: [46-03]
tech-stack:
  added: []
  patterns: ["util puro de formatacao", "EfiService com prototipo real e rede falsa nos testes", "golden da mensagem capturado antes da alteracao"]
key-files:
  created:
    - apps/backend/src/modules/quotes/quote-message.util.ts
    - apps/backend/src/modules/quotes/quote-message.util.test.ts
    - apps/backend/src/modules/quotes/quotes.service.mensagem.test.ts
  modified:
    - apps/backend/src/modules/quotes/quotes.service.ts
decisions:
  - "Item com desconto: `~R$ bruto~ R$ total` com bruto = total + desconto da linha; bloco Subtotal/Desconto/Acrescimo/Total so quando ha ajuste (sem ajuste a mensagem e identica a anterior)"
  - "Subtotal e Desconto consideram TODOS os itens (lista exibida limitada a 10); divergencia entre total e itens gera logger.warn e o Desconto exibido passa a ser max(0, subtotal + acrescimo - total)"
  - "Pix Copia e Cola em mensagem propria depois da principal e antes do PDF; falha so gera warn sem o codigo"
metrics:
  tasks: 3
  commits: 3
status: complete
actuals:
  tokens: 8285
  tasks: 3
  commits: 3
plan_head_before: fa0d60c29ee4176455e8f374848df89ba524a5e7
plan_head_after: 25685e7ce619b271366f0f6eb9e164fa1237e597
---

# Fase 46 Plano 02: Mensagem com desconto/acrescimo e Pix Copia e Cola separado

A mensagem de WhatsApp (Chatwoot) passa a mostrar item com preco original riscado, Subtotal, Desconto, Acrescimo e Total liquido; a cobranca PIX nasce no total liquido do Quote; e o Pix Copia e Cola vai sozinho numa segunda mensagem.

## Tarefas e commits

| Tarefa | Descricao | Commit |
|--------|-----------|--------|
| 1 (tracer) | util puro + `buildPaymentMessage`/`enviarParaCliente` com resumo de valores; tracer 25877 e golden sem desconto | `dd5a568` |
| 2 | Matriz U1..U10 (util) e M1, M2, M4, M5, M6, M7; total 0 de item bonificado em `mapQuoteToAthosMapped` | `04d4e0e` |
| 3 | `enviarPixCopiaECola` e testes X1..X5; remocao do codigo/convite da mensagem principal | `25685e7` |

Base (`plan_head_before`): `fa0d60c` (merge da branch `feat/fase-42-43-cc-email-baixa-athos`, ja com o plano 46-01). `commits: 3` medido com `git rev-list --count fa0d60c..HEAD` antes do commit deste SUMMARY.

## Resultados dos testes (reais)

Baseline medido antes de alterar o codigo (HEAD `fa0d60c`, ja com os testes novos da tarefa 1 escritos):

| Comando | Antes | Depois |
|---------|-------|--------|
| `quotes.service.unit` + `quotes.service.chatwoot` + `quotes.service.total-liquido` | 50 passed | 50 passed |
| `quotes.service.mensagem` | M3 passou, T1 falhou (2 testes) | 15 passed (M3, T1, M1, M2, M4, M5, M6, M7, X1, X2 x3, X3, X4, X5) |
| `quote-message.util` | suite inexistente | 11 passed (U1..U10 + acrescimo invalido) |
| 5 suites acima juntas | - | 76 passed, 0 failed |
| Suite completa do backend (`jest --no-coverage`) | 928 passed, 1 failed (T1 propositalmente em RED), 10 skipped, 64 suites passed + 1 failed + 1 skipped | **953 passed, 0 failed, 10 skipped; 66 suites passed, 1 skipped** |
| `tsc --noEmit -p apps/backend/tsconfig.json` | - | exit 0, sem `error TS` |

(Baseline do plano 46-01: 927 passed; o plano 46-02 acrescenta 26 testes: 953.)

### Evidencia RED

- **Golden M3 (sem desconto)** foi fixado vendo a saida REAL do codigo ainda nao alterado (HEAD `fa0d60c`): saudacao, "Segue o resumo do seu pedido:", `📋 *Orçamento #25877*`, linhas `• Caderno (2x) — R$ 20,00` e `• Lápis (1x) — R$ 3,50`, `💰 *Total: R$ 23,50*`, separador, `*1️⃣ PIX à vista — R$ 23,50*` com link, separador e despedida. M3 passou no HEAD e continua passando depois (a mensagem sem desconto nao mudou, byte a byte).
- **T1 (tracer 25877)** falhou no HEAD: a linha do item saia `• Caneta teste (200x) — R$ 130,00`, sem Subtotal/Desconto.
- **M5 (bonificado)** falhou antes da correcao: `mapQuoteToAthosMapped(...).itens[0].total` devolvia `12` em vez de `0`.
- **X1 e X3** falharam antes da separacao do codigo (codigo dentro da mensagem principal; nenhuma 2a chamada).
- Observacao honesta: M1, M2, M4, M6, M7 e X2, X4, X5 ja passaram assim que o util/`buildPaymentMessage` da tarefa 1 existiram ou porque descrevem comportamento ja existente (travas de regressao); o M6 teve um erro no PROPRIO teste na primeira rodada (contava tambem as linhas `• Entrada agora`/`• Restante` do bloco 50/50) e foi corrigido no filtro do teste, nao no codigo.

## Esperado x obtido (casos reais, Chatwoot/EFI falsos)

| Orcamento | Esperado | Obtido |
|-----------|----------|--------|
| 25877 (200 x 0,95, desconto 60, total 130) | `• Caneta teste (200x) — ~R$ 190,00~ R$ 130,00`, `Subtotal: R$ 190,00`, `Desconto: -R$ 60,00`, `Total: R$ 130,00`; PIX amount 130 | identico (T1) |
| 25952 (110 x 5,30, desconto 58,30, total 524,70) | Subtotal 583,00, Desconto -58,30, Total 524,70 (583,00 nunca como total); PIX 524,70 | identico (M1) |
| 25900 (1 x 5,00) | sem Subtotal/Desconto/`~`; `Total: R$ 5,00`; PIX 5 | identico (M2) |
| 25877 + acrescimo 7,50 | `Acréscimo: +R$ 7,50`, Total 137,50; PIX 137,50 | identico (M4) |
| Item bonificado 10 x 1,20, desconto 12, final 0 | `~R$ 12,00~ R$ 0,00`; total mapeado 0 | identico (M5) |
| 12 itens (2 com desconto de 2,00) | 10 linhas de item + `_...e mais 2 item(s)_`; Subtotal 120,00, Desconto -4,00, Total 116,00 | identico (M6) |
| Total 100 com itens somando 130 (desconto 60) | Desconto -R$ 90,00 e `logger.warn` com "diverg" | identico (M7) |
| Pix Copia e Cola | 2 mensagens: principal sem o codigo, depois so o codigo, PDF por ultimo; falha na 2a so avisa sem o codigo | identico (X1, X3) |

## Deviations from Plan

None - plano executado como escrito.

Notas de execucao (nao sao desvios de escopo):
- O tracer precisou de `checkPaymentStatus = jest.fn().mockResolvedValue(undefined)` (o plano dizia `jest.fn()`; o codigo chama `.catch` na promessa).
- O criterio de aceite `grep -c "desconto > 0"` foi atendido com a variavel `zeroExplicadoPorDesconto = providedTotal === 0 && desconto > 0` em `mapQuoteToAthosMapped`.
- Gate do tracer: verify automatizado re-executado de ponta a ponta apos a tarefa 1 (2 passed, regressao 45 passed, tsc exit 0); nenhum checkpoint humano era exigido.
- Merge inicial: conflito em `.planning/ROADMAP.md` resolvido mantendo a versao da branch da fase 42-43. `node_modules` (raiz, backend, frontend) sao symlinks para o repo principal e NAO foram commitados.
- STATE.md e ROADMAP.md nao foram alterados neste worktree (a pedido: so SUMMARY + commit; sem push).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Mitigacoes: T-46-04 (amount do PIX afirmado em T1/M1/M2/M4: 130, 524.7, 5, 137.5), T-46-05 (X3 afirma que nenhum aviso contem o codigo; `enviarPixCopiaECola` nunca loga o codigo), T-46-06 (codigo vai ao mesmo `convId`; X1), T-46-07 (aviso de divergencia, M7). Nenhuma dependencia npm nova; nenhuma conexao a Athos, Chatwoot ou EFI reais (todos `jest.fn`); sem Evolution/sendPix.

## Self-Check: PASSED

- Arquivos presentes: quote-message.util.ts, quote-message.util.test.ts, quotes.service.mensagem.test.ts.
- Commits `dd5a568`, `04d4e0e`, `25685e7` presentes no historico.
- Criterios por grep: `calcularResumoValores` no service = 2; `Subtotal` no util >= 1; `caso prefira copiar` = 0; `enviarPixCopiaECola` = 2; `Evolution|sendPix` = 0; `desconto > 0` = 1; `25952` no teste >= 1.
