---
phase: 35-backend-white-label
plan: "03"
subsystem: backend
tags: [pdf, white-label, handlebars, env-vars, config, tdd]
status: complete

dependency_graph:
  requires: ["35-02"]
  provides:
    - "QuotesPdfStorageService.renderHtml() resolve template via cadeia de 3 niveis com erro explicito"
    - "Dados de empresa (nome, CNPJ, endereco, logo, cor) injetados no contexto Handlebars"
    - "Fail-fast com 4 vars EMPRESA_* obrigatorias no startup do backend"
    - ".env.example documenta todas as 7 vars EMPRESA_* com defaults BomCusto"
  affects:
    - "apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts"
    - "apps/backend/src/modules/app.module.ts"
    - ".env.example"

tech_stack:
  added: []
  patterns:
    - "node:fs existsSync + readFileSync para cadeia de fallback de template"
    - "ConfigService.get<string>() sem ?? para vars opcionais (undefined intencional)"
    - "TDD red-green com jest.mock(node:fs) e jest.mock(minio)"

key_files:
  created:
    - apps/backend/src/modules/quotes/quotes-pdf-storage.service.test.ts
  modified:
    - apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
    - apps/backend/src/modules/app.module.ts
    - .env.example

decisions:
  - "empresaLogoUrl sem ?? '' — deve permanecer undefined quando EMPRESA_LOGO_URL ausente (D-08 / Pitfall 3 do RESEARCH)"
  - "empresaCor com fallback '#0d6efd' — azul Bootstrap padrao quando EMPRESA_COR_PRIMARIA ausente (D-02/CFG-05)"
  - "templateSource resolvido em renderHtml() a cada geracao — nao cacheado — para suportar hot-swap de template via volume Docker"
  - "jest.mock('minio') e jest.mock('puppeteer') necessarios pois minio usa timers incompativeis com test runtime"

metrics:
  duration: "5 min"
  completed_date: "2026-06-19"
  tasks_completed: 2
  files_modified: 4

commits:
  - hash: a4bee84
    message: "test(35-03): add failing tests for template chain resolution and empresa context"
    phase: RED
  - hash: d3f23a4
    message: "feat(35-03): implement template chain resolution + empresa context in renderHtml()"
    phase: GREEN
  - hash: 4bf5b01
    message: "feat(35-03): add EMPRESA_* required vars to REQUIRED_ENV_VARS + document in .env.example"
    phase: feat
---

# Phase 35 Plan 03: renderHtml chain + env vars Summary

Conecta o template externo `.hbs` (Plano 02) ao renderizador PDF via cadeia de fallback de 3 níveis com erro explícito para path ausente; injeta dados de empresa lidos via ConfigService no contexto Handlebars; adiciona 4 vars EMPRESA_* obrigatórias ao fail-fast do backend; e documenta todas as 7 vars EMPRESA_* no `.env.example` com defaults BomCusto.

## What Was Built

### Task 1: Cadeia de resolução de template + dados de empresa em renderHtml() (TDD)

**RED commit a4bee84** — 6 testes criados e falhando, cobrindo todos os ramos da cadeia de fallback e o comportamento de cada variável de empresa.

**GREEN commit d3f23a4** — Implementação em `quotes-pdf-storage.service.ts`:

- Adicionados imports `from "node:fs"` (existsSync, readFileSync) e `from "node:path"` ao topo do arquivo (nenhuma dependência nova — built-ins do Node).
- `renderHtml()` reescrito com cadeia de 3 níveis:
  1. `EMPRESA_PDF_TEMPLATE_PATH` definida → lê o arquivo; se ausente → lança `InternalServerErrorException` citando o path (D-06)
  2. Sem `EMPRESA_PDF_TEMPLATE_PATH` → tenta `path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs")`
  3. Fallback final → `QUOTES_PDF_HTML_TEMPLATE` (string TS embutida — zero risco de regressão)
- Dados de empresa adicionados ao contexto Handlebars (D-07):
  - `empresaNome`, `empresaCnpj`, `empresaEndereco` com `?? ""` (vars obrigatórias — defensivo)
  - `empresaLogoUrl` SEM `?? ""` — permanece `undefined` quando `EMPRESA_LOGO_URL` ausente (D-08)
  - `empresaCor` com `?? "#0d6efd"` (fallback azul Bootstrap quando `EMPRESA_COR_PRIMARIA` ausente)

