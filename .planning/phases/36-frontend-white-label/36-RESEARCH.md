# Phase 36: Frontend White-Label — Research

**Researched:** 2026-06-22
**Domain:** Next.js App Router — dehardcode de branding em Client + Server Components via env vars
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Usar `NEXT_PUBLIC_EMPRESA_*` — baked at build, segue o padrão já existente de `NEXT_PUBLIC_API_URL`. Todas as 7 páginas-alvo são Client Components (`"use client"`); `NEXT_PUBLIC_*` funciona em qualquer componente sem rewiring.
- **D-02:** Vars definidas em `apps/frontend/.env.local` (runtime local); documentadas em `apps/frontend/.env.example` (novo arquivo a criar) com valores BomCusto como defaults — espelha o estilo do `apps/backend/.env.example`.
- **D-03:** Módulo central `apps/frontend/src/lib/empresa.ts` exporta as constantes lidas de `process.env.NEXT_PUBLIC_*`. As 8 páginas importam do módulo; um único ponto de alteração caso nome de var mude.
- **D-04:** Injetar `--cor-primaria` como CSS custom property no `<head>` via `<style>` inline no `layout.tsx` (Server Component lê `process.env` diretamente). Substituir **todos** os `#0d6efd` no `globals.css` por `var(--cor-primaria)`.
- **D-05:** Nome da custom property: `--cor-primaria` — não colide com `--bs-primary` do Bootstrap.
- **D-06:** Fallback da cor: `NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd"` definido no módulo `empresa.ts`.
- **D-07:** Substituir `export const metadata: Metadata = { title: "BomCusto Orcamento" }` por `export async function generateMetadata(): Promise<Metadata>` que retorna `title: process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "Orcamento"`.
- **D-08:** Logo usa `NEXT_PUBLIC_EMPRESA_LOGO_URL` via módulo `empresa.ts`. Fallback para `/media/logo-primary.png` quando var não definida.
- **D-09:** Padrão de renderização: `<img src={EMPRESA_LOGO_URL} alt={EMPRESA_NOME} ...>` — sem conditional rendering; fallback é melhor UX que header vazio.
- **D-10:** Parameterizar `orcamento@bomcustoilhabela.com.br` via `NEXT_PUBLIC_EMPRESA_EMAIL`. Incluso no módulo `empresa.ts` e em ambos `.env.example`.

### Claude's Discretion

- Ordem das exports no módulo `empresa.ts` (resolvida pelo UI-SPEC: `NOME → CNPJ → ENDERECO → EMAIL → LOGO_URL → COR_PRIMARIA`)
- Exatamente quais classes/seletores no `globals.css` contêm `#0d6efd` a substituir (pesquisador lista via grep — ver Codebase Audit abaixo)
- `alt` text do `<img>` logo (resolvido pelo UI-SPEC: usar `{EMPRESA_NOME}`)

### Deferred Ideas (OUT OF SCOPE)

- Painel admin no sistema para editar configurações sem acessar o servidor (WL-01)
- Upload de logo pelo sistema (MinIO) sem editar `.env` (WL-02)
- Templates PDF gerenciados pelo painel admin (WL-03)
- Compartilhar vars `EMPRESA_*` via Docker Compose stack.env (melhoria futura de DevOps)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FRONT-01 | `layout.tsx` usa `EMPRESA_NOME` no `metadata.title` em vez de "BomCusto Orcamento" hardcoded | D-07 confirmado: `layout.tsx` é Server Component puro, pode usar `generateMetadata()` async; linha 7 contém `title: "BomCusto Orcamento"` |
| FRONT-02 | 5 páginas internas exibem logo/nome/CNPJ/endereço lidos das env vars | Grep confirmou todas as 5 páginas com valores hardcoded; módulo `empresa.ts` centraliza via D-03 |
| FRONT-03 | 2 páginas públicas exibem logo e nome lidos das env vars | `approve/page.tsx` e `status/page.tsx` confirmados com `logo-primary.png` + "Bom Custo" hardcoded |
| FRONT-04 | Cor primária injetada como CSS custom property no `layout.tsx` | 5 ocorrências de `#0d6efd` no `globals.css` confirmadas nas linhas 37, 130, 133, 146, 190 |
</phase_requirements>

---

## Summary

