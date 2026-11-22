---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 09
subsystem: pesquisa-satisfacao
tags: [nextjs, admin, resultados, revogacao, proxy, acessibilidade, abas]
status: complete

requires:
  - phase: 52-08
    provides: ConfigForm, lib/pesquisa-admin.ts (MSG_SESSAO, formatarDataHora, formatarReais, formatarPercentual), itens de menu PA_NAV_ITEMS (/configuracoes/pesquisa) e RecursosBootstrap sob SRI
  - phase: 52-12
    provides: "PesquisaAdminController: GET /pesquisa/admin/resultados e POST /pesquisa/admin/pesquisas/:id/revogar (AdminOnly, idempotente)"
  - phase: 52-07
    provides: PesquisaResultadosService.resultados com o ResultadosDTO (nota média, taxa n de N, cupons, gastoMes, variantes, amostraPequena, distribuicao, ultimas, relatorioChatwootUrl)
provides:
  - "proxy GET /api/admin/pesquisa-resultados com requireAdminSession e periodo em lista fechada"
  - "proxy POST /api/admin/pesquisa-revogar/[id] com requireAdminSession e id validado como UUID antes do backend"
  - "ResultadosPanel (Client Component) com cartões, comparativo sem vencedor com amostra pequena, distribuição, últimas respostas e ação Revogar pesquisa com confirmação inline e recarga do servidor"
  - "rota /configuracoes/pesquisa com PasswordGate + AdminShell e abas Configuração/Resultados em ?aba= (Configuração fora da URL) e ?periodo="
affects:
  - 52-10 (tela de cupons reusa o padrão de proxies e as classes pesquisa-pill-*)

actuals:
  tokens: 8259
  tasks: 2
  commits: 2
  plan_head_before: f7e311fb2ceb2f185c927070bff2df70a7dc238d
  plan_head_after: a4f5f8e655411dc8fe0392e66c8b5f28e4af3562

tech-stack:
  added: []
  patterns:
    - "proxy admin que repassa só um parâmetro de URL em lista fechada; qualquer outro valor cai no padrão"
    - "proxy de ação com id validado como UUID localmente (404 sem tocar o backend) e sem corpo"
    - "painel com abas em ?aba= e formulário sempre montado (hidden) para não perder edição; painel carregado sob demanda"
    - "ação de escrita que sempre recarrega do servidor no finally (nunca otimista) e usa ref emEnvio contra duplo envio"
    - "classes de pílula locais com os valores exatos do UI-SPEC; barra de progresso com o número sempre visível"

key-files:
  created:
    - apps/frontend/src/app/api/admin/pesquisa-resultados/route.ts
    - "apps/frontend/src/app/api/admin/pesquisa-revogar/[id]/route.ts"
    - apps/frontend/src/app/configuracoes/pesquisa/resultados-panel.tsx
    - apps/frontend/src/app/configuracoes/pesquisa/page.tsx
  modified: []

key-decisions:
  - "A recarga dos resultados após a revogação acontece em qualquer desfecho (inclusive 401/404/5xx), como o plano pede: nada de atualização otimista"
  - "O formulário de configuração fica sempre montado dentro de um <div hidden> na aba Resultados, preservando o estado digitado e o beforeunload"
  - "O comparativo nunca destaca vencedor (não só quando amostraPequena): a informação fica na tabela e o aviso aparece abaixo de 30 respostas por variante"
  - "Contagens de cupom exibem a unidade pluralizada (1 cupom / 2 cupons) ao lado do número para cumprir zero-one-many sem perder o número em destaque"
  - "A distribuição usa barras neutras (#5b6778 sobre #eef1f6) porque o UI-SPEC proíbe accent em barras de progresso"

patterns-established:
  - "Painel admin com filtro de período na URL e nota explícita de que o gasto é sempre do mês atual quando o filtro não é mês"
  - "Comentário livre do cliente truncado com CSS line-clamp em 2 linhas, com Ver tudo/Ver menos por linha e sem HTML bruto"
  - "Confirmação inline para ação irreversível com aviso amarelo (#f7a600/#fff8e6/#8a5a00), só uma aberta por vez e pílula de estado no lugar do botão depois de concluída"

requirements-completed: []

