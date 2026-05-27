---
phase: 31-hist-rico-nfs-e-consulta-nf-athos
plan: "03"
subsystem: frontend/contas-receber
tags: [nfse, athos, nfe, frontend, nextjs, lazy-load, intersection-observer]
dependency_graph:
  requires: ["31-01", "31-02"]
  provides:
    - "GET /api/cobranca/nfse/cliente/[idcliente]"
    - "GET /api/athos/clientes/[idcliente]/notas-fiscais"
    - "Seção NFS-e Emitidas colapsável + lazy na page.tsx"
    - "Seção Notas Fiscais Athos colapsável + lazy + busca na page.tsx"
  affects:
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
tech_stack:
  added: []
  patterns:
    - IntersectionObserver nativo do browser para lazy load
    - Route Handler Next.js 15 com params Promise + await
    - backendFetch proxy com x-internal-api-key (NFS-e) e x-api-token (Athos)
    - Seção colapsável via estado React + botão clicável
    - encodeURIComponent para query param seguro
key_files:
  created:
    - apps/frontend/src/app/api/cobranca/nfse/cliente/[idcliente]/route.ts
    - apps/frontend/src/app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts
  modified:
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
decisions:
  - "carregarNfseEmitidas e carregarNotasFiscaisAthos com finally setCarregada=true garantem que o estado vazio seja exibido mesmo em caso de erro de rede"
  - "resultadoBuscaNf inicializado como null (nao array vazio) para distinguir busca nunca feita de busca sem resultado"
  - "Botao Limpar expoe limpeza do resultado + campo de busca em um unico clique"
  - "Secao NFAT exibe spinner de busca dentro do botao Buscar (substituindo texto) para feedback imediato"
metrics:
  duration: "~6 min"
  completed: "2026-05-27T17:18:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 31 Plan 03: Frontend Histórico NFS-e + Consulta NF Athos Summary

**One-liner:** Dois Route Handlers proxy (NFS-e cliente + notas-fiscais Athos com filtro número) e duas seções colapsáveis com lazy load via IntersectionObserver nativo adicionadas à página `/contas-receber/[idcliente]`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Route Handlers proxy NFS-e histórico + notas-fiscais Athos | 26215ac | route.ts (x2 criados) |
| 2 | Seção NFS-e Emitidas colapsável com lazy load e cancelamento | 5eae298 | page.tsx |
| 3 | Seção Notas Fiscais Athos colapsável com lazy load e busca | 7b556a6 | page.tsx |

## What Was Built

### Route Handler: GET /api/cobranca/nfse/cliente/[idcliente]

Proxy para `GET /cobranca/nfse/cliente/:id` no backend. Usa `backendFetch` (que injeta `x-internal-api-key` automaticamente via `internalHeaders`). Validação `Number.isFinite(id) && id > 0` → 400. Padrão idêntico ao de `contas-receber/cliente/[idcliente]/route.ts`.

### Route Handler: GET /api/athos/clientes/[idcliente]/notas-fiscais

Proxy para `GET /athos/clientes/:id/notas-fiscais` no backend Athos. Injeta `x-api-token` via `process.env.INTERNAL_API_KEY` (padrão Athos). Encaminha `?numero=X` via `encodeURIComponent` quando presente e não vazio. Validação de `idcliente` com retorno 400.

### page.tsx — Seção NFS-e Emitidas

- **Tipo:** `NfseEmitidaCliente` (id, numeroNfse, numeroRps, valorServico, linkNfse, dataEmissao, titulos[])
- **Estados:** `nfseAberta` (default false — D-03), `nfseCarregada`, `nfseEmitidas[]`, `loadingNfse`, `nfseRef`
- **Lazy load:** `IntersectionObserver` observa `nfseRef.current`, dispara `carregarNfseEmitidas()` ao entrar na viewport quando `!nfseCarregada` (D-02)
- **Tabela:** Data emissão | Nº NFS-e | Nº RPS | Valor | Títulos vinculados (badges) | Ações (D-05)
- **Download condicional:** botão `bi-file-earmark-arrow-down` apenas quando `linkNfse !== null` (D-05)
- **Cancelamento:** título tooltip `"Remove do sistema. O cancelamento na prefeitura pode não ser suportado."` (D-07a) + `confirm()` com mesmo aviso (D-07b); DELETE `/api/cobranca/nfse/:id`; remove do estado + `setRefetchKey` (D-06)
- **Estado vazio:** `"Nenhuma NFS-e emitida para este cliente"` (D-04)