Esta fase é uma refatoração de dehardcode — sem novas funcionalidades, sem novos pacotes. Todos os valores de identidade visual da empresa (`/media/logo-primary.png`, "BomCusto Orcamento", "Bom Custo Papelaria & Gráfica Rápida LTDA", `62.391.927/0001-57`, etc.) estão hoje hardcoded em 8 arquivos do frontend. A fase cria um módulo central `empresa.ts`, define 6 vars `NEXT_PUBLIC_EMPRESA_*`, e faz os 8 arquivos importar do módulo em vez de usar strings literais.

O ponto de complexidade real é o `layout.tsx`: é o único Server Component nos 8 alvos. Ele lê `process.env` diretamente (sem `NEXT_PUBLIC_`), injeta o CSS custom property `--cor-primaria` via `<style>` inline no `<head>`, e exporta `generateMetadata()` async para o title dinâmico. Os outros 7 arquivos são todos `"use client"` e só enxergam vars `NEXT_PUBLIC_*`.

O CSS theming é cirúrgico: apenas 5 seletores em `globals.css` usam `#0d6efd` — exatamente os identificados no UI-SPEC (linhas 37, 130, 133, 146, 190). Nenhuma outra parte do CSS precisa mudar.

**Primary recommendation:** Criar `empresa.ts` primeiro, depois modificar os 8 arquivos em sequência, finalizando com `globals.css` e `.env.example`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Title da aba (`metadata`) | Frontend Server (SSR) — `layout.tsx` | — | `generateMetadata()` é exclusivo de Server Components no Next.js App Router |
| CSS custom property `--cor-primaria` | Frontend Server (SSR) — `layout.tsx` | — | `<style>` inline no `<head>` precisa estar no Server Component que renderiza o HTML shell |
| Logo URL e nome (páginas internas) | Browser / Client | módulo `empresa.ts` | 7 páginas são `"use client"` — leem `NEXT_PUBLIC_*` baked at build |
| Logo e nome (páginas públicas) | Browser / Client | módulo `empresa.ts` | `approve` e `status` também são `"use client"` |
| Env vars `NEXT_PUBLIC_*` | CDN / Static (baked at build) | — | Padrão Next.js: valores embutidos no bundle em build time |

---

## Codebase Audit — Inventário Exaustivo de Hardcoded

Verificado via grep exaustivo nos 8 arquivos-alvo (e adjacentes). [VERIFIED: grep codebase]

### apps/frontend/src/app/layout.tsx

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 7 | `title: "BomCusto Orcamento"` | `generateMetadata()` retorna `process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "Orcamento"` |
| — | Sem `<head>` no JSX atual | Adicionar `<head><style>` com `--cor-primaria` |

### apps/frontend/src/app/orcamento/page.tsx

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 399 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 399 | `alt="Logo Bom Custo"` | `alt={EMPRESA_NOME}` |
| 399 | `style={{maxWidth:180, maxHeight:120, ...}}` | Preservar dimensões, apenas src/alt mudam |
| 401 | `"Bom Custo Papelaria & Gráfica Rápida LTDA"` | `{EMPRESA_NOME}` |
| 402 | `"CNPJ: 62.391.927/0001-57"` | `{EMPRESA_CNPJ && <div className="small">CNPJ: {EMPRESA_CNPJ}</div>}` |
| 403 | `"Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê"` | `{EMPRESA_ENDERECO && <div className="small">{EMPRESA_ENDERECO}</div>}` |
| 404 | `"Ilhabela - SP, CEP: 11633-078"` | (incluído em `EMPRESA_ENDERECO` ou variável separada — ver nota abaixo) |
| 407 | `"orcamento@bomcustoilhabela.com.br"` | `{EMPRESA_EMAIL && <div className="small">E-mail: {EMPRESA_EMAIL}</div>}` |

**Nota:** `orcamento/page.tsx` tem o endereço em 2 linhas separadas (403: "Rua..." e 404: "Ilhabela - SP..."). No fallback do módulo `empresa.ts`, `EMPRESA_ENDERECO` deve incluir os dois trechos concatenados: `"Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê, Ilhabela - SP, CEP: 11633-078"`. O template do header exibirá numa única `<div>`.

