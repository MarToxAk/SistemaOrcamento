# Bom Custo Design System

Design system for **BomCusto Orçamento** — the internal quote-management
platform of **Bom Custo Papelaria & Gráfica Rápida LTDA**, a stationery
and rapid-printing shop in Ilhabela, SP, Brazil.

The product digitises the full quote lifecycle for printed goods
(carimbos, gravações, brindes — rubber stamps, engravings, branded
gifts): creation → approval → PDF → NFS-e (municipal service invoice)
→ PIX billing.

> **Business**: Bom Custo Papelaria & Gráfica Rápida LTDA
> **Address**: Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê — Ilhabela / SP, CEP 11633-078
> **CNPJ**: 62.391.927/0001-57
> **Email**: orcamento@bomcustoilhabela.com.br

---

## Products in this system

The codebase ships **two distinct UI surfaces** that share the same
visual language:

1. **Internal Quote Panel** (`/orcamento`, `/orcamento/novo`, `/orcamento/[id]`)
   — embedded inside the **Chatwoot CRM** as an iframe app. Used by
   the shop staff to list, create, edit, send and update quotes from
   inside a customer conversation.
2. **Public Production Status** (`/status`) — a customer-facing
   tracking board showing approved → in production → ready quotes.
   This page also receives real-time PIX/cash payment confirmations
   through Server-Sent Events.

Both surfaces are Next.js 14 (App Router) pages styled with
**Bootstrap 5.3.2** + **bootstrap-icons 1.11.1**, a heavy reliance on
a signature **5-stop pastel rainbow gradient** for the page header,
and Brazilian Portuguese throughout.

## Sources used to build this system

- GitHub repo (input): **https://github.com/MarToxAk/SistemaOrcamento** — the full Next.js + NestJS monorepo. Read this for deeper component code, backend services, integration details, and any future component additions.
- Local codebase mounted as `SistemaOrcamento/` during system creation.
- Logo asset extracted from `apps/frontend/public/media/logo_new.svg`.
- No Figma file was provided; visual rules were reverse-engineered from
  inline styles, `globals.css`, and `docs/INSTRUCOES_DESIGN.md`.

Anyone iterating on this design system should pull the latest from the
GitHub repo to verify recent component changes, particularly around
new screens, the NFS-e modal flow, and the Chatwoot bridge logic.

---

## Content fundamentals

The product is internal-facing and Brazilian — language is **Portuguese
(pt-BR)**, formal but not stiff, second-person plural implicit (no `tu`).

**Language and tone**
- **Direct, transactional, no marketing fluff.** Labels name the
  thing: "Adicionar Orçamento", "Carregar", "Enviar Link", "Detalhes",
  "Alterar status".
- **Imperative for actions** ("Carregar", "Salvar", "Cancelar") —
  matches Brazilian business-software convention.
- **Honorifics avoided.** No "Olá", no "Bem-vindo" — staff are
  in-and-out of this UI all day, every greeting would grate. The home
  screen literally just says "Lista de Orçamentos" with a one-line
  subtitle.
- **Subtitles explain the screen, not the feature.** Example:
  "Consulte, filtre e acompanhe seus orçamentos em tempo real."
- **Error copy is plain and apologetic, not technical.**
  "Não foi possível carregar os orçamentos." / "Falha ao gerar PDF."
