# Summary: 19-01 — AthosService.buscarRelacaoOrcamentoVenda

**Phase:** 19-aprovacao-associada-caixa-athos  
**Plan:** 01  
**Wave:** 1  
**Commit:** 8fd4df7  
**Status:** DONE

## Objective

Adicionar método `buscarRelacaoOrcamentoVenda` no `AthosService` para consultar a tabela `relacao_orcamento_venda` no Athos ERP (read-only pool) e retornar o `idvenda` vinculado a um `idorcamento`.

## Artifacts Created / Modified

| File | Action |
|------|--------|
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | Added method `buscarRelacaoOrcamentoVenda` at line ~682 |
| `apps/backend/src/modules/integrations/athos/athos.service.test.ts` | Added describe block with 3 tests |

## Key Decisions

- Método retorna `{ idvenda: null }` em caso de not-found ou erro de conexão (não lança exceção)
- Usa o pool Athos existente via `getPool()` com `client?.release()` no finally
- Padrão idêntico ao dos métodos existentes no serviço

## Tests

- 9/9 testes passando (3 novos: found, not-found, pool failure)
