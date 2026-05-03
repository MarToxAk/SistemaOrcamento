# Phase 7: Mensagens Automáticas ao Cliente via Chatwoot — Research

**Researched:** 2026-05-02
**Domain:** NestJS service layer — Chatwoot notification hooks in quotes and EFI payment flows
**Confidence:** HIGH (all findings verified from codebase, no external dependencies)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 Tom:** Profissional mas amigável — nome completo, emojis apenas em pontos-chave, linguagem neutra. Padrão: `Olá, {Nome Completo}. {Conteúdo principal}. {Emoji ou próximo passo}.`
- **D-02 Conteúdo de status:** Enxuto — número do orçamento + descrição + próximo passo. Sem total/itens.
- **D-03 Textos exatos de status:** Ver CONTEXT.md — quatro strings literais para EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, CANCELADO.
- **D-04 Aprovação:** Manter conteúdo atual — apenas corrigir encoding. Não reescrever a mensagem.
- **D-05 PIX:** Ajustar tom das mensagens existentes em `efi.service.ts` seguindo D-01. Não reescrever do zero.
- **D-06 Status que notificam:** EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, CANCELADO. Não notificar: PENDENTE, ENVIADO, APROVADO, PAGAMENTO_PARCIAL.
- **D-07 conversationId ausente:** Logar `logger.warn`, não lançar exceção.

### Claude's Discretion

- Onde exatamente injetar a lógica de notificação no `changeStatus()` (antes ou depois do commit no banco)
- Como resolver o nome do cliente quando não estiver cached no quote (reusar padrão do approveByToken)
- Estratégia de teste unitário para as novas mensagens

### Deferred Ideas (OUT OF SCOPE)

- Templates de mensagem configuráveis pelo painel interno
- Histórico de mensagens enviadas ao cliente
- Mensagem de lembrete automático para orçamentos PENDENTE há X dias
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSG-01 | Cliente aprova via token → Chatwoot confirma aprovação | Fix encoding bug em `approveByToken()` linha 1694. Lógica já existe. |
| MSG-02 | PIX parcial confirmado via EFI webhook → Chatwoot mensagem com valor e saldo | Lógica já existe em `efi.service.ts` linha 619-656. Ajustar tom (D-01/D-05). |
| MSG-03 | PIX total confirmado via EFI webhook → Chatwoot mensagem de conclusão | Mesma lógica — `fullyPaid=true` branch linha 624-625. Ajustar tom. |
| MSG-04 | Parcelado confirmado via EFI webhook → Chatwoot confirmação parcela | Mesmo código — branch `isHalf=true` linha 628-629. Ajustar tom. |
| MSG-05 | Status muda para EM_PRODUCAO/PRONTO/ENTREGUE/CANCELADO → Chatwoot notifica | Novo código em `changeStatus()` após linha 678 (após `prisma.quote.update`). |
</phase_requirements>

---

## Summary

Phase 7 modifica três arquivos de serviço backend para padronizar e adicionar notificações Chatwoot. O trabalho é exclusivamente de service layer — nenhuma migration, nenhum endpoint novo, nenhuma mudança de schema.

**MSG-01 (approveByToken):** A mensagem já existe e funciona logicamente. O problema é que o arquivo `quotes.service.ts` foi editado em encoding errado e acumulou 90 sequências UTF-8 dupla-codificadas (mojibake). A mensagem de aprovação ocupa as linhas 1691-1694 e contém strings como `OlÃ¡` em vez de `Olá`. A correção é cirúrgica: reescrever as string literals afetadas com os caracteres corretos.

**MSG-02/03/04 (efi.service.ts):** As mensagens PIX já existem e são funcionais (linhas 619-653). O `efi.service.ts` não tem mojibake. A tarefa é revisar o tom para seguir D-01 — o código atual usa `Olá, ${firstName}! 👋` (primeiro nome) mas D-01 exige nome completo. A lógica de detecção de tipo de pagamento (parcial/total/entrada-50%) já está implementada.

