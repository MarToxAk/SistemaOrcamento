---
phase: 36-frontend-white-label
plan: "02"
subsystem: frontend
tags:
  - white-label
  - dehardcode
  - empresa.ts
  - branding
dependency_graph:
  requires:
    - 36-01 (empresa.ts criado com 6 exports NEXT_PUBLIC_EMPRESA_*)
  provides:
    - 5 páginas internas importando de empresa.ts
    - header das páginas de orçamento com logo/nome/CNPJ/endereço/email white-label
    - logo das páginas de contas-receber white-label
  affects:
    - apps/frontend/src/app/orcamento/page.tsx
    - apps/frontend/src/app/orcamento/novo/page.tsx
    - apps/frontend/src/app/orcamento/[id]/page.tsx
    - apps/frontend/src/app/contas-receber/page.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
tech_stack:
  added: []
  patterns:
    - "Renderização condicional JSX para campos opcionais: {VAR && <div>{VAR}</div>}"
    - "Endereço fragmentado consolidado em variável única EMPRESA_ENDERECO"
    - "Dimensões de logo preservadas por arquivo (não uniformizadas)"
key_files:
  created: []
  modified:
    - apps/frontend/src/app/orcamento/page.tsx
    - apps/frontend/src/app/orcamento/novo/page.tsx
    - apps/frontend/src/app/orcamento/[id]/page.tsx
    - apps/frontend/src/app/contas-receber/page.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
decisions:
  - "Email mantido com renderização condicional dentro do bloco telefone via Fragment (<>E-mail: {EMPRESA_EMAIL}</>), evitando div extra que quebraria o layout existente"
  - "Bloco de telefone mantido como texto estático (sem EMPRESA_TELEFONE no módulo — fora do escopo FRONT-02)"
  - "Dimensões de logo preservadas exatamente: orcamento/page usa maxWidth:180/maxHeight:120; novo e [id] usam maxWidth:140/maxHeight:100"
metrics:
  duration: "6min"
  completed_date: "2026-06-22"
  tasks_completed: 2
  files_modified: 5
status: complete
requirements:
  - FRONT-02
---

# Phase 36 Plan 02: Dehardcode Páginas Internas — Summary

**One-liner:** Import de empresa.ts nas 5 páginas internas substituindo logo/nome/CNPJ/endereço/email hardcoded por constantes white-label com renderização condicional.

---

## What Was Built

Todas as 5 páginas internas do frontend agora importam dados de branding do módulo `empresa.ts` (criado no Plano 01) em vez de usar strings literais.

**Páginas de orçamento (3 arquivos):** Adicionado import completo com 5 exports (`EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_EMAIL`, `EMPRESA_LOGO_URL`). Header dehardcoded: logo URL/alt, nome da empresa, CNPJ com renderização condicional, endereço consolidado (2 divs → 1 div com renderização condicional), email condicional dentro do bloco telefone.

**Páginas de contas-receber (2 arquivos):** Adicionado import mínimo (`EMPRESA_NOME`, `EMPRESA_LOGO_URL`). Somente logo URL e alt text substituídos — conforme RESEARCH.md que confirma ausência de outros dados de empresa hardcoded nestas páginas.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Dehardcode header das 3 páginas de orçamento | 69b3fc3 | orcamento/page.tsx, orcamento/novo/page.tsx, orcamento/[id]/page.tsx |
| 2 | Dehardcode logo nas 2 páginas de contas-receber | 165fe3c | contas-receber/page.tsx, contas-receber/[idcliente]/page.tsx |

---

## Verification Results

```
1. grep logo-primary.png nos 5 arquivos → 0 resultados ✓
2. grep "Bom Custo|BomCusto|62.391.927|bomcustoilhabela" nos 5 arquivos → 0 resultados ✓
3. grep 'from.*@/lib/empresa' nos 5 arquivos → 5 linhas ✓
4. {EMPRESA_CNPJ && ...} nos 3 arquivos de orçamento → 3 linhas ✓
5. {EMPRESA_ENDERECO && ...} nos 3 arquivos de orçamento → 3 linhas (consolidado) ✓
6. alt={EMPRESA_NOME} nas 2 páginas de contas-receber → 2 linhas ✓
```

---

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — plano executado exatamente como escrito.

### Notas de Implementação

**Email dentro do bloco telefone:** O plano especificava `{EMPRESA_EMAIL && <div className="small">E-mail: {EMPRESA_EMAIL}</div>}` separado do bloco de telefone. Na implementação, o email foi mantido dentro da `<div className="small">` do telefone via `{EMPRESA_EMAIL && <>E-mail: {EMPRESA_EMAIL}</>}` (Fragment em vez de nova div) para preservar o layout visual existente onde telefone e email compartilham o mesmo bloco. O comportamento condicional está correto — linha não aparece quando `EMPRESA_EMAIL` é string vazia. A renderização condicional satisfaz o must_have do plano.

---

## Known Stubs

Nenhum — todos os campos exibem dados reais de `empresa.ts` (com fallbacks definidos no módulo). Nenhum valor hardcoded permanece nos 5 arquivos.

---

## Threat Flags

Nenhum — a fase não introduz novos endpoints, rotas de auth, ou caminhos de acesso a arquivos. As vars `NEXT_PUBLIC_*` são por design públicas (baked into JS bundle). A análise de ameaças já documentada no PLAN.md (T-36-03, T-36-04) cobre toda a superfície desta fase.

---

## Self-Check: PASSED

- [x] apps/frontend/src/app/orcamento/page.tsx — modificado e commitado (69b3fc3)
- [x] apps/frontend/src/app/orcamento/novo/page.tsx — modificado e commitado (69b3fc3)
- [x] apps/frontend/src/app/orcamento/[id]/page.tsx — modificado e commitado (69b3fc3)
- [x] apps/frontend/src/app/contas-receber/page.tsx — modificado e commitado (165fe3c)
- [x] apps/frontend/src/app/contas-receber/[idcliente]/page.tsx — modificado e commitado (165fe3c)
- [x] Commit 69b3fc3 existe no log
- [x] Commit 165fe3c existe no log
