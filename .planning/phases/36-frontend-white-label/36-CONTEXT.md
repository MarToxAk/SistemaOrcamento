# Phase 36: Frontend White-Label - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Dehardcode os 8 arquivos do frontend (layout.tsx + 5 páginas internas + 2 páginas públicas) para exibir nome, logo, CNPJ, endereço, email e cor da empresa a partir de variáveis de ambiente `NEXT_PUBLIC_EMPRESA_*`. Nenhuma referência a "BomCusto" permanece hardcoded no frontend após esta fase. 100% frontend — sem alterações no backend.

</domain>

<decisions>
## Implementation Decisions

### Estratégia de Vars — Acesso no Frontend

- **D-01:** Usar `NEXT_PUBLIC_EMPRESA_*` — baked at build, segue o padrão já existente de `NEXT_PUBLIC_API_URL`. Todas as 7 páginas-alvo são Client Components (`"use client"`); `NEXT_PUBLIC_*` funciona em qualquer componente sem rewiring.
- **D-02:** Vars definidas em `apps/frontend/.env.local` (runtime local); documentadas em `apps/frontend/.env.example` (novo arquivo a criar) com valores BomCusto como defaults — espelha o estilo do `apps/backend/.env.example`.
- **D-03:** Módulo central `apps/frontend/src/lib/empresa.ts` exporta as constantes lidas de `process.env.NEXT_PUBLIC_*`. As 8 páginas importam do módulo; um único ponto de alteração caso nome de var mude.

### CSS Theming — Cor Primária (FRONT-04)

- **D-04:** Injetar `--cor-primaria` como CSS custom property no `<head>` via `<style>` inline no `layout.tsx` (Server Component lê `process.env` diretamente). Substituir **todos** os `#0d6efd` no `globals.css` por `var(--cor-primaria)` — theming real que atende o success criteria 3 ("todos os elementos de branding assumem a nova cor").
- **D-05:** Nome da custom property: `--cor-primaria` — explícito, consistente com `EMPRESA_COR_PRIMARIA`; não colide com `--bs-primary` do Bootstrap.
- **D-06:** Fallback da cor: `NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd"` definido no módulo `empresa.ts` — mesma decisão da fase 35 (D-02: fallback `#0d6efd` no serviço TypeScript). Template sempre recebe um valor concreto.

### Metadata Dinâmico — Título da Aba (FRONT-01)

- **D-07:** Substituir `export const metadata: Metadata = { title: "BomCusto Orcamento" }` por `export async function generateMetadata(): Promise<Metadata>` que retorna `title: process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "Orcamento"` — padrão Next.js App Router para title dinâmico em Server Component.

### Logo — Exibição e Fallback

- **D-08:** Logo em todas as páginas usa `NEXT_PUBLIC_EMPRESA_LOGO_URL` via módulo `empresa.ts`. Fallback para `/media/logo-primary.png` quando var não definida — zero regressão na BomCusto; novo deploy sem logo configurado vê o logo padrão do sistema em vez de header vazio.
- **D-09:** Padrão de renderização: `<img src={EMPRESA_LOGO_URL} alt={EMPRESA_NOME} ...>` — sem `{{#if}}` como no PDF; no frontend um logo fallback é melhor UX que ausência de logo.

### Email Hardcoded

- **D-10:** Parameterizar `orcamento@bomcustoilhabela.com.br` (presente em 3 páginas internas: `orcamento/page.tsx`, `orcamento/novo/page.tsx`, `orcamento/[id]/page.tsx`) via `NEXT_PUBLIC_EMPRESA_EMAIL`. Incluso no módulo `empresa.ts` e em ambos `.env.example` (frontend e backend). Motivação: ROADMAP goal é "nenhuma referência a BomCusto permanece hardcoded"; email contém "bomcusto" diretamente.

### Claude's Discretion

- Ordem das exports no módulo `empresa.ts` (sugestão: `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_EMAIL`, `EMPRESA_LOGO_URL`, `EMPRESA_COR_PRIMARIA`)
- Exatamente quais classes/seletores no `globals.css` contêm `#0d6efd` a substituir (pesquisador conta e lista via grep)
- `alt` text do `<img>` logo — usar `EMPRESA_NOME` ou string fixa "Logo"

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da Fase 36

- `.planning/REQUIREMENTS.md` — FRONT-01..04 (4 requisitos de frontend white-label); seção de traceability mapeia FRONT-* → Phase 36
- `.planning/ROADMAP.md` — Phase 36 goal + 4 success criteria (especialmente SC-3: "todos os elementos de branding assumem a nova cor")

### Arquivos-alvo do Frontend (8 arquivos a modificar)

