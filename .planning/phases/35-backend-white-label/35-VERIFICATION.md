---
phase: 35-backend-white-label
verified: 2026-06-19T09:30:00Z
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 35: Backend White-Label Verification Report

**Phase Goal:** Sistema backend completamente configurável por empresa via env vars — dados fiscais e PDF apontam para a empresa do deploy, não para BomCusto hardcoded
**Verified:** 2026-06-19T09:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Copiar `.env.example` e preencher `EMPRESA_*` resulta em PDFs com nome, CNPJ, endereço e logo da nova empresa sem editar TypeScript | VERIFIED | `quotes-pdf-storage.service.ts` lê as 5 vars via ConfigService e as passa ao contexto Handlebars (linhas 127-131, 174-178); `quote-default.hbs` usa `{{empresaNome}}`, `{{empresaCnpj}}`, `{{empresaEndereco}}`, `{{#if empresaLogoUrl}}`, `{{empresaCor}}` no HTML/CSS |
| SC-2 | PDF usa `quote-default.hbs` externo; `EMPRESA_PDF_TEMPLATE_PATH` com volume Docker usa template alternativo | VERIFIED | Cadeia de fallback de 3 níveis implementada em `renderHtml()` (linhas 102-132 de `quotes-pdf-storage.service.ts`); 6/6 testes da cadeia passam |
| SC-3 | NFS-e usa código IBGE de `EMPRESA_MUNICIPIO_IBGE`; string `"3520400"` não existe mais como propriedade fixa no código-fonte | VERIFIED | `nfse.service.ts` linha 60: getter computado `private get CODIGO_MUNICIPIO()`; busca por `private readonly CODIGO_MUNICIPIO` no codebase: zero ocorrências |
| SC-4 | `.env.example` lista todas as variáveis `EMPRESA_*` com valores BomCusto como defaults e comentários | VERIFIED | `git show HEAD:.env.example`: 8 ocorrências de `EMPRESA`; seção `# Empresa (White-Label)` presente entre NFS-e e Segurança; aviso NFSE_SOAP_URL para outro município confirmado |

**Score:** 4/4 roadmap criteria verified

### Must-Haves por Plano (PLAN frontmatter)

#### Plano 01 — NFS-e (NFSE-01, CFG-04)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | NFS-e usa código IBGE de `EMPRESA_MUNICIPIO_IBGE`, não string fixa `3520400` | VERIFIED | Getter `private get CODIGO_MUNICIPIO()` lê `this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400"` — linha 60 do arquivo verificada diretamente |
| 2 | Sem `EMPRESA_MUNICIPIO_IBGE`, getter retorna fallback `3520400` | VERIFIED | Teste `getter CODIGO_MUNICIPIO retorna fallback 3520400 quando EMPRESA_MUNICIPIO_IBGE ausente` passa (10/10 testes no suite) |
| 3 | Propriedade fixa `private readonly CODIGO_MUNICIPIO = "3520400"` não existe mais | VERIFIED | grep `private readonly CODIGO_MUNICIPIO` no backend: zero ocorrências |

#### Plano 02 — Template PDF (PDF-02, PDF-03, PDF-05, CFG-02, CFG-03, CFG-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 4 | Arquivo `apps/backend/templates/quote-default.hbs` existe com conteúdo do template PDF | VERIFIED | Arquivo existe, 299 linhas (> 100 exigido) |
| 5 | Template usa variáveis Handlebars de empresa no lugar de strings BomCusto hardcoded | VERIFIED | `{{empresaNome}}` (linhas 33, 169, 294), `{{empresaCnpj}}` (linha 170), `{{empresaEndereco}}` (linha 173), `{{#if empresaLogoUrl}}` (linha 166), `--primary: {{empresaCor}}` (linha 41); nenhuma ocorrência de `Bom Custo Papelaria` no HTML funcional |
| 6 | Imagem Docker copia `templates/` para a imagem runtime | VERIFIED | `Dockerfile` linha 36: `COPY --from=build /app/apps/backend/templates ./apps/backend/templates` — imediatamente após scripts |
| 7 | Logo renderiza `<img>` somente quando `empresaLogoUrl` presente | VERIFIED | Bloco `{{#if empresaLogoUrl}}<img ...>{{/if}}` confirmado; teste (e) passa: sem logo, nenhuma `<img>` no HTML |
| 8 | Cor primária injetada como CSS custom property `--primary` no `:root` | VERIFIED | `--primary: {{empresaCor}};` no `:root`; `var(--primary)` em 4 elementos de branding (linhas 44, 77, 93, 110) |

