---
phase: quick-261123-ot3-fechamento-chatwoot-webhook-sem-pesquisa
status: complete
---

# Resumo — quick 261123-ot3

## Entregue
- Rota nova `POST /api/integrations/chatwoot/automation/webhook-sem-pesquisa/:token` (mesmo `CHATWOOT_AUTOMATION_WEBHOOK_TOKEN`): fecha como hoje (pendência, etiquetas, atraso humano, resolvido da IA) mas nunca chama o gancho da pesquisa.
- Webhook atual: a pesquisa só sai quando o orçamento da conversa está `ENTREGUE` ou `PRONTO_PARA_ENTREGA` (`STATUS_ELEGIVEIS_PESQUISA`) **e** chegou a esse status nos últimos 7 dias (`JANELA_PESQUISA_DIAS`; data = histórico de status; sem registro = sem pesquisa). Outro status (inclusive `APROVADO`, `ENVIADO`, `CANCELADO`) ou sem orçamento: só o resolvido da IA.

## Verificação
- `npx jest src/modules/integrations/chatwoot src/modules/pesquisa`: 22 suites, 550 testes passando; `tsc --noEmit` limpo.
- Testes com Chatwoot/IA/gancho falsos; nada testado contra o Chatwoot real.

## Observações
- `pesquisa.tracer.test.ts` usava conversa sem orçamento; passou a usar pedido ENTREGUE (comportamento novo e intencional).
- Executado em linha pelo orquestrador (sem subagentes), por ser mudança pequena.
