---
name: bom-custo-design
description: Use this skill to generate well-branded interfaces and assets for Bom Custo Papelaria & Gráfica Rápida (BomCusto Orçamento internal app), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, logos, UI kit components, a repaginated dashboard layout, and a production-ready PDF quote template.
user-invocable: true
---

Read the `README.md` file within this skill first — it documents content tone,
visual foundations, colors, type, iconography, and the file index.

## Brand essentials (memorise these)

- **Brand pigments** (from the logo): yellow `#FAED23`, red `#EE3537`,
  green `#14A958` / forest `#0F7949`.
- **Language**: Brazilian Portuguese, formal-but-transactional, Title Case
  on actions/labels. Currency in BRL via `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`.
- **Default theme**: "Painel" (Mulish font, teal accent `#0e6d73`, cool
  white surfaces, dark-ink sidebar active state).
- **Iconography**: Bootstrap Icons 1.11.1 via CDN. No emoji except `✅`
  on the realtime payment toast.
- **Logo placement**: always on a white tile with a small radius and
  padding — never on the raw cream background.

## What lives where

- `colors_and_type.css` — all design tokens as CSS custom properties.
  Always reference these variables, never hardcode brand pigments.
- `assets/logo-primary.png` — default brand mark (2000×1574, scales
  crisp at any size).
- `assets/logo-wordmark.svg` / `logo-white.png` / `logo-mono.svg` — variants.
- `assets/pencils-top.png` / `pencils-bottom.png` — colorful decorative
  strips used on the PDF quote (full-bleed top + bottom of A4).
- `Layout v2.html` — the canonical repaginated dashboard (Sidebar + Stats
  + compact data table + Kanban + Form + Detail). Production code should
  follow this layout's visual hierarchy. Source JSX lives in `layout-v2/`.
- `Orcamento PDF.html` — preview of the A4 print-ready quote PDF.
- `backend/quotes-pdf.template.ts` — drop-in Handlebars template that
  replaces `apps/backend/src/quotes/quotes-pdf.template.ts` in the
  BomCusto monorepo. Preserves every existing placeholder.
- `preview/*.html` — 16 specimen cards for the design system tab.
- `ui_kits/bomcusto_quote_panel/` — earlier UI kit (Bootstrap-based,
  pre-repaginate). Keep as reference; new work follows Layout v2.

## How to use this skill

If asked to **create a visual artifact** (slide deck, mock, throwaway prototype):
1. Copy the relevant assets out of `assets/` into your output folder.
2. Reference `colors_and_type.css` tokens (don't hardcode).
3. Default to the "Painel" theme unless asked otherwise.
4. Render real Bootstrap Icons via CDN — don't hand-roll SVG icons.

If asked to **work on production code** in the BomCusto repo
(`apps/frontend` / `apps/backend`):
1. For PDF changes: edit `backend/quotes-pdf.template.ts` here and copy
   it to `apps/backend/src/quotes/quotes-pdf.template.ts` in their repo.
   The pencil/logo asset URLs default to `https://autopyweb.com.br/...` —
   update if a different CDN is used.
2. For frontend layout changes: lift the visual structure from
   `Layout v2.html` (sidebar + topbar + stat cards + compact table) and
   the styling from `layout-v2/styles.css`. Port JSX to Next.js App
   Router pages, keeping existing `useEffect` blocks for Chatwoot/data
   fetching intact.
3. Replace `apps/frontend/public/media/logo_new.svg` with
   `assets/logo-primary.png` — the legacy SVG is older and less
   readable.

If invoked with no task, **ask first**:
- What do you want to build? (a new screen, a marketing piece, a flyer,
  a deck, a PDF template change, etc.)
- What's the audience? (internal staff / public customer)
- Any existing screen to reference?

Then act as an expert designer who outputs HTML artifacts OR production
code, depending on the need. For source-of-truth verification of any
visual decision, the upstream GitHub repo is
**https://github.com/MarToxAk/SistemaOrcamento**.