**MSG-05 (changeStatus):** Novo código a adicionar após o `prisma.quote.update` retornar (linha 680). O `updated` do Prisma já inclui `customer` via `include: { customer: true }` na query existente — portanto `updated.customer?.fullName` está disponível sem nenhum Prisma include adicional.

**Primary recommendation:** Injetar a notificação em `changeStatus()` DEPOIS do `prisma.quote.update` (linha 678) mas ANTES do `return this.mapQuoteBody(updated)` (linha 680). O `updated` já tem o `customer.fullName` e o `conversationId` disponíveis diretamente no objeto Prisma (não no mapped). Usar o mesmo padrão try/catch de `approveByToken()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MSG-01 fix encoding | API / Backend (`quotes.service.ts`) | — | Problema existe na string literal salva no arquivo TypeScript |
| MSG-01 notificação | API / Backend (`quotes.service.ts`) | Chatwoot API | Lógica já existe em `approveByToken()` |
| MSG-02/03/04 PIX | API / Backend (`efi.service.ts`) | Chatwoot API | Webhook handler já envia; ajuste de tom apenas |
| MSG-05 status | API / Backend (`quotes.service.ts`) | Chatwoot API | `changeStatus()` é o ponto único de mudança de status |

---

## Standard Stack

### Core (existente, sem instalar nada)
| Component | Location | Purpose |
|-----------|----------|---------|
| `ChatwootService.sendOutgoingMessage()` | `chatwoot.service.ts:60` | Envia mensagem outgoing para conversa |
| `QuotesService.changeStatus()` | `quotes.service.ts:630` | Único ponto de transição de status |
| `QuotesService.approveByToken()` | `quotes.service.ts:1620` | Aprovação pelo cliente com notificação já existente |
| `EfiService.processWebhook()` | `efi.service.ts:492` | Webhook PIX com notificação já existente |

**Nenhuma dependência nova a instalar.** Todas as ferramentas já existem no codebase.

---

## Architecture Patterns

### Pattern 1: Notificação fire-and-forget em try/catch (padrão canônico do projeto)

O padrão já usado em `approveByToken()` (linha 1640) e em `enviarParaCliente()`:

```typescript
// Source: quotes.service.ts, linha 1640-1699
try {
  const convId = quote.conversationId ? String(quote.conversationId) : undefined;
  if (convId) {
    // resolve nome...
    await this.chatwootService.sendOutgoingMessage(convId, mensagem);
  }
} catch (err) {
  this.logger.warn(`Falha ao notificar via Chatwoot: ${err instanceof Error ? err.message : String(err)}`);
}
```

**Replicar exatamente este padrão em `changeStatus()`.** O `chatwootService.sendOutgoingMessage()` **lança exceção** em caso de falha HTTP (linha 78: `throw err`), portanto o try/catch é obrigatório.

### Pattern 2: Resolução de nome do cliente em `changeStatus()`

O `changeStatus()` já executa `prisma.quote.update` com `include: { customer: true }` (linha 665-666). O resultado `updated` é o objeto Prisma bruto antes de `mapQuoteBody()`. Portanto:

```typescript
// VERIFICADO: updated já tem customer incluído (linha 652-678 de quotes.service.ts)
const clienteNome = updated.customer?.fullName ?? "Cliente";
const convId = updated.conversationId ? String(updated.conversationId) : undefined;
const numero = updated.externalQuoteId ?? updated.internalNumber ?? "";
```

Não é necessário nenhum include adicional ao Prisma — o `customer` já está no `updated`.

**Nota sobre `conversationId`:** No objeto Prisma bruto, `conversationId` é `BigInt | null`. Usar `String(updated.conversationId)` para converter.

**Nota sobre `numero`:** O campo `externalQuoteId` é `BigInt | null`. Para exibição, usar `Number(updated.externalQuoteId)` ou `String(updated.externalQuoteId)` conforme o padrão já adotado no projeto.

### Pattern 3: Ponto de injeção em `changeStatus()`

```
changeStatus() atual:
  1. findQuoteByIdentifier()          [linha 631]
  2. normalizeStatus() + validação    [linhas 636-650]
  3. prisma.quote.update() → updated  [linhas 652-678]
  4. return mapQuoteBody(updated)     [linha 680]   ← injetar ANTES desta linha