- **Confirmation copy is matter-of-fact.** "Pagamento do Pedido #1234
  confirmado no caixa." — no exclamation tower, no celebratory emoji.
  (The status page does sneak in a single `✅` for cashier payments —
  that's the only place emoji appears anywhere in the product.)
- **Spelling**: full Brazilian accents preserved (`Orçamento`, `Não`,
  `Endereço`, `Validação`). Older files have plain-ASCII fallbacks
  ("Orcamento") in some places — treat that as legacy; always write
  accented form for new copy.

**Domain vocabulary** (use these terms verbatim — they're industry-standard for the shop)
- **Orçamento** — quote
- **Pedido** — order (post-approval)
- **Carimbo** — rubber stamp (one of the core products)
- **NFS-e** — Nota Fiscal de Serviço Eletrônica (municipal e-invoice)
- **PIX** — Brazilian instant-payment system
- **Vendedor** — salesperson
- **Validade** — quote expiry
- **Prazo de Entrega** — delivery deadline
- **Cliente** — customer

**Status labels** (these are the canonical seven — capitalised in UI as shown)
`Pendente`, `Enviado`, `Aprovado`, `Em Produção`, `Pronto p/ Entrega`,
`Entregue`, `Cancelado`, `Recusado`. Each maps to a status color (see
ColorStatusBadges card).

**Numbers and money**
- Currency formatted with `pt-BR` locale, BRL style:
  `(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`
  → `R$ 1.234,56` (comma decimal, period thousands).
- Dates formatted `pt-BR`: `12/05/2026` for dates, `12/05/2026, 14:32:08` for datetimes.
- Phone numbers normalised to `(12) 99648-4918` format.
- Quote numbers prefixed `#` in pedido contexts.

**Casing**
- Buttons / nav: Title Case Per Word ("Adicionar Orçamento", not "Adicionar orçamento").
- Status pills: Title Case ("Em Produção", "Pronto p/ Entrega").
- Form labels: Title Case ("Nome do Cliente", "Prazo de Entrega").
- Body / helper text: sentence case.

**Emoji & symbols**
- Emoji is **almost never used**. One exception: the realtime payment
  toast on `/status` prefixes the message with `✅`. Anywhere else,
  use a `bi-*` bootstrap-icons glyph (see ICONOGRAPHY).
- Required-field marker is a red asterisk: `<span class="text-danger">*</span>`.

---

## Visual foundations

The system has a clear, consistent visual identity, but it lives at the
intersection of two design eras — both still present in the live code:

| Era                | Where                          | Vibe                                                       |
|--------------------|--------------------------------|------------------------------------------------------------|
| **Current**        | `/orcamento`, `/orcamento/novo`, `/orcamento/[id]`, `/status` | Bootstrap 5 + pastel-rainbow header band + warm cream body, B2B utilitarian |
| **Legacy "casual"** | `globals.css` `.shell` / `.hero` rules | Paper-cream + terracotta + teal earthy palette, more "designed", used as fallback shell |

**Rule of thumb**: build new things in the **current** style. Use the
legacy palette only when matching an existing surface that uses it.

### Colors

**Brand pigments** (from the logo) — `#FAED23` yellow, `#EE3537` red,
`#14A958` / `#0F7949` greens. These almost never appear as page chrome;
they live inside the logo mark and inform the warm cream-and-paper
mood of the body background.

**Page background**: `#f9f7ed` (warm cream, applied directly to `body`).
Not pure white — the cream is deliberate and ties to the printed-paper
business.

**Surface**: white (`#ffffff`) with `box-shadow: 0 2px 8px rgba(0,0,0,0.06)`
on `.orcamento-section` blocks.

**Hero / header gradient** — the single most recognisable surface:
```
linear-gradient(135deg,
  #c5f2e8  0%,   /* mint   */
  #cbe1f9 25%,   /* sky    */
  #e7d8f9 50%,   /* lavender */
  #f9e7f5 75%,   /* pink   */
  #f0cacb 100%   /* peach  */
)
```
Applied to the page-header band on every internal screen. It softens
the otherwise plain Bootstrap layout and gives the product its mood.

**Primary action**: Bootstrap blue `#0d6efd` (`.btn-primary` /
`.btn-accent`). Hover deepens to `#084298`.

**Secondary CTA** ("Adicionar Orçamento" on `/orcamento`): sage
`#7dc8aa` (hover `#6ab594`). This is the only place in the app where
a non-Bootstrap accent appears, and it's used for the highest-value
action on the list screen.

**Status colors** — see the ColorStatusBadges card. Each status pill is
a soft pastel-bg with a saturated fg, intentionally low-contrast so a
densely populated list reads calmly.

### Type
- Family: `"Inter", "Segoe UI", system-ui, sans-serif`. **No webfont is loaded** — the app relies on the OS UI font. Inter is the design intent if a real font ever ships.
- Headlines are heavy (`font-weight: 800` on `h1`, 700 elsewhere) with letter-spacing `0.01em`.
- Subtitles use `--ink-soft` (`#5b6772`) at 0.85 opacity for the home shell, regular for embedded headers.
- Tables run at `1.15–1.18rem` — bigger than typical web defaults; this is a staff-facing tool, density loses to legibility.
- Required-field labels include a literal red asterisk character.

### Spacing
- Vertical rhythm is rooted in `1rem` (16px) increments.
- The header band uses `padding: 0.75rem 1rem` on mobile, scaling to `1rem`+ at desktop.
- Form fields use Bootstrap's default `.form-control` padding.
- Section cards: `padding: 1rem` (compact) up to `2.2rem 2rem` (legacy hero card).
- Stack gap on form rows: `1.2rem`.

### Backgrounds, gradients, imagery
- **No hero photography** anywhere in the product.
- **No hand-drawn illustrations** anywhere in the product.
- **Two gradient systems coexist**:
  1. The pastel rainbow header (current).
  2. Two radial blobs over warm cream from `globals.css`:
     ```
     radial-gradient(circle at 80% 20%, #f9c384 0%, transparent 25%),
     radial-gradient(circle at 15% 80%, #94d9cb 0%, transparent 20%),
     #f3ede1
     ```
     — legacy, only on screens that still use the `.page` shell.
- **No repeating patterns or textures.** The brand pigment yellow disc lives only on the logo.

### Borders, corners, shadows
- **Border radius**: 6px (badges, small buttons) → 8px (buttons, inputs, header band) → 10px (alerts, large inputs) → 14px (legacy cards) → 18px (legacy hero/shell). The pattern is "the bigger the surface, the rounder the corner".
- **Borders**: hairlines at `#ececec` (Bootstrap-aligned) on tables, warm border `#d7ccb7` on legacy inputs.
- **Shadows**: only two real elevations.
  - `0 2px 8px rgba(0,0,0,0.06)` on every section card.
  - `0 8px 32px rgba(31,31,31,0.08)` for modals and the legacy hero card.
- **No inner shadows** anywhere. No multi-layered shadow stacks.
- No "protection gradients" — pages don't overlay copy on imagery.

### Animation & motion
- **Almost none.** The app is utilitarian.
- `transition: border 0.2s` on focused inputs (border darkens to `#0d6efd`).
- `transition: background 0.2s` on primary buttons (no transform).
- Loading states use Bootstrap's `.spinner-border` (no custom motion).
- **No fades, no bouncing easings, no scale tweens.** A toast slides in
  via Bootstrap's default; that's the most motion you'll see.

### States
- **Hover**:
  - Primary button: background darkens (`#0d6efd → #084298`).
  - Sage CTA: `#7dc8aa → #6ab594`.
  - Links: underline appears + accent color.
- **Focus**: input border switches to `#0d6efd`, no glow.
- **Press**: relies on browser default. **No shrink / scale on press.**
- **Disabled**: `opacity: 0.7`.
- **Row state**: paid rows get a `#effaf3` (`--success-soft-bg`) stripe.
- **Highlighted row** (status just changed): brief yellow tint for ~3s on `/status`.

### Layout rules
- Single column on mobile, max-width container around `1100px–1200px` on desktop.
- Header band is full-width inside the container, rounded top corners only (`border-radius: 8px 8px 0 0`).
- Body section sits directly underneath, rounded bottom corners. Together they read as one card with a tinted top stripe.
- No sticky headers, no sidebar nav — pages stand alone (the host app is Chatwoot, which provides surrounding chrome).
- Toast container fixed to bottom-right: `position-fixed bottom-0 end-0 p-3`, `z-index: 1100`.

### Transparency & blur
- **None.** No backdrop-blur, no glassmorphism, no alpha-over-image cards.
- Modal scrim uses opaque `rgba(0,0,0,0.3)`.

### Imagery vibe (for placeholders)
- Warm, paper-toned, neutral. Cream, kraft, terracotta, sage, soft sky.
- Cool tech-blue is reserved for actions and links, not imagery.
- No grain, no duotones — if a brand image is ever added, it should be photographic and product-focused (a finished stamp, a printed page) and rendered untreated.

---

## Iconography

The product uses **Bootstrap Icons** (`bootstrap-icons@1.11.1`) loaded
from CDN on every screen that needs glyphs:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
```

Icons are rendered as `<i class="bi bi-XXX">` glyphs. The set is
**monoline, ~16px, regular weight** — no fills, no duotones, no
animation. Used inline in buttons (`<i class="bi bi-eye"></i>`),
in alerts (`<i class="bi bi-exclamation-triangle-fill">`), and as
status decorations (`<i class="bi bi-check-circle me-1" />`,
`<i class="bi bi-hourglass-split me-1" />`).

Common icons in active use:
- `bi-eye` — view detail
- `bi-search` — load / lookup
- `bi-plus-circle` — add quote
- `bi-send` — send approval link
- `bi-check-circle` — approved, confirmed
- `bi-hourglass-split` — awaiting approval
- `bi-exclamation-triangle-fill` — error/warning
- `bi-x-lg`, `bi-trash`, `bi-pencil` — destructive/edit actions in forms

**Do not invent SVG icons.** Always pick a `bi-*` glyph. If the
bootstrap-icons catalog truly lacks a needed icon, document a
substitution and link from CDN (Lucide / Heroicons as closest stylistic
matches — same monoline weight).

**Logo system** — four official variants now live in `assets/`. Use the
**primary** as the default; pick a variant only when the surface demands it.

| File                      | Use                                                                |
|---------------------------|--------------------------------------------------------------------|
| `logo-primary.png`        | **Default.** Full mark on light. Yellow disc + red "Bom Custo" wordmark with green palm tree + curved green `PAPELARIA & IMPRESSÕES` tagline. |
| `logo-wordmark.svg`       | No tagline. Use when the mark is small (favicons, app shortcuts, garment prints) or when the tagline would be illegible. |
| `logo-white.png`          | Dark-background variant. Tagline rendered in white instead of green. |
| `logo-mono.svg`           | Single-color black & white version for one-color print, embossing, fax-safe contexts, watermarking. |
| `logo-legacy-app.svg`     | **Reference only.** The mark that the production Next.js app (`/media/logo_new.svg`) currently ships. It's an older variant and should eventually be replaced with `logo-primary.png` (or a true SVG export of the new primary). |

**Placement rules**
- Always on a **white tile** (`background:#fff; border-radius:8–10px;
  padding:6–10px`) when sitting against the cream page background or
  the pastel gradient — the yellow disc fights with both otherwise.
- Keep the bounding box close to **1:1**; the new primary is a square
  composition (palm rises above the disc — let it breathe).
- Never recolor the marks, never strip the palm, never separate the
  wordmark from the disc. The palm + disc + wordmark are one shape.
- Minimum size: ~64×64px for the primary (the tagline becomes
  illegible smaller — drop to `logo-wordmark.svg` for tighter spots).

**Emoji** is not part of the icon language. The single `✅` on the
realtime payment toast is a tolerated exception, not a precedent.

---

## Repository layout

```
/
├── README.md                   ← this file
├── SKILL.md                    ← Claude Code skill manifest
├── colors_and_type.css         ← all design tokens (CSS custom properties)
├── assets/                     ← logos, source CSS reference
│   ├── logo-primary.png        ← default brand mark (full, with tagline)
│   ├── logo-wordmark.svg       ← no tagline / t-shirt variant
│   ├── logo-white.png          ← dark-background variant
│   ├── logo-mono.svg           ← single-color black & white
│   ├── logo-legacy-app.svg     ← what the production app currently ships (older)
│   └── source-globals.css      ← the original frontend globals.css for reference
├── preview/                    ← design-system swatch & specimen cards
│   ├── colors-brand.html
│   ├── colors-surface.html
│   ├── colors-status.html
│   ├── colors-gradient.html
│   ├── type-scale.html
│   ├── type-stack.html
│   ├── spacing-radius.html
│   ├── shadow-elevation.html
│   ├── buttons.html
│   ├── inputs.html
│   ├── badges-status.html
│   ├── alerts.html
│   ├── table.html
│   ├── header-band.html
│   ├── logo-card.html
│   └── iconography.html
└── ui_kits/
    └── bomcusto_quote_panel/
        ├── README.md
        ├── index.html          ← interactive click-through prototype
        ├── HeaderBand.jsx
        ├── QuoteTable.jsx
        ├── StatusPill.jsx
        ├── QuoteForm.jsx
        └── StatusBoard.jsx
```

## Index — what's in this folder

| Path                                      | What                                                      |
|-------------------------------------------|-----------------------------------------------------------|
| `README.md`                               | This document — full content + visual + icon spec         |
| `SKILL.md`                                | Claude Code skill manifest (`bom-custo-design`)           |
| `colors_and_type.css`                     | Every design token as CSS custom properties               |
| `Layout v2.html`                          | Repaginated dashboard prototype (sidebar + 4 views, 3 theme presets, full Tweaks). **Default theme: Painel.** |
| `Orcamento PDF.html`                      | A4 print-ready quote PDF preview with colorful pencil borders, full Tweaks (logo size, strip height, colors). |
| `Orcamento PDF v1.html`                   | Earlier minimalist (no-pencil) variant of the PDF — kept for reference. |
| `backend/quotes-pdf.template.ts`          | Handlebars version of the new PDF, drop-in replacement for `apps/backend/src/quotes/quotes-pdf.template.ts`. |
| `assets/logo-primary.png`                 | Default logo (2000×1574 PNG, full mark with palm + tagline) |
| `assets/logo-wordmark.svg`                | Vector wordmark (no tagline)                              |
| `assets/logo-white.png`                   | Dark-background variant                                    |
| `assets/logo-mono.svg`                    | Single-color black & white                                |
| `assets/logo-legacy-app.svg`              | Old logo currently shipped by the production app          |
| `assets/pencils-top.png` / `pencils-bottom.png` | Rainbow colored-pencil decorative strips for the PDF. |
| `assets/source-globals.css`               | Verbatim copy of the original frontend globals.css for reference |
| `preview/*.html`                          | 16 design-system specimen cards (Type / Colors / Spacing / Components / Brand) |
| `ui_kits/bomcusto_quote_panel/`           | Click-through prototype of the staff quote panel + 5 JSX components (older, pre-repaginate version) |
| `layout-v2/`                              | Source JSX + CSS for `Layout v2.html` and the PDF Tweaks panel |

## Iterating on this system

The most reliable next step is to pull the latest from the source
GitHub repo: <https://github.com/MarToxAk/SistemaOrcamento>. Look at
`apps/frontend/src/app/**` for the canonical implementations of every
screen documented here; this design system codifies what's already in
production code.