**Telefones (linha 406):** `"Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405"` — **NÃO está nos 4 requisitos FRONT-01..04**. Telefone não é var definida no módulo `empresa.ts` (D-03 lista: NOME, CNPJ, ENDERECO, EMAIL, LOGO_URL, COR_PRIMARIA). Remover ou manter como texto fixo — **fora do escopo desta fase**. A decisão mais segura é manter o bloco de telefone como texto estático (ou removê-lo), pois não há `EMPRESA_TELEFONE` definida.

### apps/frontend/src/app/orcamento/novo/page.tsx

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 587 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 587 | `alt="Logo Bom Custo"` | `alt={EMPRESA_NOME}` |
| 587 | `style={{maxWidth:140, maxHeight:100, ...}}` | Preservar (diferente de `orcamento/page`!) |
| 589 | `"Bom Custo Papelaria & Gráfica Rápida LTDA"` | `{EMPRESA_NOME}` |
| 590 | `"CNPJ: 62.391.927/0001-57"` | `{EMPRESA_CNPJ && ...}` |
| 591 | `"Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê"` | `{EMPRESA_ENDERECO && ...}` |
| 591-592 | `"Ilhabela - SP, CEP: 11633-078"` | (unificado em `EMPRESA_ENDERECO`) |
| 595 | `"orcamento@bomcustoilhabela.com.br"` | `{EMPRESA_EMAIL && ...}` |

**Atenção de dimensão:** Em `orcamento/novo/page.tsx` a logo usa `maxWidth:140, maxHeight:100` (linha 587) — não `maxWidth:180, maxHeight:120` como em `orcamento/page.tsx`. O UI-SPEC documenta `maxWidth: 180, maxHeight: 120` para páginas internas como padrão de pages `orcamento/page` e `orcamento/novo`. Preservar os valores exatos de cada arquivo.

### apps/frontend/src/app/orcamento/[id]/page.tsx

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 529 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 529 | `alt="Logo Bom Custo"` | `alt={EMPRESA_NOME}` |
| 531 | `"Bom Custo Papelaria & Gráfica Rápida LTDA"` | `{EMPRESA_NOME}` |
| 532 | `"CNPJ: 62.391.927/0001-57"` | `{EMPRESA_CNPJ && ...}` |
| 533 | `"Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê"` | `{EMPRESA_ENDERECO && ...}` |
| 535 | `"Ilhabela - SP, CEP: 11633-078"` | (unificado em `EMPRESA_ENDERECO`) |
| 537 | `"orcamento@bomcustoilhabela.com.br"` | `{EMPRESA_EMAIL && ...}` |

### apps/frontend/src/app/contas-receber/page.tsx

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 108 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 109 | `alt="Logo Bom Custo"` | `alt={EMPRESA_NOME}` |

**Nota:** Esta página não tem nome, CNPJ, endereço ou email da empresa hardcoded — somente o logo. O `<h3>` diz "Contas a Receber" (estático, não é dado de empresa).

### apps/frontend/src/app/contas-receber/[idcliente]/page.tsx

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 611 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 612 | `alt="Logo Bom Custo"` | `alt={EMPRESA_NOME}` |

**Nota:** Mesma estrutura que `contas-receber/page.tsx` — somente logo, sem outros dados de empresa.

### apps/frontend/src/app/orcamento/[id]/approve/page.tsx (PÚBLICA)

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 145 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 146 | `alt="Bom Custo Papelaria & Gráfica Rápida"` | `alt={EMPRESA_NOME}` |
| 149 | `"Bom Custo Papelaria & Gráfica Rápida"` | `{EMPRESA_NOME}` |

**Nota:** Telefone hardcoded (`(12) 99648-4918`) nas linhas 247, 252, 274, 278 — fora do escopo (sem `EMPRESA_TELEFONE` no módulo).

### apps/frontend/src/app/orcamento/[id]/status/page.tsx (PÚBLICA)

| Linha | Valor Hardcoded | Substituição |
|-------|----------------|--------------|
| 106 | `src="/media/logo-primary.png"` | `src={EMPRESA_LOGO_URL}` |
| 107 | `alt="Bom Custo Papelaria &amp; Gráfica Rápida"` | `alt={EMPRESA_NOME}` |
| 110 | `"Bom Custo Papelaria &amp; Gráfica Rápida"` | `{EMPRESA_NOME}` |