```

**Inserir o bloco try/catch de notificação entre as linhas 678 e 680** (entre o fechamento de `prisma.quote.update` e o `return`). Isso garante que:
- O banco já está atualizado (sem risco de notificar antes de persistir)
- A função ainda retorna normalmente mesmo que o Chatwoot falhe

### Anti-Patterns to Avoid

- **Não lançar exceção quando Chatwoot falha:** A notificação é secundária — o status do orçamento já foi salvo. Uma falha no Chatwoot não deve fazer o `changeStatus()` retornar 500.
- **Não chamar `mapQuoteBody()` antes de extrair conversationId:** O `mapQuoteBody()` retorna um objeto diferente do Prisma. O `conversationId` está em `updated.conversationId` (BigInt), não em `mapQuoteBody(updated).body.conversationId` (Number). Use o objeto Prisma `updated` diretamente dentro do try/catch.
- **Não usar apenas o primeiro nome:** D-01 exige nome completo (`fullName`). O código atual de EFI usa `String(clienteNome).split(" ")[0]` — isso deve ser removido nas mensagens ajustadas.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detectar pagamento parcial vs. total | Lógica customizada | `fullyPaid` boolean já calculado (linha 551) | Já testado, considera `paidTotal` acumulado |
| Detectar entrada 50% | Comparação manual | `isHalf` boolean já calculado (linha 622) | Considera `firstInstallmentAmount` e tolerância de R$0,01 |
| Conversão BigInt para string | Regex/parse customizado | `String(bigintValue)` | Já é o padrão no codebase |
| Formatação monetária | `toFixed(2)` manual | `v.toLocaleString("pt-BR", {style:"currency", currency:"BRL"})` | Já existe como `fmt()` no EFI service |

---

## Encoding Bug — Root Cause e Fix

### Root Cause (VERIFIED: análise de bytes)

O arquivo `quotes.service.ts` tem **UTF-8 BOM** (bytes `ef bb bf`) e contém **90 sequências UTF-8 dupla-codificadas** (mojibake). O padrão é: o arquivo foi editado por uma ferramenta que leu os bytes UTF-8 como Latin-1, depois salvou de volta como UTF-8. Resultado: `á` (UTF-8: `c3 a1`) virou `Ã¡` (bytes: `c3 83 c2 a1`).

**Escopo:** 47 linhas afetadas. As linhas com string literals afetadas pela fase 7 são:
- **Linha 1344:** `\`OlÃ¡, ${primeiroNome}! ðŸ'‹\`` (em `buildPaymentMessage` / `enviarParaCliente`)
- **Linha 1348:** `\`ðŸ"‹ *OrÃ§amento #${numero}*\``
- **Linha 1352:** `\`ðŸ'° *Total: ${fmt(total)}*\``
- **Linha 1355:** `\`*Como vocÃª prefere pagar?*\``
- **Linha 1360:** `\`Qualquer dÃºvida, Ã© sÃ³ chamar! ðŸ˜Š\``
- **Linha 1315-1335:** linhas de `linhasPagamento.push(...)` com emojis e acentos
- **Linha 1523, 1525:** fallback messages em `enviarParaCliente`
- **Linha 1691:** `entregaTexto` com previsão de entrega
- **Linha 1694:** A mensagem principal de aprovação em `approveByToken()`

### Fix Approach

