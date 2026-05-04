# Requirements: Sistema de Orcamento BomCusto

**Defined:** 2026-05-04
**Core Value:** Orcamentos criados, aprovados e cobrados sem intervencao manual.

---

**Previous milestones:** see .planning/milestones/v1.4-REQUIREMENTS.md (v1.4 - 16/16 complete)

---

## v1.5 Requirements

### NFSFIX-01 — Corrigir encoding das descrições de serviço NFS-e
**Priority:** High
**Scope:** Backend
**Description:** As descrições de serviço na constante `SERVICOS` em `nfse.service.ts` estão com mojibake (UTF-8 interpretado como Latin-1). Corrigir para texto correto em UTF-8.
**Acceptance:**
- `"Confecção de carimbos, banners, placas e sinalização"` (não `"ConfecÃ§Ã£o..."`)
- `"Gravação de objetos e joias"` (não `"GravaÃ§Ã£o..."`)
- `"Composição gráfica e confecção de matrizes"` (não `"ComposiÃ§Ã£o grÃ¡fica..."`)
- `"Encadernação e acabamento"` (não `"EncadernaÃ§Ã£o..."`)
- Arquivo salvo como UTF-8 sem BOM

### NFSFIX-02 — Corrigir proxy API NFS-e para repassar body do POST
**Priority:** High
**Scope:** Frontend (route.ts)
**Description:** A rota `/api/quotes/[id]/nfse/route.ts` no Next.js faz chamada POST ao backend sem repassar o body recebido do cliente. Corrigir para ler e repassar o JSON.
**Acceptance:**
- POST para `/api/quotes/[id]/nfse` lê o body da request
- Body é repassado integralmente ao backend via `backendFetch`
- Campos como `descontoAtivo`, `descontoPorcentagem`, `descontoValor` chegam ao backend

### NFSFIX-03 — UI de desconto no modal de emissão NFS-e
**Priority:** High
**Scope:** Frontend (page.tsx)
**Description:** O modal de emissão NFS-e não tem campos para desconto. Adicionar switch "Aplicar desconto" e três campos bidirecionais sincronizados.
**Acceptance:**
- Switch `descontoAtivo` habilita/desabilita a seção de desconto
- Campo "% desconto" — ao preencher, recalcula R$ desconto e Valor total automaticamente
- Campo "R$ desconto" — ao preencher, recalcula % desconto e Valor total automaticamente
- Campo "Valor total" — ao preencher, recalcula R$ desconto e % desconto automaticamente
- Valor total base vem do `quote.totais.valor` (valor original do orçamento)
- `handleEmitirNfse()` inclui `descontoAtivo`, `descontoPorcentagem`, `descontoValor` no body enviado à API
- Campos de desconto só são enviados se `descontoAtivo` for true

---

## Backlog

- POLL-01: Reconciliacao periodica em background
- POLL-02: Dashboard de divergencia status Athos
