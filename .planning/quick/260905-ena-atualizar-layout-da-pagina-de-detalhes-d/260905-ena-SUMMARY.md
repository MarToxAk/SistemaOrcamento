---
phase: quick-260905-ena
plan: 01
subsystem: ui
tags: [nextjs, react, plainadmin, contas-a-receber, cliente-detalhe, refactor-visual]

# Dependency graph
requires:
  - phase: quick-260905-cyr
    provides: "AdminShell (sidebar 250px + topbar sticky) e as classes pa-* de casca em /contas-receber — layout replicado aqui"
  - phase: quick-260905-dzi
    provides: "Secoes Contas Pagas, Itens Mais Comprados e Gasto por Mes na pagina de detalhe do cliente — reestilizadas por este quick task sem mudanca de dado"
provides:
  - "apps/frontend/src/app/contas-receber/admin-shell.tsx como fonte unica das 42+ regras pa-* de componente (card, tabela, pill, stat, seg, progress) — antes duplicadas so em page.tsx"
  - "/contas-receber/[idcliente] renderizado dentro de <AdminShell> com a mesma sidebar/topbar/paleta pa-* de /contas-receber"
affects: [contas-a-receber, cliente-detalhe, admin-shell]

# Actuals (#2632)
actuals:
  tokens: 13376
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS de componente pa-* vive exclusivamente em admin-shell.tsx — qualquer pagina que usa <AdminShell> ganha as classes automaticamente sem redeclarar estilos"
    - "Secoes recolhiveis (NFS-e Emitidas / Notas Fiscais Athos) usam o proprio pa-card-header como botao de toggle (bordas top/left/right zeradas via style inline, border-bottom herdado da classe) com icones bi-chevron-down/bi-chevron-right"
    - "Barra de acoes sticky e botoes de acao migrados de estilo inline para classes compartilhadas pa-actionbar/pa-btn-accent em admin-shell.tsx"

key-files:
  created: []
  modified:
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
    - apps/frontend/src/app/contas-receber/page.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx

key-decisions:
  - "CSS de componente (pa-card, pa-table, pa-pill, pa-stat, pa-seg, pa-progress, etc.) movido de page.tsx para admin-shell.tsx verbatim, mais a nova variante pa-pill-danger — unica fonte de verdade para as duas paginas de contas a receber"
  - "Rotulos VEN/AVC, badges de tipo de NF (tipoNf/numeroNf) e 'Sem NF' nas tabelas de titulos NAO foram convertidos para pa-pill — fora do escopo explicito do plano (so status de boleto pago/cancelado/pendente e etiquetas de tipo de nota nas secoes fiscais foram mandatadas)"
  - "Cards de resumo do historico usam pa-stat-grid com gridTemplateColumns inline de 3 colunas (em vez de criar uma classe modificadora nova) — opcao explicitamente permitida pelo plano"
  - "orcamento-header, orcamento-section, logo-img e o override de body{background:#f7f1e3} removidos do <style> residual dos modais (Rule 1): eram CSS morto apos a remocao do header antigo e o override de body colidia com --pa-bg do AdminShell, causando regressao visual de fundo"
  - "Botao 'Gerar Boleto' (antes btn-warning) e 'Anexar NFS-e' (antes btn-primary) agora compartilham o mesmo visual pa-btn-accent — mudanca de cor explicitamente pedida pelo plano ('os dois botoes de acao passam a ter o visual de acento da casca')"

patterns-established:
  - "Pagina de detalhe do cliente e a pagina de lista compartilham 100% do CSS pa-* de admin-shell.tsx — qualquer nova pagina de contas a receber deve seguir o mesmo padrao (importar AdminShell, nao redeclarar estilos)"

requirements-completed: [QT-ENA-01, QT-ENA-02, QT-ENA-03]

coverage:
  - id: D1
    description: "Abrir /contas-receber/{id} mostra a mesma sidebar fixa de 250px e a mesma topbar sticky de /contas-receber, com 'Contas a Receber' marcado como ativo e subtitulo com o nome do cliente"
    requirement: "QT-ENA-01"
    verification:
      - kind: automated_ui
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json && npm --prefix apps/frontend run build — ambos limpos apos as 3 tasks"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber/2829 com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Banco Athos de producao e a porta 3000 local estao inacessiveis/ocupados nesta maquina (ver Verificacao Humana Pendente) — confirmacao visual pixel-a-pixel exige navegador + rede Tailscale reais"
  - id: D2
    description: "Todo o conteudo pre-existente (dados cadastrais, titulos em aberto com grupos de boleto, cards de resumo, contas pagas, itens mais comprados com toggle, gasto por mes, NFS-e emitidas, notas fiscais Athos) continua visivel e funcional dentro da nova casca"
    requirement: "QT-ENA-02"
    verification:
      - kind: other
        ref: "Loops de grep de preservacao de simbolos de dados (24 identificadores) e de copy (16 strings) definidos no PLAN.md — 0 perdidos"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber/2829 com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Os loops automatizados confirmam que nenhum simbolo/copy foi perdido no re-skin, mas a conferencia visual dos numeros reais do cliente exige Athos acessivel"
  - id: D3
    description: "Selecionar titulos revela a barra de acoes e os botoes Gerar Boleto / Anexar NFS-e abrem seus modais por cima da sidebar; /contas-receber (lista) nao regride"
    requirement: "QT-ENA-03"
    verification:
      - kind: other
        ref: "grep boleto-modal-backdrop + z-index 1050 preservados; grep das 42 regras pa-* + pa-pill-danger em admin-shell.tsx (0 perdidas); git diff --name-only apps/backend apps/frontend/src/app/globals.css == 0"
        status: pass
      - kind: manual_procedural
        ref: "7 pontos da conferencia visual da Task 3 (sidebar/topbar, subtitulo, secoes, fiscais, barra de acoes sobre modais, responsividade <992px, regressao em /contas-receber) — nao executados nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Modais e z-index foram verificados estaticamente no codigo; a sobreposicao visual real e a nao-regressao da lista exigem navegador + Athos reais"

