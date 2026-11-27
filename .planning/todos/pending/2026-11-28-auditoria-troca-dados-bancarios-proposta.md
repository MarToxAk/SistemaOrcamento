---
created: 2026-11-28T00:00:00.000Z
title: Auditoria na troca dos dados bancarios da proposta
area: api
severity: minor
files:
  - apps/backend/src/modules/propostas/propostas.service.ts
---

## Problem

Revisao do plano 55-19 (WR-03): trocar agencia/conta em Configuracoes > Dados bancarios (propostas) nao guarda
valor anterior, autor nem data em historico, e a tela nao pede confirmacao. Um erro de digitacao ou a senha de
configuracoes vazada poderia desviar pagamentos de orgaos publicos sem rastro.

## Solution

TBD. Tabela de historico (valor anterior mascarado, novo, quando, IP/sessao), confirmacao na tela ao mudar a conta
e aviso interno (e-mail/Chatwoot) quando a conta mudar.
