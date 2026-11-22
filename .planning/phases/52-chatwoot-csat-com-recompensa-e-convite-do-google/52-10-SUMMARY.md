---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 10
subsystem: pesquisa-satisfacao
tags: [nextjs, admin, cupons, resgate, proxy, acessibilidade, paginacao, ui]
status: complete

requires:
  - phase: 52-12
    provides: PesquisaAdminController com GET cupons, GET cupons/:codigo e POST cupons/:codigo/resgate (AdminOnly, DTOs e erros 404/409/422 tipados)
  - phase: 52-07
    provides: PesquisaCupomService.buscarPorCodigo/listar/resgatar e o campo derivado situacao (EMITIDO, SUSPENSO, USADO, EXPIRADO, CANCELADO)
  - phase: 52-08
    provides: lib/pesquisa-admin.ts (MSG_SESSAO, lerNumero, formatarDataHora, formatarReais, formatarPercentual), item de menu /cupons, AdminShell/PasswordGate/RecursosBootstrap
provides:
  - GET /api/admin/pesquisa-cupons (lista paginada, status/cursor/limite em lista fechada)
  - GET /api/admin/pesquisa-cupons/[codigo] (detalhe, normalizacao, regex e encodeURIComponent)
  - POST /api/admin/pesquisa-cupons/[codigo]/resgate (repassa somente { valorCompra })
  - CuponsManager (busca, detalhe, resgate em dois passos e lista paginada)
  - Rota /cupons (PasswordGate + AdminShell + Suspense), ?status= na URL
affects:
  - 52-11 (roteiro pode exercitar /cupons no balcao e conferir o resgate real)

actuals:
  tokens: 9712
  tasks: 2
  commits: 2
  plan_head_before: f7e311fb2ceb2f185c927070bff2df70a7dc238d
  plan_head_after: 81f80687974f4d70273a0b8b0a61d72117a40a00

tech-stack:
  added: []
  patterns:
    - "Proxy admin com query montada por URLSearchParams e listas fechadas (status/cursor/limite), nunca repassando a query crua"
    - "Resgate irreversivel em dois passos: painel de confirmacao inline (aviso amarelo #f7a600/#fff8e6/#8a5a00) e recarga SEMPRE do servidor apos confirmar, nunca otimista"
    - "Situacao do cupom exibida a partir do campo derivado do servidor (UI-D09); a tela so mapeia rotulo, cor de pilula e texto de apoio"
    - "Tabela admin com primeira e segunda colunas sticky a esquerda dentro de pa-card-body-scroll com overflow-x"

key-files:
  created:
    - apps/frontend/src/app/api/admin/pesquisa-cupons/route.ts
    - apps/frontend/src/app/api/admin/pesquisa-cupons/[codigo]/route.ts
    - apps/frontend/src/app/api/admin/pesquisa-cupons/[codigo]/resgate/route.ts
    - apps/frontend/src/app/cupons/page.tsx
    - apps/frontend/src/app/cupons/cupons-manager.tsx
  modified: []

key-decisions:
  - "Codigo invalido e rejeitado no proxy com 404 local, sem chamar o backend (regex ^[A-Z0-9]{1,6}-[A-Z0-9]{6}$ apos trim e maiusculas)"
  - "O resgate sempre recarrega o detalhe por GET depois de confirmar; a resposta do POST e usada apenas para a mensagem de sucesso com descontoAplicado"
  - "O resumo do desconto no cliente usa inteiros em centavos e arredonda para baixo, limitado ao teto e ao valor da compra, somente para exibicao (o servidor recalcula)"
  - "SUSPENSO usa suspensoAte (dd/mm/aaaa) e TETO_MENSAL no resgate usa liberadoEm; demais 422 exibem a mensagem do servidor"
  - "Mensagem 'Informe o valor da compra.' aparece quando o campo fica invalido apos ser tocado; o botao fica desabilitado para valor vazio/invalido (UI-SPEC)"
  - "Coluna extra com cabecalho visualmente oculto abriga o botao 'Ver detalhes' sem alterar a lista de colunas do UI-SPEC"

patterns-established:
  - "Erro de resgate por status: 409 (ja usado), 422 com codigo (ABAIXO_DO_MINIMO/VENCIDO/CANCELADO/TETO_MENSAL), senao a mensagem de nao lancar o desconto antes de confirmar + recarga do servidor"
  - "Filtro de segmento em ?status= com 'Todos' fora da URL via useFiltrosUrl"

requirements-completed: []

