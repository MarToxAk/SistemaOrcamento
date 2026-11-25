# Phase 54: Pagamento PIX efetivo, comprovante EFI e NFS-e no orcamento - Research

**Researched:** 2026-11-25
**Domain:** Webhook PIX EFI (quitacao com desconto), nota privada com anexo no Chatwoot, trava de emissao de NFS-e Nacional com senha de liberacao, limpeza do emissor iiBrasil
**Confidence:** HIGH (codigo lido e testado nesta sessao) / MEDIUM (comportamento do endpoint oficial de comprovante da EFI, que so pode ser confirmado com credenciais reais)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pagamento efetivo com desconto**
- **D-01:** Total devido no PIX a vista = valor com desconto (`pixFinalAmount` da cobranca). Quitado quando `pago >= total devido` (tolerancia R$ 0,02). Gravar o desconto em `Quote.paymentDiscount` (hoje existe no schema e nada preenche; ex.: 8,65) e o valor devido em `Quote.paymentAmount`. A mensagem ao cliente deixa de dizer "parcial" nesse caso e passa a confirmar pagamento integral.
- **D-02:** O desconto de 5% vale **somente para PIX a vista**. O fluxo em 2 parcelas (`firstInstallmentAmount`/`secondInstallmentAmount`) continua sem desconto, usando o total cheio.
- **D-03:** Pagamentos reais parciais (ex.: 50% de entrada) continuam parciais, sem desconto, e nao liberam NFS-e.

**Comprovante na conversa privada**
- **D-04:** Ao confirmar pagamento PIX, postar nota privada na conversa Chatwoot (`ChatwootService.postConversationNote`) com um **comprovante em layout proprio (imagem ou PDF anexado)**, pois a API EFI nao tem endpoint de comprovante pronto (confirmar na pesquisa; se houver, usar o oficial). Conteudo minimo: numero do orcamento, valor pago, desconto aplicado, total do orcamento, E2E ID, txid, data/hora, pagador quando o webhook trouxer. Falha no comprovante nunca derruba o webhook (try/catch + log), como ja ocorre com a mensagem ao cliente.
- **D-05:** O comprovante e interno (nota privada), nao e enviado ao cliente. Respeitar a regra sem emoji problematico apenas onde a API Athos exige; Chatwoot aceita emoji.