# Metrics
duration: ~40min
completed: 2026-09-05
status: complete
---

# Quick Task 260905-ena: Layout PlainAdmin na Página de Detalhe do Cliente Summary

**Página `/contas-receber/[idcliente]` migrada da casca Bootstrap antiga (`orcamento-header` + `container`) para o mesmo `<AdminShell>` (sidebar 250px + topbar sticky) e o mesmo conjunto de classes `pa-*` já usado em `/contas-receber`, com CSS de componente unificado em `admin-shell.tsx`.**

## Performance

- **Duration:** ~40min
- **Tasks:** 3/3 completos
- **Files modified:** 3 (0 criados, 3 modificados)

## Accomplishments

- `admin-shell.tsx` passou a ser a fonte única das ~42 regras `pa-*` de componente (card, tabela, pill, stat, seg, progress, aging, vencer) que antes viviam duplicadas apenas em `page.tsx` — mais a nova variante `pa-pill-danger`
- Página de detalhe do cliente inteira (dados cadastrais, títulos em aberto com grupos de boleto, 3 cards de resumo, contas pagas, itens mais comprados, gasto por mês, NFS-e emitidas, notas fiscais Athos, barra de ações) migrada para dentro de `<AdminShell>` com sidebar/topbar idênticas à lista
- Etiqueta "Bloqueado" usa a nova `pa-pill-danger`; status de boleto (pago/cancelado/pendente) e etiquetas de tipo de nota fiscal usam variantes de `pa-pill`; toggle "Por Valor/Por Quantidade" usa `pa-seg`
- Todas as tabelas Bootstrap (`table table-sm table-hover table-bordered`) fora dos modais convertidas para `pa-table` densa, sem wrapper `table-responsive`
- Seções recolhíveis NFS-e Emitidas e Notas Fiscais Athos viram `pa-card` com o próprio `pa-card-header` como botão de expandir/recolher (chevrons no lugar dos triângulos de texto ▼/►)
- Barra de ações sticky e os dois botões de ação migrados de estilo inline para classes compartilhadas `pa-actionbar`/`pa-btn-accent`
- Os 3 modais (boleto, NFS-e, e-mail) e seu `<style>` permanecem intocados fora de `<AdminShell>`, com `boleto-modal-backdrop` em `z-index: 1050` acima da sidebar (`1040`)
- CSS morto removido do `<style>` residual dos modais (`orcamento-header`, `orcamento-section`, `logo-img`, override de `body{background:#f7f1e3}`) — o override de fundo colidia com `--pa-bg` do AdminShell e teria causado regressão visual silenciosa
- Nenhuma mudança de fetch, estado, handler ou string de copy — confirmado por loops de grep de preservação de símbolos (24 identificadores) e copy (16 strings) do PLAN.md, todos passando
- `apps/backend` e `apps/frontend/src/app/globals.css` não tocados (gate de escopo do plano)

## Task Commits

Each task was committed atomically:

1. **Task 1: Casca única — extrair CSS pa-* compartilhado e envolver o detalhe em AdminShell** - `1c87919` (feat)
2. **Task 2: Re-skin do bloco principal — dados cadastrais, títulos, resumo e histórico** - `2e781da` (feat)
3. **Task 3: Re-skin das seções fiscais + barra de ações** - `c03470c` (feat)

## Files Created/Modified

