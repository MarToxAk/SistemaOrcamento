---
phase: 30-emissao-nfse-titulos
plan: "03"
subsystem: frontend
tags: [nfse, modal, route-handler, contas-receber, athos]
dependency_graph:
  requires:
    - 30-01 (GET /athos/venda/:idvenda/tipo-produto, NfseService.emitirParaContaReceber)
    - 30-02 (POST /cobranca/nfse)
  provides:
    - Route Handler POST /api/cobranca/nfse
    - Route Handler GET /api/athos/venda/[idvenda]/tipo-produto
    - Modal NFS-e 4-estados em /contas-receber/[idcliente]
  affects:
    - apps/frontend/src/app/api/cobranca/nfse/route.ts
    - apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
    - apps/backend/src/modules/integrations/athos/athos.service.ts
tech_stack:
  added: []
  patterns:
    - Route Handler Next.js com backendFetch (padrão boleto)
    - Modal 4-estados com React state (confirm/loading/success/error)
    - Promise.all para busca paralela de tipo-produto por venda
    - readOnly input para valor calculado
key_files:
  created:
    - apps/frontend/src/app/api/cobranca/nfse/route.ts
    - apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts
  modified:
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
    - apps/backend/src/modules/integrations/athos/athos.service.ts
decisions:
  - "Campo valor da NFS-e somente-leitura — valor calculado não editável para evitar inconsistências"
  - "Promise.all paralelo para verificarTipoProdutoVenda de múltiplas vendas ao abrir modal"
  - "Títulos 100% físicos excluídos de idcontasReceber e da soma — valor zero bloqueia botão confirmar"
  - "itensServico adicionado ao retorno de verificarTipoProdutoVenda para pré-preencher descrição"
  - "Seletor de tipo de serviço (4 opções fixas) idêntico ao modal de orçamento"
  - "vendavalorfinalitem (não valortotal inexistente) para valor dos itens de serviço"
metrics:
  duration: "~2h (incluindo 8 fixes iterativos em UAT)"
  completed: "2026-05-23"
  tasks: 2
  files: 4
---

# Phase 30 Plan 03: Modal NFS-e + Route Handlers Summary

**One-liner:** Route Handlers POST /api/cobranca/nfse e GET /api/athos/venda/[idvenda]/tipo-produto criados; Modal NFS-e 4-estados implementado com detecção de produtos físicos, pré-preenchimento de descrição, seletor de tipo de serviço e valor somente-leitura.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Route Handlers POST /api/cobranca/nfse e GET tipo-produto | ced9639 | route.ts (×2) |
| 2 | Modal NFS-e 4-estados + refetch + estilos CSS | 08f99f0 | page.tsx |
| fixes | 8 correções iterativas via UAT | bcb4c5b→452177f | page.tsx, athos.service.ts |

## Decisions Made

1. **Valor somente-leitura** — Durante UAT o operador reportou que campo editável podia gerar emissão com valor errado. Campo alterado para `readOnly` com `form-control-plaintext` — valor calculado automaticamente a partir dos títulos selecionados.

2. **Promise.all para múltiplas vendas** — `abreNfseModal()` busca tipo-produto de todas as vendas únicas dos títulos selecionados em paralelo, não apenas a primeira venda.

3. **Exclusão de 100% físicos** — Títulos cujas vendas têm `valorServicos=0` são excluídos de `idcontasReceber` e da soma. O botão "Confirmar Emissão" fica desabilitado quando o valor resultante é zero.

4. **Descrição automática** — `verificarTipoProdutoVenda()` retorna `itensServico[]` com `descricaoproduto`, `quantidadeitem`, `vendavalorfinalitem`. O modal pré-preenche o campo Descrição no formato `"Item (2x) - R$xx,xx; ..."`.

5. **Seletor de tipo de serviço** — 4 opções fixas (`24.01`, `24.01-02`, `13.05`, `14.08`) idênticas ao modal de orçamento. `servicoCodigo` enviado no POST.

6. **vendavalorfinalitem** — Coluna real do Athos para valor do item; `valortotal` não existe na tabela `venda_item`.

## Deviations from Plan

O plano original especificava valor editável (NFR-02/D-03). Durante UAT o operador decidiu bloquear a edição para evitar inconsistências. Campo alterado para `readOnly` — sem impacto no fluxo de emissão pois o backend valida o valor via `@Min(0.01)`.

## Known Stubs

Nenhum.

## Threat Flags

- **T-30-09:** `idclienteAthos` (número > 0), `idcontasReceber` (array não-vazio), `valor` (> 0) validados no Route Handler — 400 se inválido. ✓
- **T-30-10:** Guard `Number.isFinite(id) && id > 0` no Route Handler tipo-produto. ✓
- **T-30-11:** `backendFetch` injeta `x-internal-api-key` automaticamente — chave não exposta ao browser. ✓
- **T-30-SC:** Nenhum pacote novo instalado. ✓

## Self-Check

- [x] `ls apps/frontend/src/app/api/cobranca/nfse/route.ts` — existe
- [x] `ls "apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts"` — existe
- [x] `npx tsc --noEmit` — 0 erros TypeScript (frontend + backend)
- [x] `grep -c "nfseModalState" page.tsx` — ≥10 ocorrências
- [x] `grep "abreNfseModal" page.tsx` — definição + onClick
- [x] `grep "TODO: Phase 30" page.tsx` — 0 resultados (TODO removido)
- [x] `grep "nfse-modal-backdrop" page.tsx` — CSS presente com z-index:1051
- [x] Campo valor com `readOnly` — confirmado em UAT
- [x] Seletor tipo-produto com 4 opções — confirmado em UAT
- [x] Aviso produto físico — confirmado em UAT
- [x] Bloqueio 100% físico — confirmado em UAT
- [x] Checkpoint humano aprovado via UAT (testes 1, 3, 4, 5 pass)

## Self-Check: PASSED
