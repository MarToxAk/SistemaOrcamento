---
created: 2026-11-27T19:41:19.856Z
title: Contas a pagar - anexar NF, XML e boleto em um unico botao
area: api
severity: minor
files:
  - apps/backend/src/modules/integrations/athos/athos.controller.ts:247
  - apps/backend/src/modules/integrations/athos/athos-anexo.util.ts
---

## Problem

Pedido do usuario em 2026-11-27 ("guarda na proxima atualizacao"): no contas a pagar, hoje cada arquivo e anexado separado ao lancamento do Athos (`POST /api/athos/contas-pagar/:id/anexo`, um por vez). O usuario quer salvar tudo junto - Nota fiscal (PDF), XML da nota e boleto - em um unico botao/acao.

Restricoes conhecidas (CLAUDE.md global): o endpoint `/anexo` tem 500 intermitente (servidor de arquivos instavel) e precisa de novas tentativas; codigo de barras do boleto vai no campo `observacao`.

## Solution

TBD. Ideia: no frontend do contas a pagar, um seletor multiplo (NF + XML + boleto) e um endpoint/fluxo que anexa os tres em sequencia com retry por arquivo, mostrando o resultado de cada um; ler o codigo de barras do boleto e gravar em `observacao` quando possivel.