**Abordagem cirúrgica:** Reescrever as string literals afetadas com os caracteres corretos. Não tentar "re-encodar" o arquivo inteiro — o arquivo tem **199 sequências UTF-8 corretas** misturadas (código TypeScript, imports, etc.) que não devem ser tocadas.

**Mapeamento de caracteres para fix** (verificado por inspeção de bytes):

| Mojibake | Correto |
|----------|---------|
| `OlÃ¡` | `Olá` |
| `OrÃ§amento` | `Orçamento` |
| `execuÃ§Ã£o` | `execução` |
| `serviÃ§o` | `serviço` |
| `dÃºvida` | `dúvida` |
| `sequÃªncia` | `sequência` |
| `PrevisÃ£o` | `Previsão` |
| `Ã  disposiÃ§Ã£o` | `à disposição` |
| `â€"` | `—` |
| `ðŸ'‹` | `👋` |
| `ðŸ"‹` | `📋` |
| `ðŸ'°` | `💰` |
| `ðŸ"…` | `📅` |
| `ðŸŽ‰` | `🎉` |
| `ðŸ'‰` | `👉` |
| `ðŸ˜Š` | `😊` |
| `CartÃ£o` | `Cartão` |
| `crÃ©dito` | `crédito` |
| `atÃ©` | `até` |
| `vocÃª` | `você` |
| `Ã©` | `é` |
| `sÃ³` | `só` |
| `1ï¸âƒ£` | `1️⃣` |
| `2ï¸âƒ£` | `2️⃣` |
| `3ï¸âƒ£` | `3️⃣` |

**Escopo do fix para MSG-01:** O planner deve incluir uma tarefa para corrigir TODOS os string literals mojibake do arquivo de uma vez, não apenas a mensagem de aprovação. O arquivo já está corrompido e corrigir parcialmente deixa o código inconsistente. A tarefa é: identificar e substituir todos os string literals com mojibake mantendo a lógica intacta.

**O `efi.service.ts` não tem mojibake** (0 sequências dupla-codificadas verificadas). O `chatwoot.service.ts` também não.

---

## EFI Webhook — Payment Type Detection

### Como o código distingue tipos de pagamento (VERIFIED: efi.service.ts)

O `processWebhook()` recebe um pagamento PIX com campos: `txid`, `amount`, `externalId`. A distinção entre tipos de pagamento é feita por:

**1. PIX total vs. parcial:** calculado dinamicamente na linha 551:
```typescript
const fullyPaid = pending <= 0; // pending = quoteTotal - paidTotal acumulado - pagamento atual
```

**2. Entrada 50% vs. outros parciais:** calculado na linha 622:
```typescript
const isHalf = Math.abs(payment.amount - halfAmount) < 0.01
  || Number((quote as any).firstInstallmentAmount ?? 0) === payment.amount;
```
`firstInstallmentAmount` é um campo do schema Prisma (linha 92 do schema) que é preenchido quando o operador gera um link PIX 50%. Se o pagamento vier com `txid` igual a `paymentExternalId` e o valor for ≈ metade do total, `isHalf=true`.

**3. Segunda parcela (MSG-04):** Não há branch separada no código para a segunda parcela. Quando a segunda parcela chega (com `txid` = `secondInstallmentExternalId`), o `paidTotal` acumulado fará `fullyPaid=true`. Ou seja, a segunda parcela vai para o branch `fullyPaid=true` (MSG-03), não existe um tratamento "segunda parcela" distinto.

**Mapeamento CONTEXT.md para código:**

| Requisito | Branch no código | Condição |
|-----------|-----------------|----------|
| MSG-02: PIX parcial | `!fullyPaid && !isHalf` (linhas 630-632) | valor parcial genérico |
| MSG-03: PIX total | `fullyPaid=true` (linhas 624-625) | total pago |
| MSG-04: Entrada 50% | `!fullyPaid && isHalf=true` (linhas 628-629) | primeiro pagamento ≈ 50% |
| MSG-04 segunda parcela | `fullyPaid=true` | cai no mesmo branch de MSG-03 |

