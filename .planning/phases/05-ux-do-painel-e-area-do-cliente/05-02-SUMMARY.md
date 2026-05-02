# 05-02 SUMMARY — Bootstrap Form Validation

## What Was Built
- **`submitted` state** — `useState(false)`, set to `true` on first form submit
- **`checkValidity()`** guard — returns early if HTML5 validation fails before API call
- **Conditional `was-validated` class** — applied to `<form>` only after first submit attempt (avoids showing red borders on page load)
- **Asterisk spans** on 5 required fields: clienteNome, clienteTelefone, vendedor, validade, prazoEntrega
- **`<div className="invalid-feedback">`** messages for each required field
- **CSS rule** to suppress Bootstrap's green `:valid` borders — `border-color: #ced4da; background-image: none`

## Files Modified
- `apps/frontend/src/app/orcamento/novo/page.tsx`

## Decisions
- Used `event.currentTarget.checkValidity()` (not `reportValidity()`) to avoid conflicting with Bootstrap's own validation UI
- CSS suppression of green borders: common UX preference — no green checkmarks on untouched valid fields
