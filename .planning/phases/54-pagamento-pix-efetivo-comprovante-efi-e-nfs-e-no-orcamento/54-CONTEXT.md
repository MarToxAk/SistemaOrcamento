# Phase 54: Pagamento PIX efetivo, comprovante EFI e NFS-e no orcamento - Context

**Gathered:** 2026-11-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Corrigir o fluxo de pagamento PIX (webhook EFI) para considerar o desconto de PIX a vista, enviar um comprovante de pagamento como nota privada na conversa do Chatwoot, e permitir emitir NFS-e na pagina do orcamento somente com pagamento integral (ou com senha de liberacao). Remover o emissor iiBrasil (descontinuado).

Caso de origem: orcamento #26809, total R$ 173,00, PIX pago R$ 164,35 (= 173,00 x 0,95, desconto de 5% acima de R$ 150, `efi.service.ts:417`). O webhook compara `paidTotal` com `quote.total` cheio e envia "pagamento parcial, restam R$ 8,65" mesmo com o pagamento completo.

</domain>

<decisions>
## Implementation Decisions

### Pagamento efetivo com desconto
- **D-01:** Total devido no PIX a vista = valor com desconto (`pixFinalAmount` da cobranca). Quitado quando `pago >= total devido` (tolerancia R$ 0,02). Gravar o desconto em `Quote.paymentDiscount` (hoje existe no schema e nada preenche; ex.: 8,65) e o valor devido em `Quote.paymentAmount`. A mensagem ao cliente deixa de dizer "parcial" nesse caso e passa a confirmar pagamento integral.
- **D-02:** O desconto de 5% vale **somente para PIX a vista**. O fluxo em 2 parcelas (`firstInstallmentAmount`/`secondInstallmentAmount`) continua sem desconto, usando o total cheio.
- **D-03:** Pagamentos reais parciais (ex.: 50% de entrada) continuam parciais, sem desconto, e nao liberam NFS-e.

### Comprovante na conversa privada
- **D-04:** Ao confirmar pagamento PIX, postar nota privada na conversa Chatwoot (`ChatwootService.postConversationNote`) com um **comprovante em layout proprio (imagem ou PDF anexado)**, pois a API EFI nao tem endpoint de comprovante pronto (confirmar na pesquisa; se houver, usar o oficial). Conteudo minimo: numero do orcamento, valor pago, desconto aplicado, total do orcamento, E2E ID, txid, data/hora, pagador quando o webhook trouxer. Falha no comprovante nunca derruba o webhook (try/catch + log), como ja ocorre com a mensagem ao cliente.
- **D-05:** O comprovante e interno (nota privada), nao e enviado ao cliente. Respeitar a regra sem emoji problematico apenas onde a API Athos exige; Chatwoot aceita emoji.

### NFS-e na pagina do orcamento
- **D-06:** Liberar a emissao somente com pagamento integral: `paidTotal >= total devido` (ja considerando o desconto). Com 50% (entrada) **nao libera**.
- **D-07:** Valor da nota: o **valor efetivamente pago** (ex.: R$ 164,35 no #26809), pre-preenchido no campo valor do servico. *(Premissa a confirmar na verificacao: pedido original do usuario diz para considerar o desconto de pagamento e identificar o pagamento feito.)*
- **D-08:** A tela mostra o pagamento identificado (valor pago, desconto, data, E2E) junto ao botao de emitir.
- **D-09:** Emitir **sem confirmacao de pagamento integral** exige senha de liberacao. Senha unica da empresa em variavel de ambiente (ex.: `NFSE_OVERRIDE_PASSWORD`), validada **no backend** (nunca no front), com comparacao em tempo constante, e **auditoria** (quem/quando/orcamento liberou). O valor da senha o usuario define depois; nao colocar valor real no repositorio nem em `.env.example`.

### Emissor de NFS-e
- **D-10:** Manter o fluxo atual do orcamento (Sistema Nacional / Sefin, `/quotes/:id/nfse/emitir`) e apenas adicionar as travas de pagamento e senha.
- **D-11:** **Remover o emissor iiBrasil** (SOAP), descontinuado. Cuidado de escopo: notas ja emitidas pelo iiBrasil continuam no banco e sao lidas por Contas a Receber/Cobranca (`cobranca-notas.service.ts`, `email-envio.service.ts`, `nfse-xml-parser.util.ts`). Remover o codigo de **emissao/SOAP/credenciais**, preservando leitura/parse de notas historicas. A pesquisa deve mapear o limite exato antes de apagar. Atualizar `.env.example` e a memoria `nfse-iibrasil-integracao.md`. — **Reversibility:** costly — remove cliente SOAP usado por varios modulos; reverter exige restaurar do git.

### Claude's Discretion
- Formato do comprovante (imagem vs PDF) e biblioteca de geracao (preferir o que o projeto ja usa para PDFs).
- Estrutura da tabela/campo de auditoria da liberacao por senha.
- Mensagem exata ao cliente quando o pagamento for integral com desconto.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pagamento PIX / EFI
- `apps/backend/src/modules/integrations/efi/efi.service.ts` — desconto PIX (~L417), webhook PIX (~L600-760), mensagem de parcial (L714), webhook de cartao (~L833)
- `apps/backend/prisma/schema.prisma` (`Quote`, `PaymentTransaction`) — `paymentDiscount`, `paymentAmount`, `paidTotal`, `pendingTotal`
- `apps/backend/src/modules/integrations/efi/efi.webhook.test.ts` — testes do webhook a estender
- `memory/integration-efi.md` — integracao EFI Pay

### Chatwoot
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` — `postConversationNote` (nota privada), `sendOutgoingMessage`
- `memory/integration-chatwoot.md`

### NFS-e
- `apps/backend/src/modules/integrations/nfse/` — `nfse-nacional.service.ts`, `nfse.service.ts` (iiBrasil), parser XML
- `apps/frontend/src/app/orcamento/[id]/page.tsx` (`handleEmitirNfseAutomatica`, ~L393) e `apps/frontend/src/app/api/quotes/[id]/nfse/emitir/route.ts`
- `memory/nfse-nacional-sefin-integracao.md`, `memory/nfse-iibrasil-integracao.md`
- `.planning/phases/30-emissao-nfse-titulos/` — emissao de NFS-e em Contas a Receber (nao quebrar)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatwootService.postConversationNote`: ja posta nota privada.
- Emissao automatica de NFS-e Nacional ja integrada na pagina do orcamento.
- `Quote.paymentDiscount` / `paymentAmount`: campos prontos, nao usados.

### Established Patterns
- Webhook EFI: dedupe por `eventId`/`externalId`, transacao Prisma, notificacoes em try/catch sem derrubar o webhook.
- Backend NestJS com segredos via env; front chama backend por `backendFetch`.

### Integration Points
- Webhook PIX em `efi.service.ts` (calculo de quitacao e mensagens).
- Endpoint `POST /quotes/:id/nfse/emitir` (travas de pagamento e senha).
- Pagina `orcamento/[id]` (UI de pagamento identificado e campo de senha).

</code_context>

<specifics>
## Specific Ideas

- Caso de teste: #26809 (173,00 total, 164,35 pago) deve resultar em quitado, sem "restam R$ 8,65".
- Caso de teste: entrada 50% nao libera NFS-e; pagamento integral com desconto libera.

</specifics>

<deferred>
## Deferred Ideas

- Desconto de PIX tambem nas duas parcelas (descartado nesta fase).
- Senha por usuario em vez de senha unica (nao pedido).

</deferred>

---

*Phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento*
*Context gathered: 2026-11-25*
