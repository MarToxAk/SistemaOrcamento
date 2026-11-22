---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 13
subsystem: backend
tags: [nestjs, jest, pesquisa, csat, placeholders, paridade, gap-closure]

requires:
  - phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
    provides: "52-03 (render/validacao de mensagens) e 52-05 (envio real de fechamento, cupom e convite)"
provides:
  - "renderizarTexto com lookup de chave caixa-insensivel (assinatura e contrato de desconhecido -> \"\" inalterados)"
  - "cobertura de caminho real para {LINK}, {CODIGO} e {LINK_GOOGLE} em caixa alta"
  - "teste de paridade entre renderizarTexto (producao) e renderizarPrevia (previa real do frontend)"
affects: [52-VERIFICATION, 52-REVIEW, "verdade 15 (CR-01)"]

actuals:
  tokens: 3139        # chars/4 sobre o diff realizado (12554 chars)
  tasks: 3
  commits: 4          # medido por git rev-list --count be8821f..HEAD no momento de escrever este SUMMARY
  plan_head_before: be8821ffff8e81ca4900da9aa6bff7ff5282e12f
  plan_head_after: d68544999881f5735f05d7f3141171ab006d32bb

tech-stack:
  added: []
  patterns:
    - "Normalizacao da chave no render (toLowerCase antes de hasOwnProperty) em vez de rejeitar caixa alta na validacao"
    - "require calculado para exercitar a funcao pura real do frontend a partir da suite do backend (sem runner no frontend)"

key-files:
  created:
    - apps/backend/src/modules/pesquisa/pesquisa-render-paridade.test.ts
  modified:
    - apps/backend/src/modules/pesquisa/pesquisa-regras.ts
    - apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa.service.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts

key-decisions:
  - "Corrigir no render (renderizarTexto), nao na validacao: a validacao e a previa ja eram caixa-insensíveis por desenho, entao normalizar a chave e a menor mudanca que torna previa e producao identicas."
  - "Manter Object.prototype.hasOwnProperty.call sobre a chave normalizada (sem acesso dinamico a cadeia de prototipos) e manter chave desconhecida -> string vazia."
  - "Documentar explicitamente a divergencia para chave valida porem ausente do mapa do contexto (producao devolve \"\", previa mantem o literal) em vez de exigir igualdade impossivel."

patterns-established:
  - "Paridade previa x producao: o teste le a fonte real do frontend por require calculado e compara para cada chave que cada mapa de contexto carrega."

requirements-completed: []

coverage:
  - id: D1
    description: "renderizarTexto resolve {LINK}/{Link}/{link} para o mesmo valor (lookup caixa-insensivel) e mantem desconhecido -> \"\""
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts#T52-13b: renderizarTexto resolve {LINK}, {Link} e {link} para o mesmo valor"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fechamento real entrega a URL do token mesmo com {LINK} em caixa alta, sem chaves sobrando"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa.service.test.ts#T52-13a (tracer): fechamento com {LINK} em caixa alta envia o link real"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cupom com {CODIGO} em caixa alta sai com o codigo real do mesmo run; equivalencia de caixa provada com um unico mapa"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts#T52-13c: cupom com {CODIGO} em caixa alta sai com o código real"
        status: pass
    human_judgment: false
  - id: D4
    description: "Convite com {LINK_GOOGLE} em caixa alta sai com o link do Google exatamente uma vez"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts#T52-13d: convite com {LINK_GOOGLE} em caixa alta sai com o link do Google"
        status: pass
    human_judgment: false
  - id: D5
    description: "Paridade entre previa real do frontend e render de producao para as chaves de cada contexto (8/7/2), com divergencia documentada para chave ausente e mensagem exata para desconhecido"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-render-paridade.test.ts#T52-13e / T52-13f"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-11-22
status: complete
---

# Phase 52 Plan 13: Paridade de placeholders (fechamento, cupom e convite) Summary

**`renderizarTexto` passou a comparar chaves sem diferenciar maiúsculas de minúsculas, fechando o CR-01: `{LINK}`, `{CODIGO}` e `{LINK_GOOGLE}` agora saem com o valor real no envio, idênticos à prévia do admin.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-22T20:17:42Z
- **Completed:** 2026-11-22T20:20:26Z (antes do commit deste SUMMARY)
- **Tasks:** 3/3
- **Files modified:** 5 (4 modificados + 1 criado)

## Accomplishments

