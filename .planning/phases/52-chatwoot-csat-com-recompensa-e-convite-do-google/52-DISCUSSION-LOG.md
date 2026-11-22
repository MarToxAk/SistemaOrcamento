# Phase 52: Chatwoot CSAT com recompensa e convite do Google - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 52-chatwoot-csat-com-recompensa-e-convite-do-google
**Areas discussed:** Decisoes previas, Pesquisa e dados, Relatorio nativo Chatwoot, Cupom e resgate, Mensagens, Configuracoes e painel

Pareceres consultados antes das perguntas: Legal Compliance Checker, Customer Success Manager, Backend Architect (agency-agents).

---

## Decisoes previas (antes do smart discuss)

| Pergunta | Escolha |
|----------|---------|
| Tipo de recompensa | % com teto (1b) |
| Cupom | codigo unico por cliente (2a) |
| Quem recebe | qualquer nota (3a) |
| Google | so convite, sem recompensa (4a) |
| Empresas | Box e Bom Custo, cada um edita a sua config (5b) |
| Forma da pesquisa | pagina propria (6b) |
| Opt-out SAIR | sim |
| Teto mensal | R$300 |
| Ticket medio | Box R$6, Bom Custo R$30, editavel |

## Pesquisa e dados

| Option | Description | Selected |
|--------|-------------|----------|
| /pesquisa/[token] | curta, PT, padrao /cobranca | ✓ |
| /avaliar/[token] | alternativa | |

| Option | Description | Selected |
|--------|-------------|----------|
| Token aleatorio no banco | revogavel, padrao cobranca | ✓ |
| HMAC assinado sem banco | nao revogavel | |

| Option | Description | Selected |
|--------|-------------|----------|
| Estrelas 1-5 | simples | ✓ (A/B) |
| Carinhas 1-5 | visual | ✓ (A/B) |
| NPS 0-10 | incompativel com rating 1-5 do Chatwoot | |

**User's choice:** 1 ok, 2 ok, "deixa os dois para fazer teste de a e b".

## Relatorio nativo do Chatwoot

**User's request:** fazer aparecer em /reports/csat "meio que nativo do Chatwoot".
**Notes:** Investigado no codigo do Chatwoot (containers chatwoot-box-rails-1 v4.12.1 e chatwoot-rails-1 v4.19.1; arquivos de CSAT com md5 identicos) e da Evolution (ignora mensagens privadas e message_updated). Viavel: mensagem privada input_csat + PUT publico csat_survey. Validar em homologacao.

| Option | Description | Selected |
|--------|-------------|----------|
| a) Nota privada | nota, comentario, cupom | ✓ |
| b) Atributos do contato | ultima nota, cupom ativo | ✓ |
| c) Etiquetas avaliou/csat-baixo | filtro | ✓ |

## Cupom e resgate

| Option | Description | Selected |
|--------|-------------|----------|
| Tela Cupons no sistema | valida e da baixa; desconto manual no Athos | ✓ |
| So codigo no WhatsApp | sem controle | |
| Integrar Athos/PDV | escrita em producao | |

**Notes:** "pode ser, no Athos nao tem sistema de cupom".

| Option | Description | Selected |
|--------|-------------|----------|
| Teto pelo pior caso | soma dos tetos emitidos | |
| Teto pelo desconto real | cupons usados | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Pesquisa continua, cupom suspenso | | ✓ |
| Pausa tudo | | |

## Mensagens

| Option | Description | Selected |
|--------|-------------|----------|
| IA + bloco fixo editavel | link nunca se perde | ✓ |
| Template 100% editavel, IA desligada | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Botao na pagina + WhatsApp com cupom e convite | | ✓ |
| So na pagina | | |
| So WhatsApp | | |

## Configuracoes e painel

| Option | Description | Selected |
|--------|-------------|----------|
| So configuracoes | | |
| Configuracoes + painel | | ✓ |

**Notes:** usuario quer que as respostas aparecam tambem no Chatwoot (resolvido acima).

## Decided autonomously

[auto] [Arquitetura] — Q: "Como suportar Box e Bom Custo?" → Selected: "Uma instancia por empresa, sem refatoracao multi-Chatwoot" (reversible technical — decided autonomously: segue deploy atual)
[auto] [Pesquisa] — Q: "Como servir a pagina publica?" → Selected: "Proxy Next.js -> backend" (reversible technical — decided autonomously: padrao existente)
[auto] [Pesquisa] — Q: "Validade do link?" → Selected: "7 dias, editavel" (reversible technical — decided autonomously: config)
[auto] [Cupom] — Q: "Formato do codigo?" → Selected: "PREFIXO-6 chars sem ambiguos" (reversible technical — decided autonomously: geracao de texto)
[auto] [Cupom] — Q: "Limite por cliente?" → Selected: "1 a cada 90 dias, editavel" (reversible technical — decided autonomously: config)
[auto] [Fluxo] — Q: "Quando enviar a recompensa?" → Selected: "Na resposta, com status e retry" (reversible technical — decided autonomously: logica interna)
[auto] [Fluxo] — Q: "Idempotencia?" → Selected: "Unique por conversa/pesquisa" (reversible technical — decided autonomously: restricao local)
[auto] [Fluxo] — Q: "Opt-out?" → Selected: "SAIR -> lista de supressao" (reversible technical — decided autonomously: lista simples)
[auto] [Chatwoot] — Q: "CSAT nativo?" → Selected: "Desligado nos inboxes WhatsApp" (reversible technical — decided autonomously: toggle no painel)

## Deferred Ideas

- Integracao do cupom com Athos/PDV.
- Migracao para WhatsApp Cloud API oficial.