**Implicação para o plano:** MSG-04 (parcelado confirmado) não tem branch exclusivo. Se o requisito distingue "segunda parcela" de "total", seria necessário detectar se o `txid` é `secondInstallmentExternalId`. Para ajuste de tom (D-05), isso pode ser feito verificando `quote.secondInstallmentExternalId === payment.txid`.

---

## `sendOutgoingMessage` — Behavior on Error

**VERIFIED: chatwoot.service.ts linha 60-79**

```typescript
async sendOutgoingMessage(conversationId: string, message: string) {
  if (!baseUrl || !accountId || !token) {
    return { enabled: false, message: "Configuração do Chatwoot ausente." };
    // NÃO lança exceção quando configuração ausente — retorna objeto
  }
  try {
    const response = await axios.post(...);
    return { enabled: true, response: response.data };
  } catch (err) {
    this.logger.warn(`sendOutgoingMessage falhou...`);
    throw err; // LANÇA exceção em falha HTTP
  }
}
```

**Comportamento:** Quando a configuração do Chatwoot está ausente (dev/CI), o método **retorna** `{ enabled: false }` sem lançar. Quando configurado mas com falha HTTP, **lança** a exceção. Por isso o try/catch nos callers é obrigatório.

**Callers existentes:**
- `approveByToken()` — já tem try/catch (linha 1640-1699) ✓
- `enviarParaCliente()` — já tem try/catch (linha 1601-1616) ✓
- `efi.service.ts processWebhook()` — já tem try/catch (linha 601-657) ✓
- `changeStatus()` — **não tem**, precisa adicionar ← nova tarefa

---

## `changeStatus()` — Transaction Safety

**VERIFIED: quotes.service.ts linha 652-679**

O `changeStatus()` **não usa `$transaction`** — executa um único `prisma.quote.update` com `statusHistory.create` aninhado (relation create via Prisma). O `prisma.quote.update` é atomicamente consistente pelo PostgreSQL, mas não está em um bloco `$transaction` explícito com outras operações.

**Implicação:** Adicionar `await this.chatwootService.sendOutgoingMessage(...)` depois do `prisma.quote.update` é **completamente seguro**:
- O banco já está atualizado (commit implícito do update)
- A notificação é async fire-and-forget dentro de try/catch
- Mesmo que o Chatwoot falhe, o status no banco permanece correto

**Sem risco de deadlock ou timeout de transação** — a chamada Chatwoot acontece fora de qualquer contexto de transação.

---

## Common Pitfalls

### Pitfall 1: BigInt em template literal
**What goes wrong:** `\`Orçamento #${updated.externalQuoteId}\`` lança TypeError se `externalQuoteId` for BigInt.
**Why it happens:** Prisma retorna `BigInt` para campos `@db.BigInt`. Template literals não serializam BigInt.
**How to avoid:** Usar `Number(updated.externalQuoteId)` ou `String(updated.externalQuoteId)`. O padrão no codebase é `Number(...)`. Verificar: `updated.externalQuoteId` é `BigInt | null`, `updated.internalNumber` é `Int` (seguro).
**Warning signs:** `TypeError: Cannot convert a BigInt value to a number` em runtime.

### Pitfall 2: `updated` vs. `mapQuoteBody(updated)` para extrair conversationId
**What goes wrong:** Tentar `updated.body.conversationId` ou `updated.chatwootConversationUrl` dentro do try/catch.
**Why it happens:** `changeStatus()` retorna `mapQuoteBody(updated)` mas o objeto Prisma `updated` está disponível antes do return. O `mapQuoteBody()` converte `conversationId` para `Number`, enquanto o Prisma retorna `BigInt`.
**How to avoid:** Dentro do bloco try/catch (inserido entre o `prisma.quote.update` e o `return`), usar `updated` (objeto Prisma bruto) diretamente: `updated.conversationId`, `updated.customer?.fullName`, etc.

