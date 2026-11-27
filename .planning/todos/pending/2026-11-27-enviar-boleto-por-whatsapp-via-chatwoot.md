---
created: 2026-11-27T19:41:19.856Z
title: Enviar boleto por WhatsApp via Chatwoot (telefone ou id da conversa)
area: api
severity: minor
files:
  - apps/backend/src/modules/integrations/chatwoot/
  - apps/backend/src/modules/cobranca/
---

## Problem

Pedido do usuario em 2026-11-27 ("guarda na proxima atualizacao"): enviar o boleto ao cliente pelo WhatsApp usando o Chatwoot, atrelando o envio pelo numero de telefone do cliente ou pelo id da conversa (chat) do Chatwoot. Hoje o boleto sai por e-mail (cobranca, Fase 42).

## Solution

TBD. Reaproveitar o `ChatwootService.sendAttachment` (ja usado para PDF de orcamento e comprovante PIX) para mandar o PDF do boleto + linha digitavel/link. Resolver a conversa por: id da conversa informado, ou busca/criacao de contato pelo telefone (sync de contatos ja existe). Definir onde fica o botao (tela de contas a receber/boleto) e o texto da mensagem.
