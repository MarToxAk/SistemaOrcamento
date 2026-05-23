# UI Kit — BomCusto Quote Panel

Pixel-faithful click-through recreation of the main internal app
surface: the **Lista / Novo / Detalhe / Status** flow that Bom Custo
staff use from inside Chatwoot.

Open `index.html` to interact:
- Browse the quote list.
- Filter by status with the pill row.
- Click "Adicionar Orçamento" to open the new-quote form.
- Click "Detalhes" on a quote to see the detail screen.
- Use the status dropdown to advance a quote — toast confirms.
- Switch to "Produção" to see the public status board variant.

## Components

| File              | What it is                                                  |
|-------------------|-------------------------------------------------------------|
| `HeaderBand.jsx`  | Pastel-gradient header with logo + business identity         |
| `StatusPill.jsx`  | The 7 canonical status pills (and inline pedido/payment badges) |
| `QuoteTable.jsx`  | List/table of quotes — with paid-row stripe and action column |
| `QuoteForm.jsx`   | Quote creation form (client + items + carimbos)              |
| `StatusBoard.jsx` | Customer-facing production board (`/status`)                 |
| `index.html`      | Click-through prototype tying it all together                |

## Design fidelity notes

- All visual tokens come from `../../colors_and_type.css`.
- Iconography is **Bootstrap Icons 1.11.1** loaded from CDN.
- No webfont is loaded — `var(--font-ui)` falls back through Inter →
  Segoe UI → system.
- This is a UI recreation, not the production app: data is mocked,
  form submission goes through a fake handler, and Chatwoot validation
  is bypassed. The visual surface matches `apps/frontend/src/app/**`
  faithfully.
