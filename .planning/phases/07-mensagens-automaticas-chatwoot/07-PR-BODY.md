# Phase 07: Mensagens Automáticas ao Cliente via Chatwoot

## Summary

**Phase 07: Mensagens Automáticas ao Cliente via Chatwoot**
**Goal:** Implementar envios automáticos ao cliente via Chatwoot para aprovações, notificações de status e notificações de pagamento (PIX), com tom profissional e correção de encoding.
**Status:** Verification: ✅ UAT passed (10/10)

Esta PR agrega as entregas das duas tarefas planejadas para a fase 7 (07-01, 07-02). Todas as mudanças foram testadas localmente com CI e testes unitários/integrados.

## Changes

### Plan 07-01: Mensagem de Aprovação + Notificações de Status
- Commit: `fa9c751` — feat(07-01): add changeStatus Chatwoot notifications + fix encoding
- Entregues:
  - Notificações Chatwoot em `changeStatus()` para `EM_PRODUCAO`, `PRONTO_PARA_ENTREGA`, `ENTREGUE`, `CANCELADO` (mensagens conforme D-03)
  - Correções de encoding em `approveByToken()` e `buildPaymentMessage()` para remover mojibake
- Arquivos-chave:
  - `apps/backend/src/modules/quotes/quotes.service.ts`

### Plan 07-02: Tom das Mensagens PIX
- Commit: `c52dac7` — feat(07-02): standardize PIX message tone with full client name
- Entregues:
  - Mensagens PIX usam o nome completo do cliente (remove `split(" ")[0]`) e tom mais profissional (D-01)
- Arquivos-chave:
  - `apps/backend/src/modules/integrations/efi/efi.service.ts`

## Requirements Addressed
- D-01: Tom profissional nas mensagens PIX
- D-03: Textos de notificação aprovados
- D-07: Falhas de envio devem logar e não quebrar o fluxo

## Tests / Verification
- Automated tests: ✅ 35/35 (25 quotes.service tests + 10 efi.webhook tests)
- UAT: ✅ 10/10 (detailed in `07-UAT.md`)

## Key Decisions
- Correções de encoding feitas via scripts de manipulação byte-level; alterações focadas em templates de mensagens.
- Chatwoot usado como canal de notificação. Se `conversationId` for `null`, apenas log é emitido.

## How to create PR
- Branch: `ship/phase-07` (já criada e push realizada)
- Remote: `m` → https://github.com/MarToxAk/SistemaOrcamento

If you have `gh` CLI installed locally, run:

```powershell
gh pr create --title "Phase 07: Mensagens Automáticas ao Cliente via Chatwoot" \
  --body-file ./.planning/phases/07-mensagens-automaticas-chatwoot/07-PR-BODY.md \
  --base main
```

Or open this URL to create a PR in the browser:

https://github.com/MarToxAk/SistemaOrcamento/pull/new/ship/phase-07

---

**Notes:**
- STATE.md será atualizado com o status de shipping após criação do PR (ou posso atualizar agora para indicar branch criada/PR pendente).
