---
phase: 52
review: 52-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Placeholders em caixa alta passam na validação/prévia mas são renderizados vazios no envio"
  - id: WR-01
    severity: warning
    disposition: open
    title: "MENSAGEM_OK fica fora da re-tentativa do CSAT nativo e deixa o branch de reconciliarCsatNativo morto"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Contagem do CSAT nativo ignora estados que ainda podem criar input_csat (risco de segunda input_csat)"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Taxa de resposta pode ultrapassar 100% (numerador e denominador com âncoras de data diferentes)"
  - id: WR-04
    severity: warning
    disposition: open
    title: "lerNumero converte 1.000 em 1 — erro silencioso em campos monetários"
  - id: WR-05
    severity: warning
    disposition: open
    title: "PesquisaConfigService.obter() faz findUnique + create não atômico (P2002 no primeiro acesso concorrente)"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Limites de dinheiro na config não respeitam o Decimal(12,2) do banco (500 em vez de 400)"
  - id: WR-07
    severity: warning
    disposition: open
    title: "Promessa de recompensa no fechamento pode divergir do cupom efetivamente emitido"
  - id: WR-08
    severity: warning
    disposition: open
    title: "sendOutgoingMessage sem timeout — reserva ENVIANDO pode gerar mensagem duplicada na re-tentativa"
  - id: WR-09
    severity: warning
    disposition: open
    title: "Impossible-state guard — checagem de pesquisa anonimizada em reenviarPendentes"
  - id: IN-01
    severity: info
    disposition: open
    title: "Branch P2002 por pesquisaId devolve cupom sem checar status"
  - id: IN-02
    severity: info
    disposition: open
    title: "enviarPutCsat envia rating 0 quando nota é nula"
  - id: IN-03
    severity: info
    disposition: open
    title: "Corrida resgate × revogação devolve 409 JA_USADO para cupom cancelado"
  - id: IN-04
    severity: info
    disposition: open
    title: "Constantes de etiquetas duplicadas entre pesquisa-efeitos e chatwoot-etiquetas"
  - id: IN-05
    severity: info
    disposition: open
    title: "Comentário livre do cliente vai para nota privada do Chatwoot sem sanitização"
  - id: IN-06
    severity: info
    disposition: open
    title: "montarConfigPadrao aceita envs fora dos limites de validarConfig"
  - id: IN-07
    severity: info
    disposition: open
    title: "tentativasEnvio é compartilhado entre cupom e convite"
  - id: IN-08
    severity: info
    disposition: open
    title: "Lógica de carga inicial duplicada no config-form"
open: 18
total: 18
recorded: 2026-11-22T19:20:00Z
---

# Phase 52: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| WR-09 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently.

> Nota: o relatório `52-REVIEW.md` usa numeração `#### CR-01:` (quatro cerquilhas) na seção "Narrative Findings". O parser automático do gate espera `### CR-01:`, então esta disposição foi escrita a partir do frontmatter (`findings:`) e dos títulos do relatório, com todas as linhas em `open`.
