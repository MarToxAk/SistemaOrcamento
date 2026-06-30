# Phase 16: UI de desconto no modal NFS-e

**Milestone:** v1.5
**Status:** Not started
**Requirements:** NFSFIX-03
**Depends on:** Phase 15 (proxy body fix)

## Goal
Adicionar ao modal de emissão NFS-e um switch "Aplicar desconto" e três campos bidirecionais que se atualizam automaticamente ao digitar em qualquer um deles.

## Fields to Add

### State variables (page.tsx)
```typescript
const [nfseDescontoAtivo, setNfseDescontoAtivo] = useState(false);
const [nfseDescontoPercent, setNfseDescontoPercent] = useState("");
const [nfseDescontoValor, setNfseDescontoValor] = useState("");
const [nfseValorTotal, setNfseValorTotal] = useState("");
```

### Sync logic
- Base = `quote.totais?.valor ?? 0`
- Ao editar % → R$ = base * % / 100; Total = base - R$
- Ao editar R$ → % = R$ / base * 100; Total = base - R$
- Ao editar Total → R$ = base - Total; % = R$ / base * 100

### handleEmitirNfse additions
```typescript
if (nfseDescontoAtivo) {
  body.descontoAtivo = "true";
  body.descontoPorcentagem = nfseDescontoPercent;
  body.descontoValor = nfseDescontoValor;
}
```

## UI Structure (modal addition)
```
[Switch] Aplicar desconto
  ─── (visible when active) ──────────────────
  % desconto:    [_____]%
  R$ desconto:   R$ [_____]
  Valor total:   R$ [_____]
  ─────────────────────────────────────────────
```

## Files to Change
- `apps/frontend/src/app/orcamento/[id]/page.tsx`
  - Adicionar state vars de desconto (após linha 125)
  - Adicionar sync handlers (nova função `syncDesconto(field, value)`)
  - Atualizar `handleEmitirNfse()` para incluir campos de desconto no body
  - Atualizar modal JSX (após campos de endereço) para mostrar switch + campos

## Notes
- O backend já aceita esses campos (implementado na fase 14)
- Proxy já vai repassar o body após a fase 15
- Não alterar lógica de cálculo do backend