coverage:
  - id: D1
    description: "Proxies admin GET /api/admin/pesquisa-resultados e POST /api/admin/pesquisa-revogar/[id], com sessão, lista fechada de período e validação de UUID, sem expor chaves"
    verification:
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build (rotas pesquisa-resultados e pesquisa-revogar geradas)"
        status: pass
      - kind: automated_ui
        ref: "grep de aceitação (requireAdminSession>=2 nos dois, pesquisa/admin/resultados=1, pesquisas/=1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Painel de resultados: quatro cartões, comparativo com aviso de amostra pequena, distribuição, últimas respostas com comentário truncado e ação Revogar pesquisa com confirmação e recarga"
    verification:
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build"
        status: pass
      - kind: automated_ui
        ref: "grep de aceitação (Amostra pequena=1, pa-card-body-scroll=1, telefoneMascarado=0, dangerouslySetInnerHTML=0, scope=\"col\"=10, Revogar pesquisa=1, Confirmar revogação=1, /api/admin/pesquisa-revogar/=1, emEnvio=4)"
        status: pass
    human_judgment: true
    rationale: "Comportamento visual e de interação (barra de teto nos quatro cenários, truncar/expandir comentário, confirmação inline, pílulas e leitura em 360px) exige UAT humano; não há runner de testes no frontend."
  - id: D3
    description: "Rota /configuracoes/pesquisa atrás da senha, com abas Configuração/Resultados, estado em ?aba=/?periodo= e ConfigForm sempre montado"
    verification:
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build (/configuracoes/pesquisa listada)"
        status: pass
      - kind: automated_ui
        ref: "grep de aceitação (PasswordGate=3, Suspense=3, ConfigForm=2, activeHref=\"/configuracoes/pesquisa\"=1, useFiltrosUrl=2)"
        status: pass
    human_judgment: true
    rationale: "A troca de abas sem perder edição não salva e a permanência do filtro ao recarregar exigem verificação humana no navegador."

metrics:
  duration: "~3min"
  started: "2026-11-22T18:54:23Z"
  completed: "2026-11-22T18:56:54Z"
  tasks: 2
  files: 4
  commits: 2
---

# Phase 52 Plan 09: Página da pesquisa com as abas Configuração e Resultados

**Painel de resultados com nota média, taxa n de N, cupons, gasto contra o teto sem decidir com amostra pequena, distribuição, últimas respostas com comentário truncado e revogação confirmada que recarrega do servidor.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-11-22T18:54:23Z
- **Completed:** 2026-11-22T18:56:54Z
- **Tasks:** 2
- **Files modified:** 4 (todos criados)
- **Verificação:** `npx tsc --noEmit -p apps/frontend/tsconfig.json` sem erros; `npm --workspace @orcamento/frontend run build` concluído (Next 16.2.5) com `/configuracoes/pesquisa`, `/api/admin/pesquisa-resultados` e `/api/admin/pesquisa-revogar/[id]` gerados.

## Accomplishments

- Proxy `GET /api/admin/pesquisa-resultados`: exige `requireAdminSession` (401 em português), aceita apenas `periodo` em `mes|30d|tudo` (qualquer outro vira `mes`) e usa `adminBackendFetch` em `/pesquisa/admin/resultados?periodo=`; falha de rede em 500.
- Proxy `POST /api/admin/pesquisa-revogar/[id]`: `params` assíncrono (Next 16), exige sessão, valida o id como UUID e responde 404 local sem chamar o backend quando inválido; não repassa corpo e chama `POST /pesquisa/admin/pesquisas/{id}/revogar`.
- `ResultadosPanel`: busca a cada mudança de período com `AbortController` (resposta velha descartada); estados de carregando (`aria-busy`), erro (`Tentar novamente`, 401 com `MSG_SESSAO`) e vazio ("Nenhuma resposta ainda").
- Cartões: nota média ("4,5 de 5", "1 resposta"/"2 respostas", "—" sem respostas); taxa com o par "n de N" e "0 de 0 · Sem envios no período" quando não houve envio; cupons com plural; gasto real do mês com `pa-progress` limitada a 100%, classes success/warning/danger por faixa e texto "Teto atingido..." — valor, teto e percentual sempre visíveis.
- Comparativo "Estrelas e carinhas" com aviso "Amostra pequena: menos de 30 respostas por variante. Não compare as variantes ainda." e nenhum vencedor destacado; "Notas recebidas" com cinco barras em HTML/CSS (rótulo 1 Muito ruim a 5 Excelente, contagem e percentual sempre visíveis).
- "Últimas respostas" com Data · Nota (estrela e 4/5) · Variante · Comentário (line-clamp 2 + Ver tudo/Ver menos, "Sem comentário" quando vazio) · Cupom (pílula) · Ações; tabela com `<caption>` oculto, `scope="col"` e scroll horizontal dentro de `pa-card-body-scroll` abaixo de 992 px.
- Pílulas: Emitido/Suspenso em `pa-pill-warning`, Usado em `pesquisa-pill-ok`, Vencido/Sem cupom em `pesquisa-pill-neutral`, Cancelado e Revogada em `pesquisa-pill-danger` — as três classes novas com os hex exatos do UI-SPEC; comentário renderizado como texto e sem telefone/token/conversationId.
- Revogação: botão real "Revogar pesquisa" (alvo de 44 px) abre confirmação inline (borda `#f7a600`, fundo `#fff8e6`, texto `#8a5a00`, ícone de alerta) com a copy exata, "Confirmar revogação"/"Cancelar" e ref `emEnvio`; sucesso em `role="status"` ("Pesquisa revogada." + "Cupom cancelado."/"O cupom já havia sido usado e não foi alterado."), 404/401/rede com as mensagens previstas em `role="alert"`, e recarga do servidor no `finally` em qualquer desfecho.
- `page.tsx` monta `PasswordGate` + `RecursosBootstrap` + `AdminShell`, abas em `pa-seg` com `aria-pressed`, estado em `?aba=` (Configuração é o padrão e não entra na URL), `?periodo=` só quando não é `mes`, `ConfigForm` sempre montado (escondido por `hidden`) e `ResultadosPanel` só na aba Resultados.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Proxies dos resultados e da revogação e painel de resultados com Revogar pesquisa** - `daecaab` (feat)
2. **Task 2: Página /configuracoes/pesquisa com as abas Configuração e Resultados** - `a4f5f8e` (feat)

