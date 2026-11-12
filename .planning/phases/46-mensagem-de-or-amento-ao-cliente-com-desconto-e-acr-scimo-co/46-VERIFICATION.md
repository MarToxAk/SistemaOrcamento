---
phase: 46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co
verified: 2026-11-12T12:10:00Z
status: human_needed
score: 11/11 must-haves verified
covered_files:
  - ".planning/phases/46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co/46-01-PLAN.md"
  - ".planning/phases/46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co/46-01-SUMMARY.md"
  - ".planning/phases/46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co/46-02-PLAN.md"
  - ".planning/phases/46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co/46-02-SUMMARY.md"
  - ".planning/phases/46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co/46-03-PLAN.md"
  - ".planning/phases/46-mensagem-de-or-amento-ao-cliente-com-desconto-e-acr-scimo-co/46-03-SUMMARY.md"
  - "apps/backend/src/modules/integrations/athos/athos.service.ts"
  - "apps/backend/src/modules/quotes/dto/create-quote.dto.ts"
  - "apps/backend/src/modules/quotes/quote-message.util.ts"
  - "apps/backend/src/modules/quotes/quote-totals.util.ts"
  - "apps/backend/src/modules/quotes/quotes-mensagem.clone.it.test.ts"
  - "apps/backend/src/modules/quotes/quotes.service.ts"
  - "apps/frontend/src/app/orcamento/novo/page.tsx"
  - "scripts/athos-clone-refresh.sh"
covered_digest: "v4:sha256:869f11ce0a772f792bee7ea1a336e73e24b11b7b45961a7e3f06baeb2bb888fc"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Enviar um orcamento real com desconto (ex.: um pedido recente do Balcao com preco alterado) pelo fluxo Enviar ao cliente e olhar a conversa no WhatsApp/Chatwoot"
    expected: "Item com preco original riscado (~R$ x~ R$ y) renderizado como tachado no WhatsApp; Subtotal/Desconto/Total corretos; link PIX na mensagem principal; Pix Copia e Cola chega como 2a mensagem contendo so o codigo; PDF por ultimo"
    why_human: "Testes usam Chatwoot/EFI falsos e so conferem o texto; a renderizacao real do tachado (~...~) pelo canal e a ordem/legibilidade das 3 mensagens so se veem na conversa real"
  - test: "Confirmar no Athos de producao (Balcao) como um orcamento COM acrescimo grava o cabecalho: o campo valor ja inclui valoracrescimo ou nao?"
    expected: "Se valor NAO inclui o acrescimo, a formula valor - descontors + valoracrescimo da fase esta certa; se JA inclui, o Quote/PIX cobraria o acrescimo em dobro"
    why_human: "Nenhum dos 26.113 orcamentos do clone (dump de 2026-11-12) tem valoracrescimo <> 0, entao a semantica do acrescimo so foi provada por replica construida pela propria fase (B4), nao por dado real. Consulta de leitura no Athos original exige decisao do usuario"
  - test: "Cobranca PIX real (EFI) de um orcamento com desconto: conferir o valor da cobranca gerada no app do banco/painel EFI"
    expected: "Valor da cobranca = Total liquido da mensagem (ex.: 524,70 no 25952, nunca 583,00)"
    why_human: "createPixPaymentLink e falso nos testes; so se confirma o amount a EFI real vendo a cobranca"
gaps: []
---

# Fase 46: Mensagem de orcamento ao cliente com desconto e acrescimo corretos - Relatorio de Verificacao

**Objetivo da fase:** A mensagem de orcamento enviada ao cliente (WhatsApp via Chatwoot) e a cobranca PIX mostram valores corretos quando houve alteracao de preco unitario, desconto por item/geral e acrescimo; preco original = valoritem + valordesconto/qtd; total cobrado liquido; mensagem com Subtotal/Desconto/Total e preco riscado; Pix Copia e Cola separado; sem Evolution/sendPix; nada escrito no Athos original.
**Verificado em:** 2026-11-12 (HEAD 6fa88d5, branch feat/fase-42-43-cc-email-baixa-athos)
**Status:** human_needed
**Re-verificacao:** Nao (verificacao inicial)

## Evidencia executada (nao vem dos SUMMARYs)

