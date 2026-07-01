---
phase: 36
slug: frontend-white-label
status: draft
shadcn_initialized: false
preset: none
created: 2026-06-19
---

# Phase 36 — UI Design Contract

> Visual and interaction contract para a fase de Frontend White-Label.
> Gerado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **Escopo:** Esta fase é uma refatoração de dehardcode — o layout visual NÃO muda.
> Apenas os valores que preenchem os slots existentes passam a vir de variáveis de
> ambiente `NEXT_PUBLIC_EMPRESA_*`. Nenhuma tela nova, nenhum componente novo.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — Bootstrap via CDN (já existente) |
| Preset | not applicable |
| Component library | none (Bootstrap classes diretas) |
| Icon library | Bootstrap Icons 1.11.1 via CDN |
| Font | Inter / Segoe UI / system-ui (stack existente, sem webfont carregado) |

Fonte: SKILL.md + `colors_and_type.css` do bom-custo-design + `globals.css` existente.

---

## Spacing Scale

Escala existente no design system (`.claude/skills/bom-custo-design/colors_and_type.css`).
Esta fase não adiciona nem altera espaçamentos — apenas substitui valores de texto e `src` de imagem.

| Token | Valor | Uso no codebase existente |
|-------|-------|---------------------------|
| xs | 4px (0.25rem — `--space-1`) | Gaps inline, padding de badge |
| sm | 8px (0.5rem — `--space-2`) | Separação entre elementos compact |
| md | 16px (1rem — `--space-4`) | Espaçamento padrão de elementos |
| lg | 20px (1.25rem — `--space-5`) | Padding de form fields |
| xl | 24px (1.5rem — `--space-6`) | Section padding |
| 2xl | 32px (2rem — `--space-8`) | Layout gaps principais |
| 3xl | 40px (2.5rem — `--space-10`) | Margem top do header (`.orcamento-header`) |

Exceções: Logo tiles usam padding fixo de 4–6px (valor de pixel exato preservado dos arquivos existentes — não alterar nesta fase).

---

## Typography

Escala de tipo do design system (não muda nesta fase). Documentada para o checker:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 1.05rem (`--fs-base`) | 400 regular | 1.5 (`--lh-normal`) |
| Label / small | 0.95rem (`--fs-sm`) | 400 regular | 1.5 |
| Sub-heading / card values | 1.35rem (`--fs-lg`) | 700 bold | 1.3 (`--lh-snug`) |
| H1 / page title | 2.2rem (`--fs-2xl`) | 800 black | 1.15 (`--lh-tight`) |

Fontes: `colors_and_type.css` do bom-custo-design; confirmado em `globals.css` (`.orcamento-title h1: font-size 2.2rem, font-weight 800`).

---

## Color

Paleta existente — esta fase NÃO adiciona cores. O contrato registra os valores que serão afetados pela custom property `--cor-primaria`.

| Role | Valor atual | Uso |
|------|-------------|-----|
| Dominant (60%) | `#f9f7ed` (`--bg`) | Background de página (warm paper cream) |
| Secondary (30%) | `#ffffff` (`--surface`) | Cards, shells, modais, logo tiles |
| Accent (10%) | `#0d6efd` (`--accent`) — mutável via `--cor-primaria` | Ver lista abaixo |
| Destructive | `#ee3537` (`--danger`, brand red) | Ações de cancelamento e alertas de erro |

**Accent reservado para — lista exata dos seletores afetados pela substituição de `#0d6efd` por `var(--cor-primaria)`:**

1. `.orcamento-status-em_producao, .orcamento-status-emproducao { color: ... }` — cor do texto do badge de status "Em Produção"
2. `.orcamento-input:focus { border-color: ... }` — borda de foco nos inputs de formulário
3. `.orcamento-btn { background: ... }` — botão primário do formulário de login (página raiz)
4. `.btn-accent { background: ... }` — botão de ação primário (ex: "Novo orçamento")
5. `.orcamento-assina { color: ... }` — texto de assinatura no modal de aprovação

**Esses são os 5 seletores com `#0d6efd` hardcoded em `globals.css`** (confirmado via grep — 5 ocorrências nas linhas 37, 130, 133, 146, 190).

