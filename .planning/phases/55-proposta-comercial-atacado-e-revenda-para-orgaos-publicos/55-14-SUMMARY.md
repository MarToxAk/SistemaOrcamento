---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 14
subsystem: frontend/propostas
tags: [nextjs, formatadores-puros, busca-produto, tabela-itens, abaixo-do-custo, tracer]
requires: [55-06, 55-09]
provides:
  - formatadores puros pt-BR (formatarDinheiro, formatarQuantidade, formatarMargem, rotuloStatus, classeStatus, mensagemDeErro) e regras de estado de tela (podeEditar, linhaEstado)
  - checar-propostas-formatadores.mjs (61 linhas OK, com casos limite)
  - BuscaProduto (busca de produto do Athos com atraso, listbox acessivel, quantidade e orientacao de produto nao encontrado)
  - TabelaItens (edicao de itens, ajuste, aplicar % em todos, custo, margem, destaque abaixo do custo, prop desabilitado)
  - tela /propostas/[id] ligada a busca e a tabela; estado = resposta do servidor
affects: [55-10, 55-18]
tech-stack:
  added: []
  patterns: [regra de tela como funcao pura provada por script .mjs com type stripping, texto decimal formatado por BigInt sem ponto flutuante, callbacks de edicao devolvem mensagem de erro ou null e a resposta do servidor substitui o estado]
key-files:
  created:
    - apps/frontend/src/app/propostas/_shared/formatadores.ts
    - apps/frontend/scripts/checar-propostas-formatadores.mjs
    - apps/frontend/src/app/propostas/_componentes/busca-produto.tsx
    - apps/frontend/src/app/propostas/_componentes/tabela-itens.tsx
  modified:
    - apps/frontend/src/app/propostas/[id]/page.tsx
key-decisions:
  - "O navegador nunca calcula preco: as edicoes enviam so intencoes (quantidade, nome, descricaoCurta, ajuste { tipo, valor }) e a pagina substitui o estado pela resposta completa do servidor, inclusive em DELETE e aplicar-percentual."
  - "linhaEstado le somente a flag abaixoDoCusto do servidor e nunca compara preco, custo ou margem; preco igual ao custo (flag falsa) nao destaca e nada bloqueia (D-13)."
  - "podeEditar e verdadeiro so para o texto exato RASCUNHO; a pagina passa desabilitado={!podeEditar(status)} a TabelaItens e troca a busca por um aviso de que so e possivel duplicar (D-08)."
  - "A marca do produto aparece apenas na lista da busca; a tabela de itens nao tem coluna de marca (D-22)."
  - "Zero arredondado nunca leva sinal (-0.001 vira R$ 0,00 e -0.04 vira 0,0%)."
requirements-completed: [P55-MONT, P55-CICLO]
duration: 40 min
completed: 2026-11-27
status: complete
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
plan_head_before: 24d3834bb8d17777678c7c8c3858eed2451ebb0c
plan_head_after: bf2190ed2b2540ba67a9a7e0139366389a7680df
---

# Phase 55 Plan 14: Montagem de itens na tela da proposta Summary

Busca de produto do Athos, tabela de itens editavel (nome, descricao curta, quantidade, ajuste por item, aplicar % em todos, custo, margem e destaque vermelho abaixo do custo) e formatadores puros com checagem executavel de `podeEditar` e `linhaEstado`, sempre exibindo o que o servidor calculou.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Buscar produto do Athos e adicionar o item pela tela, exibindo a resposta do servidor | 44951f4 |
| 2 | Tabela de itens editavel: ajuste, aplicar % em todos, custo, margem e destaque abaixo do custo | bf2190e |

## Accomplishments