### page.tsx — Seção Notas Fiscais Athos

- **Tipo:** `NotaFiscalAthos` (numero, dataemissao, valor, tipo)
- **Estados:** `nfatAberta` (default false), `nfatCarregada`, `notasFiscaisAthos[]`, `loadingNfat`, `buscaNumeroNf`, `resultadoBuscaNf` (null = nunca buscado), `buscandoNf`, `nfatRef`
- **Lazy load:** `IntersectionObserver` observa `nfatRef.current`, dispara `carregarNotasFiscaisAthos()` (D-02)
- **Busca manual:** campo de texto + botão "Buscar" / Enter (D-13); `buscarNotaPorNumero()` chama `?numero=encodeURIComponent(trim)` (D-14/T-31-09)
- **Resultado acima da lista:** bloco `alert alert-info` com tabela de resultados renderizado **antes** da lista de 50 (D-16)
- **Lista geral persiste:** sempre visível quando `nfatCarregada`, independente de busca ativa (D-15)
- **Botão Limpar:** zera `resultadoBuscaNf` e `buscaNumeroNf` em um clique
- **Colunas:** Nº da nota | Data emissão | Valor | Tipo (D-09)
- **Estados vazios:** `"Nenhuma nota fiscal encontrada no Athos"` (lista geral) e `"Nenhuma nota encontrada com este número."` (busca) (D-04)

## Verification Results

- `npx tsc --noEmit` do frontend: sem erros após cada task
- `npx next lint`: sem erros
- grep `backendFetch` em route.ts NFS-e: linha 16 ✓
- grep `x-api-token` em route.ts Athos: linha 19 ✓
- grep `numero` em route.ts Athos: linhas 15/23/24 ✓
- grep `NFS-e Emitidas`: linha 847 ✓
- grep `IntersectionObserver`: linhas 289 e 351 ✓
- grep `nfseRef`: linhas 121/294/850 ✓
- grep `Nenhuma NFS-e emitida para este cliente`: linha 858 ✓
- grep `cancelamento na prefeitura pode`: linhas 905/909 ✓
- grep `Notas Fiscais Athos`: linhas 1005/1014 ✓
- grep `nfatRef`: linhas 138/355/1017 ✓
- grep `buscarNotaPorNumero`: linhas 331/1027/1032 ✓
- grep `Nenhuma nota encontrada com este número`: linha 1055 ✓
- grep `Nenhuma nota fiscal encontrada no Athos`: linha 1091 ✓

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — plano executado exatamente conforme especificado.

### Adições além do plano (Rule 2)

**1. [Rule 2 - Missing functionality] Botão "Limpar" para resetar busca NFAT**
- **Found during:** Task 3
- **Issue:** Sem botão de limpar, o operador não teria como desfazer o resultado da busca e retornar ao estado neutro
- **Fix:** Botão "Limpar" condicional (visível quando `resultadoBuscaNf !== null`) que zera `resultadoBuscaNf` e `buscaNumeroNf` em um clique
- **Files modified:** page.tsx
- **Commit:** 7b556a6

## Known Stubs

Nenhum — todos os dados são lidos de APIs reais (banco próprio via Prisma para NFS-e, banco Athos via SQL para NF-e).

## Threat Flags

Nenhum — todos os novos endpoints estão dentro do perímetro do `<threat_model>` do plano:
- T-31-08 mitigado: tokens injetados server-side nos Route Handlers (process.env / internalHeaders); nunca expostos ao browser
- T-31-09 mitigado: `encodeURIComponent` no frontend + query parametrizada ($2) no backend
- T-31-10 mitigado: `Number.isFinite + id > 0` nos dois Route Handlers com retorno 400
- T-31-SC: nenhuma dependência nova instalada (IntersectionObserver é API nativa do browser)

## Self-Check

- [x] `apps/frontend/src/app/api/cobranca/nfse/cliente/[idcliente]/route.ts` criado — FOUND
- [x] `apps/frontend/src/app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts` criado — FOUND
- [x] `page.tsx` modificado com seções NFS-e e NFAT — FOUND
- [x] Commit 26215ac (Task 1) — FOUND
- [x] Commit 5eae298 (Task 2) — FOUND
- [x] Commit 7b556a6 (Task 3) — FOUND

## Self-Check: PASSED