**Nota:** Telefone hardcoded (`(12) 99648-4918`) nas linhas 128, 189 — fora do escopo.

### apps/frontend/src/app/globals.css — 5 Ocorrências de #0d6efd [VERIFIED: grep codebase]

| Linha | Seletor | Propriedade | Substituição |
|-------|---------|-------------|--------------|
| 37 | `.orcamento-status-em_producao, .orcamento-status-emproducao` | `color: #0d6efd` | `color: var(--cor-primaria)` |
| 130 | `.orcamento-input:focus` | `border-color: #0d6efd` | `border-color: var(--cor-primaria)` |
| 133 | `.orcamento-btn` | `background: #0d6efd` | `background: var(--cor-primaria)` |
| 146 | `.btn-accent` | `background: #0d6efd` | `background: var(--cor-primaria)` |
| 190 | `.orcamento-assina` | `color: #0d6efd` | `color: var(--cor-primaria)` |

---

## Standard Stack

### Core (sem novos pacotes nesta fase)

| Item | Versão | Papel | Status |
|------|--------|-------|--------|
| Next.js | ^16.2.5 (package.json) | Framework | já instalado |
| React | 18.3.1 | Runtime | já instalado |
| TypeScript | ^5.6.2 | Tipagem | já instalado |

**Nenhum pacote novo é instalado nesta fase.** É uma refatoração pura de código existente.

### Padrões Next.js usados nesta fase [ASSUMED — treinamento; comportamento confirmado pela estrutura existente do projeto]

| Padrão | Onde | Notas |
|--------|------|-------|
| `NEXT_PUBLIC_*` env vars | Client Components | Baked at build; visível no bundle. Padrão já usado em `NEXT_PUBLIC_API_URL`. |
| `export async function generateMetadata()` | `layout.tsx` (Server Component) | App Router: forma canônica de metadata dinâmico |
| `<style>` inline no Server Component | `layout.tsx` `<head>` | CSS custom property injetado no HTML shell antes do hydrate |
| `process.env.VAR` diretamente | `layout.tsx` | Server Component lê env sem `NEXT_PUBLIC_` |

---

## Package Legitimacy Audit

**Nenhum pacote externo novo é instalado nesta fase.** Refatoração pura — apenas arquivos `.ts`/`.tsx`/`.css`/`.env.example` são criados ou editados.

| Pacote | Registry | Veredicto | Disposição |
|--------|----------|-----------|------------|
| (nenhum) | — | — | N/A |

---

## Architecture Patterns

### System Architecture Diagram

```
Build Time:
  .env.local (NEXT_PUBLIC_EMPRESA_*)
       │
       ▼
  Next.js build
       │
       ├── baked into JS bundle ──► Client Components (7 páginas)
       │                             └── importam de empresa.ts
       │                                  └── process.env.NEXT_PUBLIC_*
       │
       └── layout.tsx (Server Component)
                │
                ├── generateMetadata() → title dinâmico
                └── <style>:root{--cor-primaria:...}</style> → injetado no HTML

Runtime:
  Browser recebe HTML com --cor-primaria já definido
  Bootstrap CSS carregado via CDN
  globals.css usa var(--cor-primaria) nos 5 seletores
```

### Recommended Project Structure (novos arquivos)

```
apps/frontend/
├── .env.example          # NOVO — documentação das 6 vars NEXT_PUBLIC_EMPRESA_*
└── src/
    └── lib/
        └── empresa.ts    # NOVO — módulo central de constantes de empresa
```

### Pattern 1: Módulo Central de Constantes (empresa.ts)

**What:** Arquivo TypeScript que exporta constantes lidas de `process.env.NEXT_PUBLIC_EMPRESA_*`. Centraliza todos os nomes de variáveis em um único ponto.

**When to use:** Todos os Client Components que precisam de dados de empresa importam daqui.

**Contrato exato (do UI-SPEC):**
```typescript
// apps/frontend/src/lib/empresa.ts
export const EMPRESA_NOME     = process.env.NEXT_PUBLIC_EMPRESA_NOME     ?? "Sistema de Orçamento";
export const EMPRESA_CNPJ     = process.env.NEXT_PUBLIC_EMPRESA_CNPJ     ?? "";
export const EMPRESA_ENDERECO = process.env.NEXT_PUBLIC_EMPRESA_ENDERECO ?? "";
export const EMPRESA_EMAIL    = process.env.NEXT_PUBLIC_EMPRESA_EMAIL    ?? "";
export const EMPRESA_LOGO_URL = process.env.NEXT_PUBLIC_EMPRESA_LOGO_URL ?? "/media/logo-primary.png";
export const EMPRESA_COR_PRIMARIA = process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd";
```