O fallback quando `NEXT_PUBLIC_EMPRESA_COR_PRIMARIA` não estiver definido é `#0d6efd` — zero regressão na BomCusto.

---

## Módulo Central de Empresa — Contrato de API

O módulo `apps/frontend/src/lib/empresa.ts` é o artefato central desta fase.
Abaixo o contrato de export que o executor deve implementar:

```ts
// apps/frontend/src/lib/empresa.ts
// Constantes de empresa — lidas de NEXT_PUBLIC_EMPRESA_* (baked at build).
// Usado por todos os Client Components das 7 páginas-alvo.
// layout.tsx (Server Component) lê process.env diretamente — não importa daqui.

export const EMPRESA_NOME     = process.env.NEXT_PUBLIC_EMPRESA_NOME     ?? "Sistema de Orçamento";
export const EMPRESA_CNPJ     = process.env.NEXT_PUBLIC_EMPRESA_CNPJ     ?? "";
export const EMPRESA_ENDERECO = process.env.NEXT_PUBLIC_EMPRESA_ENDERECO ?? "";
export const EMPRESA_EMAIL    = process.env.NEXT_PUBLIC_EMPRESA_EMAIL    ?? "";
export const EMPRESA_LOGO_URL = process.env.NEXT_PUBLIC_EMPRESA_LOGO_URL ?? "/media/logo-primary.png";
export const EMPRESA_COR_PRIMARIA = process.env.NEXT_PUBLIC_EMPRESA_COR_PRIMARIA ?? "#0d6efd";
```