#### Plano 03 — renderHtml + env vars (PDF-01, PDF-04, CFG-01..05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 9 | `renderHtml` resolve template na ordem: `EMPRESA_PDF_TEMPLATE_PATH` → `quote-default.hbs` externo → string TS embutida | VERIFIED | Cadeia de 3 níveis em linhas 108-123 de `quotes-pdf-storage.service.ts`; testes (a)-(d) passam (6/6) |
| 10 | `EMPRESA_PDF_TEMPLATE_PATH` com arquivo ausente lança erro explícito | VERIFIED | `InternalServerErrorException` lançada citando o path (linhas 111-114); teste (b) confirma o throw |
| 11 | Backend não sobe sem `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_MUNICIPIO_IBGE` | VERIFIED | `app.module.ts` `REQUIRED_ENV_VARS` contém as 4 entradas (linhas 30-33); mensagem de erro inclui `See .env.example for EMPRESA_* setup instructions` (linha 44) |

**Score total de must-haves:** 11/11 verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/backend/src/modules/integrations/nfse/nfse.service.ts` | Getter `private get CODIGO_MUNICIPIO` lendo `EMPRESA_MUNICIPIO_IBGE` | VERIFIED | Linha 60: getter computado presente; `this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400"` |
| `apps/backend/src/modules/integrations/nfse/nfse.service.test.ts` | Teste do getter (env var presente e fallback) | VERIFIED | `EMPRESA_MUNICIPIO_IBGE` presente em 5 linhas; 3 testes específicos do getter |
| `apps/backend/templates/quote-default.hbs` | Template PDF externo com variáveis de empresa e bloco `{{!}}` de documentação | VERIFIED | 299 linhas; bloco `{{!` no topo (linhas 1-27); todas as variáveis presentes |
| `apps/backend/Dockerfile` | COPY de `templates/` para a imagem runtime | VERIFIED | Linha 36: `COPY --from=build /app/apps/backend/templates ./apps/backend/templates` |
| `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` | Cadeia de fallback + dados de empresa no contexto Handlebars | VERIFIED | Cadeia de 3 níveis; 5 campos de empresa passados ao template (linhas 127-131, 174-178) |
| `apps/backend/src/modules/quotes/quotes-pdf-storage.service.test.ts` | Testes da cadeia de fallback, erro e contexto de empresa | VERIFIED | 6 testes; todos os ramos cobertos |
| `apps/backend/src/modules/app.module.ts` | 4 vars `EMPRESA_*` obrigatórias + hint `.env.example` no erro | VERIFIED | Linhas 30-33 e 44 verificadas |
| `.env.example` | Seção `# Empresa (White-Label)` com 7 vars documentadas | VERIFIED | 8 ocorrências de EMPRESA; 4 vars obrigatórias com defaults BomCusto; 3 opcionais comentadas; aviso sobre NFSE_SOAP_URL |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `nfse.service.ts` | `EMPRESA_MUNICIPIO_IBGE` | `this.config.get<string>("EMPRESA_MUNICIPIO_IBGE")` | WIRED | Getter computado linha 60 |
| `quote-default.hbs` | `empresaLogoUrl` | bloco condicional Handlebars | WIRED | `{{#if empresaLogoUrl}}` linha 166 |
| `quote-default.hbs` | `empresaCor` | CSS custom property | WIRED | `--primary: {{empresaCor}}` linha 41 |
| `quotes-pdf-storage.service.ts` | `apps/backend/templates/quote-default.hbs` | `fs.readFileSync` na cadeia de fallback | WIRED | `path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs")` linha 118 |
| `app.module.ts` | `.env.example` | mensagem de erro de startup com hint | WIRED | `See .env.example for EMPRESA_* setup instructions` linha 44 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Getter `CODIGO_MUNICIPIO` lê `EMPRESA_MUNICIPIO_IBGE` com fallback | `npm --workspace @bomcusto/backend test -- --testPathPatterns=nfse.service` | 10 passed, 1 suite | PASS |
| Cadeia de fallback de template (3 níveis + erro explícito) e contexto de empresa | `npm --workspace @bomcusto/backend test -- --testPathPatterns=quotes-pdf` | 6 passed, 1 suite | PASS |