**Todos os campos existentes do contexto preservados sem alteração.**

### Task 2: Vars EMPRESA_* obrigatórias no app.module.ts + seção no .env.example

**commit 4bf5b01**:

- `app.module.ts`: 4 vars adicionadas ao `REQUIRED_ENV_VARS` após `ATHOS_SISTEMA_USUARIO_ID`: `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_MUNICIPIO_IBGE`
- `app.module.ts`: mensagem do `throw new Error(...)` em `validateEnv` atualizada com hint `.env.example` (D-03)
- `.env.example`: nova seção `# Empresa (White-Label)` inserida entre a seção NFS-e e `# Seguranca interna`:
  - 4 vars obrigatórias com defaults BomCusto reais
  - 3 vars opcionais comentadas: `EMPRESA_LOGO_URL`, `EMPRESA_COR_PRIMARIA`, `EMPRESA_PDF_TEMPLATE_PATH` (com exemplo de volume Docker)
  - Aviso sobre `NFSE_SOAP_URL`/`NFSE_AUX_URL` para deploy em outro município

## Verification

- `npm --workspace @bomcusto/backend test -- --testPathPatterns=quotes-pdf`: 6/6 testes passando
- `npm --workspace @bomcusto/backend test`: 215 testes passando, 18 suites, sem regressões
- Verificação programática do plano: OK (todos os tokens esperados encontrados em `app.module.ts` e `.env.example`)

## Deviations from Plan

### TDD Infrastructure Fix — jest.mock('minio') e jest.mock('puppeteer')

**Found during:** Task 1 — execução do teste RED
**Issue:** `minio` usa `timers.setInterval` internamente (de `async.ts`), que em versões recentes do Node retorna `undefined` no contexto Jest, causando `TypeError: The "original" argument must be of type function`. O arquivo de serviço importa `minio` e `puppeteer` mas ambos não são necessários para testar a lógica de `renderHtml()`.
**Fix:** Adicionados `jest.mock("minio", () => ({ Client: jest.fn() }))` e `jest.mock("puppeteer", () => ({}))` no topo do arquivo de teste, antes de qualquer import do serviço. Padrão alinhado com a abordagem de `nfse.service.test.ts` que já isola dependências externas.
**Files modified:** `apps/backend/src/modules/quotes/quotes-pdf-storage.service.test.ts`
**Classification:** [Rule 3 - Blocking Fix] Sem o mock, o teste não conseguia nem compilar/importar o serviço.

## Known Stubs

Nenhum. Todos os dados de empresa são lidos diretamente de env vars via ConfigService e injetados no contexto Handlebars. O template externo `quote-default.hbs` (criado no Plano 02) já usa as variáveis corretas.

## Threat Surface Scan

Nenhuma nova superfície de ataque introduzida além do que já estava no threat model do plano:
- `EMPRESA_PDF_TEMPLATE_PATH` lida de env var controlada pelo operador (T-35-04 — aceito)
- Fail-fast de vars obrigatórias no startup (T-35-05 — comportamento intencional)

## Self-Check: PASSED

- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` contém `from "node:fs"` ✓
- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` contém `EMPRESA_PDF_TEMPLATE_PATH` ✓
- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` contém `path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs")` ✓
- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` contém `"#0d6efd"` como fallback ✓
- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` contém empresaNome, empresaCnpj, empresaEndereco, empresaLogoUrl, empresaCor no contexto ✓
- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.test.ts` existe e contém `EMPRESA_PDF_TEMPLATE_PATH` ✓
- `apps/backend/src/modules/app.module.ts` contém `"EMPRESA_NOME"`, `"EMPRESA_CNPJ"`, `"EMPRESA_ENDERECO"`, `"EMPRESA_MUNICIPIO_IBGE"` ✓
- `apps/backend/src/modules/app.module.ts` contém `See .env.example for EMPRESA_* setup instructions` ✓
- `.env.example` contém `EMPRESA_NOME=`, `EMPRESA_CNPJ=`, `EMPRESA_ENDERECO=`, `EMPRESA_MUNICIPIO_IBGE=` ✓
- `.env.example` contém `EMPRESA_LOGO_URL`, `EMPRESA_COR_PRIMARIA`, `EMPRESA_PDF_TEMPLATE_PATH` ✓
- Commits a4bee84, d3f23a4, 4bf5b01 existem ✓
- 215 testes passando, 0 regressões ✓
