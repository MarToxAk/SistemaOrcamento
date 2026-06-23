---
status: complete
phase: 36-frontend-white-label
source: [36-01-SUMMARY.md, 36-02-SUMMARY.md, 36-03-SUMMARY.md]
started: 2026-06-22T00:00:00Z
updated: 2026-06-23T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Theming pela cor primária
expected: Abrir qualquer página do app (ex: lista de orçamentos). Os botões de ação e elementos de destaque devem aparecer na cor azul padrão #0d6efd (quando NEXT_PUBLIC_EMPRESA_COR_PRIMARIA não está definida). A cor deve vir de var(--cor-primaria) — testável inspecionando o CSS no DevTools (botões não devem ter #0d6efd literal no style inline, apenas via variável CSS).
result: pass

### 2. Título dinâmico da aba do navegador
expected: Abrir o app e observar a aba do navegador. O título deve vir de NEXT_PUBLIC_EMPRESA_NOME (ex: "BomCusto Orçamento" com o fallback padrão) — não deve ser um título hardcoded fixo. Trocar o valor da env var e rebuildar deve mudar o título.
result: pass

### 3. Header white-label nas páginas de orçamento (internas)
expected: Acessar a lista de orçamentos (/orcamento), a página de novo orçamento (/orcamento/novo) e um orçamento existente (/orcamento/[id]). O header de cada página deve exibir: logo da empresa (sem /media/logo-primary.png hardcoded), nome da empresa, CNPJ e endereço vindos das env vars. Nenhum valor "BomCusto" ou "62.391.927/0001-57" deve estar hardcoded no HTML fonte.
result: pass

### 4. Logo white-label nas páginas de contas-receber
expected: Acessar /contas-receber e /contas-receber/[idcliente]. O logo exibido deve vir de NEXT_PUBLIC_EMPRESA_LOGO_URL (não /media/logo-primary.png hardcoded). O atributo alt da imagem deve ser o nome da empresa (NEXT_PUBLIC_EMPRESA_NOME), não "BomCusto" fixo.
result: pass

### 5. Header white-label nas páginas públicas de orçamento
expected: Acessar a página de aprovação (/orcamento/[id]/approve) ou de status (/orcamento/[id]/status) de algum orçamento existente. O header deve mostrar o logo e o nome da empresa vindos das env vars. Nenhuma string "Bom Custo Papelaria & Gráfica Rápida" ou URL /media/logo-primary.png deve estar hardcoded no HTML.
result: pass

### 6. Renderização condicional — campos opcionais ausentes
expected: Nas páginas de orçamento internas, verificar que quando CNPJ e/ou endereço não estão definidos nas env vars (ou são string vazia), esses campos simplesmente não aparecem no header — sem div vazio, sem texto em branco, sem elemento fantasma ocupando espaço.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
