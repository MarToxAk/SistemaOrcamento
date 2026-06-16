# Phase 34: Frontend de Gestão de Produtos - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar a tela de gestão de produtos na rota `/produtos` do frontend Next.js. O operador pode: buscar/listar produtos com filtros (descrição, código de barras, departamento/grupo/marca e status), criar produto via modal, editar produto via modal, e desativar/reativar produto via botão inline. Todos os dados vêm dos endpoints da Fase 33 (`GET/POST/PATCH /athos/produtos`) via Route Handlers. Fase 100% frontend — sem alteração no backend.

</domain>

<decisions>
## Implementation Decisions

### Localização e Navegação

- **D-01:** Página dedicada na rota `/produtos` — `apps/frontend/src/app/produtos/page.tsx`.
- **D-02 (Claude's discretion):** Como o operador navega até `/produtos` (ex: link no header da página `/`, ou navbar compartilhada) — pesquisador avalia o padrão de navegação existente e encaixa da forma mais consistente.

### Criar e Editar: Modal Único

- **D-03:** Formulário de criação e edição usa **modal único com dois modos** — mesmo componente, título e botões diferenciados (`"Novo Produto"` vs `"Editar Produto"`). Sem rotas separadas `/produtos/novo` ou `/produtos/[id]/editar`.
- **D-04 (Claude's discretion):** Organização visual dos 25 campos dentro do modal (seções colapsáveis, blocos com título, ou tabs Bootstrap) — pesquisador avalia o padrão mais adequado para o volume de campos no contexto BomCusto.

### Campos do Formulário

- **D-05:** Todos os 25 campos do `CreateProdutoDto` aparecem no formulário de criação. Na edição, os mesmos campos (todos opcionais — `UpdateProdutoDto` é `PartialType`). Campos preenchidos pelo sistema (`idproduto`, `datacadastro`, `idusuariocadastro`) não aparecem no formulário.
- **D-06 (Claude's discretion):** Ordem e agrupamento dos campos no modal — pesquisador propõe blocos (ex: Identificação | Classificação | Preços | Complemento) e Claude implementa o que fizer mais sentido para papelaria/gráfica.
- **D-07:** Departamento, grupo e marca: dropdowns `<select>` carregados via `GET /api/athos/produtos/lookup/departamentos`, `/grupos`, `/marcas` ao abrir o modal. Opção vazia ("Selecione...") para campos opcionais.

### Listagem e Status Visual

- **D-08:** Filtro padrão ao carregar `/produtos`: **todos os produtos** (ativos e inativos) — sem filtro automático por status.
- **D-09:** Produtos inativos exibidos com **badge cinza "Inativo"** e **opacidade reduzida** na linha (`opacity-50` ou equivalente Bootstrap). Produto ativo não tem badge de status.
- **D-10:** Botões de filtro de status acima da lista: `Todos | Só ativos | Só inativos` — mesmo padrão de group de botões usado em `/contas-receber`.
- **D-11:** Colunas da tabela de listagem: **Descrição | Código de barras | Departamento | Valor venda 1 | Status** + coluna de **Ações** (botão Editar + botão Ativar/Desativar). 5 colunas de dados.

### Claude's Discretion

- Como integrar o link de navegação para `/produtos` na interface existente.
- Organização visual dos 25 campos dentro do modal.
- Modal implementado como React state overlay — sem Bootstrap Modal JS (padrão estabelecido na fase 29 para modal de boleto).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend — Utilitários e Padrões

- `apps/frontend/src/lib/backend-client.ts` — `backendFetch` com injeção automática de `x-internal-api-key`; toda chamada server-side usa esta função
- `apps/frontend/src/app/api/athos/clientes/route.ts` — padrão canônico de Route Handler GET: forward query string, `backendFetch`, tratar `res.ok`, catch de falha de rede
- `apps/frontend/src/app/contas-receber/page.tsx` — página com filtros por button group + tabela + estados loading/erro; replicar o padrão de UX (D-10 referencia os botões de status)

### Backend — Endpoints disponíveis (Fases 32 e 33)

- `apps/backend/src/modules/integrations/athos/athos-produto.controller.ts` — todos os endpoints: `GET /athos/produtos`, `GET /athos/produtos/:idproduto`, `GET /athos/produtos/lookup/departamentos`, `/grupos`, `/marcas`, `POST /athos/produtos`, `PATCH /athos/produtos/:idproduto`, `PATCH /athos/produtos/:idproduto/status`
- `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts` — 25 campos com validações; define o body do POST e quais campos exibir no formulário
- `apps/backend/src/modules/integrations/athos/dto/update-produto.dto.ts` — `PartialType(CreateProdutoDto)`; todos os campos opcionais no PATCH
- `apps/backend/src/modules/integrations/athos/dto/alterar-status-produto.dto.ts` — body `{ ativo: boolean }` para PATCH status

### Requisitos

- `.planning/REQUIREMENTS.md` — UPROD-01, UPROD-02, UPROD-03, UPROD-04
- `.planning/ROADMAP.md` — Phase 34 success criteria (4 critérios de aceite)

### Constraints do Projeto

- `.planning/PROJECT.md` — seção Constraints e Key Decisions; soft-delete obrigatório (D-09 do projeto)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`backendFetch`** (`apps/frontend/src/lib/backend-client.ts`) — função server-side para chamadas ao backend; usar em todos os novos Route Handlers de produtos
- **Button group de filtro** (`apps/frontend/src/app/contas-receber/page.tsx` L43-51) — padrão de `STATUS_OPTIONS` + `setStatusFiltro` + classe `btn-outline-*`; replicar para filtro de status de produto
- **Tabela com loading/erro** (padrão de `/contas-receber`) — `useState(loading/erro/items)` + `useEffect` + `fetch('/api/...')` com try/catch/finally

### Established Patterns

- **"use client"** + hooks React — todas as páginas interativas usam este padrão; sem RSC com streaming
- **Route Handlers como proxy** — frontend nunca chama o backend diretamente; sempre via `/api/athos/*` Route Handlers que adicionam `x-internal-api-key` server-side
- **Modal como overlay React** — sem Bootstrap Modal JS; componente `<dialog>` ou div com estado `modalOpen: boolean` (padrão da fase 29)
- **Bootstrap para styling** — classes utility Bootstrap já disponíveis em todas as páginas; sem Tailwind, sem Styled Components

### Integration Points

- **Nova página:** `apps/frontend/src/app/produtos/page.tsx`
- **Novos Route Handlers:**
  - `apps/frontend/src/app/api/athos/produtos/route.ts` (GET + POST)
  - `apps/frontend/src/app/api/athos/produtos/[idproduto]/route.ts` (GET + PATCH)
  - `apps/frontend/src/app/api/athos/produtos/[idproduto]/status/route.ts` (PATCH)
  - `apps/frontend/src/app/api/athos/produtos/lookup/departamentos/route.ts` (GET)
  - `apps/frontend/src/app/api/athos/produtos/lookup/grupos/route.ts` (GET)
  - `apps/frontend/src/app/api/athos/produtos/lookup/marcas/route.ts` (GET)

</code_context>

<specifics>
## Specific Ideas

- Botões de filtro de status: padrão `Todos | Só ativos | Só inativos` exatamente como os botões AVC/VEN/REC/CAN de `/contas-receber`
- Badge de inativo: classe Bootstrap `badge bg-secondary` ou `bg-dark` com texto "Inativo"
- Linha inativa na tabela: wrapper `<tr className={!produto.statusproduto ? "opacity-50" : ""}>`
- Coluna de ações: dois botões por linha — "Editar" (abre modal em modo editar) e "Desativar"/"Reativar" (toggle direto via PATCH status)

</specifics>

<deferred>
## Deferred Ideas

- Paginação com navegação de páginas (next/prev buttons) → pesquisador avalia se `{ total, page, take }` já é suficiente para implementar; a lista retorna até 50 itens por vez
- Busca full-text com trigram/pg_trgm → complexidade desnecessária agora (backlog de fase 32)
- Cache de lookups (departamento/grupo/marca mudam raramente) → otimização futura
- Importação em lote de produtos → fora do escopo (REQUIREMENTS.md Out of Scope)
- Gestão de grade/composição/série → v2 requirements (PADV-01..03)

</deferred>

---

*Phase: 34-frontend-de-gest-o-de-produtos*
*Context gathered: 2026-06-16*
