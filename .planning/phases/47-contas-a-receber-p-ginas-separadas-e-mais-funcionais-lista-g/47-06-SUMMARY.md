---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
plan: 06
subsystem: frontend/contas-receber
tags: [nextjs, notas-fiscais, nfse, nfe, xml, zip, filtros-url]
requires: [47-01, 47-02, 47-03, 47-04]
provides:
  - "Rota /contas-receber/notas (PasswordGate) com filtros de tipo, periodo, busca e pagina na URL"
  - "Componente NotasFiscais: NFS-e e NF-e dos boletos com PDF, XML, 'PDF e XML' e ZIP em lote"
  - "_shared/notas-util.ts (funcoes puras + baixarArquivo) e scripts/checar-notas.mjs"
  - "Proxy GET /api/cobranca/nfe/danfe com requireAdminSession"
  - "Aba Notas Fiscais do cliente usando o mesmo componente, com Remover Anexo preservado"
affects: []
tech-stack:
  added: []
  patterns: ["funcoes puras sem imports para o script Node", "um download por vez com rotulo Baixando...", "selecao por chave sobrevive a troca de pagina"]
key-files:
  created:
    - apps/frontend/src/app/contas-receber/notas/page.tsx
    - apps/frontend/src/app/contas-receber/_componentes/notas-fiscais.tsx
    - apps/frontend/src/app/contas-receber/_shared/notas-util.ts
    - apps/frontend/src/app/api/cobranca/nfe/danfe/route.ts
    - apps/frontend/scripts/checar-notas.mjs
  modified:
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-notas.tsx"
decisions:
  - "Uma unica paginacao (50 por pagina) sobre NFS-e e NF-e juntas (NFS-e primeiro): a secao de cada tipo mostra so os itens da pagina atual, sem repetir linhas."
  - "A selecao guarda chaves (nfse:ID, nfe:BOLETO:NUMERO) e e resolvida contra a lista carregada; sobrevive a troca de pagina e notas que somem da lista saem sozinhas da contagem."
  - "Na aba do cliente, id invalido mostra 'Cliente invalido.' em vez de chamar a lista sem filtro (o proxy ignora idclienteAthos nao numerico e devolveria todos os clientes)."
metrics:
  tasks: 3
  files: 7
  duration: "aprox. 35 min"
status: complete
commits: 3
plan_head_before: 99b62bdc9e186b47d96aabd9fd7913164bcf0b24
plan_head_after: 8c0d990643f3aab14ac37d0879326a2218d0128e
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Fase 47 Plano 06: Notas Fiscais em pagina propria e na aba do cliente Summary

Pagina /contas-receber/notas e aba Notas Fiscais do cliente compartilham o componente `NotasFiscais`: lista NFS-e e NF-e dos boletos e baixa PDF (DANFSe/DANFE), XML salvo (ou "XML Indisponível") e ZIP "PDF e XML" por nota ou em lote de ate 50, sem alterar nenhuma regra de boleto, baixa ou aviso (D-03).

## O que foi feito

**Tarefa 1 (tracer), commit 05d2ff0.** Rota `/contas-receber/notas` atras do `PasswordGate`, subitem "Notas Fiscais" (icone file-earmark-text) depois de Boletos na barra lateral e `NotasFiscais` listando as NFS-e de `GET /api/cobranca/notas`, com estados de carga, erro ("Não foi possível carregar as notas fiscais." + Atualizar) e vazio aviso de `truncado` ("Mostrando as 500 NFS-e mais recentes..."). O botao XML chama `baixarArquivo("/api/cobranca/nfse/<id>/xml")`: fica desabilitado com title "XML indisponível" quando a lista ja diz `indisponivel`; um 404 com "XML indisponível" marca a linha em estado local (pill "XML Indisponível") e mostra a mensagem do backend numa linha `role="status"`. Nenhum arquivo falso e criado: erro nunca vira download.

