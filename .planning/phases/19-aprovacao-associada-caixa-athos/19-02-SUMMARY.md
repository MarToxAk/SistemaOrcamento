# Summary: 19-02 — Guard EM_PRODUCAO + conciliarViaCaixaAthos

**Phase:** 19-aprovacao-associada-caixa-athos  
**Plan:** 02  
**Wave:** 2  
**Commit:** fd36b4e  
**Status:** DONE

## Objective

Atualizar `quotes.service.ts` com:
1. Guard `EM_PRODUCAO` com 3 condições (APR-01/02/03)
2. Branching em `getById` para chamar `conciliarViaCaixaAthos` quando `externalQuoteId` presente (ATHC-01)
3. Novo método privado `conciliarViaCaixaAthos` que busca vínculo Athos e aciona `checkPaymentStatus` (ATHC-02, TRG-01/02/03)

## Artifacts Created / Modified

| File | Action |
|------|--------|
| `apps/backend/src/modules/quotes/quotes.service.ts` | 3 mudanças: guard EM_PRODUCAO, branching getById, novo método |
| `apps/backend/src/modules/quotes/quotes.service.unit.test.ts` | Atualizado teste existente + 4 novos testes |

## Key Decisions

- Guard `EM_PRODUCAO` agora exige `isAssociated` (obrigatório) + (`approved` OU `saleExternalId`)
- Mensagens de erro em ASCII sem acentos para evitar encoding issues
- `conciliarViaCaixaAthos` persiste `saleExternalId` de forma idempotente (só atualiza se ainda null)
- Fire-and-forget via `void ... .catch()` para não bloquear `getById`

## New Logic Flow

```
getById():
  if (externalQuoteId) -> conciliarViaCaixaAthos (fire-and-forget)
  else if (PENDENTE/ENVIADO) -> checkPaymentStatus (anterior)

conciliarViaCaixaAthos():
  1. buscarRelacaoOrcamentoVenda(idorcamento) -> { idvenda }
  2. if idvenda && !saleExternalId -> persist saleExternalId
  3. if status PENDENTE/ENVIADO -> checkPaymentStatus()

changeStatus(EM_PRODUCAO):
  if (!isAssociated && !approved && !hasSaleId) -> throw "sem associacao...sem pagamento"
  if (!isAssociated) -> throw "sem associacao"
  if (!approved && !hasSaleId) -> throw "sem pagamento"
```

## Tests

- 28/28 testes passando
- Novos: sem-associacao, associado-sem-pagamento, associado+aprovado→ok, associado+saleId→ok
