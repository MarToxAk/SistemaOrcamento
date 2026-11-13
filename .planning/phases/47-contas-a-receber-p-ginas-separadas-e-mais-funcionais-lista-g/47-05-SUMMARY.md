---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
plan: 05
subsystem: frontend/contas-receber
tags: [nextjs, boletos, detalhe, filtros-url, clipboard]
requires: [47-02, 47-03, 47-04]
provides:
  - BoletoDetalhe (linha digitavel e PIX copiaveis, titulos, ultimo aviso, historico de baixa, area de acoes) e copiarTexto
  - filtros-boletos.ts (lerFiltrosBoletos, filtrarBoletos, normalizarTexto) e script checar-filtros-boletos.mjs
  - proxy GET /api/cobranca/boleto/[id]/baixa-athos
  - tabela compacta em /contas-receber/boletos com linha expansivel e filtros/boleto aberto na URL
  - botao Detalhes nos grupos da aba Boletos do cliente
affects: [47-06]
tech-stack:
  added: []
  patterns: ["linha expansivel controlada pela URL (?boleto=)", "busca digitada local com gravacao atrasada na URL", "copia com fallback textarea + execCommand fora de HTTPS"]
key-files:
  created:
    - apps/frontend/src/app/contas-receber/_componentes/boleto-detalhe.tsx
    - apps/frontend/src/app/contas-receber/_shared/filtros-boletos.ts
    - apps/frontend/src/app/api/cobranca/boleto/[id]/baixa-athos/route.ts
    - apps/frontend/scripts/checar-filtros-boletos.mjs
  modified:
    - apps/frontend/src/app/contas-receber/_componentes/boletos-consolidados.tsx
    - apps/frontend/src/app/contas-receber/boletos/page.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx
decisions:
  - "A linha aberta vem da URL (?boleto=<id>) e so abre se o boleto estiver na lista filtrada; abrir/fechar grava/remove o parametro."
  - "Depois de uma acao a lista e recarregada em modo silencioso (sem trocar a tabela pelo spinner), para o detalhe aberto nao fechar; BoletoDetalhe remonta pela key id:status:athosBaixaStatus e rebusca o historico."
  - "Ultimo aviso saiu da coluna Vencimento e ficou so no detalhe (tabela compacta)."
metrics:
  tasks: 3
  files: 7
status: complete
commits: 3
plan_head_before: 5a931f42118e8a800bcae3212966282bcab2efa9
plan_head_after: d1dcac833e96a4a8e104ff88ee1b29ba2bc22855
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
---

# Fase 47 Plano 05: Boletos em tabela compacta com linha expansivel Summary

Boletos de /contas-receber/boletos viram uma tabela compacta (cliente, valor, vencimento, status, selos de NFS-e e Athos) cuja linha abre um detalhe com linha digitavel e PIX copiaveis, titulos, ultimo aviso, historico de baixa no Athos e todas as acoes existentes; filtros e boleto aberto ficam na URL, e a aba Boletos do cliente ganhou o botao Detalhes com o mesmo painel.

## O que foi feito

**Tarefa 1 (tracer), commit 453ee0c:** proxy `GET /api/cobranca/boleto/[id]/baixa-athos` (`requireAdminSession`, id `^\d+$`, 502 em falha de rede); `boleto-detalhe.tsx` busca `/detalhe` (47-03) e `/baixa-athos` em paralelo com carregando/erro independentes; `copiarTexto` usa `navigator.clipboard` em contexto seguro e, senao, textarea fora da tela + `execCommand("copy")`; botao vira "Copiado!" por 2 s ou "Não foi possível copiar". Tabela ganhou chevron (`aria-expanded`) e `tr.pa-row-detalhe`.

**Tarefa 2, commit fb21a59:** `filtros-boletos.ts` puro (sem imports) e `checar-filtros-boletos.mjs`; barra `pa-filtros` (Status, Situação, Vencimento De/Até, Buscar Cliente, Limpar Filtros) lida/gravada pela URL; "Mostrando X de Y" e estado vazio com botao de limpar; colunas reduzidas e clique na linha abre o detalhe; acoes reunidas em `acoes` do detalhe: Baixar PDF, Verificar Pagamento (mostra o status devolvido), Cancelar Boleto (so se nao pago, mesmo `confirm` da aba do cliente), Simular / Baixar no Athos / Estornar baixa (mesmas condicoes e textos) e Ver Cliente (`?aba=boletos`); `formatBRL` agora vem de `_shared/formatadores`; `boletos/page.tsx` com Suspense.

**Tarefa 3, commit d1dcac8:** botao Detalhes (chevron, `aria-expanded`) em cada grupo da aba Boletos, abrindo `BoletoDetalhe` sem `acoes` entre o cabecalho e a sub-tabela; nada mais mudou no arquivo.

## Verificacao (resultados reais)

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 apos cada tarefa; `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0 (backend nao alterado).
- `npm --prefix apps/frontend run build`: exit 0 nas tres tarefas; `/contas-receber/boletos` listada. `next-env.d.ts` restaurado apos cada build e nao commitado.
- `node -v` = v22.22.1; `node apps/frontend/scripts/checar-filtros-boletos.mjs`: exit 0, 9 linhas `OK` (aviso MODULE_TYPELESS_PACKAGE_JSON do Node, inofensivo).
- Gates: `/detalhe` e `baixa-athos` em boleto-detalhe.tsx = 1 cada; `execCommand` = 2; `requireAdminSession` no proxy novo >= 1; `filtrarBoletos` = 2, `useFiltrosUrl` = 2, `verificar-pagamento` = 1, `/cancelar` = 1, `Digite ESTORNAR para confirmar` = 1, `export function ResumoBoletos` = 1 em boletos-consolidados.tsx; `Suspense` em boletos/page.tsx = 3; imports em filtros-boletos.ts = 0; gate de preservacao da aba Boletos imprime PRESERVADO.
- Tracer: `<verify>` (tsc + build) reexecutado de ponta a ponta antes de expandir; passou.
- Nao verificado no navegador nem contra a EFI real (a verificacao humana e o campo `banking_billet.barcode`/`pix.qrcode` seguem pendentes, conforme D-13).

## Desvios do plano

Nenhum de regra. Observacoes:
- Worktree partia de commit antigo: `git reset --hard 5a931f4` (HEAD do checkout principal, inclui 47-01..47-04). `node_modules` (raiz, frontend e backend) via symlink para o repo principal, nao commitados (aparecem como untracked no worktree).
- Ajuste de implementacao: o recarregamento da lista apos acoes e silencioso (parametro `silencioso` em `fetchBoletosDashboard`); o botao Atualizar continua mostrando o spinner.
- O ultimo aviso deixou a coluna Vencimento e so aparece no detalhe (coerente com a tabela compacta; nenhuma regra de aviso mudou).
- Regras de boleto, baixa, estorno e avisos, textos de confirm/prompt e backend nao foram alterados; nenhuma escrita no Athos; linha digitavel e PIX nao sao logados nem gravados em storage.

## Stubs conhecidos

Nenhum.

## Self-Check: PASSED

Arquivos criados conferidos no disco e commits 453ee0c, fb21a59 e d1dcac8 presentes no historico da branch.