coverage:
  - id: D1
    description: "Tres proxies admin de cupons com sessao, codigo normalizado/validado/encodeURIComponent e repasse apenas das chaves conhecidas"
    verification:
      - kind: automated_ui
        ref: "grep de aceitacao (requireAdminSession>=3 nos tres, encodeURIComponent=1, export async function POST=1, pesquisa/admin/cupons>=1)"
        status: pass
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tela /cupons com busca, situacao derivada do servidor, resgate em dois passos com recarga do servidor, erros tipados e lista recente filtrando/paginando"
    verification:
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build (rota /cupons listada)"
        status: pass
      - kind: automated_ui
        ref: "grep de aceitacao (PasswordGate=4, activeHref /cupons=1, Confirmar uso=3, emEnvio=4, /resgate=1, Carregar mais=1, dangerouslySetInnerHTML=0, scope col=8)"
        status: pass
    human_judgment: true
    rationale: "Fluxo visual e de interacao (painel de confirmacao, resumo ao vivo, foco, sticky columns, 360px e paginação com mais de 50 cupons) exige UAT humano; nao ha runner de testes no frontend."

metrics:
  duration: "~8min"
  started: "2026-11-22T18:49:00Z"
  completed: "2026-11-22T18:57:00Z"
  tasks: 2
  files: 5
  commits: 2
  plan_head_before: f7e311fb2ceb2f185c927070bff2df70a7dc238d
  plan_head_after: 81f80687974f4d70273a0b8b0a61d72117a40a00
---

# Phase 52 Plan 10: Tela de cupons do balcão e resgate em dois passos

**Busca de cupom por código, situação derivada do servidor, resgate irreversível em dois passos com recarga do servidor e lista paginada de cupons recentes, atrás de três proxies admin protegidos por sessão.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-11-22T18:49:00Z
- **Completed:** 2026-11-22T18:57:00Z
- **Tasks:** 2
- **Files modified:** 5 (todos criados)
- **Verificação:** `npx tsc --noEmit -p apps/frontend/tsconfig.json` sem erros nas duas tasks; `npm --workspace @orcamento/frontend run build` concluiu (Next 16.2.5) e lista a rota `/cupons`.

## Accomplishments

- Três proxies admin: `GET /api/admin/pesquisa-cupons` (status em lista fechada, cursor até 64 caracteres alfanuméricos, limite 1–100), `GET .../[codigo]` (normaliza, valida a regex e usa `encodeURIComponent`, com 404 local sem chamar o backend) e `POST .../[codigo]/resgate` (repasa somente `{ valorCompra }` numérico positivo), todos com `requireAdminSession`, `adminBackendFetch` e status/corpo do backend preservados.
- Página `/cupons` com `PasswordGate` (título e descrição do UI-SPEC), `RecursosBootstrap`, `AdminShell` com `activeHref="/cupons"` e o gerenciador dentro de `Suspense` por causa de `?status=`.
- Busca de cupom com rótulo visível, ajuda, `autoCapitalize="characters"`, `autoComplete="off"`, `spellCheck={false}`, Enter enviando, normalização antes da requisição, botão com spinner e "Buscando cupom..." e a mensagem de não encontrado do contrato.
- Detalhe do cupom com código monoespaçado, pílula de situação vinda do campo `situacao` do servidor (sem recalcular), campos Desconto/Teto/Compra mínima/Válido até/Cliente mascarado/Emitido em/Nota da pesquisa e texto de apoio por situação (Suspenso com `suspensoAte`, Vencido com a validade, Já usado com data/hora e desconto, Cancelado).
- Resgate só em `Disponível`: valor da compra com `inputMode="decimal"`, resumo ao vivo em centavos (arredondado para baixo e limitado ao teto e à compra), aviso "Limitado ao teto..." e "Desconto arredondado para baixo, no centavo.", bloqueio visível abaixo da compra mínima, painel de confirmação inline nos valores exatos do UI-SPEC, ref `emEnvio` contra duplo envio e recarga SEMPRE do servidor ao final (sucesso, 409, 422, 5xx ou rede).
- Lista recente com `pa-seg` Todos/Disponíveis/Usados/Vencidos/Cancelados em `?status=`, tabela acessível com `scope="col"` e `aria-label`, primeira e segunda colunas sticky, 50 por página com "Carregar mais" por cursor, "Ver detalhes" como botão real (com foco no detalhe) e estados vazio, filtro sem resultado, carregando com `aria-busy` e erro com "Tentar novamente".

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Proxies admin de cupons (lista, detalhe e resgate)** - `2780459` (feat)
2. **Task 2: Página Cupons e gerenciador (busca, resgate em dois passos e lista paginada)** - `81f8068` (feat)

