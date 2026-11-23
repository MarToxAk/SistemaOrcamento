---
phase: quick-261123-ot3-fechamento-chatwoot-webhook-sem-pesquisa
status: complete
---

# Resumo — quick 261123-ot3

## Entregue
- Rota nova `POST /api/integrations/chatwoot/automation/webhook-sem-pesquisa/:token` (mesmo `CHATWOOT_AUTOMATION_WEBHOOK_TOKEN`): fecha como hoje (pendência, etiquetas, atraso humano, resolvido da IA) mas nunca chama o gancho da pesquisa.
- Webhook atual: a pesquisa só sai quando o orçamento da conversa está `APROVADO`, `PRONTO_PARA_ENTREGA`, `ENTREGUE` ou `ENVIADO` (`STATUS_ELEGIVEIS_PESQUISA`) **e** foi aprovado nos últimos 7 dias (`JANELA_APROVACAO_PESQUISA_DIAS`; data via histórico APROVADO, senão `approvedAt`; sem data = sem pesquisa). Sem orçamento ou com outro status (inclusive `CANCELADO`), sai só o resolvido da IA.

## Verificação
- `npx jest src/modules/integrations/chatwoot src/modules/pesquisa`: 22 suites, 551 testes passando; `tsc --noEmit` limpo.
- Testes com Chatwoot/IA/gancho falsos; nada testado contra o Chatwoot real.

## Observações
- `pesquisa.tracer.test.ts` usava conversa sem orçamento; passou a usar pedido ENTREGUE (comportamento novo e intencional).
- Executado em linha pelo orquestrador (sem subagentes), por ser mudança pequena.