### Pattern 2: Injeção de CSS Custom Property no layout.tsx

**What:** Server Component lê a cor primária e a injeta como CSS custom property no `<head>` via `<style>` inline. O CSS global referencia `var(--cor-primaria)` em vez de `#0d6efd`.

**Contrato exato (do UI-SPEC):**
```tsx
// apps/frontend/src/app/layout.tsx
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "Orçamento",
    description: "Painel de orçamentos integrado ao Chatwoot e PDV",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const cor = process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd";
  return (
    <html lang="pt-BR">
      <head>
        <style>{`:root { --cor-primaria: ${cor}; }`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Pattern 3: Renderização Condicional de Dados de Empresa

**What:** CNPJ, endereço e email usam renderização condicional para não exibir linhas vazias quando a variável não estiver configurada.

**Contrato exato (do UI-SPEC):**
```tsx
import { EMPRESA_NOME, EMPRESA_CNPJ, EMPRESA_ENDERECO, EMPRESA_EMAIL, EMPRESA_LOGO_URL } from "@/lib/empresa";

// No JSX:
<img src={EMPRESA_LOGO_URL} alt={EMPRESA_NOME} style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }} />
<h3 className="mb-0">{EMPRESA_NOME}</h3>
{EMPRESA_CNPJ && <div className="small">CNPJ: {EMPRESA_CNPJ}</div>}
{EMPRESA_ENDERECO && <div className="small">{EMPRESA_ENDERECO}</div>}
{EMPRESA_EMAIL && <div className="small">E-mail: {EMPRESA_EMAIL}</div>}
```

**Páginas públicas (approve, status) — padrão simplificado:**
```tsx
import { EMPRESA_NOME, EMPRESA_LOGO_URL } from "@/lib/empresa";

