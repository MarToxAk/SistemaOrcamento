# 06-04-SUMMARY.md — Gap Closure: Remove auto-dispatch hook from create()

## Status: COMPLETE

## Commit
`6c53538` — fix(06): remove auto-dispatch hook from create() — manual send only

## Objetivo
Fechar gap do UAT da fase 6 (teste 1): remover o hook fire-and-forget que disparava
`enviarParaCliente` automaticamente ao criar orçamento com `idorcamento` do Athos.
O operador quer controlar o envio manualmente via botão "Enviar".

## Implementação

### Backend — quotes.service.ts
- Removido bloco `if (payload.idorcamento && !quote.approvalRequestedAt)` (linhas ~587-596)
- O método `create()` não chama mais `enviarParaCliente` automaticamente
- Endpoint `POST /api/quotes/:id/enviar` (manual) permanece intacto no controller

### Testes — quotes.service.test.ts
- Removido describe "D-01 + D-06 — Hook fire-and-forget no create()" com 4 testes
- Removido mock `mockEnviarParaCliente` que ficou sem uso
- Teste D-03 (approvalLink usa /orcamento/) mantido
- Suite: 33/33 testes passando (era 37 antes da remoção dos 4 testes do hook)

## Verificações
- `npx tsc -p apps/backend/tsconfig.build.json --noEmit` → 0 erros
- `npm test` → 33/33 passed
- `grep "POST :id/enviar"` no controller → endpoint manual intacto

## Resultado
Criar orçamento com `idorcamento` do Athos não envia mais mensagem automaticamente.
O operador usa o botão "Enviar" no painel para disparar a mensagem quando quiser.

## Self-Check: PASSED