**Plan metadata:** commit do SUMMARY (docs).

## Files Created/Modified

- `apps/frontend/src/app/api/admin/pesquisa-cupons/route.ts` - proxy GET da lista paginada, com `URLSearchParams` e listas fechadas.
- `apps/frontend/src/app/api/admin/pesquisa-cupons/[codigo]/route.ts` - proxy GET do detalhe, com normalização, regex e `encodeURIComponent`.
- `apps/frontend/src/app/api/admin/pesquisa-cupons/[codigo]/resgate/route.ts` - proxy POST do resgate, somente `{ valorCompra }`.
- `apps/frontend/src/app/cupons/page.tsx` - PasswordGate + RecursosBootstrap + AdminShell + Suspense.
- `apps/frontend/src/app/cupons/cupons-manager.tsx` - busca, detalhe, resgate em dois passos e lista paginada.

## Decisions Made

- Código inválido é rejeitado no proxy com 404 local (mesma mensagem do backend), evitando chamada desnecessária e fechando a superfície de manipulação de caminho (T-52-52).
- O POST do resgate tem sua resposta usada só para a mensagem de sucesso (`descontoAplicado`); a verdade exibida vem sempre do GET de detalhe imediatamente depois — nada otimista.
- O resumo do desconto no cliente trabalha em centavos inteiros e arredonda para baixo, limitado ao teto e ao valor da compra, apenas para exibição (UI-D10); o servidor recalcula no resgate.
- `SUSPENSO` mostra `suspensoAte` e `TETO_MENSAL` no resgate mostra `liberadoEm`; os demais 422 exibem a mensagem do servidor (`ABAIXO_DO_MINIMO`, `VENCIDO`, `CANCELADO`).
- "Informe o valor da compra." aparece quando o campo fica inválido após ser tocado; o botão fica desabilitado para valor vazio/inválido, como o UI-SPEC pede ("habilitado só com valor válido").
- A coluna de ações ganhou cabeçalho visualmente oculto para abrigar "Ver detalhes" sem alterar a lista de colunas da copy.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- O build do Next reescreveu `apps/frontend/next-env.d.ts`; como é artefato gerado e fora do escopo, a alteração foi revertida antes de cada commit (mesma abordagem dos planos 52-08 e anteriores).
- O worktree não tem `node_modules` próprio; `tsc` e `next build` resolveram os módulos a partir de `/root/SistemaOrcamento/node_modules`.

## User Setup Required

None - no external service configuration required.

## Known Stubs

Nenhum. A tela está ligada ao contrato real dos proxies e do backend; o resumo do desconto é visualização intencional (não é stub de dado) e não há TODO/FIXME nem valor vazio hardcoded que chegue à tela.

## Threat Flags

Nenhum além do `threat_model` do plano. T-52-51 mitigado (`emEnvio`, confirmação em dois passos, recarga do servidor e 409 do backend); T-52-52 mitigado (normalização, regex e `encodeURIComponent`, 404 local); T-52-53 mitigado (`requireAdminSession` nos três handlers e parâmetros em lista fechada); T-52-54 mitigado (somente `telefoneMascarado` do servidor); T-52-55 mitigado (mensagem de não lançar o desconto antes de confirmar + recarga da verdade do servidor); T-52-SC sem dependências novas.

## Next Phase Readiness

- `/cupons` pronta para o roteiro (52-11) exercitar busca e resgate no balcão.
- Os proxies ficam disponíveis para qualquer tela admin que precise consultar cupons.
- Nenhuma alteração em `admin-shell.tsx`, `recursos-bootstrap.tsx` ou `lib/pesquisa-admin.ts` (plano 52-08); nada de STATE.md/ROADMAP.md (o orquestrador centraliza).

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- Os 5 arquivos do plano existem no disco e nos commits `2780459` e `81f8068` (ancestrais de HEAD).
- `git rev-list --count f7e311f..HEAD` = 2 (uma por task).
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: sem erros.
- `npm --workspace @orcamento/frontend run build`: concluído sem "Failed to compile"/"Type error"; rota `/cupons` listada.
- Critérios de aceitação (grep) conferidos: proxies (requireAdminSession, encodeURIComponent, POST, pesquisa/admin/cupons) e tela (PasswordGate, activeHref, Confirmar uso, emEnvio, /resgate, Carregar mais, dangerouslySetInnerHTML=0, scope="col").