<img src={EMPRESA_LOGO_URL} alt={EMPRESA_NOME} style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }} />
<div className="mt-2 small text-muted">{EMPRESA_NOME}</div>
```

### Anti-Patterns to Avoid

- **Ler `process.env` em Client Component sem prefixo `NEXT_PUBLIC_`:** Retorna `undefined` no browser. Todas as 7 páginas `"use client"` DEVEM usar `NEXT_PUBLIC_EMPRESA_*` (via módulo `empresa.ts`).
- **Usar `next/image` para o logo da empresa:** O projeto usa `<img>` padrão (com eslint-disable comentado). Não introduzir `next/image` — mudaria o contrato de dimensões e exigiria configuração de `remotePatterns`.
- **Ler vars de empresa em `layout.tsx` via módulo `empresa.ts`:** O módulo usa `NEXT_PUBLIC_*` e funciona em Client Components. O `layout.tsx` é Server Component e lê `process.env` diretamente — mais explícito e não requer o módulo.
- **Usar `--bs-primary` como nome da custom property:** Colide com o Bootstrap 5. O nome correto é `--cor-primaria` (D-05).
- **Condicionais para logo:** Não usar `{EMPRESA_LOGO_URL && <img>}`. O fallback no módulo garante que sempre há um URL — zero regressão na BomCusto.

---

## Don't Hand-Roll

| Problema | Não Construir | Usar Em Vez | Razão |
|----------|---------------|-------------|-------|
| CSS custom property | Inline style por elemento | `var(--cor-primaria)` no globals.css | Um único ponto de mudança afeta todos os seletores simultaneamente |
| Ponto de leitura de env | Leitura direta em cada componente | módulo `empresa.ts` | Se o nome da var mudar, só muda em 1 arquivo |
| Fallback de logo | `if (!EMPRESA_LOGO_URL)` em cada página | Fallback no módulo (`?? "/media/logo-primary.png"`) | Lógica de fallback em 1 lugar, não em 8 |
| Renderização de campos opcionais (CNPJ, endereço, email) | Remover o campo do template | Renderização condicional `{valor && <div>}` | Mantém estrutura HTML estável; ausência de dado oculta o elemento sem quebrar layout |

**Key insight:** Esta fase é puramente de centralização — os dados já existem, só precisam ser lidos de env vars em vez de literals. Qualquer lógica extra (validação de formato, transformação) pertence ao módulo `empresa.ts`, não às páginas.

---

## Common Pitfalls

### Pitfall 1: NEXT_PUBLIC_ obrigatório para Client Components

**What goes wrong:** Implementar `empresa.ts` usando `process.env.EMPRESA_NOME` (sem `NEXT_PUBLIC_`). O bundle de produção retornará `undefined` para todas as variáveis.
**Why it happens:** Next.js "tree-shakes" env vars no build: apenas `NEXT_PUBLIC_*` é incluído no bundle client-side.
**How to avoid:** O módulo `empresa.ts` DEVE usar `process.env.NEXT_PUBLIC_EMPRESA_*` em todas as exports.
**Warning signs:** Valores aparecem corretamente em `next dev` (que tem acesso ao processo Node.js) mas são `undefined` em `next build && next start`.

### Pitfall 2: generateMetadata conflita com export const metadata

**What goes wrong:** Manter `export const metadata` e adicionar `export async function generateMetadata()` no mesmo arquivo. Next.js usa um ou outro — ter os dois gera aviso de build e comportamento indefinido.
**Why it happens:** O desenvolvedor esquece de remover o export estático ao adicionar o dinâmico.
**How to avoid:** Remover completamente `export const metadata = { title: "BomCusto Orcamento", ... }` e substituir por `export async function generateMetadata()`.
**Warning signs:** Warning de build: "Both `metadata` and `generateMetadata` are exported from the same route".

### Pitfall 3: Dimensões de logo diferentes entre páginas internas

**What goes wrong:** Uniformizar as dimensões de logo em todas as 5 páginas internas durante o refactor, introduzindo regressão visual inesperada.
**Why it happens:** O refactor parece uma boa oportunidade para "padronizar". Mas `orcamento/page.tsx` usa `maxWidth:180, maxHeight:120` enquanto as outras usam `maxWidth:140, maxHeight:100`.
**How to avoid:** Preservar exatamente os valores de style de cada arquivo. Não homogeneizar dimensões nesta fase.
**Warning signs:** UI-SPEC diz explicitamente: "Páginas internas (`orcamento/page`, `orcamento/novo`) usam `maxWidth: 180, maxHeight: 120` — preservar os valores exatos já existentes nesses arquivos."

### Pitfall 4: Endereço fragmentado em 2 linhas vira 1 linha

**What goes wrong:** `orcamento/page.tsx` tem o endereço em duas divs separadas (linha 403: "Rua Olímpio..." e linha 404: "Ilhabela - SP..."). Ao substituir por `{EMPRESA_ENDERECO}`, o valor da env var precisa conter o endereço completo numa string.
**Why it happens:** O desenvolvedor substitui apenas a linha 403 e deixa a linha 404 como texto fixo "Ilhabela - SP, CEP: 11633-078".
**How to avoid:** Ao criar o `.env.example`, definir `NEXT_PUBLIC_EMPRESA_ENDERECO` como o endereço completo numa linha. Substituir as DUAS divs por uma única `{EMPRESA_ENDERECO && <div className="small">{EMPRESA_ENDERECO}</div>}`.

### Pitfall 5: Telefone hardcoded não é escopo desta fase

**What goes wrong:** O executor "aproveita" para parametrizar também os telefones enquanto está editando o header, criando scope creep silencioso.
**Why it happens:** Os telefones hardcoded ficam visíveis durante a edição (linhas 406, 594, etc.).
**How to avoid:** O módulo `empresa.ts` tem exatamente 6 exports (D-03). Telefone não está em nenhum deles. Manter o bloco de telefone como texto estático (ou remover do header se o operador preferir limpeza visual, mas sem adicionar nova var).

### Pitfall 6: `&amp;` em JSX nas páginas públicas

**What goes wrong:** `approve/page.tsx` e `status/page.tsx` usam `Bom Custo Papelaria &amp; Gráfica Rápida` (entidade HTML). Ao substituir por `{EMPRESA_NOME}`, o React renderiza a string diretamente — sem encode. O texto correto em `empresa.ts` deve ser `"Bom Custo Papelaria & Gráfica Rápida"` com `&` literal, não `&amp;`.
**How to avoid:** Fallback no módulo: `?? "Sistema de Orçamento"` (genérico); no `.env.example` usar `Bom Custo Papelaria & Gráfica Rápida` com `&` literal.

---

## Runtime State Inventory

Esta fase é uma refatoração de source code e configuração por env vars — não é rename/migration de dados.

| Categoria | Itens Encontrados | Ação |
|-----------|------------------|------|
| Stored data | Nenhum — fase não altera banco nem IDs armazenados | Nenhuma |
| Live service config | Nenhum — fase não altera n8n, Chatwoot, ou qualquer serviço externo | Nenhuma |
| OS-registered state | Nenhum | Nenhuma |
| Secrets/env vars | `apps/frontend/.env.local` deve receber as 6 vars `NEXT_PUBLIC_EMPRESA_*` | Atualizar .env.local manualmente no servidor; `.env.example` documenta os valores |
| Build artifacts | `.next/` — diretório de build do Next.js deve ser recriado com `npm run build` após adicionar as vars | `npm run build` depois de configurar `.env.local` |

**Restartar o servidor Next.js é necessário** após adicionar as vars em `.env.local` — o baking ocorre no build, não em runtime.

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|---------------|------------|--------|---------|
| Node.js / Next.js build | Baking das vars `NEXT_PUBLIC_*` | Sim (projeto em execução) | Next ^16.2.5 | — |
| `/media/logo-primary.png` | Fallback de logo quando `EMPRESA_LOGO_URL` não definida | Sim (arquivo estático em `apps/frontend/public/media/`) | — | Já existe |
| `apps/frontend/.env.local` | Runtime local das vars `NEXT_PUBLIC_EMPRESA_*` | Sim (arquivo existente com `NEXT_PUBLIC_API_URL`) | — | — |

**Dependências sem fallback que bloqueiam execução:** Nenhuma — a fase funciona out-of-the-box com os fallbacks do módulo `empresa.ts`.

---

## Validation Architecture

`workflow.nyquist_validation` ausente do `config.json` → tratado como habilitado.

Esta fase é refatoração pura de frontend — não há testes automatizados existentes que cubram os componentes modificados. O projeto não tem configuração de testing framework detectada (`jest.config.*`, `vitest.config.*`, `playwright.config.*` ausentes).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Nenhum detectado no projeto |
| Config file | Nenhum — Wave 0 deve criar ou documentar ausência |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FRONT-01 | Título da aba = valor de `NEXT_PUBLIC_EMPRESA_NOME` | manual-only | N/A — requer browser para verificar `<title>` | ❌ |
| FRONT-02 | Header das 5 páginas internas exibe dados de empresa das vars | manual-only | N/A — requer browser | ❌ |
| FRONT-03 | Header das 2 páginas públicas exibe logo/nome das vars | manual-only | N/A — requer browser | ❌ |
| FRONT-04 | Elementos com `--cor-primaria` mudam com `EMPRESA_COR_PRIMARIA` | manual-only | N/A — requer inspeção visual | ❌ |

**Justificativa manual-only:** Todos os success criteria são verificações visuais de browser (título da aba, logos, cores). Não existe framework de teste E2E configurado. A verificação ocorre via UAT manual: definir `EMPRESA_NOME=Outra Empresa` no `.env.local`, rebuildar, e confirmar que nenhum "BomCusto" aparece nas 7 páginas + título da aba.

### Wave 0 Gaps

- Não há gaps de test framework — fase não requer testes automatizados por ser 100% visual/browser-only.

### Sampling Rate

- **Por commit de task:** Inspecionar visualmente a página modificada no browser local com a var redefinida.
- **Por merge de wave:** Verificar todas as 8 páginas-alvo com `EMPRESA_NOME=Outra Empresa` e `EMPRESA_COR_PRIMARIA=#e63946`.
- **Phase gate:** UAT manual completo conforme success criteria do ROADMAP antes de `/gsd-verify-work`.