**Tarefa 2, commit 520be2d.** Proxy `GET /api/cobranca/nfe/danfe` (`requireAdminSession`, `cobrancaBoletoId` `^\d+$` e `numero` `^\d{1,15}$`, repassa o `Content-Disposition` do backend, 502 em falha de rede). No componente: PDF (`nfse/<id>/pdf` e `nfe/danfe`), XML e "PDF e XML" (POST `notas/zip`) por nota; secao "NF-e dos Boletos" com Boleto (#id e status) e `avisoNfe` como alerta; checkbox por linha e "selecionar todos da pagina"; barra `pa-actionbar` com "N nota(s) selecionada(s)", "Baixar Selecionadas (ZIP)" e "Limpar Seleção"; acima de `LIMITE_NOTAS_ZIP` (50, espelhado do backend e do proxy) o botao fica desabilitado e aparece "Máximo de 50 notas por arquivo ZIP."; um download por vez com "Baixando..."; paginacao de 50 com Anterior/Próxima e "Página X de Y". Na pagina: `pa-seg` de Tipo, datas De/Até, busca por cliente ou numero (gravada na URL com 300 ms de atraso) e "Limpar Filtros", todos via `useFiltrosUrl`; mudar filtro volta `pagina` para 1. `checar-notas.mjs` com 14 casos.

**Tarefa 3, commit 8c0d990.** `AbaNotas` troca a lista propria de NFS-e por `<NotasFiscais idclienteAthos mostrarCliente={false} acoesExtrasNfse=... />` (NFS-e e NF-e do cliente, com PDF/XML/ZIP). A acao extra "Remover Anexo" (`btn btn-sm btn-outline-danger`, title "Remove o anexo local. Não cancela a nota na prefeitura.") usa o mesmo texto de `confirm`, o mesmo `DELETE /api/cobranca/nfse/<id>` e a mesma mensagem de erro de antes; no sucesso recarrega a lista (funcao `recarregar` do componente) e chama `onRecarregar()`. A secao "Notas Fiscais Athos" com busca por numero ficou como estava, mais a linha de ajuda pedida.

## Verificacao (resultados reais)

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 (apos cada tarefa). `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- `npm --prefix apps/frontend run build`: exit 0 nas tres tarefas; `/contas-receber/notas` e `/api/cobranca/nfe/danfe` aparecem no log do build (baseline: inexistentes). `apps/frontend/next-env.d.ts` restaurado apos cada build.
- `node apps/frontend/scripts/checar-notas.mjs` (Node 22.22.1): 14 linhas `OK`, exit 0. `checar-filtros-url.mjs`: 7 OK. `checar-filtros-boletos.mjs`: 9 OK.
- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 21 suites, 298 testes passando (backend nao foi tocado). A linha ERROR "PERMISSAO_NEGADA" no log vem de um teste que simula falha de baixa.
- Greps de aceitacao: `/contas-receber/notas` no admin-shell 1; `/xml` 1 e `XML Indisponível` 1 no componente; `PasswordGate` 3 e `useFiltrosUrl` 2 na pagina; imports no `notas-util.ts` 0; `/api/cobranca/notas/zip` 3, `/api/cobranca/nfe/danfe` 1 e `LIMITE_NOTAS_ZIP` 3 no componente; `requireAdminSession` 2 no proxy do DANFE. Aba: `NotasFiscais` 7, `confirm(` 1, "Isso NÃO cancela a nota na prefeitura" 1, `/notas-fiscais` 3; gate de preservacao imprimiu PRESERVADO.
- Nao houve teste manual em navegador nem download real (sem sessao de admin, backend e dados nesta execucao): os fluxos de clique, o ZIP real e o XML real ficam para a verificacao humana pos-fase abaixo.

## Desvios do plano

1. **[Ordem] `notas-util.ts` completo ja na tarefa 1.** O plano distribuia as funcoes entre as tarefas 1 e 2; o arquivo inteiro (inclusive `montarPayloadZip`, `filtrarNotasExibicao`, `paginar`) entrou no commit da tarefa 1. Sem efeito funcional; so a separacao dos commits difere do texto do plano.
2. **[Rule 2 - Seguranca] Guard de id na aba do cliente.** `Number(idcliente)` invalido viraria `idclienteAthos=NaN`, que o proxy `notas` descarta, devolvendo as notas de todos os clientes na tela de um cliente. A aba agora mostra "Cliente inválido." sem chamar a lista. Commit 8c0d990.
3. **Rotulo do botao de remover.** O botao antigo dizia "Cancelar ⓘ"; seguindo o plano, agora e "Remover Anexo" (mesmo title, confirm e DELETE).
4. **Link externo da NFS-e na aba do cliente.** O antigo icone que abria `linkNfse` (prefeitura) deu lugar ao botao PDF pelo proxy `nfse/<id>/pdf` (D-10). A aba tambem deixou de mostrar o numero do RPS, que nao vem da lista nova de `GET /api/cobranca/notas`.
5. **Mensagens de erro do proxy.** `mensagemErroDownload` tambem le o campo `error` do corpo (os proxies Next respondem `{ error }` em 400 e 401 proprios), alem de `message` do backend.
6. **Ambiente.** Faltavam `node_modules` no worktree: criados symlinks para os do repositorio principal (nao commitados; aparecem como untracked). O build emite aviso de "workspace root" por causa deles.

## Problemas conhecidos e itens adiados

- **Nao corrigido, por decisao do usuario:** `AthosService.buscarNotasFiscaisCliente` usa `n.valornota` (coluna inexistente) e devolve lista vazia; a secao "Notas Fiscais Athos" da aba do cliente segue vazia. Este plano nao depende dela (usa `GET /api/cobranca/notas`, do 47-03); permanece em `deferred-items.md`.
- O proxy existente `nfse/<id>/pdf` nao usa `requireAdminSession` (pre-existente, fora do escopo de D-03); o PDF da NFS-e continua pela mesma rota de antes.
- Verificacao humana pos-fase: em /contas-receber/notas baixar o XML de uma NFS-e do padrao Nacional; tentar o XML de uma NFS-e antiga (deve aparecer "XML Indisponível"); baixar um ZIP com duas notas e abrir o LEIA-ME se houver; conferir o DANFE de uma NF-e de boleto.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do registrado no `<threat_model>` do plano (T-47-23 a T-47-27): pagina atras do `PasswordGate`; proxies de lista, XML, ZIP e DANFE com `requireAdminSession`; payload do ZIP so com linhas listadas; botao de lote bloqueado acima de 50; `extrairNomeArquivo` fica so com o nome apos a ultima barra e sem caracteres de controle (checado no script); a tela apenas repassa os bytes da rota do 47-01.

## Self-Check: PASSED

- Arquivos criados e modificados presentes (7 arquivos do `git diff --stat`).
- Commits 05d2ff0, 520be2d e 8c0d990 presentes no historico da branch; `git rev-list --count` entre a base e o HEAD de codigo: 3.