- `_shared/formatadores.ts` (puro, sem imports): dinheiro e margem por BigInt half-up sobre o texto (`"1234567.89"` = `R$ 1.234.567,89`, `"-3.45"` = `-R$ 3,45`, `"66.675"` = `66,7%`, invalido = `—`), quantidade sem zeros finais, rotulo e classe de status, `mensagemDeErro`, `podeEditar` e `linhaEstado`.
- `scripts/checar-propostas-formatadores.mjs`: 61 linhas OK, inclusive `podeEditar` recusando LANCANDO, ENVIADA, FECHADA, CANCELADA, `rascunho`, ` RASCUNHO`, vazio, null e undefined, e `linhaEstado` com flag verdadeira, falsa, nula, ausente, preco igual ao custo e preco abaixo do custo com flag falsa (nao recalcula).
- `BuscaProduto`: atraso de 350 ms, minimo de 2 caracteres, `GET /api/propostas/produtos?q=...&limit=10`, combobox com listbox e navegacao por teclado, codigo, descricao, marca (so apoio), unidade, estoque da loja e preco; produto sem preco desabilitado com o motivo; escolha pede quantidade (ate 3 casas, inteiro quando o produto nao fraciona); resultado vazio mostra "Produto não encontrado? Cadastre no Athos desktop e busque de novo: este sistema não cadastra produtos."
- `TabelaItens` com `desabilitado` em todos os campos e botoes: edicao de nome e descricao e quantidade no `onBlur` (so envia se mudou), seletor de ajuste (Nenhum, Percentual %, Preço final R$) confirmado por OK ou Enter com o texto de ajuda do D-02a, preco final, total, custo unitario, margem liquida, remover (com confirmacao), estado "Salvando..." e erro por linha, barra "Aplicar % em todos os itens" com texto de ajuda (substitui os ajustes individuais e arredonda cada item para cima) e rodape com o total. Cada campo volta ao valor do servidor quando o servidor o altera.
- `[id]/page.tsx`: funcao unica `enviar` para POST de item, PATCH de item, DELETE de item e `aplicar-percentual`; a resposta completa vira o estado; erros por `mensagemDeErro`; status por `rotuloStatus` e `classeStatus`; busca so renderizada quando `podeEditar`; fora de RASCUNHO aparece o aviso de que so da para duplicar.

## Verification

- `node apps/frontend/scripts/checar-propostas-formatadores.mjs`: exit 0, 61 linhas OK, sem SKIP (Node 22.22).
- `node apps/frontend/scripts/checar-propostas-rotas.mjs`: exit 0, 55 linhas OK, sem SKIP.
- `npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json`: exit 0, sem `error TS` (rodado apos cada tarefa).
- Mutacoes provadas: trocar `podeEditar` para `status !== "FECHADA"` faz o script terminar com exit 1; trocar `linhaEstado` para `abaixoDoCusto !== undefined` faz o script terminar com exit 1; restaurados, exit 0.
- Greps: `/api/propostas/produtos` em busca-produto = 1; `Cadastre no Athos desktop` = 1; `dangerouslySetInnerHTML` nos dois componentes = 0; `linhaEstado` em tabela-itens = 3; `podeEditar` em page = 3; `Aplicar % em todos` = 1; `desabilitado` em tabela-itens = 8.
- Nao executado: verificacao visual no navegador e chamada real ao backend (do plano 55-11); nao ha harness de teste de componentes React neste frontend.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem node_modules**
- **Found during:** inicio da execucao (typecheck)
- **Fix:** `npm ci` na raiz do worktree (nada versionado).
- **Commit:** n/a

### Notas de interpretacao (sem desvio de comportamento)

- `classeStatus` devolve so as classes de cor (`bg-secondary`, `bg-warning text-dark`, `bg-primary`, `bg-success`, `bg-danger`, `bg-light text-dark border` para desconhecido); a pagina acrescenta `badge`. A tela deixou de usar `STATUS_PILL` e `STATUS_ROTULO` de `_shared/tipos.ts`; as constantes continuam la porque a lista (`propostas/page.tsx`) as usa.
- A regra `permiteFracionar` (quantidade inteira para produto que nao fraciona) e validada na tela como orientacao ao operador; o servidor continua a autoridade.
- O CSS `table-danger` do Bootstrap nao colore `.pa-table`; `TabelaItens` traz uma regra local para pintar as celulas da linha destacada.
- Execucao no modo padrao (verificacao humana no fim da fase): o gate do tracer foi cumprido re-rodando a verificacao automatizada ponta a ponta, que passou antes de expandir.

**Total deviations:** 1 (ambiente). **Impact:** nenhum.

## Known Stubs

None.

## Threat Flags

None alem do mapeado: T-55-42 (tela so envia intencoes e exibe a resposta do servidor; formatadores, `podeEditar` e `linhaEstado` provados por script) e T-55-58 (nenhum HTML bruto nos dois componentes, guard por grep).

## Self-Check: PASSED

- Arquivos existem: formatadores.ts, checar-propostas-formatadores.mjs, busca-produto.tsx, tabela-itens.tsx, `[id]/page.tsx` (modificado).
- Commits 44951f4 e bf2190e presentes na branch (2 commits medidos de `plan_head_before` a `plan_head_after`).
