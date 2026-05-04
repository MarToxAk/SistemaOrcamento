# 13-CONTEXT — Gatilhos de checagem e sincronizacao de status

Phase: 13
Milestone: v1.4
Status: planning
Created: 2026-05-04

---

## Objetivo

Conectar a conciliação Athos (fase 12) ao fluxo normal de operação — disparando checagens automáticas ao abrir detalhe de orçamento e ao enviar para cliente, além de garantir observabilidade estruturada nos logs.

---

## Escopo

### In Scope
- PCHK-01: Ao abrir detalhe (`getById`), disparar checagem de pagamento para orçamentos elegíveis
- PCHK-02: Ao enviar para cliente (`enviarParaCliente`), disparar checagem antes do envio
- PCHK-03: Endpoint `/quotes/:id/payment-status` já existe — validar que retorna dados completos de conciliação
- OBSV-01: Logar resultado de cada tentativa de conciliação (sucesso, não pago, erro) de forma estruturada
- OBSV-02: Falhas no Athos não derrubam fluxo principal (já garantido na fase 12 — verificar/documentar)

### Out of Scope
- Reconciliação periódica em background (POLL-01 → v2)
- Dashboard de divergência (POLL-02 → v2)
- Alterar `checkPaymentStatus` ou `verificarPagamentoPorOrcamento`

---

## Estado Atual

### getById (quotes.service.ts ~linha 183)
- Já consulta Athos para preencher `saleExternalId` se ausente
- **Não dispara checagem de pagamento** — apenas resolve o id da venda
- Não toca em `checkPaymentStatus`

### enviarParaCliente (quotes.service.ts ~linha 260)
- Processa envio para o cliente (status → ENVIADO, links de pagamento, etc.)
- **Não dispara checagem de pagamento** antes do envio

### checkPaymentStatus (quotes.service.ts ~linha 231)
- Método completo: consulta Athos, persiste idVenda, atualiza status para APROVADO se `paid=true`
- Endpoint público: `GET /quotes/:id/payment-status`
- **Não é chamado de dentro de getById ou enviarParaCliente**

### OBSV-02
- `verificarPagamentoPorOrcamento` já retorna `{paid: false}` com `logger.warn` em caso de erro — degradação graciosa garantida na fase 12

---

## Decisões de Design

| ID | Decisão | Razão |
|----|---------|-------|
| D-01 | Disparo fire-and-forget em `getById`: `void this.checkPaymentStatus(...).catch(...)` | Não atrasar resposta de detalhe; checagem é background |
| D-02 | Disparo fire-and-forget em `enviarParaCliente`: mesma abordagem | Envio não deve bloquear em caso de falha Athos |
| D-03 | Só disparar para status elegíveis: `["PENDENTE", "ENVIADO"]` | Evitar consultas desnecessárias para orçamentos já resolvidos |
| D-04 | OBSV-01: log estruturado de resultado após cada conciliação com `quoteId`, `paid`, `idVenda`, `valor`, `statusUpdated` | Rastreabilidade sem alterar o fluxo principal |
| D-05 | PCHK-03 já entregue — validar com teste de contrato do endpoint | Endpoint existe; só precisa de cobertura |

---

## Arquivos Alvo

| Arquivo | Mudança |
|---------|---------|
| `apps/backend/src/modules/quotes/quotes.service.ts` | Adicionar disparo fire-and-forget em `getById` e `enviarParaCliente`; adicionar log estruturado em `checkPaymentStatus` |

---

## Referência de Requisitos

| Requisito | Descrição |
|-----------|-----------|
| PCHK-01 | Ao abrir detalhe, disparar checagem |
| PCHK-02 | Ao enviar para cliente, disparar checagem |
| PCHK-03 | Endpoint payment-status retorna dados completos (já existe) |
| OBSV-01 | Log estruturado por tentativa de conciliação |
| OBSV-02 | Falhas Athos não derrubam fluxo principal (já garantido) |
