---
phase: 35
slug: backend-white-label
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `npm --workspace @bomcusto/backend test -- --testPathPattern="nfse\|quotes-pdf" --passWithNoTests` |
| **Full suite command** | `npm --workspace @bomcusto/backend test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --workspace @bomcusto/backend test -- --testPathPattern="nfse|quotes-pdf" --passWithNoTests`
- **After every plan wave:** Run `npm --workspace @bomcusto/backend test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-NFS-e | TBD | 1 | NFSE-01, CFG-04 | — | `CODIGO_MUNICIPIO` getter lê env var, não string fixa | unit | `npm --workspace @bomcusto/backend test -- --testPathPattern=nfse.service` | ✅ `nfse.service.test.ts` | ⬜ pending |
| 35-PDF-template | TBD | 1 | PDF-01, PDF-02, PDF-03, PDF-04 | T-path-traversal | `EMPRESA_PDF_TEMPLATE_PATH` definida + ausente → erro explícito (não silencioso) | unit | `npm --workspace @bomcusto/backend test -- --testPathPattern=quotes-pdf` | ❌ W0 | ⬜ pending |
| 35-PDF-context | TBD | 1 | PDF-01, PDF-02 | — | `renderHtml()` passa vars EMPRESA_* no contexto Handlebars | unit | mesmo acima | ❌ W0 | ⬜ pending |
| 35-cfg-validate | TBD | 1 | CFG-02, CFG-03 | — | `validateEnv()` rejeita startup sem vars obrigatórias EMPRESA_* | unit | `npm --workspace @bomcusto/backend test -- --testPathPattern=app.module` | ⚠️ manual se não existir | ⬜ pending |
| 35-env-example | TBD | 1 | CFG-01, CFG-05 | — | `.env.example` documenta todas as vars EMPRESA_* | manual | leitura visual do arquivo | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/quotes/quotes-pdf-storage.service.test.ts` — stubs para PDF-01, PDF-02, PDF-03, PDF-04, D-06; necessita mock de `ConfigService` e `node:fs` (`existsSync`/`readFileSync`)
- [ ] Mock de `existsSync`/`readFileSync` em `node:fs` para testar fallback chain sem I/O real

*`nfse.service.test.ts` já existe — adicionar caso de teste para getter `CODIGO_MUNICIPIO` no arquivo existente.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `.env.example` lista todas as vars EMPRESA_* com defaults BomCusto e comentários | CFG-01, CFG-05 | Conteúdo de documentação — sem lógica executável | Abrir `apps/backend/.env.example`, verificar presença de todas as vars `EMPRESA_*` com comentários explicativos |
| PDF gerado exibe nome/CNPJ/endereço da empresa lidos do `.env` | PDF-01, PDF-02 | Validação E2E de output binário (PDF Puppeteer) | Setar vars EMPRESA_* no `.env.local`, gerar um orçamento, abrir PDF e verificar dados |
| Template `.hbs` customizado via `EMPRESA_PDF_TEMPLATE_PATH` substitui o padrão | PDF-04 | Requer volume Docker + arquivo .hbs externo | Montar arquivo `.hbs` personalizado, setar `EMPRESA_PDF_TEMPLATE_PATH`, gerar PDF e verificar que usa o template customizado |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