---

## Security Domain

Esta fase não introduz autenticação, sessões, inputs externos, ou criptografia. As vars `NEXT_PUBLIC_*` são por definição públicas (baked into JS bundle), então não há risco de vazamento de segredos.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | — |
| V3 Session Management | não | — |
| V4 Access Control | não | — |
| V5 Input Validation | não (vars são configuração, não input de usuário) | — |
| V6 Cryptography | não | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSS injection via `EMPRESA_COR_PRIMARIA` | Tampering | O valor é injetado num `<style>` inline do Server Component. Um atacante com acesso ao `.env.local` já tem acesso total ao servidor — não é vetor de ataque externo. Em deploy controlado por env var, o risco é baixo e aceitável. |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `export const metadata` (estático) | `export async function generateMetadata()` | Next.js App Router (v13+) | Permite title dinâmico sem rewiring |
| `CSS color hardcoded` | `CSS custom property var(--cor-primaria)` | CSS Variables (baseline 2017) | Theming via env var sem rebuild de CSS |

**Deprecated/outdated:**
- `export const metadata` com valor fixo: funcional, mas não suporta título dinâmico. Substituir por `generateMetadata()`.

---

## Open Questions

1. **Bloco de telefone nas páginas internas**
   - O que sabemos: 3 páginas internas têm `"Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405"` hardcoded.
   - O que está indefinido: manter como texto fixo BomCusto ou remover do header?
   - Recomendação: Manter como texto fixo nesta fase (não pertence ao escopo FRONT-01..04). Se o operador quiser parameterizar, é uma extensão futura via `EMPRESA_TELEFONE`.