**NFS-e na pagina do orcamento**
- **D-06:** Liberar a emissao somente com pagamento integral: `paidTotal >= total devido` (ja considerando o desconto). Com 50% (entrada) **nao libera**.
- **D-07:** Valor da nota: o **valor efetivamente pago** (ex.: R$ 164,35 no #26809), pre-preenchido no campo valor do servico. *(Premissa a confirmar na verificacao: pedido original do usuario diz para considerar o desconto de pagamento e identificar o pagamento feito.)*
- **D-08:** A tela mostra o pagamento identificado (valor pago, desconto, data, E2E) junto ao botao de emitir.
- **D-09:** Emitir **sem confirmacao de pagamento integral** exige senha de liberacao. Senha unica da empresa em variavel de ambiente (ex.: `NFSE_OVERRIDE_PASSWORD`), validada **no backend** (nunca no front), com comparacao em tempo constante, e **auditoria** (quem/quando/orcamento liberou). O valor da senha o usuario define depois; nao colocar valor real no repositorio nem em `.env.example`.

**Emissor de NFS-e**
- **D-10:** Manter o fluxo atual do orcamento (Sistema Nacional / Sefin, `/quotes/:id/nfse/emitir`) e apenas adicionar as travas de pagamento e senha.
- **D-11:** **Remover o emissor iiBrasil** (SOAP), descontinuado. Cuidado de escopo: notas ja emitidas pelo iiBrasil continuam no banco e sao lidas por Contas a Receber/Cobranca (`cobranca-notas.service.ts`, `email-envio.service.ts`, `nfse-xml-parser.util.ts`). Remover o codigo de **emissao/SOAP/credenciais**, preservando leitura/parse de notas historicas. A pesquisa deve mapear o limite exato antes de apagar. Atualizar `.env.example` e a memoria `nfse-iibrasil-integracao.md`. — **Reversibility:** costly — remove cliente SOAP usado por varios modulos; reverter exige restaurar do git.

### Claude's Discretion
- Formato do comprovante (imagem vs PDF) e biblioteca de geracao (preferir o que o projeto ja usa para PDFs).
- Estrutura da tabela/campo de auditoria da liberacao por senha.
- Mensagem exata ao cliente quando o pagamento for integral com desconto.

### Deferred Ideas (OUT OF SCOPE)
- Desconto de PIX tambem nas duas parcelas (descartado nesta fase).
- Senha por usuario em vez de senha unica (nao pedido).
</user_constraints>

<phase_requirements>
## Phase Requirements

O ROADMAP (`.planning/ROADMAP.md`, Phase 54) traz `Requirements: TBD` e nenhum ID foi fornecido. Proponho IDs locais (`[ASSUMED]`, o planner pode renomear) para rastrear cobertura:

| ID proposto | Descricao | Research Support |
|----|-----------|------------------|
| P54-PAG | PIX a vista com desconto quita o orcamento (tolerancia R$ 0,02), grava `paymentDiscount`/`paymentAmount`, mensagem sem "parcial" | Secoes "Pagamento efetivo" e Pitfalls 1, 2, 3 |
| P54-CMP | Comprovante como nota privada com anexo no Chatwoot, sem derrubar o webhook | Secao "Comprovante" |
| P54-NFS | Trava de pagamento integral + senha de liberacao + auditoria + pre-preenchimento com valor pago na emissao NFS-e do orcamento | Secao "NFS-e no orcamento" |
| P54-IIB | Remocao do residuo do emissor iiBrasil sem quebrar leitura de notas historicas | Secao "Mapa da remocao iiBrasil" |
</phase_requirements>

## Summary

O bug de origem (#26809) esta confirmado no codigo: `processWebhook` calcula `pending = quoteTotal - nextPaid` contra o `quote.total` cheio (`efi.service.ts:634-638`), enquanto a cobranca PIX foi criada com 5% de desconto (`efi.service.ts:417-418`). Os campos `Quote.paymentAmount` e `Quote.paymentDiscount` existem no schema (`schema.prisma:88-89`) mas **nada os escreve** (grep em `apps/` e `packages/`: so uma variavel local homonima no webhook de cartao, `efi.service.ts:833`). O correto e derivar o "devido" por tipo de txid: txid de `paymentExternalId` (PIX a vista) = `resolvePaymentOptions(total)` opcao `PIX_AVISTA.finalAmount`; txid de `secondInstallmentExternalId` (entrada 50%) = total cheio. A quitacao deve usar centavos inteiros e tolerancia de 2 centavos, num util puro compartilhado entre o webhook EFI e a trava de NFS-e.

Descoberta importante para D-11: **o emissor SOAP iiBrasil ja foi removido do codigo-fonte** (o `nfse.service.ts` atual so tem emissao Nacional, anexo manual de XML e envio de DANFSe; nao ha `enviarSoap`, hash de integridade nem importacao de `soap`). O que resta do iiBrasil e **residuo de configuracao/dependencia/documentacao**: dependencia `soap` sem uso, `NFSE_TOKEN` ainda **obrigatoria no boot** (`app.module.ts:31`), sonda do WSDL iiBrasil no `/health` (`health.controller.ts:61-70`), variaveis `NFSE_*` do iiBrasil em `.env.example`, `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`, `deploy/stack.env.example`, e documentos/memoria. Nada em Contas a Receber/Cobranca precisa ser apagado; a leitura de notas historicas (PDF pronto do provedor) deve ficar intacta.

Sobre o comprovante: **existe endpoint oficial** `GET /v2/gn/pix/comprovantes` (escopo `gn.receipts.read`, um identificador entre `e2eId`/`idEnvio`/`rtrId`/`txid`, resposta 200 documentada como imagem `comprovante.png`). A documentacao nao diz se cobre PIX *recebido* nem o content-type exato, e o escopo precisa estar habilitado na aplicacao EFI. Por isso a recomendacao e: a nota privada **sempre** leva o texto completo (todos os campos minimos de D-04) e o anexo e a imagem oficial quando a EFI a devolver; senao, PNG com layout proprio gerado por Puppeteer+Handlebars (padrao ja usado no projeto). O Chatwoot aceita nota privada com anexo (verificado no codigo-fonte do Chatwoot local: `private` e `attachments` sao independentes e `content` e opcional).

**Primary recommendation:** Criar `quote-payment.util.ts` (centavos + tolerancia 0,02) como fonte unica de quitacao; usar no webhook PIX e na trava de NFS-e; postar comprovante apos o commit (nunca dentro da transacao) com try/catch; adicionar trava + senha (hash SHA-256 + `timingSafeEqual`) + tabela de auditoria no endpoint `POST /quotes/:quoteId/nfse/emitir`; tratar a remocao do iiBrasil como limpeza de config/dependencia/health, nao de codigo de leitura.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Calculo de quitacao (devido, desconto, tolerancia) | API / Backend (util puro) | — | Dinheiro e regra de negocio; precisa ser identico no webhook e na trava de NFS-e |
| Persistir `paymentDiscount`/`paymentAmount`/`paidTotal` | Database / Storage | API / Backend | Transacao Prisma do webhook ja existente |
| Geracao do comprovante (PNG/PDF) | API / Backend | — | Puppeteer ja e dependencia do backend; Dockerfile instala chromium |
| Envio da nota privada com anexo | API / Backend (ChatwootService) | — | Token do Chatwoot so existe no backend |
| Trava de pagamento + validacao da senha | API / Backend | — | Decisao de seguranca nunca no front (D-09) |
| Auditoria da liberacao por senha | Database / Storage | API / Backend | Tabela nova, escrita pelo service |
| IP real do operador para auditoria | Frontend Server (route handler Next) | API / Backend | Backend so ve o IP do container Next; precedente `x-client-ip` (Fase 52) |
| Exibir pagamento identificado, campo de senha, valor pre-preenchido | Browser / Client (page.tsx) | Frontend Server (proxy `/api/quotes/[id]/nfse/*`) | UI ja vive em `orcamento/[id]/page.tsx` |
| Remocao iiBrasil | Config/Deploy + API / Backend | — | Residuo e env, dependencia, health e docs |

## Standard Stack

Nenhuma biblioteca nova e necessaria. [VERIFIED: apps/backend/package.json]

### Core (ja presentes, reutilizar)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `puppeteer` | ^24.40.0 (`apps/backend/package.json:36`) | Render do comprovante (PNG) | Mesmo padrao hardened de `danfse-pdf.service.ts` e `quotes-pdf-storage.service.ts`; Dockerfile instala chromium |
| `handlebars` | ^4.7.9 | Template HTML do comprovante com escape | Ja usado nos PDFs; escapa texto do pagador |
| `axios` | ^1.7.7 | Chamada ao endpoint de comprovante EFI e ao Chatwoot | Padrao do projeto |
| `class-validator` | ^0.14.1 | DTO com `senhaLiberacao` | ValidationPipe global com whitelist/forbidNonWhitelisted (`main.ts:33-37`) |
| `node:crypto` | Node 22.22.1 | `createHash` + `timingSafeEqual` | `timingSafeEqual` ja usado em `internal-auth.guard.ts` |
| `jest` + `ts-jest` | 30.2.0 / ^29.4.9 | Testes backend | Unico framework do repo (nao ha vitest) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Puppeteer PNG | `pdfkit`/`sharp` | Existem so como dependencia transitiva (nao declaradas); nao usar |
| PNG | PDF (Puppeteer `page.pdf`) | Mesmo custo; PNG aparece inline na conversa e e o formato do comprovante oficial EFI. PDF e aceitavel (discricionario) |
| Tabela de auditoria nova | Reusar `QuoteStatusHistory` | `changedByName` e string livre sem IP/resultado/valores; mistura auditoria de senha com historico de status. Preferir tabela propria |

**Installation:** nenhuma. Para D-11: `npm uninstall soap -w @orcamento/backend` (atualiza `package-lock.json`).

**Version verification:** `npm ls soap` mostra `@orcamento/backend@0.1.0 -> soap@1.9.1` como unico consumidor; `grep` por `from "soap"`/`require("soap")` em `apps/` nao encontra uso. [VERIFIED: npm ls + grep nesta sessao]

## Package Legitimacy Audit

Esta fase **nao instala nenhum pacote externo**. Unica alteracao de dependencia: **remover** `soap`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (nenhum pacote novo) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
EFI (PIX recebido)
   | POST /api/integrations/efi/webhook/payment/pix  { pix:[{endToEndId,txid,valor,horario,infoPagador,gnExtras?}] }
   v
EfiController -> EfiService.processWebhook
   |-- extractWebhookPayments (txid, valor, e2e, raw)
   |-- dedupe por eventId/externalId  --> ignored_duplicate (sem comprovante duplicado)
   |-- acha Quote por paymentExternalId | secondInstallmentExternalId
   |-- [NOVO] quote-payment.util: devido = (txid==paymentExternalId) ? PIX_AVISTA.finalAmount : total
   |          quitado = pago >= devido - 0,02 ; pendente = quitado ? 0 : devido - pago
   |-- $transaction { PaymentTransaction.create ; Quote.update(paidTotal,pendingTotal,paymentDiscount,paymentAmount,...) ; status history }
   |-- (apos commit) dispararEtiquetasChatwoot
   |-- mensagem ao cliente (try/catch)  --> integral c/ desconto: sem "parcial"
   '-- [NOVO] comprovante (try/catch separado):
          EFI GET /v2/gn/pix/comprovantes?e2eId  --(ok)--> imagem oficial
                                                 --(falha/escopo)--> PNG proprio (Puppeteer+Handlebars)
          ChatwootService.sendAttachment(conv, buffer, nome, mime, {private:true, content:texto})

Operador (iframe Chatwoot) -> orcamento/[id]/page.tsx
   |-- GET /api/quotes/:id/nfse/pagamento  -> backend GET quotes/:id/nfse/pagamento (status, valorPago, desconto, E2E, data)
   |-- Emitir: POST /api/quotes/:id/nfse/emitir (+ x-client-ip, senhaLiberacao?, liberadoPor?)
   '-> NfseController.emitir -> NfseService.emitirQuoteNfseAutomatica
         |-- carrega Quote + util de quitacao
         |-- integral? --sim--> emite (NfseNacionalService.emitir)
         |-- nao: exige senha -> sha256+timingSafeEqual(NFSE_OVERRIDE_PASSWORD) -> grava NfseLiberacao -> emite
         '-- senha ausente/errada -> 403 {code} (e audita tentativa)
```

### Recommended Project Structure
```
apps/backend/src/modules/
├── quotes/quote-payment.util.ts            # NOVO: quitacao em centavos (puro, testavel)
├── quotes/quote-payment.util.test.ts       # NOVO
├── integrations/efi/
│   ├── efi.service.ts                      # ALTERAR: processWebhook, createPix5050Link, buscarComprovanteOficial
│   ├── pix-comprovante.service.ts          # NOVO: renderiza PNG (Puppeteer+Handlebars) - @Optional no EfiService
│   ├── pix-comprovante.template.ts         # NOVO: HTML do layout proprio
│   └── efi.module.ts                       # ALTERAR: provider novo
├── integrations/chatwoot/chatwoot.service.ts   # ALTERAR: sendAttachment(opts?: {private?, content?})
├── integrations/nfse/
│   ├── nfse.service.ts                     # ALTERAR: gate + senha + auditoria + resolverPagamentoQuote
│   ├── nfse.controller.ts                  # ALTERAR: GET pagamento; emitir recebe ip
│   ├── nfse-liberacao.util.ts              # NOVO: compararSenha (sha256 + timingSafeEqual) + limiter de falhas
│   └── dto/emitir-nfse-nacional.dto.ts     # ALTERAR: senhaLiberacao?, liberadoPor?
apps/backend/prisma/schema.prisma + migrations/<ts>_add_nfse_liberacao/migration.sql   # NOVO model
apps/frontend/src/app/
├── api/quotes/[id]/nfse/pagamento/route.ts # NOVO proxy GET
├── api/quotes/[id]/nfse/emitir/route.ts    # ALTERAR: repassa x-client-ip
└── orcamento/[id]/page.tsx                 # ALTERAR: card de pagamento, senha, valor pre-preenchido
```

### Pattern 1: Quitacao em centavos com tolerancia (fonte unica)
**What:** util puro; nenhuma aritmetica de float em reais.
**When to use:** webhook PIX e trava de NFS-e (e, opcionalmente, webhook de cartao).
```typescript
// Fonte: padrao do projeto (toMoney/toFixed(2) em efi.service.ts) + decisao D-01
export const TOLERANCIA_QUITACAO_CENTAVOS = 2; // R$ 0,02
const c = (v: number | string) => Math.round(Number(String(v).replace(",", ".")) * 100);

export function calcularQuitacao(i: { total: number; desconto: number; pagoAntes: number; pagamento: number }) {
  const total = c(i.total), desconto = c(i.desconto);
  const devido = total - desconto;
  const pago = Math.min(total, c(i.pagoAntes) + c(i.pagamento));   // dinheiro real recebido
  const falta = Math.max(devido - pago, 0);
  const quitado = falta <= TOLERANCIA_QUITACAO_CENTAVOS;
  return { devido: devido / 100, pago: pago / 100, pendente: quitado ? 0 : falta / 100, quitado };
}
```
Aplicacao no webhook (esboço): `ehAvista = payment.txid === quote.paymentExternalId`; `devidoAvista = this.resolvePaymentOptions(total).options.find(o => o.code === "PIX_AVISTA").finalAmount`; `desconto = ehAvista ? total - devidoAvista : 0` (so > 0 quando total > 150).

### Pattern 2: Efeitos colaterais depois do commit, cada um com seu try/catch
Seguir `dispararEtiquetasChatwoot` (`efi.service.ts:80-95`, "Chamar SEMPRE depois do $transaction") e o bloco da mensagem ao cliente (`efi.service.ts:690-722`). O comprovante vira um bloco **separado** do da mensagem ao cliente (falha de um nao pode impedir o outro).

### Pattern 3: Endpoint de leitura de pagamento no NfseController (mesmo padrao de `tomador`)
`GET quotes/:quoteId/nfse/pagamento` devolve `{ situacao: "INTEGRAL"|"PARCIAL"|"SEM_PAGAMENTO", valorDevido, valorPago, desconto, valorSugeridoNota, pagoEm, e2eId, metodo, origem }`, lendo `Quote` + `PaymentTransaction` (`eventId` = E2E, `processedAt`, `webhookPayload.horario`). Nao precisa alterar `mapQuoteBody` (o front nao consome `paidTotal`; ver Pitfall 6).

### Anti-Patterns to Avoid
- **Gravar `paymentDiscount` na criacao do link** (`quotes.service.ts:1997-2007`): o cliente pode escolher cartao ou 50/50 depois; o desconto so e real quando o txid de `paymentExternalId` e pago.
- **Comparar reais em float** (`<= 0` no `pending` atual, `efi.service.ts:638`): usar centavos.
- **Gerar comprovante dentro da `$transaction`**: Puppeteer/HTTP dentro de transacao segura conexao do banco.
- **Validar senha no front ou comparar com `===`**: D-09.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comparacao de segredo | `===` ou comparacao por tamanho (como em `internal-auth.guard.ts`, que vaza o tamanho) | `createHash("sha256")` nos dois lados + `timingSafeEqual` | Tempo constante e tamanho fixo (32 bytes) |
| Render do comprovante | Canvas/SVG manual | Puppeteer + Handlebars (`danfse-pdf.service.ts:61-90`) | Padrao hardened ja existente: rede bloqueada (so `about:blank`/`data:`), `--no-sandbox` |
| Multipart para Chatwoot | Novo montador | Estender `ChatwootService.sendAttachment` (`chatwoot.service.ts:278-322`) | Ja monta boundary; falta so `private`/`content` parametrizaveis |
| IP do operador | Ler `req.ip` do backend | Header `x-client-ip` + `ipDoCliente` (`frontend/src/lib/ip-cliente.ts`) | Backend so enxerga o container Next |
| Aritmetica de dinheiro | `Number` com `toFixed` encadeado | Centavos inteiros no util | Evita `164.34999999999997` |

**Key insight:** o projeto ja tem os blocos (Puppeteer hardened, multipart Chatwoot, `x-client-ip`, `timingSafeEqual`); a fase e de composicao, nao de infraestrutura nova.

## Pagamento efetivo: respostas da pesquisa (pergunta 1)

**Onde esta o bug** [VERIFIED: efi.service.ts lido nesta sessao]
- Desconto: `efi.service.ts:417` `const pixDiscountPercent = value > 150 ? 5 : 0;` e `:418` `const pixFinalAmount = Number((value * (1 - pixDiscountPercent / 100)).toFixed(2));`. Estrito `> 150` (cartao usa `>= 150`, linha ~432).
- A cobranca PIX embute o desconto internamente: `createPixPaymentLink` (`:225`) chama `resolvePaymentOptions(originalAmount)` (`:237`) e envia `valor.original = finalAmount.toFixed(2)`. Quem chama passa o **total cheio** (`quotes.service.ts:1962-1966`, `amount: total`).
- Webhook: `:634` `const quoteTotal = this.toMoney((quote as any).total);` ... `:636` `const nextPaid = Number(Math.min(quoteTotal, currentPaid + payment.amount).toFixed(2));` `:637` `const pending = Number(Math.max(quoteTotal - nextPaid, 0).toFixed(2));` `:638` `const fullyPaid = pending <= 0;` `:639` `const nextStatus = this.resolveNextQuoteStatus(quote.status, fullyPaid);`.
- Mensagem: `:708` (integral) e `:714` `mensagem = \`⚠️ ${clienteNome}, recebemos um pagamento parcial PIX.\n\nOrçamento #${numero}\nPago: ${fmt(payment.amount)} de ${fmt(total)} — Restam: ${fmt(remaining)}.\n\nAguardamos o pagamento restante.\``. O `remaining` (`:710`) usa `total - payment.amount` ignorando `currentPaid` (bug latente com varios pagamentos): trocar por `pending` calculado.

**Onde gravar** [VERIFIED: schema.prisma:88-89]
```
  paymentAmount      Decimal?              @db.Decimal(12, 2)
  paymentDiscount    Decimal               @default(0) @db.Decimal(12, 2)
```
No `tx.quote.update` (`efi.service.ts:659-670`) acrescentar `paymentDiscount` e `paymentAmount` **apenas** quando `payment.txid === quote.paymentExternalId` (PIX a vista) e `desconto > 0`: `paymentDiscount = total - devido` (ex. `8.65`), `paymentAmount = devido` (ex. `164.35`). Nao sobrescrever com 0 em pagamentos de outro txid. `paidTotal` continua sendo o dinheiro real (164,35), `pendingTotal` = 0, `paymentConfirmedAt` = agora quando quitado (`efi.service.ts:667`).

**`PaymentTransaction`:** `status` `PAID`/`PARTIAL` (`:180`) passa a refletir `quitado`; acrescentar em `metadata` `{ txid, signature, desconto, devido, horario, infoPagador, pagador }` (nao tem coluna nova; `webhookPayload` ja guarda o `raw`).

**`resolveNextQuoteStatus(current, fullyPaid)`** (`efi.service.ts:64-72`): assinatura e logica **nao mudam**; so o `fullyPaid` de entrada. `PAGAMENTO_PARCIAL`+quitado -> `APROVADO`; etiquetas sincronizam sozinhas porque `nextStatus !== quote.status` dispara `dispararEtiquetasChatwoot` (`:688`).

**Outros pontos que usam `quote.total` para quitacao**
- Cartao: `efi.service.ts:831-837` `quoteTotal`/`paymentAmount = Math.max(quoteTotal - currentPaid, 0)`; o link de cartao e criado com `amount: total` (sem desconto, `quotes.service.ts:1986`), logo **nao muda** (D-02). Cuidado de nome: a variavel local `paymentAmount` (`:833`) colide conceitualmente com o campo `Quote.paymentAmount`; renomear se for escrever o campo.
- UI de status: **nao existe consumo de `paidTotal`/`pendingTotal`** fora do `efi.service.ts` (grep em `apps/` e `packages/`: so schema, migration `20260410000000_add_payment_fields`, efi.service e testes). `mapQuoteBody` expoe apenas `paymentConfirmedAt` (`quotes.service.ts:1691`) e `paidInCashier` (`:1694`).
- Pagamento no caixa Athos: `conciliarViaCaixaAthos` (`quotes.service.ts:~486-494`) e `confirmarPagamentoCaixa` (`:~540-547`) gravam `paymentNote = "Pagamento feito no caixa"` e `paymentConfirmedAt`, **sem** `paidTotal` (ver Open Question 1).

**Impacto nos testes de `efi.webhook.test.ts`** [VERIFIED: arquivo lido]: os mocks de quote nao trazem `paymentAmount`/`paymentDiscount` (precisam tolerar `undefined`) e o `tx` mockado so tem `paymentTransaction.create`, `quote.update`, `quoteStatusHistory.create` (nao adicionar nada novo dentro da transacao). `mockChatwootService` so tem `sendOutgoingMessage` (o comprovante deve ficar atras de `typeof ... === "function"` + try/catch, como o gancho de etiquetas, senao TypeError). Casos existentes continuam validos com a nova regra: MSG-03 (total 200, paga 200, txid a vista: devido 190 -> quitado), MSG-04 (paga 100: `isHalf` -> "entrada"), MSG-02 (paga 60 -> "parcial"), teste de auditoria (total 100, `<= 150`, sem desconto). Novos casos obrigatorios: #26809 (total 173, valor `164.35`, txid = `paymentExternalId` -> `PAID`, `paymentDiscount "8.65"`, `pendingTotal "0.00"`, status `APROVADO`, mensagem sem "parcial"/"Restam"); fronteira da tolerancia (`164.33` quita, `164.32` nao); entrada 50% (`secondInstallmentExternalId`, `86.50` de 173 -> parcial, sem desconto, nao grava `paymentDiscount`); total `<= 150` (sem desconto); pagamento acumulado em dois PIX.

## Comprovante PIX (pergunta 2)

**Existe endpoint oficial** [CITED: dev.efipay.com.br/en/docs/api-pix/endpoints-exclusivos-efi/]: `GET /v2/gn/pix/comprovantes`, escopo `gn.receipts.read`, exige exatamente um entre `e2eId`, `idEnvio`, `rtrId` ou `txid`; resposta 200 documentada como imagem (`comprovante.png`). **A pagina nao diz** se cobre PIX recebido nem o content-type exato [ASSUMED: A2]. A pagina `gestao-de-pix` (`GET /v2/pix/:e2eId`, `GET /v2/pix`) **nao** tem comprovante [CITED: dev.efipay.com.br/en/docs/api-pix/gestao-de-pix/]. O escopo `gn.receipts.read` precisa estar habilitado na aplicacao EFI (painel); `getAccessToken` (`efi.service.ts:~187-214`) nao envia `scope` e cacheia o token ate ~1h (`tokenCache`), entao habilitar o escopo so vale depois que o cache expirar/reiniciar [ASSUMED: A3].

**Payload do webhook PIX** [CITED: dev.efipay.com.br/en/docs/api-pix/webhooks/]:
```json
{ "pix": [ { "endToEndId": "E1803615022211340s08793XPJ", "txid": "fc9a43k6ff384ryP5f41719",
  "chave": "2c3c7441-...", "valor": "0.01", "horario": "2020-12-21T13:40:34.000Z", "infoPagador": "pagando o pix" } ] }
```
Com "dados do pagador" habilitados na conta, cada item ganha `gnExtras.pagador` `{ nome, cpf (mascarado), codigoBanco }` [CITED: comunidade.sejaefi.com.br; configuracao de conta com `"pagador": true` = ASSUMED A4]. `extractWebhookPayments` (`efi.service.ts:~28-58`) ja devolve `raw` = o item inteiro, entao `horario`, `infoPagador` e `gnExtras` estao disponiveis sem mudar o parser. Timeout de callback 60 s, ate 9 retentativas em nao-2xx [CITED: mesma pagina] — por isso falha do comprovante nao pode virar 5xx (um retry cairia em `ignored_duplicate` e o comprovante nunca sairia).

**Estrategia recomendada**
1. Texto da nota privada (sempre): `Pagamento PIX confirmado` + orcamento, valor pago, desconto, total, E2E, txid, data/hora (`horario` -> fuso America/Sao_Paulo), pagador/`infoPagador` quando houver. Sanitizar `infoPagador`/`nome` (texto livre do pagador, ate 140 chars, sem quebras) porque o Chatwoot renderiza markdown.
2. Anexo: tentar `EfiService.buscarComprovanteOficial(e2eId)` (`client.get("/v2/gn/pix/comprovantes", { params: { e2eId }, responseType: "arraybuffer", timeout: ~8000 })`, validar magic bytes PNG/JPEG/`%PDF`); em qualquer falha, `PixComprovanteService.gerarPng(dados)`.
3. Layout proprio: copiar o padrao de `danfse-pdf.service.ts` (`puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]})`, `setRequestInterception` abortando tudo que nao seja `about:blank`/`data:`, `Handlebars.create()` + `compile(..., { knownHelpersOnly: true, strict: false, noEscape: false })`) com `page.screenshot({ type: "png", fullPage: true })`, viewport ~480 px e `deviceScaleFactor: 2`.
4. Envio: **uma** requisicao multipart com `content` + `attachments[]` + `private=true`.

**Chatwoot: nota privada com anexo** — a doc oficial nao afirma [CITED: developers.chatwoot.com/api-reference/messages/create-new-message: "Does private=true work with attachments? The docs don't say"], mas o codigo-fonte da instancia local (v4.20.1) confirma: `@private = ActiveModel::Type::Boolean.new.cast(params[:private]) || false`, `@attachments = params[:attachments]`, `content: @params[:content]` e a unica validacao de `content` e `length: { maximum: 150_000 }` [VERIFIED: `docker exec chatwoot-rails-1` leitura de `app/builders/messages/message_builder.rb` e `app/models/message.rb`]. A versao da producao pode diferir [ASSUMED: A8]; manter a verificacao manual no checkpoint.

**Mudanca em `ChatwootService.sendAttachment`** (`chatwoot.service.ts:278-322`): hoje fixa `private` em `false` (`:302-303`) e nao envia `content`. Adicionar 5o parametro opcional `opts?: { private?: boolean; content?: string }` — **nao quebra** os chamadores existentes nem `nfse.service.chatwoot.test.ts:59` (`toHaveBeenCalledWith("999", pdfBuffer, "NFSe-42.pdf", "application/pdf")`), desde que quem nao precisa nao passe o 5o argumento. Sanitizar `fileName` (so `[A-Za-z0-9._-]`) porque entra cru no cabecalho `Content-Disposition`.

**DI e testes:** os 3 arquivos de teste do EfiService montam o modulo so com Prisma/Quotes/Chatwoot/Config (`efi.webhook.test.ts:33-45`, `efi.card-webhook.test.ts:57-66`, `efi.service.test.ts`). Declarar o renderizador no construtor como `@Optional() private readonly comprovanteRender?: PixComprovanteService` evita editar esses 3 testes; sem renderizador, a nota sai so com texto.

## NFS-e no orcamento (pergunta 3)

**Rota real:** nao esta no `QuotesController`; esta em `NfseController` (`nfse.controller.ts:14` `@Controller("quotes/:quoteId/nfse")`, `:38-41` `@Post("emitir") async emitir(@Param("quoteId") quoteId: string, @Body() dto: EmitirNfseNacionalDto)`), com `@Throttle({ default: THROTTLE_SENSITIVE })` = `{ ttl: 60_000, limit: 10 }` (`throttle.config.ts`). O servico e `NfseService.emitirQuoteNfseAutomatica` (`nfse.service.ts:138-220`); `:139` carrega o Quote, `:140-142` rejeita se `nfseNumero` ja existe, `:181` chama `nfseNacionalService.emitir`.

**Onde inserir a trava:** em `emitirQuoteNfseAutomatica`, logo depois de `:142` e **antes** de `resolverTomadorQuote`/`emitir` (nao gastar chamada Athos/SEFIN antes de negar). Carregar `PaymentTransaction`s do quote via `this.prisma` (o modulo ja importa `DatabaseModule`). Fluxo:
1. `pagamento = resolverPagamentoQuote(quote)` (usa `calcularQuitacao` com `total`, `paymentDiscount`, `paidTotal`).
2. `integral` -> segue (valor pre-preenchido no front; backend nao altera `dto.valorServico`).
3. nao integral: exigir `dto.senhaLiberacao`; sem `NFSE_OVERRIDE_PASSWORD` configurada, **negar sempre** (padrao "nunca libera por omissao" de `admin-session.ts`); comparar via sha256+`timingSafeEqual`; registrar auditoria em qualquer desfecho; senha errada -> `ForbiddenException({ code: "SENHA_LIBERACAO_INVALIDA", message })`; sem senha -> `ForbiddenException({ code: "PAGAMENTO_INTEGRAL_NAO_CONFIRMADO", message, situacao })` para a UI abrir o campo.
4. Limitador de falhas em memoria (ex.: 5 falhas/15 min por chave) como `frontend/src/lib/login-rate-limit.ts` (backend e instancia unica no compose); somado ao `THROTTLE_SENSITIVE` ja presente.

**DTO** (`dto/emitir-nfse-nacional.dto.ts`): como o `ValidationPipe` roda com `whitelist` + `forbidNonWhitelisted` (`main.ts:33-37`), campos novos **precisam** estar no DTO senao a requisicao toma 400: `@IsOptional() @IsString() @MaxLength(200) senhaLiberacao?`, `@IsOptional() @IsString() @MaxLength(80) liberadoPor?`. O `LoggingInterceptor` loga so metodo/URL/IP/UA (nao o corpo) — a senha nao vaza em log; manter assim e nunca logar o DTO.

**Auditoria ("quem/quando/orcamento")** [ASSUMED: estrutura, discricionaria]. O app **nao tem login por usuario** (`admin-session.ts`: "NAO ha sistema de login/perfis no app"; a pagina so valida contexto de iframe do Chatwoot). Logo "quem" = `liberadoPor` (campo obrigatorio de texto na UI quando usar senha) + IP real (`x-client-ip`) + user-agent. Modelo sugerido:
```prisma
model NfseLiberacao {
  id          String   @id @default(uuid())
  quoteId     String
  resultado   String   // LIBERADO | SENHA_INVALIDA | NAO_CONFIGURADA
  situacao    String   // SEM_PAGAMENTO | PARCIAL (situacao do pagamento no momento)
  valorPago   Decimal  @db.Decimal(12, 2)
  valorDevido Decimal  @db.Decimal(12, 2)
  valorNota   Decimal? @db.Decimal(12, 2)
  liberadoPor String?
  ip          String?
  userAgent   String?
  nfseNumero  String?
  criadoEm    DateTime @default(now())
  quote       Quote    @relation(fields: [quoteId], references: [id], onDelete: Restrict)
  @@index([quoteId, criadoEm])
}
```
Migration manual **aditiva e idempotente** (`CREATE TABLE IF NOT EXISTS`, como `20261122120000_add_pesquisa_recompensa/migration.sql`), porque producao usa `prisma migrate deploy` (`package.json` `prisma:deploy`). Nunca armazenar a senha nem hash dela. `Quote` ganha o lado inverso da relacao (`nfseLiberacoes NfseLiberacao[]`).

**Pre-preencher valor com o pago:** hoje o valor vem do total em **dois** lugares: `page.tsx:233` (`setEmitirValorServico(String(data.body?.totais?.valor ?? ""))`) e `page.tsx:307-309` (`abrirFormularioEmissao`, `setEmitirValorServico(valorTotal.toFixed(2))`). Ambos devem usar `pagamento.valorSugeridoNota` (= `paidTotal` quando integral) e cair no total so quando nao houver pagamento (caso de senha). O backend nao deve forcar o valor (D-07 e premissa a confirmar, A1).

**Frontend:** botoes em `page.tsx:699-737` (anexar XML manual + "Emitir NFS-e automaticamente", linha 734), card do formulario `:793`, botao Emitir `:947`, `handleEmitirNfseAutomatica` `:393` com `fetch` em `:414`. Adicionar: estado `pagamentoNfse` (fetch de `/api/quotes/:id/nfse/pagamento` ao carregar), bloco de resumo do pagamento (D-08), e, quando `situacao !== "INTEGRAL"`, campos "Senha de liberacao" (`type="password"`, `autoComplete="off"`) e "Quem esta liberando". Proxy novo `api/quotes/[id]/nfse/pagamento/route.ts` (copiar `tomador/route.ts`); `api/quotes/[id]/nfse/emitir/route.ts` passa a repassar `x-client-ip` (`ipDoCliente(req.headers)`, precedente `app/pesquisa/[token]/responder/route.ts:41-46`). O erro 403 do backend ja e repassado integralmente pelo proxy (`NextResponse.json(data, { status })`).

**Testes afetados pela trava:** `nfse.service.chatwoot.test.ts` e `nfse.service.identificador.test.ts` (e possivelmente `nfse.service.tomador.test.ts`) usam `Object.create(NfseService.prototype)` e quotes sem campos de pagamento (ex.: `{ id: "q1", externalQuoteId: 601, internalNumber: null, nfseNumero: null, conversationId: BigInt(999) }`). Com a trava, todos passariam a tomar 403. Criar uma fixture compartilhada de quote **pago integralmente** (`total`, `paidTotal`, `paymentDiscount`, `paymentConfirmedAt`) e injetar `prisma.paymentTransaction.findMany` nos `makeService()`; manter "Teste H" (NotFound) antes da trava.

**Fora do escopo/nao gatear:** `POST quotes/:quoteId/nfse` (anexar XML ja emitido fora do sistema, `nfse.controller.ts:~21-30`) registra um fato fiscal consumado; a trava vale para **emitir**. Contas a Receber (`cobranca.service` -> `NfseNacionalService`) nao passa por este endpoint e nao deve ser afetado (Fase 30).

## Mapa da remocao iiBrasil (pergunta 4)

**Achado central:** o codigo SOAP/emissao iiBrasil **ja nao existe** em `apps/` (comentario em `nfse.service.ts:29-34`: "a emissao automatica via SOAP (iiBrasil/ABRASF) foi descontinuada"; nao ha `enviarSoap`, `computeIntegridade` nem `import ... "soap"`). A migration `20260819120000_nfse_manual_anexo` ja tornou `numeroRps` opcional. Ou seja, D-11 = limpar residuo.

### REMOVER (emissao/credenciais/sonda)
| Item | Local | Acao | Risco |
|------|-------|------|-------|
| Dependencia `soap` | `apps/backend/package.json:40`, `package-lock.json` | `npm uninstall soap -w @orcamento/backend` | Nenhum uso no codigo (grep). Rebuild da imagem |
| `NFSE_TOKEN` obrigatoria no boot | `app.module.ts:31` (lista `REQUIRED_ENV_VARS`) | Remover da lista **antes** de remover da stack | Se remover da stack primeiro, o backend **nao sobe** (`validateEnv` lanca "Missing required environment variables") |
| Sonda WSDL iiBrasil no `/health` | `health.controller.ts:61-70` (`checkNfse`, URL `https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps?wsdl`), usado em `:21`, `:24`, `:28`, `:34` | Trocar por checagem de configuracao da NFS-e Nacional (`NFSE_NACIONAL_CERT_PEM`/`_KEY_PEM`/`_CNPJ_PRESTADOR` presentes, **sem** chamada de rede) ou remover a chave `nfse` | `allOk` inclui `nfse`: sem `NFSE_TOKEN` o `/health` viraria `degraded`. O chamador de `/health` e o runbook (`deploy/UPDATE_RUNBOOK.md:33-35,108`), nao o healthcheck do compose (esse e `pg_isready`) |
| Vars iiBrasil | `.env.example:128-134` (`NFSE_TOKEN`, `NFSE_CNPJ_PRESTADOR`, `NFSE_INSCRICAO_MUNICIPAL`, `NFSE_SOAP_URL`, `NFSE_AUX_URL`) e `:155-156` (aviso "NFSE_SOAP_URL e NFSE_AUX_URL") | Remover; adicionar bloco `NFSE_NACIONAL_*` e `NFSE_OVERRIDE_PASSWORD=` (vazio) | `.env.example` tem mojibake em comentarios (`â€”`): editar so as linhas alvo |
| Compose VPS | `deploy/docker-compose.vps.yml:153-157`, `deploy/docker-compose.box.vps.yml:139-143` | Remover as 5 linhas e **adicionar** `NFSE_OVERRIDE_PASSWORD: ${NFSE_OVERRIDE_PASSWORD}` | Sem a linha nova o container nunca ve a senha (compose lista env explicitamente) |
| Stack env | `deploy/stack.env.example:177-178` | Remover `NFSE_TOKEN`; incluir `NFSE_OVERRIDE_PASSWORD=` | — |
| Docs/memoria | `memory/nfse-iibrasil-integracao.md`, indice `memory/MEMORY.md`, `.planning/codebase/INTEGRATIONS.md:146-175,331-335` | Marcar como historico/descontinuado (nao apagar: contem o contexto das notas antigas); atualizar INTEGRATIONS | Memoria `nfse-iibrasil-integracao.md` ainda descreve "NAO ALTERAR" hash — reescrever o cabecalho |
| Comentarios obsoletos | `page.tsx:114,263`, `aba-gerar-boleto.tsx:55,278,317`, `api/quotes/[id]/nfse/route.ts:5`, `api/cobranca/nfse/route.ts:5`, `nfse.controller.ts:18`, `cobranca.controller.ts:100`, `cobranca.service.ts:364` | Opcional: ajustar redacao | Sem risco funcional |

### MANTER (leitura de notas historicas)
| Item | Local | Por que |
|------|-------|---------|
| Passthrough de PDF pronto do provedor (Tier 3) | `cobranca.service.ts:~555-600` (`%PDF-` sniff) e teste `cobranca.service.danfse.test.ts:96` | Notas iiBrasil antigas so tem PDF no `linkNfse` |
| "XML indisponivel" para nota so-PDF | `cobranca-notas.service.ts:283,460`; testes `cobranca-notas.service.test.ts:79` (X3), `cobranca-notas.zip.test.ts:71` (Z2) | Contrato de erro para notas legadas |
| Anexo so-PDF no e-mail | `email-envio.service.ts:~170-190` | Mesmo motivo |
| `NfseEmitida.numeroRps` (coluna legado) | `schema.prisma` (`numeroRps Int? // legado ...`) | Linhas antigas tem RPS; nao dropar coluna |
| `parseNfseXml`/DANFSe Nacional | `nfse-xml-parser.util.ts`, `danfse-*`, `danfe-pdf.service.ts` | E o padrao Nacional atual (nao e iiBrasil) |
| Anexo manual de XML | `NfseController.anexar`, `CobrancaController` `POST cobranca/nfse` | Fluxo vivo e independente do SOAP |

**Scripts historicos** (`scripts/_phase20_implement.py`, `_fix_nfse_valor_servicos_liquido.py`, `_phase21_test_pf.py`, `_update_project_v10.py`) mencionam `enviarSoap`/`NFSE_TOKEN`: sao geradores antigos, nao executados em build; nao tocar.

**Ordem segura (producao):** (1) deploy do codigo sem `NFSE_TOKEN` obrigatoria/sem sonda; (2) so depois remover as env da stack VPS. Reversao = `git revert`; nao ha migration de banco nesta parte.

## Common Pitfalls

### Pitfall 1: 50/50 tambem recebe 5% de desconto (viola D-02)
**What goes wrong:** `createPix5050Link` (`efi.service.ts:399-412`) chama `createPixPaymentLink({ amount: halfAmount })`, que reaplica `resolvePaymentOptions(halfAmount)` (`:237`). Se a metade for `> 150` (total `> 300`), a cobranca de entrada sai com 5% de desconto (ex. total 400: metade 200, cobranca R$ 190,00), mas a mensagem ao cliente mostra a metade cheia (`quotes.service.ts:~1975-1981`, `halfAmount`).
**Why it happens:** o desconto esta embutido em `createPixPaymentLink`, nao e opcao do chamador.
**How to avoid:** adicionar `aplicarDescontoPix?: boolean` (default `true`) em `createPixPaymentLink` e passar `false` em `createPix5050Link`. Teste: total 400 -> cobranca de entrada `200.00`.
**Warning signs:** webhook de entrada com `valor` != metade e mensagem "parcial".

### Pitfall 2: Pagamentos antigos ja gravados como parciais (o proprio #26809)
**What goes wrong:** corrigir o webhook nao conserta quotes ja pagas (status `PAGAMENTO_PARCIAL`, `pendingTotal = 8.65`, `paymentConfirmedAt` nulo). A trava de NFS-e as negaria.
**How to avoid:** script idempotente de reconciliacao (dry-run por padrao) que, para quotes com `paymentExternalId` e `PaymentTransaction` PIX naquele txid cujo valor ~ `PIX_AVISTA.finalAmount` (tolerancia 0,02) e que estao `PAGAMENTO_PARCIAL`, grava `paymentDiscount`/`paymentAmount`/`pendingTotal=0`/`paymentConfirmedAt` e muda o status via `QuotesService.changeStatus` (gera historico e etiquetas). Executar so com aprovacao do usuario (escrita em producao) — Open Question 3.

### Pitfall 3: Aritmetica em float e tolerancia
**What goes wrong:** `173 * 0.95 = 164.34999999999997`; so `toFixed(2)` salva. Comparar `pending <= 0` com floats ou com tolerancia aplicada em reais e fragil.
**How to avoid:** centavos inteiros (Pattern 1); testar `164.35`, `164.33` (quita), `164.32` (nao quita).

### Pitfall 4: Comprovante dentro do caminho critico do webhook
**What goes wrong:** Puppeteer (1-3 s, cold start) + chamada EFI + upload Chatwoot atrasam a resposta; excecao nao tratada vira 500 e a EFI retenta (cai em `ignored_duplicate`, comprovante perdido).
**How to avoid:** apos commit, em `try/catch` proprio, timeouts por etapa (EFI ~8 s, render <= 30 s como no padrao existente), nunca relancar; logar `quoteId` + `e2eId` (sem token) para reenvio manual.

### Pitfall 5: Mock sem metodo novo derruba testes existentes
**What goes wrong:** `mockChatwootService` so tem `sendOutgoingMessage`; chamar `postConversationNote`/`sendAttachment` direto lanca TypeError. **How to avoid:** try/catch + `typeof ... === "function"`; novos testes injetam os mocks adicionais.

### Pitfall 6: Front nao tem dado de pagamento
**What goes wrong:** assumir que `QuoteDetail` ja traz `paidTotal`. Nao traz (`page.tsx:15-33` so tem `paymentConfirmedAt`). **How to avoid:** endpoint dedicado `GET .../nfse/pagamento` (nao mexer no contrato de `getById`, usado por varios testes).

### Pitfall 7: `ValidationPipe` rejeita campos novos
`forbidNonWhitelisted: true` -> 400 se `senhaLiberacao`/`liberadoPor` nao estiverem no DTO.

### Pitfall 8: Env nova nao chega ao container
Compose lista variaveis explicitamente; esquecer `NFSE_OVERRIDE_PASSWORD` em `docker-compose.vps.yml` **e** `docker-compose.box.vps.yml` deixa o override sempre negado (silencioso).

### Pitfall 9: Arquivo `efi.service.ts` com BOM e mojibake misto
O arquivo comeca com BOM e tem trechos ja "double-encoded" (ex.: `nÃ£o configurado`, `OrÃ§amento`) ao lado de trechos UTF-8 corretos (mensagens do webhook). Editar por `Edit` cirurgico; **nao** reformatar/reencodar o arquivo inteiro nem "corrigir" trechos alheios.

### Pitfall 10: Duplo clique emite duas notas
`emitirQuoteNfseAutomatica` faz checa-e-age em `nfseNumero` (`nfse.service.ts:140`) sem trava; duas requisicoes simultaneas podem emitir duas NFS-e. Ja existia; a UI desabilita o botao em `enviando`. Opcional: `updateMany({ where: { id, nfseNumero: null }, ... })` como claim.

### Pitfall 11: `infoPagador`/nome do pagador sao texto livre de terceiros
Escapar no template (Handlebars `noEscape: false`), truncar e remover quebras no texto da nota (Chatwoot renderiza markdown/links).

## Code Examples

### Comparacao de senha em tempo constante
```typescript
// Fonte: padrao de timingSafeEqual de apps/backend/src/modules/security/internal-auth.guard.ts
import { createHash, timingSafeEqual } from "node:crypto";
const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
export function senhaConfere(informada: string | undefined, esperada: string | undefined): boolean {
  if (!esperada || !informada) return false;       // nunca libera por omissao
  return timingSafeEqual(h(informada), h(esperada)); // 32 bytes sempre: sem vazamento de tamanho
}
```

### Anexo privado no Chatwoot (extensao de `sendAttachment`)
```typescript
// Fonte: chatwoot.service.ts:278-322 + message_builder.rb do Chatwoot (private e attachments independentes)
async sendAttachment(conversationId: string, buffer: Buffer, fileName: string, contentType: string,
                     opts?: { private?: boolean; content?: string }) {
  // ... mesmo montador multipart; acrescentar partes:
  //   name="content"  -> opts.content (se houver)
  //   name="private"  -> String(opts?.private ?? false)
}
```

### Texto-base da nota privada
```
Pagamento PIX confirmado - Orcamento #{numero}
Valor pago: R$ 164,35 | Desconto PIX: R$ 8,65 | Total do orcamento: R$ 173,00
E2E: E1803615... | txid: orc26809... | Data/hora: 25/11/2026 11:40
Pagador: NOME (quando o webhook trouxer)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NFS-e via SOAP iiBrasil (hash SHA-512, RPS) | NFS-e Nacional (Sefin, mTLS A1) + anexo manual | Ago/2026 (migration `20260819120000`, PR #56) | iiBrasil so existe como residuo de config e notas historicas |
| DANFSe via API do governo | DANFSe local (Puppeteer) e `nfse-node` | 03/08/2026 (NT 008/2026, `danfse-pdf.service.ts:8-9`) | Nao depender de PDF do governo |

**Deprecated/outdated:** emissao SOAP iiBrasil; `NFSE_TOKEN`/`NFSE_SOAP_URL`/`NFSE_AUX_URL`; dependencia `soap`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O valor da NFS-e deve ser o valor efetivamente pago (R$ 164,35), nao o total (R$ 173,00) | NFS-e (D-07) | Base fiscal incorreta; confirmar com o contador/usuario antes de fixar |
| A2 | `GET /v2/gn/pix/comprovantes?e2eId=` funciona para PIX *recebido* e devolve imagem | Comprovante | Fallback para layout proprio cobre; sem custo funcional |
| A3 | Escopo `gn.receipts.read` precisa ser habilitado no painel EFI e o token cacheado so reflete apos expirar/reiniciar | Comprovante | Anexo oficial nunca sai ate habilitar; fallback cobre |
| A4 | Dados do pagador (`gnExtras.pagador`) exigem configuracao de conta (`pagador: true`) | Comprovante | Linha "pagador" ausente (e opcional, D-04 diz "quando trouxer") |
| A5 | Tabela de auditoria `NfseLiberacao` com `liberadoPor` digitado + IP + UA e suficiente como "quem" (nao ha login por usuario) | NFS-e | Auditoria mais fraca que o desejado; usuario pode querer outro identificador |
| A6 | Backend roda em instancia unica (limitador de falhas em memoria basta) | NFS-e | Com varias instancias o limite e por processo |
| A7 | PNG via `page.screenshot` leva 1-3 s e e aceitavel dentro do timeout de 60 s do webhook | Comprovante | Se lento, mover para fila/fire-and-forget |
| A8 | Chatwoot de producao aceita nota privada com anexo como o v4.20.1 local | Comprovante | Checkpoint manual de verificacao |
| A9 | Propostas de IDs de requisito P54-* | Phase Requirements | Apenas rotulos |

## Open Questions

1. **Pagamento no caixa do Athos libera a NFS-e sem senha?**
   - What we know: `conciliarViaCaixaAthos`/`confirmarPagamentoCaixa` gravam `paymentNote` e `paymentConfirmedAt` mas nao `paidTotal` (`quotes.service.ts:~486-494,~540-547`); `paidInCashier` ja e exposto (`:1694`). Para 50% PIX + resto no caixa, `paymentConfirmedAt` nem e gravado (so quando status era `PENDENTE`/`ENVIADO`).
   - What's unclear: D-06 fala so em `paidTotal >= devido`; quem paga no caixa ficaria sempre pedindo senha.
   - Recommendation: seguir D-06 estritamente nesta fase (conservador) e expor `origem: "CAIXA"` no endpoint de pagamento; **perguntar ao usuario** se `paidInCashier`/`paymentConfirmedAt` deve contar como integral (valor sugerido = total).
2. **Corrigir o desconto indevido no 50/50 (Pitfall 1)?** Alinha com D-02 mas altera `createPixPaymentLink`. Recomendacao: incluir (mudanca pequena e testavel).
3. **Reconciliar quotes antigas, incluindo o #26809 (Pitfall 2)?** Escrita em producao. Recomendacao: script com dry-run; execucao so com aprovacao explicita do usuario (regra do projeto: nao alterar sem pedido).
4. **O backend deve limitar `valorServico` ao valor pago?** D-07 so pede pre-preenchimento. Recomendacao: nao limitar; apenas pre-preencher e registrar `valorNota` na auditoria quando houver liberacao.
5. **Gatear tambem o anexo manual de XML?** Recomendacao: nao (fato fiscal ja consumado).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/testes | ✓ | v22.22.1 | — |
| npm | remover `soap` | ✓ | 11.12.1 | — |
| Jest | testes backend | ✓ | 30.2.0 | — |
| `tsc` | typecheck | ✓ | `tsc -p tsconfig.json --noEmit` exit 0 | — |
| Prisma CLI | validar schema/migration | ✓ | 5.22.0 (`prisma validate` ok com `DATABASE_URL` dummy) | — |
| Chrome do Puppeteer | testes de render do comprovante | ✓ | `~/.cache/puppeteer/{chrome,chrome-headless-shell}` | mockar `puppeteer` nos testes unitarios |
| Docker / psql | validar migration contra Postgres | ✓ | `docker`, `psql` presentes | usar Postgres descartavel (nunca o Athos de producao) |
| Chatwoot local (v4.20.1) | verificar nota privada + anexo | ✓ | container `chatwoot-rails-1` | verificar manual na producao |
| Credenciais EFI reais / mTLS | provar `GET /v2/gn/pix/comprovantes` | ✗ | — | Spike manual do usuario (Wave 0); fallback de layout proprio ja cobre |
| Frontend test runner | UI | ✗ | `apps/frontend/package.json` sem script de teste | `tsc`/`next build` + UAT manual |

**Missing dependencies with no fallback:** nenhum bloqueante.
**Missing dependencies with fallback:** credenciais EFI (spike manual); runner de teste do frontend (UAT).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest (`apps/backend/jest.config.js`, `testRegex: '.*\\.test\\.ts$'`, `rootDir: 'src'`) |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `cd /root/SistemaOrcamento/apps/backend && npx jest src/modules/integrations/efi src/modules/integrations/nfse src/modules/quotes/quote-payment.util.test.ts` |
| Full suite command | `cd /root/SistemaOrcamento/apps/backend && npx jest --silent` |
| Baseline medido | efi+nfse: 10 suites / 78 testes verdes (44 s). Suite completa: 102 passed + 2 skipped suites; 1711 passed + 28 skipped testes (27 s) |
| Typecheck | `cd /root/SistemaOrcamento/apps/backend && npx tsc -p tsconfig.json --noEmit` (exit 0 hoje) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P54-PAG | util: `calcularQuitacao` (164.35/173 quita; 164.33 quita; 164.32 nao; sem desconto <=150) | unit | `npx jest src/modules/quotes/quote-payment.util.test.ts` | ❌ Wave 0 |
| P54-PAG | webhook #26809: `PAID`, `paymentDiscount "8.65"`, `paymentAmount "164.35"`, `pendingTotal "0.00"`, `APROVADO`, msg sem "parcial"/"Restam" | unit | `npx jest src/modules/integrations/efi/efi.webhook.test.ts -t "desconto"` | ✅ estender |
| P54-PAG | entrada 50% (`secondInstallmentExternalId`) parcial sem desconto; acumulado de 2 PIX | unit | idem | ✅ estender |
| P54-PAG | `createPix5050Link` nao aplica desconto (total 400 -> 200.00) | unit | `npx jest src/modules/integrations/efi/efi.service.test.ts` | ✅ estender |
| P54-CMP | comprovante: nota privada com texto minimo + anexo; falha (render/EFI/Chatwoot) nao derruba `processWebhook`; duplicado nao reposta | unit | `npx jest src/modules/integrations/efi/efi.webhook.test.ts -t "comprovante"` | ✅ estender |
| P54-CMP | `sendAttachment` com `private=true` e `content` no multipart; sem opts mantem `private=false` | unit | `npx jest src/modules/integrations/chatwoot` | ❌ Wave 0 (novo teste) |
| P54-CMP | render PNG (template escapa HTML do pagador) | unit (puppeteer mockado) + 1 smoke real | `npx jest src/modules/integrations/efi/pix-comprovante.service.test.ts` | ❌ Wave 0 |
| P54-NFS | integral emite; parcial/sem pagamento -> 403 `PAGAMENTO_INTEGRAL_NAO_CONFIRMADO`; senha certa emite+audita; errada -> 403+audita; env ausente nega | unit | `npx jest src/modules/integrations/nfse` | ✅ estender + ❌ novo `nfse.service.pagamento.test.ts` |
| P54-NFS | `senhaConfere` (tamanhos diferentes, vazio, env vazia) e limitador de falhas | unit | `npx jest src/modules/integrations/nfse/nfse-liberacao.util.test.ts` | ❌ Wave 0 |
| P54-NFS | DTO aceita `senhaLiberacao`/`liberadoPor` e rejeita campos extras | unit | `npx jest src/modules/integrations/nfse` | ❌ Wave 0 |
| P54-IIB | app sobe sem `NFSE_TOKEN`; `/health` nao chama iiBrasil; leitura historica intacta | unit | `npx jest src/modules/cobranca` (X3, Z2, danfse tier 3 devem continuar verdes) | ✅ existentes |
| P54-IIB | `grep -rn "iibr.com.br\|NFSE_TOKEN\|NFSE_SOAP_URL\|from \"soap\"" apps deploy .env.example` sem resultados (exceto docs historicas) | static | comando grep | ❌ criterio de aceite |
| UI | pagamento identificado, campo de senha, valor pre-preenchido | manual (UAT) + `next build` | `cd apps/frontend && npx tsc --noEmit` | ❌ UAT |

### Sampling Rate
- **Per task commit:** o "Quick run command" acima (alvo da area alterada).
- **Per wave merge:** suite completa (`npx jest --silent`) + `tsc --noEmit`.
- **Phase gate:** suite completa verde (>= 1711 testes + os novos) antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `quotes/quote-payment.util.test.ts` — P54-PAG
- [ ] `integrations/nfse/nfse-liberacao.util.test.ts` — P54-NFS (senha + limitador)
- [ ] `integrations/nfse/nfse.service.pagamento.test.ts` — gate + auditoria
- [ ] fixture compartilhada de quote pago para `nfse.service.*.test.ts`
- [ ] `integrations/efi/pix-comprovante.service.test.ts` e teste de `sendAttachment` com opts
- [ ] Checkpoint humano: probe real de `GET /v2/gn/pix/comprovantes` (credenciais EFI) e nota privada+anexo na producao do Chatwoot
- [ ] Validar a migration `NfseLiberacao` num Postgres descartavel (`prisma migrate deploy` + `prisma validate`)

## Security Domain

`security_enforcement` nao esta desabilitado em `.planning/config.json` (chave ausente = habilitado).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | parcial | Segredo compartilhado `NFSE_OVERRIDE_PASSWORD` (nao ha login por usuario); sha256 + `timingSafeEqual`; negar quando nao configurada |
| V3 Session Management | nao | Sem sessao nova |
| V4 Access Control | sim | Trava de pagamento aplicada **no backend** (o front so reflete); `InternalAuthGuard` global ja protege a rota |
| V5 Input Validation | sim | `class-validator` no DTO (`MaxLength`), whitelist; sanitizar `infoPagador`/nome/arquivo do anexo |
| V6 Cryptography | sim | `node:crypto` (`createHash`, `timingSafeEqual`); nao criar cripto propria; nunca gravar a senha |
| V7 Error/Logging | sim | Nunca logar senha/DTO; `LoggingInterceptor` loga so URL/IP/UA; logs do comprovante so com `quoteId`/`e2eId` |
| V8 Data Protection | sim | Auditoria sem segredo; E2E/CPF mascarado do pagador so em nota privada |

### Known Threat Patterns for NestJS + Next + Chatwoot

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forca bruta da senha de liberacao | Spoofing/Elevation | `THROTTLE_SENSITIVE` (10/min) + limitador de falhas (5/15 min) + auditoria das falhas |
| Timing attack na comparacao | Information disclosure | sha256 dos dois lados + `timingSafeEqual` |
| Bypass da trava pelo front | Tampering | Regra so no backend; o front nao envia "pago=true" |
| Injecao via `infoPagador`/nome (HTML no render, markdown na nota) | Tampering/Info disclosure | Handlebars com escape, rede bloqueada no Puppeteer, truncar/sanitizar texto |
| Cabecalho multipart injetado por `fileName` | Tampering | Sanitizar nome do anexo |
| Webhook falso forjando pagamento | Spoofing | Achado pre-existente, **fora do escopo**: `EfiWebhookGuard` existe em `security/` mas so e registrado no `SecurityModule` (`security.module.ts:4-10`); `EfiController` expoe `webhook/payment/pix` como `@Public()` sem `@UseGuards` (grep nesta sessao). Um POST forjado com txid valido marcaria pedido como pago e agora tambem postaria comprovante. Registrar como risco para o usuario; nao ampliar a superficie nesta fase |
| Vazamento de senha em log/auditoria | Info disclosure | Nunca persistir/logar; `.env.example` vazio (D-09) |
| Emissao duplicada por concorrencia | Tampering | Pitfall 10 (claim condicional) |

## Project Constraints (from CLAUDE.md)

- Responder sempre em **portugues brasileiro**; codigo/nomes tecnicos seguem a convencao do projeto (`memory/feedback_idioma.md`).
- **Nao usar `AskUserQuestion`**: perguntas em lista numerada em texto (`memory/feedback_askuserquestion.md`) — relevante para o `discuss`/checkpoints.
- **Nao modificar codigo sem pedido explicito**; propor e perguntar antes (`memory/feedback_nao_mexer_codigo.md`). Esta pesquisa nao alterou codigo de producao.
- Backend preferencial VPS `orcamentoapi.bomcustoilhabela.com.br`, fallback `localhost:4000` (`memory/project_urls.md`).
- **Athos PostgreSQL 9.0.5 em producao** — nunca escrever; testes de escrita so no clone `athos-teste` (`memory/athos_postgres_9_0_5.md`). Esta fase **nao toca o Athos**; a reconciliacao do #26809 e no banco do Sistema, nao no Athos.
- Memoria do projeto versionada em `memory/` com indice `memory/MEMORY.md`: ao atualizar `nfse-iibrasil-integracao.md`, manter o indice coerente.
- Commits: terminar com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (system-reminder da sessao).
- Regras da API Athos (sem emoji em `observacao` etc.) **nao se aplicam** a notas do Chatwoot (D-05).

## Sources

### Primary (HIGH confidence)
- Codigo do repositorio lido nesta sessao: `efi.service.ts`, `efi.webhook.test.ts`, `efi.card-webhook.test.ts`, `chatwoot.service.ts`, `nfse.service.ts`, `nfse.controller.ts`, DTO de emissao, `quotes.service.ts` (trechos), `schema.prisma`, `app.module.ts`, `health.controller.ts`, `page.tsx`, rotas proxy, compose/env.
- Execucao local: baseline Jest (efi+nfse e suite completa), `tsc --noEmit`, `prisma validate`, `npm ls soap`.
- Codigo-fonte do Chatwoot v4.20.1 local (`message_builder.rb`, `message.rb`) via `docker exec chatwoot-rails-1` (somente leitura).

### Secondary (MEDIUM confidence)
- https://dev.efipay.com.br/en/docs/api-pix/endpoints-exclusivos-efi/ — `GET /v2/gn/pix/comprovantes`, escopo `gn.receipts.read`, identificadores, resposta imagem.
- https://dev.efipay.com.br/en/docs/api-pix/webhooks/ — payload do webhook PIX, timeout 60 s, 9 retentativas.
- https://dev.efipay.com.br/en/docs/api-pix/gestao-de-pix/ — `GET /v2/pix/:e2eId`, `GET /v2/pix`; sem endpoint de comprovante ali.
- https://developers.chatwoot.com/api-reference/messages/create-new-message — parametros; doc omissa sobre `private` + anexos.

### Tertiary (LOW confidence)
- https://comunidade.sejaefi.com.br/discussao/integracao-pix-pagador-devedor-webhook-51 — `gnExtras.pagador` e configuracao de conta (resposta de usuario em forum).
- https://apis.apievangelist.com/store/gerencianet-receipts-api/ — catalogo de terceiros listando o endpoint de comprovantes.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma lib nova; tudo ja presente e lido.
- Architecture: HIGH — pontos de insercao verificados por arquivo:linha; fluxo de testes medido.
- Pitfalls: HIGH para 1, 2, 3, 5, 7, 8 (verificados no codigo); MEDIUM para 4 e 10 (raciocinio sobre runtime).
- Comprovante EFI oficial: MEDIUM-LOW — endpoint documentado, comportamento para PIX recebido nao confirmado (A2/A3).

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 (codigo estavel; reconferir a doc EFI se o spike manual falhar)
