---
phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi
plan: 04
subsystem: ui
tags: [nextjs, react, bootstrap, contas-receber]

requires:
  - phase: "41-03"
    provides: "DashboardSummary estendido (aging, a_vencer, taxa_inadimplencia) e ClienteDevedor.maior_atraso_dias no dashboard /contas-receber"
provides:
  - "Controle client-side de ordenacao multi-criterio (nome/valor em aberto/valor vencido, asc/desc) na lista de clientes de /contas-receber"
  - "Destaque visual .status-border-critico (borda esquerda 4px) para clientes com mais de 90 dias de atraso"
  - "Roteiro de aceite humano consolidado da Fase 41 inteira (paineis, cards fiscais, ordenacao/destaque, resiliencia, cadencia do cron)"
affects: ["contas-receber-dashboard"]

actuals:
  tokens: 1240
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Ordenacao client-side com Array.prototype.sort sobre copia rasa do array ja filtrado, aplicada depois do filtro de busca existente — nenhuma chamada de rede nova"
    - "Faixa de destaque .status-border-critico segue o padrao .status-border-{statusKey} ja estabelecido no Kanban (STATE.md, decisao 2026-05-15) — cor coexiste com qualquer ordem, sem reordenacao forcada"

key-files:
  created: []
  modified:
    - apps/frontend/src/app/contas-receber/page.tsx

key-decisions:
  - "Sort keys limitadas a nome/valor em aberto/valor vencido (sem chave 'pago') — o eixo de status ja e coberto pelos botoes STATUS_OPTIONS existentes, conforme Pitfall 4 do 41-RESEARCH.md"
  - "Destaque de 90+ dias e puramente cromatico (borda lateral), nunca forca reordenacao — coexiste com qualquer criterio de ordenacao escolhido pelo operador (resolucao de D-10 do 41-UI-SPEC.md)"

patterns-established:
  - "Novo controle de interacao client-side (ordenacao) documentado como zero-latencia: nenhum estado de loading introduzido, pois opera apenas sobre dados ja carregados por fetchDashboard"

requirements-completed: [D-01, D-10]

coverage:
  - id: D1
    description: "Lista de clientes ordenavel por nome, valor em aberto e valor vencido, em ambas as direcoes, dentro do filtro de status ativo e da busca ativa, com ordem inicial identica a de hoje"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json"
        status: pass
      - kind: other
        ref: "grep de contrato: SORT_OPTIONS(2)/clientesOrdenados(2)/localeCompare(1)/bi-sort-down(1)/bi-sort-up(1)/'Ordenar por'(1)/'Alternar direção da ordenação'(1) em apps/frontend/src/app/contas-receber/page.tsx"
        status: pass
    human_judgment: true
    rationale: "Comportamento interativo real (reordenacao instantanea, coexistencia com filtro/busca) so pode ser confirmado visualmente no navegador — coberto pelo bloco 3 do human-check consolidado desta task"
  - id: D2
    description: "Clientes com mais de 90 dias de atraso recebem faixa lateral vermelha de destaque no card, sem alteracao de posicao na lista"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json"
        status: pass
      - kind: other
        ref: "grep -c status-border-critico apps/frontend/src/app/contas-receber/page.tsx == 2 (definicao no <style> + aplicacao condicional no card)"
        status: pass
    human_judgment: true
    rationale: "Contraste/posicionamento visual da borda esquerda so pode ser confirmado olhando o card renderizado — coberto pelo bloco 3 do human-check consolidado desta task"

duration: ~20min
completed: 2026-09-05
status: complete
---

# Phase 41 Plan 04: Ordenacao e Destaque de Inadimplencia Antiga Summary

