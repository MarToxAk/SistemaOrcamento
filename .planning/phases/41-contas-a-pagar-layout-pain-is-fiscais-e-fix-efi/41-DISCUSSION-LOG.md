# Phase 41: Discussion Log

**Date:** 2026-09-04

## Scope Clarification

User's original request referred to "contas-pagar" but the codebase scout found no frontend page for it (only a backend-only API, `POST /athos/contas-pagar`, Phase 24). Asked user to clarify. User confirmed they meant the existing route `https://orcamento.bomcustoilhabela.com.br/contas-receber` — i.e., Contas a Receber, not Contas a Pagar. Phase title kept as originally created to avoid renumbering; actual scope documented as Contas a Receber in `41-CONTEXT.md`.

## Areas Discussed

### Area 1: Layout do Dashboard
- **Options presented:** open question on what "melhorar layout" means
- **User's answer:** mais detalhado, mais organizado; poder organizar por nome, vencido, pagos e outros itens importantes
- **Decision:** D-01 (ordenação multi-critério), D-02 (cards de resumo fiscal no topo)

### Area 2: Monitoramento Automático EFI
- **Options presented:** cron job vs manual vs webhook-only
- **User's answer:** "seria interessante ser automático, verifica na documentação"
- **Decision:** D-03/D-04/D-05 — job agendado reaproveitando `verificarPagamentoBoleto()`; research flag aberto para confirmar rate-limits da EFI antes do plano

### Area 3: Painel de Boletos a Receber
- **Options presented:** nova aba vs seção no topo do dashboard
- **User's answer:** "uma nova aba ou uma parte dinâmica no topo"
- **Decision:** D-06 — seção dinâmica no topo (evita fragmentar navegação)

### Area 4: Organização Fiscal
- **Options presented:** user asked Claude for suggestions directly ("o que seria importante para me organizar")
- **Claude's proposal:** aging de inadimplência, NFS-e emitida vs pendente, total a vencer 7/15/30 dias, destaque visual para vencidos antigos
- **User's answer:** "tudo ok" — accepted as-is
- **Decision:** D-07, D-08, D-09, D-10

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 41-Contas a Pagar: Layout, Painéis Fiscais e Fix EFI*
