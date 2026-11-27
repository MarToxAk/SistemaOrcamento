---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 09
subsystem: frontend/propostas
tags: [nextjs, proxy, allowlist, admin-only, tracer, read-only-ui]
requires: [55-06]
provides:
  - rotaPropostaPermitida, montarCaminhoBackend e decidirAcessoProxy (puros, sem imports)
  - proxy admin /api/propostas/[[...path]] (GET, POST, PATCH, DELETE; PDF binario) com lista permitida
  - menu Propostas no admin, lista com filtro e busca, Nova proposta e tela da proposta somente leitura
  - tipos da API de propostas (_shared/tipos.ts)
  - checar-propostas-rotas.mjs (checagem executavel das rotas permitidas e da decisao de acesso)
affects: [55-10, 55-14, 55-15, 55-18]
tech-stack:
  added: []
  patterns: [decisao de acesso como funcao pura provada por script .mjs com type stripping, catch-all opcional com UMA funcao encaminhar, estado de tela = resposta do servidor]
key-files:
  created:
    - apps/frontend/src/lib/propostas-rotas.ts
    - apps/frontend/scripts/checar-propostas-rotas.mjs
    - apps/frontend/src/app/api/propostas/[[...path]]/route.ts
    - apps/frontend/src/app/propostas/_shared/tipos.ts
    - apps/frontend/src/app/propostas/page.tsx
    - apps/frontend/src/app/propostas/[id]/page.tsx
  modified:
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
key-decisions:
  - "A lista permitida cobre somente as 11 combinacoes metodo+caminho que o backend tem apos o 55-06; gerar, recuperar, duplicar, status, pdf e previa (55-18) e templates/preview (55-15) ficam recusadas com 404 ate la, e o script de checagem prova a recusa delas."
  - "Sem sessao e sempre 401, inclusive em caminho nao listado (nao revela quais rotas existem); a ordem e 401, depois 404, depois o caminho do backend."
  - "A query string so e repassada se casar com um conjunto seguro (a-z, 0-9 e . _ ~ % & = + , : @ ! * ' ( ) -); fora disso e descartada, nunca repassada."
  - "Dinheiro e quantidade aparecem exatamente como o servidor devolveu (texto), sem formatacao nem calculo no navegador; a formatacao nasce no plano 55-14."
requirements-completed: [P55-MONT, P55-CICLO]
duration: 20 min
completed: 2026-11-27
status: complete
actuals:
  tokens: 7400
  tasks: 1
  commits: 1
plan_head_before: a95a67be28d94b5f24f68bd064401c3444aae2a9
plan_head_after: 043972cc9016676c7f80e231c5c781e0f7937b6e
---

# Phase 55 Plan 09: Base da area de propostas no frontend Summary

Proxy admin `/api/propostas/[[...path]]` com lista permitida estrita (decidida pela funcao pura `decidirAcessoProxy` e provada por script), menu Propostas, lista com filtro por status e busca, "Nova proposta" que cria rascunho e tela da proposta com itens somente leitura, tudo lendo o que o servidor devolveu.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Menu, lista, Nova proposta e tela da proposta via proxy com lista permitida | 043972c |

## Accomplishments

