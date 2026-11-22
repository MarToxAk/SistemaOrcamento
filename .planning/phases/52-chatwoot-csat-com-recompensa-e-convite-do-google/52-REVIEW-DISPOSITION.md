---
phase: 52
review: 52-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Placeholders em caixa alta passam na validacao/previa mas sao renderizados vazios no envio"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "`MENSAGEM_OK` fora da re-tentativa do CSAT nativo"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Contagem do CSAT nativo ignora estados que ainda podem criar `input_csat`"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Taxa de resposta pode ultrapassar 100%"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "`lerNumero` converte \"1.000\" em 1"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "`PesquisaConfigService.obter()` faz `findUnique` + `create` nao atomico"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "Limites de dinheiro nao respeitam o `Decimal(12,2)` (500 em vez de 400)"
  - id: WR-07
    severity: warning
    disposition: skipped
    title: "Promessa de recompensa no fechamento pode divergir do cupom efetivamente emitido"
  - id: WR-08
    severity: warning
    disposition: fixed
    title: "`sendOutgoingMessage` sem timeout"
  - id: WR-09
    severity: warning
    disposition: fixed
    title: "Guarda de estado impossivel em `reenviarPendentes` (necessidade)"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Branch `P2002` por `pesquisaId` devolve cupom sem checar status"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "`enviarPutCsat` envia `rating: 0` quando `nota` e nula"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Corrida resgate x revogacao devolve 409 `JA_USADO` para cupom cancelado"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "Constantes de etiquetas duplicadas"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "Comentario livre do cliente na nota privada sem sanitizacao"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "`montarConfigPadrao` aceita envs fora dos limites de `validarConfig`"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "`tentativasEnvio` compartilhado entre cupom e convite"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "Logica de carga inicial duplicada no `config-form`"
open: 0
total: 18
unparsed: 18
recorded: 2026-11-22T20:49:52.860Z
---

# Phase 52: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-01 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-02 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-05 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-06 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-07 | warning | skipped | 52-REVIEW-FIX.md (not in the current review) |
| WR-08 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| WR-09 | warning | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-01 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-02 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-03 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-04 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-06 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-07 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |
| IN-08 | info | fixed | 52-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