Ordem das exports: `NOME → CNPJ → ENDERECO → EMAIL → LOGO_URL → COR_PRIMARIA` (Claude's Discretion resolvida — ordem lógica de relevância de branding).

---

## Logo — Contrato de Renderização

**Padrão obrigatório para TODAS as 8 páginas:**

```tsx
<img
  src={EMPRESA_LOGO_URL}
  alt={EMPRESA_NOME}
  style={{ maxWidth: 140, maxHeight: 80, background: "#fff", borderRadius: 8, padding: 6 }}
/>
```

- `alt` text: usar `{EMPRESA_NOME}` — não string fixa "Logo" (Claude's Discretion resolvida — alt descritivo é melhor acessibilidade e reflete a marca correta).
- Páginas internas (`orcamento/page`, `orcamento/novo`) usam `maxWidth: 180, maxHeight: 120` — preservar os valores exatos já existentes nesses arquivos.
- Fallback: `/media/logo-primary.png` quando `NEXT_PUBLIC_EMPRESA_LOGO_URL` não definido (D-08 do CONTEXT.md). **Nunca retornar header vazio.**

---

## Injeção de CSS Custom Property — Contrato do layout.tsx

`layout.tsx` é Server Component. O contrato de injeção é:

```tsx
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

E em `globals.css`, cada ocorrência de `#0d6efd` nos 5 seletores listados na seção Color substitui por `var(--cor-primaria)`.

**Nome da custom property:** `--cor-primaria` (D-05 do CONTEXT.md). Não usar `--bs-primary` — colide com o Bootstrap.

---

## Copywriting Contract

Esta fase não adiciona texto novo — apenas parametriza texto existente. O contrato abaixo documenta os valores de fallback que aparecem quando as vars não estão definidas, garantindo que o sistema funcione out-of-the-box.

| Elemento | Valor hardcoded atual | Fallback definido no módulo |
|----------|----------------------|----------------------------|
| `metadata.title` | `"BomCusto Orcamento"` | `"Orçamento"` (genérico, sem marca) |
| Nome da empresa no header | `"Bom Custo Papelaria & Gráfica Rápida"` | `EMPRESA_NOME ?? "Sistema de Orçamento"` |
| CNPJ no header | `"62.391.927/0001-57"` | `EMPRESA_CNPJ ?? ""` (omite se vazio) |
| Endereço no header | `"Ilhabela - SP, CEP: 11633-078"` | `EMPRESA_ENDERECO ?? ""` (omite se vazio) |
| E-mail no header | `"orcamento@bomcustoilhabela.com.br"` | `EMPRESA_EMAIL ?? ""` (omite se vazio) |
| `alt` da logo | `"Bom Custo Papelaria & Gráfica Rápida"` | `EMPRESA_NOME ?? "Sistema de Orçamento"` |

**Renderização condicional para CNPJ, Endereço e Email:** se o valor do módulo for string vazia (`""`), o elemento `<div>` correspondente NÃO deve ser renderizado (nem o label "CNPJ:", nem a linha em branco). Isso evita linhas vazias no header quando o deploy não tem todas as vars configuradas.

Exemplo:
```tsx
{EMPRESA_CNPJ && <div className="small">CNPJ: {EMPRESA_CNPJ}</div>}
{EMPRESA_ENDERECO && <div className="small">{EMPRESA_ENDERECO}</div>}
{EMPRESA_EMAIL && <div className="small">E-mail: {EMPRESA_EMAIL}</div>}
```

Não há estados vazios de dados, erros de fetch nem ações destrutivas nesta fase — fase é exclusivamente de substituição de valores estáticos.

---

## Mapa de Arquivos — Contrato de Alterações

| Arquivo | Alterações desta fase | REQ |
|---------|----------------------|-----|
| `apps/frontend/src/lib/empresa.ts` | **CRIAR** — módulo central com 6 exports | D-03 |
| `apps/frontend/.env.example` | **CRIAR** — documentar 6 vars `NEXT_PUBLIC_EMPRESA_*` com valores BomCusto como defaults | D-02 |
| `apps/frontend/src/app/layout.tsx` | `generateMetadata()` dinâmico + `<style>` inline com `--cor-primaria` | FRONT-01, FRONT-04 |
| `apps/frontend/src/app/globals.css` | Substituir 5 ocorrências de `#0d6efd` por `var(--cor-primaria)` (linhas 37, 130, 133, 146, 190) | FRONT-04 |
| `apps/frontend/src/app/orcamento/page.tsx` | Logo URL, nome empresa, CNPJ, endereço, email — importar de `empresa.ts` | FRONT-02 |
| `apps/frontend/src/app/orcamento/novo/page.tsx` | Logo URL, nome empresa, CNPJ, endereço, email — importar de `empresa.ts` | FRONT-02 |
| `apps/frontend/src/app/orcamento/[id]/page.tsx` | Logo URL, CNPJ, endereço, email — importar de `empresa.ts` | FRONT-02 |
| `apps/frontend/src/app/contas-receber/page.tsx` | Logo URL — importar de `empresa.ts` | FRONT-02 |
| `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` | Logo URL — importar de `empresa.ts` | FRONT-02 |
| `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` | Logo URL, nome empresa — importar de `empresa.ts` | FRONT-03 |
| `apps/frontend/src/app/orcamento/[id]/status/page.tsx` | Logo URL, nome empresa — importar de `empresa.ts` | FRONT-03 |

**Fora do escopo desta fase:** `apps/frontend/src/app/page.tsx` (login/home) e `apps/frontend/src/app/status/page.tsx` (kanban) — ambos têm referências ao logo mas não estão na lista dos 8 arquivos-alvo definidos em FRONT-02/FRONT-03. Não alterar a menos que o planejador decida expandir o escopo.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | nenhum | not applicable — shadcn não inicializado |
| third-party | nenhum | not applicable |

Bootstrap via CDN — já presente. Nenhum novo registry ou pacote adicionado nesta fase.

---

## Decisões do Pesquisador (Claude's Discretion)

Itens marcados como "Claude's Discretion" no CONTEXT.md, resolvidos neste spec:

| Item | Decisão |
|------|---------|
| Ordem das exports em `empresa.ts` | `NOME → CNPJ → ENDERECO → EMAIL → LOGO_URL → COR_PRIMARIA` |
| Seletores com `#0d6efd` a substituir | 5 seletores exatos nas linhas 37, 130, 133, 146, 190 do `globals.css` (confirmado via grep) |
| `alt` text do `<img>` logo | `{EMPRESA_NOME}` — descritivo e dinâmico, não string fixa |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