2. **Bloco de telefone nas páginas públicas**
   - O que sabemos: `approve/page.tsx` e `status/page.tsx` têm `(12) 99648-4918` hardcoded como link de WhatsApp.
   - O que está indefinido: manter como texto BomCusto ou remover?
   - Recomendação: Manter como texto fixo nesta fase. FRONT-03 exige apenas logo e nome nas páginas públicas.

---

## Assumptions Log

| # | Claim | Section | Risk se Errado |
|---|-------|---------|----------------|
| A1 | `layout.tsx` lendo `process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA` em Server Component sem ser Server Action — comportamento documentado no App Router | Architecture Patterns | Se o runtime ignorar a leitura, o CSS var não é injetado; fallback `#0d6efd` manteria funcionando visualmente |
| A2 | Todas as páginas-alvo são `"use client"` — confirmado pelo grep, mas status do `layout.tsx` é inferido pela ausência de `"use client"` | Standard Stack | Correto — `layout.tsx` não tem `"use client"` (lido diretamente) |

**A2 verificado diretamente no código:** `layout.tsx` (lido) não contém `"use client"` — portanto é Server Component. [VERIFIED: grep codebase]

---

## Sources

### Primary (HIGH confidence)
- Codebase grep exaustivo — todos os 8 arquivos-alvo lidos diretamente e inventariados [VERIFIED: grep codebase]
- `36-CONTEXT.md` — decisões D-01..D-10 do discuss-phase [VERIFIED: arquivo lido]
- `36-UI-SPEC.md` — contratos de API, dimensões de logo, seletores CSS, copywriting [VERIFIED: arquivo lido]

### Secondary (MEDIUM confidence)
- `35-CONTEXT.md` — padrões e decisões do backend white-label; comportamento de logo no PDF (diferente do frontend) [VERIFIED: arquivo lido]
- `apps/frontend/package.json` — versões de Next.js e React [VERIFIED: arquivo lido]
- `apps/frontend/src/lib/backend-client.ts` — padrão de leitura de env no frontend Server (sem `NEXT_PUBLIC_`) [VERIFIED: arquivo lido]

### Tertiary (LOW confidence — ASSUMED)
- Comportamento de `NEXT_PUBLIC_*` baking at build time [ASSUMED — treinamento; consistente com estrutura do projeto]
- Comportamento de `generateMetadata()` vs `export const metadata` no App Router [ASSUMED — treinamento]

---

## Metadata

**Confidence breakdown:**
- Codebase audit: HIGH — todos os arquivos lidos diretamente, nenhuma suposição
- Standard Stack: HIGH — nenhum pacote novo, só padrões Next.js existentes no projeto
- Architecture: HIGH — baseado no CONTEXT.md e UI-SPEC aprovados
- Pitfalls: HIGH — derivados da inspeção direta do código com os valores reais

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (30 dias — stack estável, sem deps externas novas)
