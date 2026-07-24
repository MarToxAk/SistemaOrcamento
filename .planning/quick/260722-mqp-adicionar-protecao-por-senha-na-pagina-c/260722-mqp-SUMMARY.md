---
phase: 260722-mqp
plan: 01
subsystem: auth
tags: [nextjs, react, cookie-session, admin-session, password-gate]

requires:
  - phase: 999.1-06
    provides: "/api/admin/login route, admin-session.ts (cookie orcamento_admin_session), gate inline em templates-manager.tsx"
provides:
  - "Componente cliente reutilizavel PasswordGate (apps/frontend/src/components/password-gate.tsx)"
  - "/contas-receber protegido por senha compartilhada com /configuracoes/templates"
  - "Guarda server-side requireAdminSession no proxy GET /api/athos/contas-receber/dashboard"
affects: [contas-receber, configuracoes, admin-session]

tech-stack:
  added: []
  patterns:
    - "PasswordGate: componente client reutilizavel que so renderiza children apos checar/autenticar sessao via /api/admin/login"

key-files:
  created:
    - apps/frontend/src/components/password-gate.tsx
  modified:
    - apps/frontend/src/app/contas-receber/page.tsx
    - apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts

key-decisions:
  - "Extraido PasswordGate como componente novo em vez de alterar templates-manager.tsx, preservando o gate inline que ja funciona la"
  - "Guarda server-side aplicada apenas na rota /dashboard (nao nas rotas /cliente/*), conforme escopo do plano — pagina de detalhe [idcliente] fica fora do escopo"

patterns-established:
  - "PasswordGate(children, title?, description?): gate de senha client-side reutilizavel para qualquer pagina que precise da mesma protecao leve de /configuracoes/*"

requirements-completed: [GATE-CR-01]

coverage:
  - id: D1
    description: "PasswordGate criado e portado 1:1 do fluxo inline de templates-manager.tsx (spinner / prompt de senha / children)"
    requirement: "GATE-CR-01"
    verification:
      - kind: other
        ref: "npx tsc --noEmit --project apps/frontend/tsconfig.json (Task 1)"
        status: pass
    human_judgment: true
    rationale: "Comportamento visual/interativo do gate (spinner, prompt, transicao pos-login) requer verificacao manual em navegador — typecheck confirma apenas compilacao."
  - id: D2
    description: "/contas-receber envolto em PasswordGate; dashboard so monta e busca dados apos autenticacao"
    requirement: "GATE-CR-01"
    verification:
      - kind: other
        ref: "npx tsc --noEmit --project apps/frontend/tsconfig.json (Task 2)"
        status: pass
    human_judgment: true
    rationale: "Fluxo de UX completo (fail-open sem senha, fail-closed com senha, sessao compartilhada entre paginas) exige verificacao manual com CONFIG_PANEL_PASSWORD configurada em ambiente real."
  - id: D3
    description: "GET /api/athos/contas-receber/dashboard retorna 401 sem sessao valida quando ha senha configurada; fail-open preservado sem senha"
    requirement: "GATE-CR-01"
    verification:
      - kind: other
        ref: "npx tsc --noEmit --project apps/frontend/tsconfig.json (Task 3)"
        status: pass
    human_judgment: true
    rationale: "401 vs 200 depende de CONFIG_PANEL_PASSWORD/cookie em runtime — requer teste manual com curl/servidor rodando, nao coberto por typecheck estatico."

duration: 6min
completed: 2026-07-22
status: complete
---

# Phase 260722-mqp Plan 01: Protecao por senha em /contas-receber Summary

**PasswordGate extraido de templates-manager.tsx como componente cliente reutilizavel, protegendo /contas-receber com a mesma sessao/cookie de /configuracoes/templates, mais guarda server-side 401 no proxy do dashboard.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-22T19:29:05Z
- **Completed:** 2026-07-22T19:31:08Z
- **Tasks:** 3
- **Files modified:** 3 (1 criado, 2 modificados)