- `renderizarTexto` normaliza a chave capturada com `toLowerCase()` antes de `Object.prototype.hasOwnProperty.call`, mantendo a assinatura, o uso de `hasOwnProperty` e o contrato de chave desconhecida → `""`. JSDoc atualizado.
- Caminho real de envio coberto: fechamento com `{LINK}` (URL do token), cupom com `{CODIGO}` (código do mesmo run) e convite com `{LINK_GOOGLE}` (link do Google, uma única vez), todos em caixa alta e sem `{`/`}` remanescentes.
- Novo teste de paridade executa a `renderizarPrevia` real do frontend (por `require` calculado) e prova igualdade com o render de produção para toda chave carregada por cada mapa de contexto (fechamento: 8; pós-resposta: 7; convite: 2), em caixa alta e baixa. Para chave ausente do mapa, documenta a divergência explícita (produção `""` × prévia literal).
- `validarTextoMensagem` recusa placeholder desconhecido com a mensagem exata do contrato nos três tipos, provando que placeholders fora da lista nunca chegam ao render de envio.
- Nenhuma alteração em `apps/frontend/src/lib/pesquisa-admin.ts`, no schema Prisma ou em dependências.

## Task Commits

Cada tarefa foi commitada atomicamente (Task 1 em RED → GREEN):

1. **Task 1 RED: testes que reprovam o HEAD (caixa alta)** — `f86963e` (test)
2. **Task 1 GREEN: normalização da chave em `renderizarTexto`** — `07348e2` (feat)
3. **Task 2: `{CODIGO}` e `{LINK_GOOGLE}` em caixa alta no caminho real** — `380b418` (test)
4. **Task 3: suíte de paridade prévia × produção** — `d685449` (test)

**Plan metadata:** commit `docs(52-13)` com este SUMMARY (e REQUIREMENTS.md se aplicável).

_Nota: a Task 1 é TDD (RED → GREEN), por isso tem dois commits._

## Files Created/Modified

- `apps/backend/src/modules/pesquisa/pesquisa-regras.ts` — lookup de placeholder caixa-insensível via `toLowerCase()`; JSDoc atualizado.
- `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts` — `T52-13b`: `{LINK}`, `{Link}` e `{link}` → mesmo valor; desconhecido → `""`; validação aceita `{LINK}`.
- `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts` — `T52-13a` (tracer): `prepararFechamento` com `textoFechamento: "Responda: {LINK}"` contém a URL e não tem chaves; validação aceita.
- `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts` — `T52-13c` (cupom, código do mesmo run + equivalência com um único mapa) e `T52-13d` (convite, link exatamente uma vez + equivalência com mapa fixo).
- `apps/backend/src/modules/pesquisa/pesquisa-render-paridade.test.ts` (novo) — `T52-13e`/`T52-13f`: paridade com `renderizarPrevia` real e mensagem exata para placeholder desconhecido.

## Verification

| Comando | Resultado |
|---|---|
| `cd apps/backend && ../../node_modules/.bin/jest src/modules/pesquisa src/modules/integrations/chatwoot --no-coverage` | 19 suítes / 477 testes passando (baseline 468 + 9 novos) |
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0, nenhuma linha `error TS` |
| `cd apps/backend && ../../node_modules/.bin/jest src/modules/pesquisa/pesquisa-render-paridade.test.ts --no-coverage` | 5 testes passando |

Checagem de contrato (manual): `renderizarTexto("{LINK}", { link: "x" }) === "x"` e `renderizarTexto("{xyz}", { link: "x" }) === ""`, com JSDoc atualizado.

## Decisions Made

- **Mecanismo:** normalizar a chave no render, não rejeitar caixa alta na validação. A validação (`pesquisa-regras.ts` e `pesquisa-admin.ts`) e a prévia já são caixa-insensíveis por desenho; normalizar o lookup é a menor mudança que iguala prévia e produção para toda chave que o mapa do contexto carrega.
- **Escopo da garantia:** a paridade vale para as chaves que cada mapa de contexto fornece. Chave válida porém ausente do mapa continua divergindo por desenho (produção `""`, prévia literal); o teste documenta isso em vez de exigi-la, e a validação não foi alterada.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Nenhum. Nenhum stub, placeholder `TODO`/`FIXME` ou teste pulado introduzido neste plano.

## Threat Flags

Nenhuma superfície nova. A correção reduz o risco T-52-75 (mensagem de fechamento sem link / cupom sem código) e mantém T-52-76 (lookup restrito a `hasOwnProperty`, valores vindos do servidor). Sem dependências novas (T-52-SC).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01 (verdade 15 do 52-VERIFICATION) está fechado: caixa alta e baixa produzem o mesmo texto final no envio para os placeholders que cada contexto usa.
- Escopo respeitado: WR-01..WR-09 e IN-01..IN-08 do 52-REVIEW permanecem fora deste plano.
- Nenhum trabalho de PROGRESS/ROADMAP feito aqui: o orquestrador atualiza STATE.md e ROADMAP.md após o merge dos worktrees da wave.

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- All 5 key files exist on disk (4 modified + 1 created).
- All 5 plan commits (4 task commits f86963e, 07348e2, 380b418, d685449 + this metadata commit) are ancestors of HEAD.