**Controle "Ordenar por" (nome/valor em aberto/valor vencido, com alternador de direcao) client-side na lista de clientes de `/contas-receber`, mais faixa lateral vermelha de 4px nos cards com mais de 90 dias de atraso, fechando a Fase 41 com um roteiro de aceite humano consolidado.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `SortKey`/`SortDir`/`SORT_OPTIONS` declarados no escopo de modulo; estados `sortBy` (default `total_atrasado`) e `sortDir` (default `desc`) dentro de `ContasReceberDashboard` — a ordem inicial da pagina reproduz exatamente a ordem atual do backend (`ORDER BY total_atrasado DESC NULLS LAST, total_devido DESC`), sem mudanca visual antes de qualquer clique.
- Controle "Ordenar por" (`form-select form-select-sm`, ~170px) + botao icone de alternancia de direcao (`bi-sort-down`/`bi-sort-up`, `title="Alternar direção da ordenação"`) inserido na linha de acoes do cabecalho, entre a busca e os botoes `STATUS_OPTIONS`.
- `clientesOrdenados` derivado de `clientesFiltrados` via copia rasa + `Array.prototype.sort`, com `localeCompare("pt-BR")` para nome e subtracao numerica para as duas chaves de valor, multiplicadas pelo sinal da direcao. O grid de cards passa a mapear `clientesOrdenados`; nenhuma chamada de rede nova foi introduzida.
- Destaque D-10: classe `.status-border-critico { border-left: 4px solid #ee3637; }` adicionada ao bloco `<style>`, aplicada ao `div.card` de cada cliente quando `maior_atraso_dias !== null && maior_atraso_dias > 90` — puramente cromatico, sem forcar reordenacao (coexiste com qualquer criterio de ordenacao escolhido).
- Roteiro de aceite humano da Fase 41 inteira (boletos consolidados, cards fiscais, ordenacao/destaque, resiliencia, cadencia do cron) embutido no `<human-check>` da Task 1, pronto para o verificador colher ao final da fase — ver secao "Human Check Pendente" abaixo.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ordenacao multi-criterio e destaque de inadimplencia antiga (D-01, D-10)** - `177f40e` (feat)

## Files Created/Modified

- `apps/frontend/src/app/contas-receber/page.tsx` - `SortKey`/`SortDir`/`SORT_OPTIONS`, estados `sortBy`/`sortDir`, derivacao `clientesOrdenados`, controle de UI no cabecalho, classe `.status-border-critico` e aplicacao condicional no card do cliente

## Decisions Made

- Nenhuma chave de ordenacao "pago" foi adicionada — os botoes `STATUS_OPTIONS` (AVC/VEN/REC/CAN) ja cobrem esse eixo; a ordenacao opera dentro do recorte que o filtro ativo produziu (Pitfall 4 do 41-RESEARCH.md).
- Destaque de 90+ dias implementado apenas como borda lateral (sem reordenacao forcada), conforme resolucao de D-10 registrada no 41-UI-SPEC.md — a cor coexiste com qualquer ordem escolhida pelo operador.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueio de execucao] Worktree desatualizado em 24 commits antes de iniciar**

- **Found during:** Leitura obrigatoria inicial (`required_reading`)
- **Issue:** O branch do worktree (`worktree-agent-a46a19e6192eebc6b`) estava parado em `ae2d4ac`, 24 commits atras do `main` atual (`0c7c25f`) — os diretorios de planejamento da Fase 41 (incluindo este proprio `41-04-PLAN.md`, `41-UI-SPEC.md`, `41-03-SUMMARY.md`) e todo o trabalho ja mergeado de 41-01/41-02/41-03 simplesmente nao existiam no working tree. Isso contradiz a premissa do prompt de execucao ("seu worktree branches off current main, que ja inclui o trabalho mergeado dos planos 41-01/02/03").
- **Fix:** Confirmado que `ae2d4ac` e ancestral direto de `main` (`git merge-base HEAD main` retornou o proprio `HEAD`), entao executado `git merge main --ff-only` — um fast-forward puro, sem merge de tres vias, sem risco de conflito ou de reescrever historico de outro agente. Mesmo padrao de correcao ja documentado no 41-03-SUMMARY.md para o mesmo tipo de bloqueio.
- **Files modified:** nenhum arquivo de codigo; apenas o ponteiro do branch avancou para `0c7c25f` (33 arquivos trazidos do main, incluindo toda a documentacao da Fase 41 e o codigo de 41-01/41-02/41-03).
- **Verification:** `git log --oneline -3` confirmou HEAD em `0c7c25f` antes de qualquer edicao; `git status --short` limpo.
- **Committed in:** nao gerou commit proprio (fast-forward apenas move o ponteiro do branch).

**2. [Rule 1 - artefato de build incidental] `next-env.d.ts` revertido apos rodar `npm run build`**

- **Found during:** Verificacao automatizada da Task 1 (`npm --prefix apps/frontend run build`)
- **Issue:** O comando de build (modo producao) reescreveu `apps/frontend/next-env.d.ts`, trocando a referencia `./.next/dev/types/routes.d.ts` (gerada por `npm run dev`) para `./.next/types/routes.d.ts` — um artefato auto-gerado (`// NOTE: This file should not be edited`) sem relacao com o escopo da task.
- **Fix:** `git checkout -- apps/frontend/next-env.d.ts` para restaurar o arquivo ao estado anterior, mantendo o `git diff --name-only` do plano limitado exatamente ao arquivo previsto na secao `<verification>`.
- **Files modified:** nenhum arquivo de codigo alterado por esta correcao — apenas revertida uma alteracao incidental.
- **Verification:** `git status --short` apos o revert mostrou apenas `apps/frontend/src/app/contas-receber/page.tsx` modificado.
- **Committed in:** nao gerou commit (revert de um arquivo nao commitado).

