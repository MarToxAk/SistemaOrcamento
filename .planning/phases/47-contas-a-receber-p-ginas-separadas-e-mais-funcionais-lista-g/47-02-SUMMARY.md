---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
plan: 02
subsystem: frontend/contas-receber
tags: [nextjs, navegacao, filtros-url, boletos]
requires: []
provides:
  - rota /contas-receber/boletos (painel de boletos consolidados)
  - subnavegacao do admin-shell (PaNavItem.filhos, navItemAtivo)
  - useFiltrosUrl e funcoes puras de URL (lerOpcao, lerData, lerTexto, lerInteiroPositivo, montarQuery)
  - formatadores compartilhados e RecursosBootstrap
affects: [47-04, 47-05, 47-06]
tech-stack:
  added: []
  patterns: ["filtros na URL via useSearchParams + router.replace sem scroll", "pastas privadas _componentes/ e _shared/"]
key-files:
  created:
    - apps/frontend/src/app/contas-receber/boletos/page.tsx
    - apps/frontend/src/app/contas-receber/_componentes/boletos-consolidados.tsx
    - apps/frontend/src/app/contas-receber/_shared/recursos-bootstrap.tsx
    - apps/frontend/src/app/contas-receber/_shared/filtros-url.ts
    - apps/frontend/src/app/contas-receber/_shared/use-filtros-url.ts
    - apps/frontend/src/app/contas-receber/_shared/formatadores.ts
    - apps/frontend/scripts/checar-filtros-url.mjs
  modified:
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
    - apps/frontend/src/app/contas-receber/page.tsx
decisions:
  - "Subitens da nav: 'Resumo e Clientes' (/contas-receber) e 'Boletos'; pai destacado por prefixo, filho por igualdade exata."
  - "O cartao ResumoBoletos faz o proprio fetch ao proxy existente do dashboard de boletos (sem proxy novo)."
metrics:
  tasks: 2
  files: 9
status: complete
commits: 2
plan_head_before: 4590e6a
---

# Fase 47 Plano 02: Paginas separadas e filtros na URL Summary

Painel de boletos consolidados movido para a rota protegida /contas-receber/boletos sem alterar regras, resumo enxuto com cartao compacto dos alertas da Fase 45, subnavegacao no admin-shell e filtros de status/busca do resumo na URL.

## O que foi feito

**Tarefa 1 (tracer), commit 3e56166:** o painel (tipos, helpers e componente) foi movido por script, sem edicao manual, de `page.tsx` para `_componentes/boletos-consolidados.tsx` (export default `BoletosConsolidados`; tipos e helpers exportados para o 47-05; `ResumoBoletos` novo). Rota `/contas-receber/boletos` com `PasswordGate`. `admin-shell.tsx` ganhou `filhos`, `navItemAtivo` e CSS `pa-subnav*`. `page.tsx` agora mostra `<ResumoBoletos />` (Vencem em Ate 3 Dias, Atrasados, links Ver Boletos / Ver Atrasados) e usa `RecursosBootstrap`.

**Tarefa 2, commit 4bcc16a:** `filtros-url.ts` (puro, sem imports), `formatadores.ts`, `use-filtros-url.ts`; `page.tsx` embrulhado em `Suspense`, `status` lido da URL com `lerOpcao` (lista permitida) e `busca` com `lerTexto` (80 caracteres); o efeito dependente de `statusFiltro` faz o unico fetch; script `checar-filtros-url.mjs`.

## Verificacao (resultados reais)

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 (apos cada tarefa).
- `npm --prefix apps/frontend run build`: exit 0 nas duas tarefas; o build lista `/contas-receber` e `/contas-receber/boletos` (prova do Suspense).
- `node -v` = v22.22.1 (>= 22.18): script executado de verdade, 7 linhas `OK`, exit 0 (um aviso MODULE_TYPELESS_PACKAGE_JSON do Node, inofensivo).
- Gates: `BoletosConsolidadosPanel` em page.tsx = 0; `estornar-baixa-athos` e `Digite ESTORNAR para confirmar` no arquivo novo = 1 cada; `/contas-receber/boletos` no admin-shell = 1; `useFiltrosUrl` = 2 e `Suspense` = 3 em page.tsx; imports em filtros-url.ts = 0.
- `next-env.d.ts` restaurado apos cada build e nao commitado.
- Nao verificado no navegador (verificacao humana pos-fase prevista no plano).

## Desvios do plano

Nenhum de regra. Observacoes:
- Worktree partia de commit antigo: `git reset --hard 4590e6a` (HEAD da branch feat/fase-42-43 no checkout principal, inclui 47-01). O `git -C` ao repo principal foi bloqueado pela sandbox, entao o hash foi obtido por `git worktree list`.
- `node_modules` (raiz e apps/frontend) via symlink para o repo principal, nao commitados.
- `RecursosBootstrap` e exportado como default e tambem nomeado.
- O link "Ver Atrasados" aponta para `?situacao=atrasado`, que so passa a filtrar com o plano 47-05 (contrato de URL do plano).
- Regras de boleto/baixa/estorno/avisos, `[idcliente]/page.tsx` e proxies nao foram alterados; nenhuma escrita no Athos.

## Stubs conhecidos

Nenhum.

## Self-Check: PASSED

Arquivos criados conferidos no disco e commits 3e56166 e 4bcc16a presentes no historico da branch.