**Plan metadata:** commit do SUMMARY (docs).

## Files Created/Modified

- `apps/frontend/src/app/api/admin/pesquisa-resultados/route.ts` - proxy admin GET dos resultados com período em lista fechada.
- `apps/frontend/src/app/api/admin/pesquisa-revogar/[id]/route.ts` - proxy admin POST da revogação com id validado como UUID.
- `apps/frontend/src/app/configuracoes/pesquisa/resultados-panel.tsx` - Client Component do painel de resultados e da ação Revogar pesquisa.
- `apps/frontend/src/app/configuracoes/pesquisa/page.tsx` - rota `/configuracoes/pesquisa` com as abas e o estado na URL.

## Decisions Made

- A recarga após revogar acontece no `finally`, em qualquer desfecho (inclusive erro), como o plano exige; nenhuma linha é atualizada de forma otimista.
- `ConfigForm` fica sempre montado num `<div hidden>` na aba Resultados para preservar o estado digitado e o `beforeunload` do plano 52-08.
- O comparativo nunca destaca vencedor — não só quando `amostraPequena`; a regra obrigatória (não decidir com amostra pequena) fica garantida e o aviso aparece no topo do cartão.
- As contagens de cupom exibem a unidade pluralizada ("1 cupom"/"2 cupons") junto do número para cumprir zero-one-many sem esconder o valor.
- A distribuição usa barras neutras `#5b6778` sobre `#eef1f6`, porque o UI-SPEC proíbe accent em barras de progresso.

## Deviations from Plan

None - plan executed exactly as written. Não houve correção, adição de funcionalidade crítica nem bloqueio; `next-env.d.ts` reescrito pelo build foi revertido antes dos commits (artefato gerado fora de escopo), como nos planos anteriores da fase.

## Issues Encountered

- O worktree não tem `node_modules` próprio; `tsc` e `next build` resolveram os módulos a partir de `/root/SistemaOrcamento/node_modules` (mesma abordagem dos planos anteriores da fase).
- O `next build` reescreveu `apps/frontend/next-env.d.ts` (troca `./.next/dev/types` por `./.next/types`); a alteração foi revertida e não entrou em nenhum commit.

## User Setup Required

None - no external service configuration required.

## Known Stubs

Nenhum. Todos os campos vêm do `ResultadosDTO` real do backend; os estados vazio, carregando e erro estão ligados ao fetch; não há TODO/FIXME nem valor fictício chegando à tela (as barras refletem o percentual real e "—"/"0 de 0" são os estados honestos de ausência de dado).

## Threat Flags

Nenhum além do `threat_model` do plano. T-52-47 mitigado (sessão no GET e parâmetro `periodo` em lista fechada); T-52-48 mitigado (comentário como texto, `dangerouslySetInnerHTML` ausente); T-52-49 mitigado (nenhum telefone/token/conversationId no painel; `telefoneMascarado` não é sequer referenciado); T-52-50 mitigado (aba e período com lista fechada e padrão fora da URL); T-52-62 mitigado (confirmação inline explícita, só uma por vez, ref `emEnvio`, proxy com sessão e UUID, recarga do servidor). T-52-SC: nenhuma dependência npm nova.

## Next Phase Readiness

- Painel de resultados e revogação prontos para o UAT do painel (52-CONTEXT/UI-SPEC seção 3).
- Os padrões de proxy com parâmetro fechado e de pílulas locais ficam disponíveis para a tela de cupons (52-10).
- Nada além do painel depende desta entrega; a página `/configuracoes/pesquisa` já aparece no menu do AdminShell do plano 52-08.

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- Os 4 arquivos do plano existem no disco e nos commits `daecaab` e `a4f5f8e` (ancestrais de HEAD).
- `git rev-list --count f7e311f..HEAD` = 2 (uma por task), medido pelo ledger.
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: sem erros.
- `npm --workspace @orcamento/frontend run build`: concluído; `/configuracoes/pesquisa`, `/api/admin/pesquisa-resultados` e `/api/admin/pesquisa-revogar/[id]` gerados.
- Todos os greps de aceitação das Tasks 1 e 2 atingiram os limites.