| Comando | Resultado |
|---------|-----------|
| `npm --prefix apps/backend run test -- --no-coverage` | 66 suites passed, 2 skipped; **953 passed, 28 skipped, 0 failed** (bate com o esperado) |
| `tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| `tsc --noEmit -p apps/frontend/tsconfig.json` | exit 0 |
| IT no clone (`quotes-mensagem.clone`, somente 127.0.0.1:5440/athos, flag ATHOS_IT_CLONE=1) | **18 passed, 0 failed**; ~138 linhas na tabela esperado x obtido, todas coincidentes; P1 = 57 pedidos/162 itens e P2 = 35 itens acima da tabela, 0 divergencias |
| Clone apos o IT | 26.113 orcamentos, max(idorcamento) 26145 (igual ao estado pos-refresh); pedidos `IT46` residuais = 0 |
| `grep` de "caso prefira" em apps/ (fora de teste) | 0 ocorrencias (so aparece na asserção negativa do teste X1/X3) |
| `grep` de Evolution/sendPix em quotes/*.ts (fora de teste) | 0 ocorrencias |
| `grep` de IPs de producao (192.168.33.198, 192.168.3.198, 100.102.146.44) no script e no codigo de quotes | 0 ocorrencias |

## Verdades observaveis

| # | Verdade (ROADMAP / CONTEXT) | Status | Evidencia no codigo |
|---|------------------------------|--------|---------------------|
| 1 | Preco original = `valoritem + valordesconto/quantidade`; desconto da linha = `valordesconto + orcamentodesconto` | VERIFICADO | `athos.service.ts:150-157` (`resolveItemPricing`: `descontoPorUnidade = descontoItem / quantidade`, quantidade invalida -> 0). Chamado em `loadItems` (l.490) com a quantidade. IT: 25822 = 2,00/13,00/13,00; 25877 item 2 = 0,95/60/130 (dado REAL do dump atual); B2 (vd + od) = 1,00 / 1,88 / 3,12 |
| 2 | Total liquido do cabecalho exposto: `mapped.totais {valor, descontors, descontoPercentual, valoracrescimo, liquido}`; `valor` bruto do Athos nao e usado como total | VERIFICADO | `athos.service.ts:708-749`. IT 25952: `totais.valor` 583, `liquido` 524,70, Quote.total 524,70 |
| 3 | `resolveQuoteTotal` usado no `QuotesService.create` e o Quote grava o total liquido (+ acrescimo) | VERIFICADO | `quotes.service.ts:626-646` chama `resolveQuoteTotal`; `total`/`discount`/`surcharge` vao para o `quote.create` (l.671-674, 781-784). util em `quote-totals.util.ts` (cabecalho bruto quando `descontors` informado ou valor == bruto dos itens; liquido caso contrario; acrescimo sempre somado). IT: 25952 Quote.total 524,70; B4 27,50 |
| 4 | Cobranca PIX no total liquido | VERIFICADO (com ressalva humana) | `enviarParaCliente` (l.1789-1830): `total = Number(quote.total)` alimenta `resolvePaymentOptions`, `createPixPaymentLink`, `createPix5050Link`, `createCardPaymentLink`. IT: `amount` do PIX falso = Quote.total em todos os casos (130, 524,7, 5, 63, 3,12, 6, 27,5, 9,5...). Valor na EFI real: item humano 3 |
| 5 | Acrescimo somado ao total e exibido na mensagem | VERIFICADO no codigo; semantica nao provada com dado real | `resolveQuoteTotal` (`round2(valor + surcharge)`), `montarLinhasTotal` (`Acréscimo: +R$`), pagina `/orcamento/novo` reenvia `totais.valoracrescimo` (l.408, 494-499). B4 ok. Ressalva: 0 de 26.113 orcamentos do clone tem acrescimo; item humano 2 |
| 6 | Mensagem: Subtotal/Desconto/Total; preco original riscado so nos itens com desconto; sem desconto/acrescimo a mensagem fica como era | VERIFICADO | `quote-message.util.ts` (`formatarLinhaItem` so risca se `desconto > 0,009`; `montarLinhasTotal` devolve so a linha de Total sem ajuste). `quotes.service.ts` (`buildPaymentMessage`) usa os dois. Golden M3 (sem desconto) igual a antes; IT: B1 `~R$ 69,00~ R$ 63,00`, 25900/B3/F44-4 sem `~`/Subtotal/Desconto |
| 7 | Pix Copia e Cola em mensagem separada, so com o codigo; texto "caso prefira copiar" removido | VERIFICADO | `quotes.service.ts` `enviarPixCopiaECola` (envia `codigo.trim()` sozinho) chamado apos a principal e antes do PDF (l.1930); o bloco antigo foi removido de `buildPaymentMessage`. grep "caso prefira" = 0; IT25877: 2 mensagens, codigo ausente da principal |
| 8 | Falha da mensagem separada: so `logger.warn`, sem o codigo no log, orcamento ja enviado | VERIFICADO | `enviarPixCopiaECola` try/catch com `logger.warn` que loga so `err.message` e o id; teste X3 (suite verde) |
| 9 | Sem Evolution/sendPix; envio continua pelo Chatwoot | VERIFICADO | grep = 0 em `quotes/*.ts` fora de teste; so `chatwootService.sendOutgoingMessage` |
| 10 | Nada escrevendo no Athos original | VERIFICADO | `athos-clone-refresh.sh`: unica interacao com a origem e `pg_dump ... -Fc --no-owner --no-privileges` (leitura) via `docker run`; recusa host de origem local; exige que o container `athos-teste` publique 5432 somente em 127.0.0.1:5440; psql/pg_restore/DROP/ALTER so via `docker exec athos-teste`; restore em `athos_novo` + sanidade antes da troca. IT: trava host/porta/db (`127.0.0.1`/`5440`/`athos`) e `NODE_ENV=test` ANTES de criar o `pg.Client`; Chatwoot/EFI/PDF sao `jest.fn`. `git diff 2f71d8f..HEAD` em `athos.service.ts` nao adiciona nenhum INSERT/UPDATE/DELETE; `athos-orcamento.service.ts` nao foi alterado |
| 11 | Testes com os casos reais 25822, 25877, 25952, 25900 e verificacao no clone, incluindo investigacao do aumento de preco (1,00 -> 1,50) | VERIFICADO | Testes unitarios (athos.service.itens-desconto L1..L8, P1..P8, quote-totals Q1..Q10, total-liquido C1..C6, mensagem M1..M7/X1..X5/T1) e IT 18/18 rodado por mim. Aumento de preco: B3, F44-4, P2 (35 itens reais acima da tabela) sem divergencia: desconto 0, valor = preco digitado, mensagem sem desconto |

**Score:** 11/11 verdades verificadas (0 present-but-behavior-unverified).

## Artefatos

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | `resolveItemPricing` com qtd + `mapped.totais` | VERIFICADO | substantivo, usado por `loadItems`/`buscarOrcamentoPorNumero`, dados reais (clone) fluem |
| `apps/backend/src/modules/quotes/quote-totals.util.ts` | `resolveQuoteTotal` | VERIFICADO | puro, importado e usado em `create` |
| `apps/backend/src/modules/quotes/quote-message.util.ts` | formatacao da mensagem | VERIFICADO | importado e usado em `buildPaymentMessage` |
| `apps/backend/src/modules/quotes/quotes.service.ts` | create liquido, mensagem, Pix separado | VERIFICADO | ver verdades 3, 4, 6, 7, 8 |
| `apps/backend/src/modules/quotes/dto/create-quote.dto.ts` | `totais.descontors` | VERIFICADO | opcional, `@IsNumber` |
| `apps/frontend/src/app/orcamento/novo/page.tsx` | envia `totais.valoracrescimo` | VERIFICADO | l.408 le do Athos, l.499 envia (>0) |
| `apps/backend/src/modules/quotes/quotes-mensagem.clone.it.test.ts` | IT gated no clone | VERIFICADO | executado: 18 passed |
| `scripts/athos-clone-refresh.sh` | refresh somente leitura da origem | VERIFICADO (por leitura; nao reexecutado para nao tocar o Athos original) | guardas de origem/destino conforme verdade 10 |

## Links chave

| De | Para | Via | Status |
|----|------|-----|--------|
| `loadItems` | `resolveItemPricing` | chamada com `quantidade` | LIGADO |
| `buscarOrcamentoPorNumero` | pagina `/orcamento/novo` -> `QuotesService.create` | `totais.valoracrescimo`, `valor` liquido do payload | LIGADO |
| `QuotesService.create` | `resolveQuoteTotal` | total/discount/surcharge gravados | LIGADO |
| `enviarParaCliente` | `createPixPaymentLink`/50-50/cartao | `amount: total` (= `quote.total` liquido) | LIGADO |
| `enviarParaCliente` | `buildPaymentMessage` | `itens` de `mapQuoteToAthosMapped` + `acrescimo` | LIGADO |
| `enviarParaCliente` | `enviarPixCopiaECola` | depois da principal, antes do PDF | LIGADO |

## Regressoes procuradas

| Ponto | Resultado |
|-------|-----------|
| Callers de `resolveItemPricing` | unico caller de producao e `loadItems`; os demais usos sao testes |
| Consumidores de `mapped.totais` | novo campo aditivo; pagina `/orcamento/novo` le so `valoracrescimo`; PDF/EFI webhooks leem `body.totais.valor` do `mapQuoteBody` (= `quote.total`, agora liquido, coerente) |
| Orcamentos antigos com qtd = 1 | `descontoPorUnidade = desconto/1` = comportamento anterior; teste P5 (#21716, #21717/#21659, #21718) e P6 verdes; 25900/26109 no IT |
| Desconto > linha | total da linha travado em 0 + aviso, como antes (L6, C5/C6); item bonificado total 0 preservado em `mapQuoteToAthosMapped` (M5) |
| Merge de orcamentos (`quotes.service.ts` ~1400) | nao recalcula total; inalterado |
| Mensagens de fallback (sem opcoes EFI / sem link PIX) | mostram apenas `Total: R$ total.toFixed(2)` (liquido, valor correto) sem itens/desconto; ver Avisos |

## Anti-padroes

Nenhum marcador TBD/FIXME/XXX/TODO nos arquivos tocados (o unico match foi a palavra "TODOS" em comentario). Sem stubs, sem retornos vazios, sem handlers vazios.

## Avisos (nao bloqueiam; nao sao gaps de must-have)

1. **Acrescimo nao provado com dado real.** `valoracrescimo <> 0` ocorre em 0 de 26.113 orcamentos do clone; a regra `valor - descontors + valoracrescimo` e decisao do CONTEXT (D-02) e foi exercida apenas em replica/unitarios. Se no Athos real o `valor` ja incluir o acrescimo, o PIX o cobraria em dobro. Item humano 2.
2. **Mensagens de fallback** (`enviarParaCliente`, quando nao ha `paymentOptions`/`pixPayment`): usam `\\n` (barra invertida literal no template string, bug pre-existente desde antes da fase, nao introduzido por ela) e nao mostram Subtotal/Desconto. O total esta correto; so o formato e pobre. Fora do escopo declarado, mas vale um ajuste futuro.
3. **Quotes ja gravados antes da correcao** (unitPrice inflado pela soma antiga) nao foram migrados; so um novo envio pela pagina `/orcamento/novo` os atualiza pelo mesmo `externalQuoteId`. Reenviar um Quote antigo sem recriar mostra os valores antigos. Documentado no 46-01-SUMMARY.
4. **Heuristica de cabecalho bruto x liquido** em `resolveQuoteTotal` quando `descontors` nao vem (cabecalho tratado como bruto se `valor` == bruto dos itens e bruto > liquido). Coberta por Q1..Q10 e pelos payloads reais da pagina; callers externos (API) que mandem `valor` ja liquido junto com `descontors` seriam descontados duas vezes; hoje o unico montador do payload e a pagina `/orcamento/novo`, que nao envia `descontors`.
5. O IT depende do clone local (`athos-teste`) e de `precovendaproduto`; sem a flag fica em `describe.skip` (por isso 28 skipped na suite completa, esperado).
6. Estado do worktree: ha mudancas nao relacionadas (STATE.md, 41-VERIFICATION.md, state.json, .gitkeep de outras fases); nenhum arquivo de codigo foi alterado por esta verificacao.

## Itens para verificacao humana

### 1. Mensagem real no WhatsApp

**Teste:** Enviar ao cliente (conversa de teste) um orcamento real com desconto por item e outro sem desconto.
**Esperado:** tachado do preco original renderizado, Subtotal/Desconto/Total corretos, link PIX na principal, codigo Pix Copia e Cola sozinho na 2a mensagem, PDF por ultimo; orcamento sem desconto igual ao formato antigo.
**Por que humano:** testes usam Chatwoot falso.

### 2. Semantica real do acrescimo no Athos

**Teste:** Localizar (ou criar no Balcao) um orcamento com acrescimo e ver como `valor`, `descontors` e `valoracrescimo` ficam gravados; so leitura, com autorizacao do usuario.
**Esperado:** `valor` nao inclui o acrescimo (senao ajustar `resolveQuoteTotal`).
**Por que humano:** nenhum dado real no clone.

### 3. Valor da cobranca na EFI

**Teste:** Gerar a cobranca PIX de um orcamento com desconto e conferir o valor no painel EFI.
**Esperado:** igual ao Total da mensagem.
**Por que humano:** EFI falsa nos testes.

## Resumo

Todas as verdades do goal e das decisoes do CONTEXT foram confirmadas no codigo e por execucao propria (953 passed / 28 skipped; tsc backend e frontend limpos; IT do clone 18/18 com pedidos REAIS 25822, 25877, 25951, 25952, 25900, 26047, 26109 e varreduras sem divergencia). Nenhuma escrita no Athos original foi encontrada ou possivel pelos artefatos da fase. O status fica `human_needed` apenas por tres checagens que testes nao conseguem fazer: renderizacao real no WhatsApp, semantica do acrescimo em dado real do Athos e valor da cobranca na EFI real.

---

_Verificado: 2026-11-12T12:10:00Z_
_Verificador: Claude (gsd-verifier)_