## Accomplishments
- Componente `PasswordGate` extraido, portando 1:1 o fluxo hoje inline em `templates-manager.tsx` (checagem de sessao, prompt de senha, spinner), consumindo apenas `/api/admin/login` — sem nova rota, env var ou cookie.
- `/contas-receber` refatorado: componente interno `ContasReceberDashboard` preserva toda a UI/logica original; novo default export envolve o dashboard em `<PasswordGate>`, garantindo que o `fetchDashboard` so dispare apos autenticacao.
- Guarda `requireAdminSession` adicionada ao `GET` do proxy `/api/athos/contas-receber/dashboard`, retornando 401 quando ha senha configurada e sessao invalida/ausente — da dentes reais ao gate client-side.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extrair componente cliente reutilizavel PasswordGate** - `0a99d51` (feat)
2. **Task 2: Envolver /contas-receber com PasswordGate** - `5724fca` (feat)
3. **Task 3: Guarda server-side no proxy do dashboard** - `a89ee54` (feat)

**Plan metadata:** (pending — commit abaixo)

_Note: Task 1 foi type="tracer"; o mesmo `<verify>` (typecheck) foi reexecutado imediatamente apos o commit como gate de feedback e passou, liberando as tarefas de expansao (Task 2 e 3)._

## Files Created/Modified
- `apps/frontend/src/components/password-gate.tsx` - Novo componente client `PasswordGate` (spinner / prompt de senha / children)
- `apps/frontend/src/app/contas-receber/page.tsx` - Default export agora envolve `ContasReceberDashboard` em `<PasswordGate>`
- `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` - `GET` agora chama `requireAdminSession(req)` e retorna 401 quando exigido

## Decisions Made
- Extrair o gate para um componente novo em vez de tocar `templates-manager.tsx`, conforme exigido pelo plano (a pagina de templates continua com seu gate inline funcionando, intacta).
- Guarda server-side restrita a rota `/dashboard`; as rotas `/cliente/*` (pagina de detalhe `[idcliente]`) ficam fora de escopo, conforme `success_criteria` e o disposition `accept` de T-mqp-04 no threat model do plano.

## Deviations from Plan

None - plan executado exatamente como escrito. Nenhuma correcao automatica (Rules 1-3) foi necessaria; nenhum ponto exigiu decisao arquitetural (Rule 4).

## Issues Encountered

None. O arquivo PLAN.md nao existia neste worktree isolado no momento da execucao (worktree criado antes do plano ser escrito no repo principal) — foi copiado do repo principal (`D:\Projetos\cloudeproject\SistemaOrcamento\.planning\quick\260722-mqp-...\260722-mqp-PLAN.md`) para o mesmo caminho relativo dentro do worktree antes de iniciar a execucao, sem alterar seu conteudo.

## User Setup Required

None - nenhuma configuracao de servico externo necessaria. A protecao usa a mesma `CONFIG_PANEL_PASSWORD` ja configurada (ou nao) para `/configuracoes/templates`; se a env var ja estiver definida em producao, `/contas-receber` ja fica protegida automaticamente com o deploy desta mudanca.

## Next Phase Readiness
- `PasswordGate` esta pronto para reuso em outras paginas que precisem da mesma protecao leve, sem duplicar o fluxo de autenticacao.
- Verificacao manual (itens 2-5 da secao `<verification>` do plano: prompt de senha visivel, curl 401 sem cookie, desbloqueio persistente, sessao compartilhada, fail-open sem senha) ainda precisa ser feita em ambiente com `CONFIG_PANEL_PASSWORD` configurada — nao coberta por este typecheck estatico.
- Follow-up potencial (fora de escopo, T-mqp-04): proteger tambem as rotas `/api/athos/contas-receber/cliente/*` que alimentam a pagina de detalhe `/contas-receber/[idcliente]`, hoje nao protegida por sessao.

---
*Phase: 260722-mqp*
*Completed: 2026-07-22*

## Self-Check: PASSED

All created files found on disk (password-gate.tsx, page.tsx, route.ts, SUMMARY.md). All task commit hashes (0a99d51, 5724fca, a89ee54) found in git log.
