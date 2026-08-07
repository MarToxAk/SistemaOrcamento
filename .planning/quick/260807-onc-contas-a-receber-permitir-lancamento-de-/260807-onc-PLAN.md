---
id: 260807-onc
mode: quick
description: Contas a receber - permitir gerar boleto incluindo titulo de desconto (valor negativo) sem NF
---

# Quick Task 260807-onc — Boleto com título de desconto (valor negativo, sem NF)

## Contexto

Cliente de `/contas-receber/2708` recebeu um título `DESCONTO` lançado manualmente no Athos com valor negativo, para abater o total de outros títulos no mesmo boleto. A regra "boleto requer NF" bloqueava a geração porque o título de desconto não tem (e não deveria ter) nota fiscal própria.

## Fix

Títulos com `valor < 0` (desconto/abatimento) ficam isentos da exigência de NF — tanto no backend (`criarBoleto`) quanto no botão "Gerar Boleto" do frontend. O valor negativo já era corretamente absorvido no ajuste final de `montarItensEfiPorVendaItem` (reduz o último item EFI), então nenhuma mudança foi necessária ali.

## Tasks

### T1. Backend — excluir títulos de valor negativo da checagem de NF

**Files**: `apps/backend/src/modules/cobranca/cobranca.service.ts`

Em `criarBoleto`, montar `idsValorNegativo` a partir de `titulosFiltrados` e excluir esses ids do filtro `semNf`.

### T2. Frontend — não bloquear o botão "Gerar Boleto" por títulos de valor negativo

**Files**: `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`

Em `selecionadosSemNf`, adicionar `&& t.valor >= 0`.
