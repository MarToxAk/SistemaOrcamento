# 12-CONTEXT — Conciliação Athos no backend

Phase: 12
Milestone: v1.4
Status: planning
Created: 2026-05-04

---

## Objetivo

Implementar a conciliação real de pagamento via banco de dados do Athos no backend, substituindo o stub `verificarPagamentoPorOrcamento` por uma consulta real à base PostgreSQL do Athos.

A lógica de sincronização de status já existe em `quotes.service.ts#checkPaymentStatus` — quando o método retornar `paid=true`, o orçamento é promovido para `APROVADO` automaticamente. O único bloqueio é que o stub retorna sempre `paid: false`.

---

## Escopo

### In Scope
- Implementar `verificarPagamentoPorOrcamento` com consulta real ao Athos
- Suportar busca por `orcamentoId` e por `vendaId` quando disponível (ATHP-02)
- Retornar `paid`, `idVenda`, `valor` tipados corretamente
- Quando `paid=true`, o status já é sincronizado pelo caller existente (ATHP-03 já implementado)

### Out of Scope
- Gatilhos automáticos (PCHK-01, PCHK-02) → Fase 13
- Observabilidade estruturada e degradação graciosa completa → Fase 13
- Alterar o fluxo de `checkPaymentStatus` no quotes.service

---

## Estado Atual

### AthosService
- **Método stub:** `verificarPagamentoPorOrcamento(orcamentoId, vendaId?)` → sempre `{paid: false, idVenda: null, valor: 0}`
- **Pool configurado:** PostgreSQL read-only, max 5 conexões, timeout 30s
- **Padrão de consulta:** dynamic column discovery via `information_schema.columns` (já usado em `buscarOrcamentoPorNumero` e `listarContasPagar`)

### QuotesService (caller)
- `checkPaymentStatus()` (linha ~231) já usa o resultado:
  - Persiste `saleExternalId` se `payment.idVenda` retornar um valor novo
  - Chama `changeStatus(quote.id, "APROVADO")` quando `payment.paid === true` e status em `["PENDENTE", "ENVIADO"]`

---

## Decisões de Design

| ID | Decisão | Razão |
|----|---------|-------|
| D-01 | Dynamic column discovery via information_schema | Consistência com padrão do AthosService; resiste a variações de schema |
| D-02 | Buscar primeiro por `idvenda` se disponível, fallback por `idorcamento` | `idvenda` é mais direto para conciliação financeira |
| D-03 | Tabelas candidatas para venda: `venda`, `orcamento_venda`, `movimento_venda` | Cobertura de variações de nomenclatura de banco Athos |
| D-04 | Status "pago" detectado por coluna de situação: `situacaovenda`, `situacao`, `statuspagamento` com valor contendo `PAGO`, `QUITADO`, `RECEBIDO` | Padrão observado em schemas ERP brasileiros |
| D-05 | Sem lançar exceção em caso de tabela não encontrada — retornar `{paid: false}` com log | Degradação graciosa; não deve quebrar fluxo principal |

---

## Arquivos Relevantes

| Arquivo | Papel na fase |
|---------|---------------|
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | Implementação do método real (alvo principal) |
| `apps/backend/src/modules/quotes/quotes.service.ts` | Caller — não muda; já tem lógica ATHP-03 |
| `apps/backend/prisma/schema.prisma` | Referência de campos: `saleExternalId`, `paymentConfirmedAt` |

---

## Referência de Requisitos

| Requisito | Descrição |
|-----------|-----------|
| ATHP-01 | Implementar `verificarPagamentoPorOrcamento` com consulta real |
| ATHP-02 | Considerar `orcamentoId` e `vendaId` quando disponível |
| ATHP-03 | Atualizar status do orçamento quando confirmado (já implementado no caller) |
