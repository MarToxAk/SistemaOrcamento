# Phase 15: Corrigir encoding NFS-e e proxy API

**Milestone:** v1.5
**Status:** Not started
**Requirements:** NFSFIX-01, NFSFIX-02

## Goal
Corrigir dois bugs técnicos silenciosos que comprometem a emissão de NFS-e:
1. Mojibake nas descrições de serviço em `nfse.service.ts` (UTF-8 interpretado como Latin-1)
2. Proxy Next.js `/api/quotes/[id]/nfse` que ignora o body do POST, fazendo campos de desconto nunca chegarem ao backend

## Files to Change
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — corrigir constante SERVICOS (linhas 44-47)
- `apps/frontend/src/app/api/quotes/[id]/nfse/route.ts` — corrigir POST handler para ler e repassar body

## Bugs

### Bug 1 — Mojibake em SERVICOS
```
Atual:    "ConfecÃ§Ã£o de carimbos, banners, placas e sinalizaÃ§Ã£o"
Correto:  "Confecção de carimbos, banners, placas e sinalização"

Atual:    "GravaÃ§Ã£o de objetos e joias"
Correto:  "Gravação de objetos e joias"

Atual:    "ComposiÃ§Ã£o grÃ¡fica e confecÃ§Ã£o de matrizes"
Correto:  "Composição gráfica e confecção de matrizes"

Atual:    "EncadernaÃ§Ã£o e acabamento"
Correto:  "Encadernação e acabamento"
```

### Bug 2 — Proxy sem body
```typescript
// Atual (route.ts POST handler):
const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, { method: "POST" });
// body do request não é lido nem repassado

// Correto:
const bodyText = await _req.text();
const res = await backendFetch(`/quotes/${encodeURIComponent(id)}/nfse`, {
  method: "POST",
  body: bodyText,
  headers: { "Content-Type": "application/json" },
});
```

## Dependencies
- Phase 16 depende desta fase (proxy precisa repassar body antes de adicionar campos de desconto no frontend)