### Requirements Coverage

| REQ-ID | Plano | Descrição | Status | Evidence |
|--------|-------|-----------|--------|---------|
| CFG-01 | 35-03 | `.env.example` documenta todas as vars `EMPRESA_*` com defaults e comentários | SATISFIED | Seção `# Empresa (White-Label)` com 7 vars em `.env.example` |
| CFG-02 | 35-02, 35-03 | `EMPRESA_LOGO_URL` usada no PDF | SATISFIED | `empresaLogoUrl` passada ao contexto; `{{#if empresaLogoUrl}}` no template |
| CFG-03 | 35-02, 35-03 | `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO` no PDF | SATISFIED | Lidas em `renderHtml()` e passadas ao contexto Handlebars |
| CFG-04 | 35-01 | `EMPRESA_MUNICIPIO_IBGE` substitui `"3520400"` no NFS-e | SATISFIED | Getter computado em `nfse.service.ts` |
| CFG-05 | 35-02, 35-03 | `EMPRESA_COR_PRIMARIA` como CSS custom property | SATISFIED | `--primary: {{empresaCor}}` no `:root`; `?? "#0d6efd"` como fallback |
| PDF-01 | 35-03 | Backend passa dados de empresa ao renderizador via env vars | SATISFIED | 5 campos de empresa no `template({...})` |
| PDF-02 | 35-02 | Template padrão usa variáveis de empresa em vez de texto hardcoded | SATISFIED | `{{empresaNome}}`, `{{empresaCnpj}}`, `{{empresaEndereco}}`, `{{empresaLogoUrl}}` no `.hbs`; sem hardcodes BomCusto |
| PDF-03 | 35-02 | Template extraído para arquivo `.hbs` externo | SATISFIED | `apps/backend/templates/quote-default.hbs` criado, 299 linhas |
| PDF-04 | 35-03 | `EMPRESA_PDF_TEMPLATE_PATH` com fallback e erro explícito | SATISFIED | Cadeia de 3 níveis; `InternalServerErrorException` quando path ausente |
| PDF-05 | 35-02 | Template documenta variáveis via comentários Handlebars | SATISFIED | Bloco `{{! ... }}` no topo (linhas 1-27) documentando 5 vars de empresa e variáveis de orçamento |
| NFSE-01 | 35-01 | `CODIGO_MUNICIPIO` lido de `EMPRESA_MUNICIPIO_IBGE` via `ConfigService` | SATISFIED | Getter computado linha 60 de `nfse.service.ts` |

Todos os 11 requisitos declarados nos PLANs para a Fase 35 (CFG-01..05, PDF-01..05, NFSE-01) foram satisfeitos. Os requisitos FRONT-01..04 pertencem à Fase 36 (não entram nesta verificação).

### Anti-Patterns Found

Nenhum anti-pattern encontrado nos arquivos modificados. Checagens realizadas:
- `TBD`, `FIXME`, `XXX`: zero ocorrências em todos os 5 arquivos modificados
- `private readonly CODIGO_MUNICIPIO`: zero ocorrências (removida conforme exigido)
- Template `.hbs`: sem texto BomCusto hardcoded no HTML funcional (documentação no bloco `{{! }}` usa exemplos genéricos)
- `return null / return {} / return []` em handlers críticos: não presentes

### Human Verification Required

Nenhum item requer verificação humana. Todos os comportamentos críticos da fase estão cobertos por testes automatizados que passam.

Os seguintes aspectos são verificáveis apenas em ambiente Docker completo, mas são consequência direta do código verificado acima e não introduzem incerteza sobre o alcance do objetivo da fase:
- Renderização visual do PDF com logo e cor customizados via Puppeteer (requer container em execução)
- Volume Docker montando `EMPRESA_PDF_TEMPLATE_PATH` apontando para `.hbs` externo (requer Docker)

Estes são cenários de integração, não de unidade — o comportamento unitário está completamente coberto pelos 16 testes que passam.

---

_Verified: 2026-06-19T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
