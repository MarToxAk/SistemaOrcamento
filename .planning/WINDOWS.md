---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-09-06T17:01:07.470Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260906-iz0 | unrun-verify | apps/backend/src/modules/integrations/nfse/nfse.service.ts |  | Human-check executavel pendente (PLAN.md): emitir/tomador/pdf/remover NFS-e via /orcamento/22764 contra Postgres/Prisma real de dev, sem confirmacao de npm run dev ativo nesta sessao | open |  | 2026-09-06T17:01:07.470Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "quick-260906-iz0",
    "file": "apps/backend/src/modules/integrations/nfse/nfse.service.ts",
    "line": null,
    "description": "Human-check executavel pendente (PLAN.md): emitir/tomador/pdf/remover NFS-e via /orcamento/22764 contra Postgres/Prisma real de dev, sem confirmacao de npm run dev ativo nesta sessao",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-06T17:01:07.470Z",
    "resolved_at": null
  }
]
````
