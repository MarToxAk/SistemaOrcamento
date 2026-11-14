---
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
plan: 05
subsystem: frontend
tags: [contas-receber, ordenacao, boletos, aba-cliente, url-state, next]
requires:
  - phase: 48-01
    provides: ordenacao.ts (CONFIG_BOLETOS_CLIENTE, lerOrdenacao, ordenacaoParaUrl, ordenarBoletos) e SeletorOrdenacao
  - phase: 48-02
    provides: expireAt e dataPagamento no POST titulos-em-uso
provides:
  - "Aba Boletos do cliente ordenavel por vencimento e pago via ?aba=boletos&ordem=&dir="
  - "Troca de aba na tela do cliente limpa ordem e dir"
affects: [48-04]
tech-stack:
  added: []
  patterns:
    - "Ordenar grupos (Map cobrancaId -> boleto + titulos) mapeando para a forma esperada por ordenarBoletos e voltando ao grupo"
key-files:
  created: []
  modified:
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/compartilhado.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
key-decisions:
  - "Sem Nome na aba do cliente (D-03): o seletor usa CONFIG_BOLETOS_CLIENTE (somente Data de Vencimento e Pago)"
  - "expireAt e dataPagamento opcionais e tratados como null antes do deploy do backend 48-02; boleto sem vencimento fica por ultimo"
  - "Troca de aba limpa ordem e dir para Boletos e Notas (mesmas chaves) abrirem cada um no seu padrao"
requirements-completed: [ORD-01, ORD-02, ORD-03, ORD-06]
duration: ~15min
completed: 2026-11-14
status: complete
commits: 2
plan_head_before: 57c0f201f0a763e902fd1b30016ff116fc8cc251
plan_head_after: 71e824e2129e85eba7cd5045e64faf5cccf1f364
actuals:
  tokens: 2200
  tasks: 2
  commits: 2
---

# Fase 48 Plano 05: Aba Boletos do cliente com ordenacao Summary

**Os boletos da aba do cliente passam a ser ordenados por vencimento ou por pago (com data de pagamento como desempate), com a escolha na URL, seletor "Ordenar Por" no cabecalho de "Boletos Emitidos" e datas "Venc." e "Pago em" em cada grupo; trocar de aba volta cada uma ao seu padrao.**

## Tarefas

1. **Tarefa 1 (tracer): vencimento e pagamento ate a aba ordenada pela URL** - commit `436f72a`.
   - `compartilhado.tsx`: `boletoAtivo.expireAt?` e `dataPagamento?`.
   - `use-dados-cliente.ts`: `boletoMap` copia `expireAt` e `dataPagamento` (`?? null`), sem fetch novo.
   - `aba-boletos.tsx`: `useFiltrosUrl`, `lerOrdenacao(obter("ordem"), obter("dir"), CONFIG_BOLETOS_CLIENTE)`, `mudarOrdenacao`, `gruposOrdenados` (ordenarBoletos sobre os grupos) no lugar do `[...boletoGrupos.values()]`, `SeletorOrdenacao` no cabecalho do cartao (so quando ha grupos), e spans "Venc. DD/MM/AAAA" e "Pago em DD/MM/AAAA" (so se pago e com data) via `formatarDataEmissao`. Detalhes, PDF, Verificar, E-mail, Cancelar, modal e sub-tabela intactos.
2. **Tarefa 2: troca de aba limpa ordem e dir** - commit `71e824e`. `page.tsx`: `definir({ aba: ..., ordem: null, dir: null })`.

Portao do tracer: `<verify>` (checar-ordenacao, tsc, build) reexecutado de ponta a ponta apos a Tarefa 1 e passou antes de expandir.

## Resultados reais da verificacao

- `node apps/frontend/scripts/checar-ordenacao.mjs`: exit 0, 21 linhas `OK` (Node v22.22.1). Tambem exit 0: `checar-filtros-boletos`, `checar-filtros-url`, `checar-notas`.
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 (apos cada tarefa).
- `npm --prefix apps/frontend run build`: exit 0 (apos cada tarefa); `next-env.d.ts` restaurado com `git checkout --`.
- Greps de aceitacao em `aba-boletos.tsx`: `ordenarBoletos(` = 1, `CONFIG_BOLETOS_CLIENTE` = 4, `SeletorOrdenacao` = 2 (import + uso), `gruposOrdenados.map(` = 1; preservacao: `Cancelar boleto #` = 1, `verificar-pagamento` = 1, `/cancelar` = 1. `expireAt` em `use-dados-cliente.ts` = 1 e em `compartilhado.tsx` = 1; `dataPagamento` em `use-dados-cliente.ts` = 1. `page.tsx`: `ordem: null` = 1, `dir: null` = 1.

## Deviations from Plan

Nenhuma de regra 1-4; plano executado como escrito. Observacoes de ambiente:

- Worktree reposicionado com `git reset --hard 57c0f20` (HEAD do checkout principal, inclui 48-01 e 48-02).
- `node_modules` (raiz e `apps/frontend`) ligados por symlink ao repo principal; aparecem como `??` e nao foram commitados.
- Nao foi possivel validar visualmente (sem navegador); validado por tsc, build e casos executaveis. Verificacao humana pos-fase continua pendente (com backend 48-02 publicado): em cliente com boleto pago e pendente, alternar Data/Pago e a direcao, F5, trocar para Notas e voltar.

## Known Stubs

Nenhum. `expireAt`/`dataPagamento` opcionais sao intencionais: antes do deploy do backend 48-02 chegam como null (boletos sem data vao por ultimo, sem erro).

## Threat Flags

Nenhuma superficie nova. T-48-10 mitigado: `lerOrdenacao` com `CONFIG_BOLETOS_CLIENTE` (valores invalidos viram o padrao) e datas renderizadas como texto pelo React. T-48-11 mitigado: corpo de cada grupo inalterado, baselines de "Cancelar boleto #", `verificar-pagamento` e `/cancelar` = 1. Nenhum arquivo de notas (`aba-notas.tsx`, `notas-fiscais.tsx`) tocado; nenhuma escrita no Athos.

## Self-Check: PASSED

- Arquivos modificados existem (4 de codigo); commits `436f72a` e `71e824e` presentes no historico do worktree.