---

**Total deviations:** 2 (1 bloqueio de ambiente corrigido via fast-forward seguro, 1 artefato de build incidental revertido)
**Impact on plan:** Nenhum impacto no escopo, contrato ou comportamento entregue. D-01 e D-10 implementados exatamente conforme a secao `<interfaces>` do plano; `git diff --name-only` lista exatamente o arquivo previsto.

## Issues Encountered

None alem do desvio de ambiente documentado acima.

## Known Stubs

None.

## User Setup Required

None — nenhuma configuracao de servico externo necessaria.

## Human Check Pendente (roteiro de aceite da Fase 41 inteira)

O `<human-check>` da Task 1 deste plano e o roteiro de aceite visual/funcional consolidado da fase inteira (`workflow.human_verify_mode = end-of-phase`), cobrindo tambem itens ja implementados em 41-01/41-02/41-03. Ainda nao foi colhido por um operador humano — deve ser apresentado ao final da fase, com veredito registrado bloco a bloco em `41-UAT.md`:

1. **Painel consolidado de boletos (D-06, D-08):** subir `npm run dev` na raiz (backend + frontend juntos), abrir `http://localhost:3000/contas-receber`, autenticar no `PasswordGate`. Confirmar: a secao aparece acima dos cards de resumo; lista boletos de mais de um cliente na mesma tela; cada linha traz nome e ID do cliente, valor, vencimento com contagem de dias, badge de status e badge de NFS-e; o link leva a pagina do cliente correspondente; com muitos boletos a area rola internamente em vez de empurrar o resto da pagina para baixo.
2. **Cards fiscais (D-02, D-07, D-09):** quatro cards de resumo com total a receber, inadimplencia ativa, recebido no mes e taxa de inadimplencia; quatro cards de faixa de atraso nas cores da paleta (amarelo, laranja, vermelho suave, vermelho); tres cards de proximos vencimentos. Nenhum card some quando o valor e zero e nenhum exibe texto quebrado no lugar do numero.
3. **Ordenacao e destaque (D-01, D-10 — entregue neste plano):** trocar a chave de ordenacao reordena a lista imediatamente, sem piscar carregamento; o botao de direcao inverte a ordem; ao clicar em "Vencidos" e depois reordenar, a ordenacao opera apenas sobre os clientes vencidos; a busca por nome continua funcionando junto com a ordenacao; clientes com atraso acima de 90 dias exibem a faixa vermelha a esquerda do card.
4. **Resiliencia (contrato de erro do 41-UI-SPEC.md):** com o backend derrubado, apenas o painel de boletos exibe a mensagem de erro propria — os cards de resumo e a lista de clientes nao somem junto.
5. **Reconciliacao automatica (D-03):** com o backend rodando, a linha de log de reconciliacao aparece com a contagem de boletos pendentes. Registrar o numero observado — e ele que decide se a cadencia de 30 minutos permanece adequada, ja que a estimativa de volume do 41-RESEARCH.md nao foi medida contra producao.

Registrar veredito por bloco. Qualquer reprovacao vira gap para `/gsd-plan-phase 41 --gaps`, nao correcao improvisada.

## Next Phase Readiness

- D-01 e D-10 entregues ponta a ponta no dashboard `/contas-receber`: ordenacao multi-criterio funcional dentro do filtro/busca ativos, e destaque cromatico de inadimplencia antiga sem reordenacao forcada.
- `git diff --name-only` do plano lista exatamente o arquivo previsto na secao `<verification>` do plano (`contas-receber/page.tsx`); `[idcliente]/page.tsx` intocado.
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`, `npm --prefix apps/frontend run build` e `npm --prefix apps/backend run test -- --no-coverage` (39 suites / 458 testes) todos verdes.
- Esta e a ultima plan da Fase 41 — o roteiro de aceite humano consolidado acima fecha o ciclo; nenhum bloqueio conhecido para o encerramento da fase alem da colheita desse veredito humano.

---
*Phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi*
*Completed: 2026-09-05*

## Self-Check: PASSED

Arquivo modificado confirmado em disco (`apps/frontend/src/app/contas-receber/page.tsx`). Commit `177f40e` confirmado em `git log`.