### Pitfall 3: Encoding ao salvar o arquivo
**What goes wrong:** Editor salva `quotes.service.ts` de volta com mojibake ao editar.
**Why it happens:** VS Code com configuração incorreta ou edição via ferramenta que não respeita UTF-8.
**How to avoid:** Antes de qualquer edição ao arquivo, verificar encoding do editor/ferramenta. Salvar sem BOM, em UTF-8. Após edição, verificar com `node -e "const b=require('fs').readFileSync('file');console.log(b.indexOf(0xc3))"` se novas sequências `c3 83` aparecem.

### Pitfall 4: Nome do cliente ausente em `changeStatus()`
**What goes wrong:** `updated.customer?.fullName` retorna `undefined` se `customer` for null (quote sem cliente associado).
**Why it happens:** Embora o schema Prisma exija `customerId` obrigatório, o `include: { customer: true }` pode retornar `null` em casos de dados legado.
**How to avoid:** Usar `updated.customer?.fullName ?? "Cliente"` — fallback `"Cliente"` segue o padrão já usado no codebase.

### Pitfall 5: EFI — ajuste de tom quebra a lógica de detecção
**What goes wrong:** Ao ajustar o tom das mensagens PIX, acidentalmente remover ou alterar as condições `isHalf`/`fullyPaid`/`temArte`.
**Why it happens:** As condições de controle estão misturadas na mesma expressão que monta a string da mensagem.
**How to avoid:** Manter intactas as variáveis `isHalf`, `fullyPaid`, `temArte`, `remaining`. Alterar apenas o conteúdo das strings nas ramificações `mensagem +=`.

---

## Code Examples

### Bloco de notificação para `changeStatus()` (novo código)

