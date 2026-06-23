---
phase: 35-backend-white-label
plan: "02"
subsystem: backend/pdf-template
tags: [pdf, handlebars, white-label, docker, template]
status: complete

dependency_graph:
  requires:
    - 35-01 (env vars EMPRESA_* definidas em app.module.ts)
  provides:
    - apps/backend/templates/quote-default.hbs (template PDF externo com variáveis de empresa)
    - apps/backend/Dockerfile (COPY templates/ para runtime)
  affects:
    - 35-03 (renderHtml() lerá este .hbs; EMPRESA_PDF_TEMPLATE_PATH usa o mesmo diretório)

tech_stack:
  added: []
  patterns:
    - Handlebars template externo (.hbs) extraído de string TypeScript inline
    - CSS custom property --primary injetada via variável Handlebars
    - Bloco condicional {{#if empresaLogoUrl}} para logo sem fallback de URL externa
    - COPY --from=build no stage runtime do Dockerfile (mesmo padrão de scripts/ e prisma/)

key_files:
  created:
    - apps/backend/templates/quote-default.hbs
  modified:
    - apps/backend/Dockerfile

decisions:
  - "D-08: Logo condicional {{#if empresaLogoUrl}} sem fallback de URL externa — sem empresaLogoUrl nenhuma tag img é renderizada (evita imagem quebrada)"
  - "D-09: CSS custom property --primary: {{empresaCor}} no :root; var(--primary) em elementos de branding (band de orçamento, idx de itens, section-label default)"
  - "D-10: Bloco {{! ... }} de documentação no topo listando todas as variáveis de empresa e orçamento"
  - "Open Question 1 (RESEARCH) resolvida como escopo mínimo: telefone/email/Instagram BomCusto mantidos como texto estático no template padrão — customização via EMPRESA_PDF_TEMPLATE_PATH (Plano 03)"

metrics:
  duration: "~8 minutos"
  completed: "2026-06-19T12:06:40Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 35 Plan 02: Extração do Template PDF para .hbs Summary

Template PDF Handlebars extraído da string TypeScript inline para arquivo externo `quote-default.hbs` com variáveis de empresa substituindo hardcodes BomCusto e CSS custom property `--primary` para theming via env var.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extrair template para quote-default.hbs com variáveis de empresa e documentação | 1a326cf | apps/backend/templates/quote-default.hbs (criado, 299 linhas) |
| 2 | Adicionar COPY de templates/ ao stage runtime do Dockerfile | 73ff3cb | apps/backend/Dockerfile |

## What Was Built

### Task 1 — Template PDF externo `quote-default.hbs`

Arquivo `apps/backend/templates/quote-default.hbs` criado com o conteúdo integral extraído de `quotes-pdf.template.ts`. Substituições aplicadas:

- **Logo** (linha 147): `<img src="...hardcoded...">` → `{{#if empresaLogoUrl}}<img src="{{empresaLogoUrl}}" ... alt="{{empresaNome}}">{{/if}}` (D-08: sem fallback externo)
- **Nome** (linha 151): `Bom Custo Papelaria & Gráfica Rápida LTDA` → `{{empresaNome}}`
- **CNPJ** (linha 152): `62.391.927/0001-57` → `{{empresaCnpj}}`
- **Endereço** (linha 155): texto fixo → `{{empresaEndereco}}`
- **Assinatura** (linha 276): `equipe Bom Custo.` → `equipe {{empresaNome}}.`
- **CSS :root** (início do bloco): `--primary: {{empresaCor}};` adicionado; `--brand-red` passa a usar `var(--primary)`; band de orçamento (`doc-header__id`), badge de índice de item (`td.idx span`) e `section-label h2::before` passam a usar `var(--primary)`
- **Bloco `{{! ... }}`** no topo: documenta todas as variáveis de empresa (empresaNome/Cnpj/Endereco/LogoUrl/Cor) e de orçamento (idorcamento, dataorcamento, cliente, itens[], carimbos[], totais, pencilsTopUrl/Bottom)
- **Contato BomCusto** (linhas 156-161): mantido como texto estático (escopo mínimo conforme Open Question 1 do RESEARCH)
- **Título da página** `<title>`: usa `{{empresaNome}}` em vez de "Bom Custo"

### Task 2 — Dockerfile

Linha inserida no stage `runtime` imediatamente após `COPY --from=build /app/apps/backend/scripts`:

```dockerfile
COPY --from=build /app/apps/backend/templates ./apps/backend/templates
```

Garante que `quote-default.hbs` exista em `/app/apps/backend/templates/quote-default.hbs` na imagem runtime — path que `path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs")` resolve no container com `WORKDIR /app`.

## Verification Results

**Task 1 — Script de verificação do plano:**
```
node -e "...must=['{{empresaNome}}','{{empresaCnpj}}','{{empresaEndereco}}','{{#if empresaLogoUrl}}','--primary: {{empresaCor}}']..."
→ OK
```

**Task 1 — Critérios adicionais:**
- Linhas: 300 (> 100 ✓)
- `{{empresaNome}}`: presente ✓
- `{{empresaCnpj}}`: presente ✓
- `{{empresaEndereco}}`: presente ✓
- `{{#if empresaLogoUrl}}`: presente ✓
- `--primary: {{empresaCor}}`: presente ✓
- `var(--primary)`: presente ✓
- Bloco `{{!`: presente ✓
- `Atenciosamente, equipe {{empresaNome}}.`: presente ✓
- `Bom Custo Papelaria` no HTML funcional: ausente ✓
- CNPJ `62.391.927` no HTML funcional: ausente ✓

**Task 2 — Script de verificação do plano:**
```
node -e "...COPY --from=build /app/apps/backend/templates..."
→ OK
```

**Linha COPY na posição correta (após scripts, linha 36):** ✓

## Deviations from Plan

### Auto-ajustes menores

**1. [Rule 1 - Bug preemptivo] Exemplos do bloco {{! ... }} sem referências BomCusto hardcoded**
- **Encontrado durante:** Task 1 — verificação automatizada
- **Problema:** O script de verificação do plano usa regex `/Bom Custo Papelaria/` que detecta qualquer ocorrência, incluindo o bloco de documentação `{{! ... }}`
- **Fix:** Substituir exemplos no bloco de documentação por valores genéricos (`"Minha Empresa Grafica & Papelaria LTDA"`, `"00.000.000/0001-00"`, `"Rua Principal, 100..."`) — mais úteis como exemplos de referência para qualquer empresa que customize o template
- **Arquivos:** `apps/backend/templates/quote-default.hbs` (linhas 6-8 do bloco de documentação)
- **Commit:** 1a326cf

**2. [Decisão de implementação] Título da página `<title>` também dehardcodado**
- **Encontrado durante:** Task 1 — ao extrair o conteúdo integral do template
- **Ação:** `<title>Orçamento Nº {{idorcamento}} — Bom Custo</title>` → `<title>Orçamento Nº {{idorcamento}} — {{empresaNome}}</title>`
- **Justificativa:** Consistência com o objetivo de white-label; o `<title>` aparece na aba do browser durante renderização Puppeteer
- **Arquivos:** `apps/backend/templates/quote-default.hbs` (linha 30)
- **Commit:** 1a326cf

## Known Stubs

Nenhum. O template é um arquivo estático externo; não há dados dinâmicos sem fonte.

Contato BomCusto (telefone/email/Instagram) nas linhas 159-164 do .hbs são texto estático **intencional** — documentado como decisão de escopo mínimo (Open Question 1 do RESEARCH). O mecanismo de customização completa é `EMPRESA_PDF_TEMPLATE_PATH` (Plano 03).

## Threat Flags

Nenhuma nova superfície de segurança introduzida. O template é um artefato estático copiado no build da imagem; sem escrita em runtime. Threats T-35-02 e T-35-03 do plano cobrem o modelo de confiança.

## Self-Check: PASSED

- `apps/backend/templates/quote-default.hbs`: FOUND
- `apps/backend/Dockerfile` (linha COPY templates): FOUND
- Commit `1a326cf`: confirmado via `git log`
- Commit `73ff3cb`: confirmado via `git log`