- `lib/propostas-rotas.ts` (puro): `rotaPropostaPermitida` aceita apenas GET/POST `[]`, GET `produtos`, GET `assinantes`, GET `clientes/<inteiro 1-10 digitos>`, GET/PATCH `<uuid>`, POST `<uuid>/itens`, PATCH/DELETE `<uuid>/itens/<uuid>` e POST `<uuid>/aplicar-percentual`. UUID e minusculo 8-4-4-4-12; qualquer segmento com ponto, barra, percentual, vazio ou maiuscula e recusado.
- `decidirAcessoProxy`: 401 sem sessao para qualquer metodo e caminho; 404 com sessao e combinacao fora da lista; com sessao e combinacao listada devolve `/propostas/...` montado so de segmentos validados.
- Proxy do Next: os quatro metodos (GET, POST, PATCH, DELETE) delegam a UMA `encaminhar`, que resolve `await params`, chama `decidirAcessoProxy({ temSessao: requireAdminSession(req), ... })`, usa `adminBackendFetch` (chaves interna e admin so no servidor), devolve PDF como binario com `Content-Type` e `Content-Disposition` originais e JSON com o mesmo status; falha de rede responde 500 "Falha ao conectar no backend." Nenhum cabecalho do navegador e repassado, so a query e o corpo.
- Menu: item "Propostas" (`file-earmark-ruled`) em `PA_NAV_ITEMS`, depois de "Orçamentos".
- `/propostas`: `PasswordGate` + `RecursosBootstrap` + `AdminShell`; filtro por status (Todas, Rascunho, Enviada, Fechada, Cancelada), busca com atraso de 350 ms (numero do orcamento ou cliente), tabela (numero ou "Rascunho", cliente, total, status, atualizada em, Abrir), paginacao anterior/proxima, estados de carregando, vazio e erro com a `mensagem` do servidor, descartando respostas antigas por contador de requisicao.
- `/propostas/[id]`: carrega `GET /api/propostas/<id>` e mostra status, numero (quando lancada), cliente (razao social do snapshot ou "Sem cliente"), total e a tabela de itens somente leitura (codigo, nome, quantidade, preco final, total) com os textos do servidor. Nenhum preco calculado no navegador; nenhum HTML bruto.

## Verification

- `node apps/frontend/scripts/checar-propostas-rotas.mjs`: exit 0, 55 linhas "OK" (11 aceitos, 24 recusados, montarCaminhoBackend, 19 linhas "OK decidirAcessoProxy"), nenhuma linha SKIP (Node 22.22.1).
- `npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json`: exit 0, sem "error TS".
- Mutacao: trocar a exigencia de sessao em `decidirAcessoProxy` para nao valer em DELETE faz o script terminar com exit 1; restaurado, volta a exit 0.
- Ligacao do proxy: `grep -c decidirAcessoProxy` = 3, `requireAdminSession` = 2, `encaminhar(` = 5, `NEXT_PUBLIC_` = 0; `grep -c "/propostas"` em `admin-shell.tsx` = 1; `dangerouslySetInnerHTML` em `propostas/` = 0.
- Nao executado: verificacao visual das telas no navegador e chamada real ao backend (nao ha harness de teste de rotas do Next neste plano; a verificacao visual e do plano 55-11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem node_modules**
- **Found during:** inicio da tarefa (typecheck)
- **Fix:** `npm ci` na raiz do worktree (nada versionado).
- **Commit:** n/a

### Notas de interpretacao (sem desvio de comportamento)

- `STATUS_ROTULO` e `STATUS_PILL` (constantes de rotulo e cor da pilula) ficaram em `_shared/tipos.ts` para a lista e a tela da proposta nao duplicarem; sao dados constantes, sem regra de negocio.
- `ProdutoBusca` segue o contrato real do backend (`ProdutoPropostaResultado`: `descricao`, `preco`, `custoUnitario` etc.), nao o texto generico do plano.
- A coluna "Codigo" da tabela de itens usa `idproduto`, o unico codigo que o contrato `PropostaDetalhe` expoe.
- O proxy trata resposta vazia do backend como corpo vazio com o mesmo status e resposta nao JSON como 502 "Resposta invalida do backend."; o plano so especificava JSON e PDF.

**Total deviations:** 1 (ambiente). **Impact:** nenhum.

## Known Stubs

None.

## Threat Flags

None alem do mapeado (T-55-39 a T-55-41): o proxy e a lista permitida mitigam T-55-39 e T-55-40; texto da API e renderizado como texto React (T-55-41).

## Self-Check: PASSED

- Arquivos existem: propostas-rotas.ts, checar-propostas-rotas.mjs, api/propostas/[[...path]]/route.ts, propostas/_shared/tipos.ts, propostas/page.tsx, propostas/[id]/page.tsx, admin-shell.tsx (modificado).
- Commit 043972c presente na branch (1 commit medido de `plan_head_before` a `plan_head_after`).
