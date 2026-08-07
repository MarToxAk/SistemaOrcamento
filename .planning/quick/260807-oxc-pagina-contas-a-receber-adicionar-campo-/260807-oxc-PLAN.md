---
id: 260807-oxc
mode: quick
description: Pagina contas a receber - campo de busca por nome ou id, exibindo id junto ao nome
---

# Quick Task 260807-oxc — Busca na listagem de Contas a Receber

## Objetivo

Na página `/contas-receber` (dashboard de clientes devedores), adicionar um campo de busca que filtra por nome ou ID do cliente, e exibir o ID junto ao nome nos cards para facilitar a localização.

## Tasks

### T1. Campo de busca + filtro client-side

**Files**: `apps/frontend/src/app/contas-receber/page.tsx`

- Estado `busca` (string).
- Input de texto no header, ao lado dos filtros de status.
- `clientesFiltrados` = `clientes` filtrado por `nome_cliente` (substring, case-insensitive) OU `idcliente` (substring da string do id). Filtro client-side sobre a lista já carregada — sem nova chamada à API.
- Estado vazio dedicado quando a busca não encontra nada.

### T2. Exibir ID junto ao nome no card

**Files**: `apps/frontend/src/app/contas-receber/page.tsx`

Badge `#{idcliente}` antes do nome no header do card.