```typescript
// Source: padrão do projeto — replicar approveByToken() linha 1640-1699
// Inserir entre linha 678 (fecha prisma.quote.update) e linha 680 (return mapQuoteBody)

const statusesToNotify: QuoteStatus[] = ["EM_PRODUCAO", "PRONTO_PARA_ENTREGA", "ENTREGUE", "CANCELADO"];
if (statusesToNotify.includes(newStatus)) {
  try {
    const convId = updated.conversationId ? String(updated.conversationId) : undefined;
    if (convId) {
      const clienteNome = updated.customer?.fullName ?? "Cliente";
      const numero = updated.externalQuoteId ? Number(updated.externalQuoteId) : updated.internalNumber;
      let mensagem = "";
      if (newStatus === "EM_PRODUCAO") {
        mensagem = `🎨 Olá, ${clienteNome}. Seu pedido #${numero} entrou em produção. Avisaremos assim que estiver pronto.`;
      } else if (newStatus === "PRONTO_PARA_ENTREGA") {
        mensagem = `✅ Olá, ${clienteNome}. Seu pedido #${numero} está pronto para retirada. Pode passar na loja quando quiser.`;
      } else if (newStatus === "ENTREGUE") {
        mensagem = `🎉 Olá, ${clienteNome}. Seu pedido #${numero} foi entregue. Obrigado pela preferência! Qualquer dúvida, estamos à disposição.`;
      } else if (newStatus === "CANCELADO") {
        mensagem = `ℹ️ Olá, ${clienteNome}. O orçamento #${numero} foi cancelado. Se tiver dúvidas ou quiser refazer o pedido, é só falar com a gente.`;
      }
      if (mensagem) {
        await this.chatwootService.sendOutgoingMessage(convId, mensagem);
      }
    } else {
      this.logger.warn(`changeStatus: conversationId ausente para quote ${updated.id}, notificacao Chatwoot ignorada`);
    }
  } catch (err) {
    this.logger.warn(`Falha ao notificar via Chatwoot apos mudanca de status ${newStatus}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

### Mensagem de aprovação corrigida (MSG-01)

A linha 1694 atual (mojibake):
```
const mensagem = `OlÃ¡, ${clienteNome ?? "Cliente"}! ðŸ'‹\n\nAgradecemos pela parceria...`
```

Deve ser substituída pela string correta (mesma lógica, caracteres corretos):
```typescript
const mensagem = `Olá, ${clienteNome ?? "Cliente"}! 👋\n\nAgradecemos pela parceria. Vamos dar sequência ao seu pedido: agendaremos a execução do serviço ou separaremos o(s) produto(s) e avisaremos assim que estiver pronto.${entregaTexto}\n\n📋 Orçamento #${numero}\n\n💰 Total: ${fmt(Number(quote.total ?? 0))}\n\nSe tiver alguma dúvida, responda por esta conversa — estamos à disposição.`;
```

---

## Test Files That Need Updating

**VERIFIED: glob de todos os arquivos .test.ts**

| Arquivo | Testes relevantes | Impacto da fase 7 |
|---------|------------------|-------------------|
| `quotes.service.unit.test.ts` | `changeStatus` (linhas 78-178) e `approveByToken` (linhas 180-254) | Adicionar testes para notificações em `changeStatus()` e verificar que encoding fix não quebra testes existentes |
| `efi.webhook.test.ts` | `processWebhook` — idempotência, extração de payload | Nenhum teste cobre a mensagem Chatwoot — adicionar teste de tone/format PIX |
| `quotes.service.chatwoot.test.ts` | Validação de conversationId/contactId em `create()` | Não afetado diretamente — cobre apenas `create()`, não `changeStatus()` |
| `quotes.service.test.ts` | Testa padrão de approvalLink (fase 6) | Não afetado |

**Testes a adicionar (Wave 0 gaps):**

1. `quotes.service.unit.test.ts` — adicionar `describe("changeStatus — Chatwoot notifications")`:
   - Deve chamar `sendOutgoingMessage` quando `newStatus === "EM_PRODUCAO"` e `conversationId` existe
   - Deve chamar `sendOutgoingMessage` para PRONTO_PARA_ENTREGA, ENTREGUE, CANCELADO
   - **Não** deve chamar `sendOutgoingMessage` para status APROVADO, ENVIADO, PENDENTE
   - Deve logar warn e **não lançar** quando `sendOutgoingMessage` lança exceção
   - Deve logar warn e **não lançar** quando `conversationId` é null
   - Mensagem para EM_PRODUCAO deve conter o `numero` do orçamento e o `fullName` do cliente

2. `efi.webhook.test.ts` — os testes existentes passam um mock de `chatwootService` mas não verificam o conteúdo da mensagem. Os testes existentes continuam válidos sem mudança para o ajuste de tom (não quebram).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A segunda parcela (segunda via 50%) chega no webhook como `fullyPaid=true` (cai no branch MSG-03) | EFI Webhook | Se chegar com `fullyPaid=false`, MSG-04 não seria disparado para segunda parcela — mas lógica atual já resolve paidTotal acumulado |
| A2 | O `efi.service.ts` não requer ajuste de import ou injeção de dependência para as mudanças de tom | Standard Stack | Se efi.service.ts precisar de nova dependência, o módulo precisa de update — muito improvável dado que ChatwootService já está injetado |

---

## Open Questions

1. **Escopo do fix de encoding**
   - O que sabemos: 47 linhas com mojibake, 90 sequências dupla-codificadas, impacta `enviarParaCliente`, `buildPaymentMessage`, `approveByToken` e comentários.
   - O que está claro: o fix deve corrigir TODOS os string literals do arquivo de uma vez (não só a mensagem de aprovação) para evitar código inconsistente.
   - Recomendação: incluir como uma única tarefa "corrigir encoding de todos os string literals em `quotes.service.ts`" — reescrever as 47 linhas afetadas com caracteres corretos.

2. **MSG-04: segunda parcela vs. MSG-03**
   - O que sabemos: quando a segunda parcela de um parcelamento 50%+50% é paga, o código resolve `fullyPaid=true` (MSG-03 branch).
   - O que está claro: os branches existentes não distinguem "segunda parcela do 50%+50%" de "PIX à vista total".
   - Recomendação: para D-05 (ajuste de tom), verificar se `quote.secondInstallmentExternalId === payment.txid` e usar linguagem de "segunda parcela recebida" nesses casos. Confirmar com o usuário se isso é necessário ou se a mensagem de "pagamento completo" é suficiente.

---

## Environment Availability

Step 2.6: SKIPPED — fase é exclusivamente de service layer backend. Sem novas dependências externas. Jest já configurado em `apps/backend/jest.config.js`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `cd apps/backend && npx jest quotes.service.unit --testPathPattern=changeStatus` |
| Full suite command | `cd apps/backend && npx jest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-01 | Fix encoding em approveByToken | unit | `npx jest quotes.service.unit --testPathPattern=approveByToken` | ✅ (testes existentes cobrem o método) |
| MSG-05 | changeStatus notifica EM_PRODUCAO via Chatwoot | unit | `npx jest quotes.service.unit --testPathPattern=changeStatus` | ❌ Wave 0 |
| MSG-05 | changeStatus não notifica APROVADO/ENVIADO | unit | `npx jest quotes.service.unit --testPathPattern=changeStatus` | ❌ Wave 0 |
| MSG-05 | changeStatus loga warn quando conversationId ausente | unit | `npx jest quotes.service.unit` | ❌ Wave 0 |
| MSG-02/03/04 | PIX webhook notifica com tom padronizado | unit | `npx jest efi.webhook` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/backend && npx jest quotes.service.unit`
- **Per wave merge:** `cd apps/backend && npx jest`
- **Phase gate:** Full suite green antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `quotes.service.unit.test.ts` — adicionar `describe("changeStatus — Chatwoot notifications")` com 6 casos — cobre MSG-05
- [ ] `efi.webhook.test.ts` — adicionar `describe("processWebhook — Chatwoot message tone")` — cobre MSG-02/03/04

*(Existing test infrastructure covers approveByToken — no new file needed for MSG-01)*

---

## Security Domain

Sem novos endpoints, sem novos campos de input, sem nova autenticação. A fase modifica apenas lógica interna de service — sem superfície de ataque nova.

A `ChatwootService` já valida a presença das env vars antes de fazer requests HTTP. O `conversationId` é derivado do banco (não de input do usuário) antes de ser passado ao Chatwoot.

**ASVS V5 (Input Validation):** O `conversationId` passado para `sendOutgoingMessage` é sempre `String(BigInt)` derivado do banco — sem risco de injection. A mensagem template não inclui input do usuário, apenas dados estruturados do banco (nome, número do orçamento).

---

## Sources

### Primary (HIGH confidence)
- `apps/backend/src/modules/quotes/quotes.service.ts` — lido completo, linhas-chave verificadas
- `apps/backend/src/modules/integrations/efi/efi.service.ts` — lido completo
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` — lido completo
- `apps/backend/src/modules/quotes/quotes.service.unit.test.ts` — lido completo
- `apps/backend/src/modules/integrations/efi/efi.webhook.test.ts` — lido completo
- Análise de bytes do arquivo (node inline) — encoding verificado diretamente

### Secondary (nenhum — tudo verificado no codebase)

---

## Metadata

**Confidence breakdown:**
- Localizações exatas de código: HIGH — lido e verificado diretamente
- Encoding bug root cause: HIGH — analisado com inspeção de bytes
- EFI payment type detection: HIGH — código lido linha por linha
- Testes a adicionar: HIGH — arquivos de teste lidos, gaps identificados
- `sendOutgoingMessage` throw behavior: HIGH — código lido linha por linha

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (codebase estável, sem dependências externas)
