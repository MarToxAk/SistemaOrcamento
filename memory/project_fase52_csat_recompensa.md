---
name: project-fase52-csat-recompensa
description: Fase 52 (2026-11-22) — Chatwoot CSAT + recompensa + convite Google no fechamento; decisoes do usuario tomadas, proximo passo criar fase com gsd-phase e discutir/planejar
metadata:
  type: project
---

Pedido do usuario (2026-11-22): adicionar CSAT no Chatwoot com recompensa para quem responder, incluir link de avaliacao do Google (tambem com recompensa) no texto, e configurar tudo numa aba nova em `/configuracoes` (hoje so existe `/configuracoes/cobranca`). Fazer via GSD (seria a fase 52) usando tambem os agentes do agency-agents.

Diagnostico ja feito:
- WhatsApp chega no Chatwoot via Evolution API (`evolution_api_v24`) em inbox `Channel::Api`. O CSAT nativo nesses inboxes chega so como TEXTO com link (`https://chat.boxpersonalizado.com.br/survey/responses/<conversation_uuid>`), sem formulario — confirmado nos logs da Evolution (conv 8 da Box, instancia BoxFinanceiroComercial). Formulario visual so no WebWidget (inbox 3 "Site").
- CSAT ligado: Box inbox 1 e 3; desligado no inbox 2 (BoxPersonalizado2) e em todos os inboxes do Chatwoot Bom Custo (v4.19.1; Box e v4.12.1).
- Recompensa por avaliacao no Google viola politica do Google (avaliacao incentivada) e nao da para verificar automaticamente quem avaliou.

Proposta apresentada: o sistema manda uma unica mensagem de fechamento (reaproveitando o atraso humano da fase 51, ver [[project-fase51-chatwoot-etiquetas]]) com link do CSAT + recompensa + convite do Google; desligar CSAT nativo nos inboxes WhatsApp; detectar resposta do CSAT pela API do Chatwoot e enviar a recompensa (cupom); configs em nova aba de `/configuracoes`.

Perguntas em aberto (o usuario ainda NAO respondeu):
1. Recompensa: a) cupom % b) valor R$ c) brinde d) texto livre
2. Cupom unico para todos ou codigo unico por cliente
3. Liberar para qualquer nota ou nota minima
4. Google: a) so convite sem recompensa (recomendado) b) recompensa manual
5. Vale para Box e Bom Custo ou so Box

Agentes agency-agents instalados em `~/.claude/agents/` (283, repo msitarzewski/agency-agents commit 8ae6164). Plano de uso na fase 52: Legal Compliance Checker + Customer Success Manager (discuss/research), Backend Architect + UX Architect (planejamento), Frontend Developer (execucao), Reality Checker + API Tester (verificacao), junto com os agentes gsd-*.

**Why:** retomar a conversa sem refazer o diagnostico.
**How to apply:** ao retomar, reapresentar as 5 perguntas (texto numerado), depois criar a fase 52 com gsd-phase e seguir o fluxo GSD como na fase 51.

## Decisoes do usuario (2026-11-22) — substituem as perguntas em aberto
- Recompensa: desconto em % com teto (1b). Tudo editavel por empresa na nova aba de /configuracoes (percentual, teto, compra minima, validade, texto, ligar/desligar).
- Cupom: codigo unico por cliente, uso unico, validade curta (2a).
- Qualquer nota recebe (3a); nota obrigatoria, comentario opcional.
- Google: so convite sem recompensa, mensagem separada, para todos (4a).
- Vale para Box e Bom Custo na mesma fase (5b) => refatorar ChatwootService para credenciais por empresa (Box e Bom Custo sao dois Chatwoots distintos).
- Resposta ao CSAT: pagina propria no frontend com token assinado por conversa (6b), sem depender do CSAT nativo.
- Opt-out "Responda SAIR" nas mensagens (7: pode ser).
- Teto de custo mensal: R$300,00. Ticket medio: Box R$6,00; Bom Custo R$30,00 (defaults devem ser diferentes por empresa, editaveis).
- Resgate do cupom (Athos/PDV vs balcao) ainda NAO definido: tratar na discussao da fase.

Pareceres dos agentes agency-agents (Legal Compliance Checker, Customer Success Manager, Backend Architect) estao resumidos: recompensa por responder e nao pela nota; um unico link na mensagem (risco de banimento WhatsApp/Evolution); template deterministico em vez de IA para link/cupom; persistir agendamento (setTimeout perde no restart); idempotencia com @@unique(conversationId); reaproveitar chatwoot-automation.service.ts e chatwoot-etiquetas.ts da fase 51.
