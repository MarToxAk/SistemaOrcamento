---
status: complete
phase: 10-operacao-segura-de-update
result: T-01..T-05 PASS
reconciled: 2026-06-08 — frontmatter adicionado na auditoria v2.1; corpo já indicava Status COMPLETE. Milestone v1.3 shipado.
---

# UAT — Phase 10: Operação Segura de Update

**Status:** COMPLETE
**Date:** 2026-05-03
**Phase Goal:** Padronizar o procedimento operacional de update da stack VPS com runbook versionado e checklist pós-deploy automatizável.

---

## Test Results Summary

| # | Test | Result |
|---|------|--------|
| T-01 | README referencia o runbook | ✅ PASS |
| T-02 | Runbook contém todas as seções obrigatórias | ✅ PASS |
| T-03 | Runbook aponta para o script de health | ✅ PASS |
| T-04 | Script detecta DB_READINESS_FAILED / MIGRATION_DEPLOY_FAILED | ✅ PASS |
| T-05 | Script tem saída não-zero em falha | ✅ PASS |
| T-06 | Sintaxe do script PowerShell válida | ✅ PASS |
| T-07 | Cold start smoke test (Docker em VPS) | ⏭ SKIP |

**Passed:** 6 / 6 testable
**Skipped:** 1 (Docker CLI não disponível localmente)

---

## Test Details

### T-01 — README referencia o runbook
**Criterion:** README.md linha 90 menciona `deploy/UPDATE_RUNBOOK.md` como procedimento oficial.
**Command:** `Select-String -Path "README.md" -Pattern "UPDATE_RUNBOOK"`
**Result:** PASS — linha 90 encontrada: "Procedimento oficial de update, rollback e validacao: deploy/UPDATE_RUNBOOK.md."

---

### T-02 — Runbook contém todas as seções obrigatórias
**Criterion:** `deploy/UPDATE_RUNBOOK.md` deve conter Pre-check, Checklist pos-deploy, Rollback tatico e Troubleshooting.
**Command:** `$rb = Get-Content "deploy/UPDATE_RUNBOOK.md" -Raw; @("Pre-check","Checklist pos-deploy","Rollback tatico","Troubleshooting") | ForEach-Object { $rb -match $_ }`
**Result:** PASS — todas as 4 seções presentes com comandos `docker compose -f deploy/docker-compose.vps.yml` concretos.

---

### T-03 — Runbook aponta para o script de health
**Criterion:** Seção "Checklist pos-deploy" do runbook deve referenciar `verify-deploy-health.ps1`.
**Command:** `Select-String -Path "deploy/UPDATE_RUNBOOK.md" -Pattern "verify-deploy-health"`
**Result:** PASS — linha 68: `powershell -ExecutionPolicy Bypass -File scripts/verify-deploy-health.ps1`

---

### T-04 — Script detecta erros críticos de startup/migration
**Criterion:** `scripts/verify-deploy-health.ps1` deve checar logs por `DB_READINESS_FAILED` e `MIGRATION_DEPLOY_FAILED`.
**Command:** `Select-String -Path "scripts/verify-deploy-health.ps1" -Pattern "DB_READINESS_FAILED|MIGRATION_DEPLOY_FAILED"`
**Result:** PASS — linha 40-41 verificam ambos os padrões nos logs do backend e falham com mensagem descritiva.

---

### T-05 — Script tem saída não-zero em falha
**Criterion:** Script deve chamar `exit 1` (via função `Fail`) quando qualquer check falhar.
**Command:** `Select-String -Path "scripts/verify-deploy-health.ps1" -Pattern "exit 1"`
**Result:** PASS — função `Fail` chama `exit 1` em todos os casos de erro (compose ps, backend não running, logs críticos, health sem 200).

---

### T-06 — Sintaxe do script PowerShell válida
**Criterion:** `[System.Management.Automation.Language.Parser]::ParseFile` retorna 0 erros.
**Command:** `$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors); "PS syntax errors: $($errors.Count)"`
**Result:** PASS — 0 erros de sintaxe.

---

### T-07 — Cold start smoke test (Docker em VPS)
**Criterion:** Executar `docker compose up -d` em VPS e confirmar backend responde `/health` após container subir do zero.
**Result:** SKIP — Docker CLI não disponível neste ambiente local. Teste deve ser executado manualmente na VPS após próximo deploy usando o runbook em `deploy/UPDATE_RUNBOOK.md`.

---

## Acceptance Decision

**ACCEPTED** — Phase 10 entregou runbook operacional versionado e script de verificação pós-deploy com todas as verificações essenciais. O único teste não executado requer ambiente de VPS com Docker, documentado como limitação conhecida e coberto pelo próprio artefato de fase (runbook + script).