- `apps/frontend/src/app/contas-receber/admin-shell.tsx` - Recebeu as ~42 regras `pa-*` de componente movidas de `page.tsx`, mais `pa-pill-danger`, `pa-actionbar` e `pa-btn-accent`
- `apps/frontend/src/app/contas-receber/page.tsx` - `<style>` de componente duplicado removido (fonte única agora é `admin-shell.tsx`); comportamento visual inalterado
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` - Envolvido em `<AdminShell>`; todas as seções internas reestilizadas com `pa-card`/`pa-table`/`pa-stat`/`pa-pill`/`pa-seg`; hook `useEmpresa` órfão removido; modais preservados fora da casca

## Decisions Made

- CSS de componente movido verbatim de `page.tsx` para `admin-shell.tsx`, com `pa-pill-danger` adicionada seguindo exatamente a forma das variantes existentes (`rgba(229, 72, 77, 0.14)` / `var(--pa-danger)`)
- Badges de tipo de NF (`tipoNf`/`numeroNf`), "Sem NF" e VEN/AVC nas tabelas de títulos em aberto mantidos como badges Bootstrap — fora do escopo explícito do plano, que só mandatou pills para status de boleto e para as etiquetas de tipo de nota nas seções fiscais
- Cards de resumo do histórico usam `pa-stat-grid` com `gridTemplateColumns: "repeat(3, 1fr)"` via `style` inline — uma das duas opções explicitamente permitidas pelo plano
- Removido CSS morto (`orcamento-header`, `orcamento-section`, `logo-img`, override de `body`) do `<style>` residual dos modais — Rule 1 (bug), pois o override de `body{background:#f7f1e3}` colidiria com `--pa-bg` do AdminShell e regrediria visualmente a página inteira mesmo com o header antigo já removido
- Botões "Gerar Boleto" e "Anexar NFS-e" passaram do visual Bootstrap (`btn-warning`/`btn-primary`) para o mesmo `pa-btn-accent` — mudança de cor explicitamente pedida pelo plano ("os dois botões de ação passam a ter o visual de acento da casca")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Worktree 50 commits atrás de `main`, sem `admin-shell.tsx`**
- **Found during:** Leitura inicial do contexto (antes da Task 1)
- **Issue:** O worktree de execução estava baseado num ponto anterior às quick tasks 260905-cyr (criação de `admin-shell.tsx`) e 260905-dzi (seções de histórico), ambas pré-requisito deste plano. `admin-shell.tsx` não existia no worktree.
- **Fix:** `git merge main --no-edit` no worktree antes de iniciar a Task 1 — merge limpo, sem conflitos, trazendo os arquivos-fonte que o plano cita como já existentes
- **Files modified:** nenhum arquivo de código (merge trouxe commits pré-existentes de `main`)
- **Verificação:** `wc -l` dos três arquivos-alvo bateu com as contagens de linha citadas no PLAN.md após o merge

**2. [Rule 1 - Bug] CSS morto e conflitante deixado pela remoção do header antigo**
- **Found during:** Task 1 (após envolver a página em `<AdminShell>`)
- **Issue:** O `<style>` residual dos modais (mantido intocado por instrução do plano) continha `.orcamento-header`, `.orcamento-section`, `.logo-img` (seletores órfãos, sem elemento correspondente após a remoção do header antigo) e um `body { background: #f7f1e3; ... }` que, por renderizar depois do `<style>` do AdminShell no DOM, sobrescreveria `--pa-bg` e pintaria a página inteira com o fundo bege antigo — uma regressão visual silenciosa que o próprio verify de escopo do plano (0 ocorrências de `orcamento-header` fora de comentários) exigia corrigir.
- **Fix:** Removidas as 3 regras órfãs e a linha de `body` do `<style>` dos modais; `.boleto-modal-backdrop` e as demais regras de modal permaneceram intocadas
- **Files modified:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
- **Verificação:** grep de 0 ocorrências de `orcamento-header` fora de comentários (gate do plano); build e tsc limpos
- **Committed in:** `1c87919` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking de ambiente, 1 bug de CSS morto/conflitante)
**Impact on plan:** Ambos necessários para completar o plano como escrito. Sem scope creep — nenhuma mudança de dado, fetch ou lógica.

## Issues Encountered

- Tentativa de iniciar `npm run dev` nesta máquina para uma checagem visual best-effort falhou com `EADDRINUSE :::3000` — outro processo (não iniciado por este executor) já ocupa a porta 3000. Nenhum processo próprio foi deixado rodando. A tentativa de `curl` anterior a essa descoberta capturou HTML de uma instância alheia/desatualizada e foi descartada.

## Verificação Humana Pendente

O banco Athos de produção está inacessível desta máquina sem rede Tailscale, e a porta 3000 local já está em uso por outro processo (ver Issues Encountered). A checagem humana da Task 3 — abrir `http://localhost:3000/contas-receber/2829` com Tailscale ativo e confirmar os 7 pontos (sidebar/topbar idênticas com item ativo, subtítulo com nome do cliente, todas as seções com os mesmos números de antes, seções fiscais abrindo/fechando, barra de ações sobre os modais, colapso da sidebar <992px, e não regressão em `/contas-receber`) — **não foi executada nesta sessão** e fica como follow-up, registrada em `.planning/WINDOWS.md`. Toda a mudança foi verificada estaticamente: `tsc --noEmit` e `next build` limpos após cada task, e os loops de grep de preservação de CSS (42 regras + `pa-pill-danger`), símbolos de dados (24) e copy (16) do PLAN.md todos passando com 0 perdas.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Página de detalhe pronta para uso assim que a rede Athos (Tailscale) e uma porta livre estiverem disponíveis para a checagem visual pendente acima
- Nenhum bloqueio para outros trabalhos — mudança é puramente visual (re-skin), sem alteração de dado/fetch/lógica de negócio

---
*Quick Task: 260905-ena*
*Completed: 2026-09-05*

## Self-Check: PASSED