- `apps/frontend/src/app/layout.tsx` — FRONT-01 (metadata.title) + FRONT-04 (CSS custom property `--cor-primaria`)
- `apps/frontend/src/app/orcamento/page.tsx` — FRONT-02: logo, nome, CNPJ, endereço, email
- `apps/frontend/src/app/orcamento/novo/page.tsx` — FRONT-02: logo, nome, CNPJ, endereço, email
- `apps/frontend/src/app/orcamento/[id]/page.tsx` — FRONT-02: logo, email
- `apps/frontend/src/app/contas-receber/page.tsx` — FRONT-02: logo
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — FRONT-02: logo
- `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` — FRONT-03: logo, nome
- `apps/frontend/src/app/orcamento/[id]/status/page.tsx` — FRONT-03: logo, nome

### Arquivo CSS a modificar

- `apps/frontend/src/app/globals.css` — substituir todos os `#0d6efd` por `var(--cor-primaria)` (D-04)

### Novos arquivos a criar

- `apps/frontend/src/lib/empresa.ts` — módulo central de constantes (D-03; novo arquivo)
- `apps/frontend/.env.example` — documentação das vars `NEXT_PUBLIC_EMPRESA_*` (D-02; novo arquivo)

### Contexto da Fase Anterior

- `.planning/phases/35-backend-white-label/35-CONTEXT.md` — decisões D-01..D-12 do backend; vars `EMPRESA_*` já documentadas no `apps/backend/.env.example`; comportamento de logo no PDF (D-08: omite `<img>` se ausente — **comportamento diferente** do frontend que usa fallback)

### Padrão de Env Var do Frontend

- `apps/frontend/.env.local` — contém `NEXT_PUBLIC_API_URL`; confirmar formato e convenção antes de criar `.env.example`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`NEXT_PUBLIC_API_URL`** (`apps/frontend/.env.local`) — padrão já estabelecido de var baked at build no frontend; `NEXT_PUBLIC_EMPRESA_*` segue exatamente o mesmo mecanismo
- **`/media/logo-primary.png`** — arquivo estático existente; usado como fallback de logo (D-08); não remover

### Established Patterns

- **Todas as 7 páginas são Client Components** — `"use client"` no topo de cada arquivo; não podem ler `process.env` em runtime exceto vars `NEXT_PUBLIC_*`
- **`layout.tsx` é Server Component** — sem `"use client"`; pode ler `process.env` diretamente; local ideal para injetar CSS var e generateMetadata
- **Bootstrap via CDN** — projeto usa classes Bootstrap (`btn-primary`, `bg-primary`); `globals.css` sobrescreve cores com `#0d6efd` hardcoded; substituição por `var(--cor-primaria)` afeta apenas os overrides do `globals.css`, não o Bootstrap em si

### Integration Points

- **`layout.tsx`**: ponto de entrada único para CSS global e metadata — toda mudança de theming e título entra aqui
- **`globals.css`**: 5 ocorrências de `#0d6efd` a substituir; todos em seletores de status, bordas e ações de branding
- **Header das páginas internas** (`orcamento/page`, `orcamento/novo`, `orcamento/[id]`): bloco com logo + nome + CNPJ + endereço + email todos hardcoded; substituição em 3 locais
- **Header das páginas públicas** (`approve`, `status`): apenas logo + nome hardcoded; 2 locais

</code_context>

<specifics>
## Specific Ideas

- O módulo `empresa.ts` deve exportar constantes simples (não hooks, não context): `export const EMPRESA_NOME = process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "Sistema de Orçamento";`
- `generateMetadata()` em `layout.tsx` lê `process.env.NEXT_PUBLIC_EMPRESA_NOME` diretamente (não via módulo) — layout.tsx é Server Component e a leitura direta é mais explícita para o metadata export
- Injeção do CSS var no layout:
  ```tsx
  const cor = process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd";
  // no JSX:
  <head>
    <style>{`:root { --cor-primaria: ${cor}; }`}</style>
  </head>
  ```
- `apps/backend/.env.example` deve ganhar também `EMPRESA_EMAIL` (complementar ao que foi feito na fase 35)

</specifics>

<deferred>
## Deferred Ideas

- Painel admin no sistema para editar configurações sem acessar o servidor → WL-01 (backlog v2 requirements)
- Upload de logo pelo sistema (MinIO) sem editar `.env` → WL-02 (backlog v2 requirements)
- Templates PDF gerenciados pelo painel admin → WL-03 (backlog v2 requirements)
- Compartilhar vars `EMPRESA_*` via Docker Compose `${VAR}` (single source of truth no stack.env) → melhoria futura de DevOps; não necessária agora pois o modelo é deploy separado por empresa

</deferred>

---

*Phase: 36-frontend-white-label*
*Context gathered: 2026-06-19*
