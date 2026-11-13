---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
plan: 04
subsystem: frontend/contas-receber/[idcliente]
tags: [nextjs, refatoracao, abas, url, boletos, nfse]
requires: [47-02]
provides:
  - "Tela do cliente em quatro abas pela URL (?aba=gerar-boleto|boletos|notas; sem parametro = Contas em Aberto)"
  - "page.tsx de 172 linhas (antes 2778) com PasswordGate, Suspense e useFiltrosUrl"
  - "_abas/compartilhado.tsx (AbaCliente, ABAS_CLIENTE, AbasNavegacao, interfaces e helpers de e-mail)"
  - "_abas/use-dados-cliente.ts (hook useDadosCliente com recarregar)"
  - "AbaContasEmAberto, AbaGerarBoleto, AbaBoletos, AbaNotas, EstilosModal em arquivos proprios"
affects: [47-05, 47-06]
tech-stack:
  added: []
  patterns: ["extracao mecanica por faixas de linhas do arquivo original", "aba na URL com lista fechada (lerOpcao)", "export nomeado + default em cada aba"]
key-files:
  created:
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/compartilhado.tsx"
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts"
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-contas-em-aberto.tsx"
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-gerar-boleto.tsx"
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/estilos-modal.tsx"
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx"
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-notas.tsx"
  modified:
    - "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"
decisions:
  - "Cada aba exporta o componente nomeado (contrato do plano) e tambem como default, para os planos 47-05 e 47-06 importarem de qualquer forma."
  - "As contagens das abas mostram titulos em aberto, titulos livres e numero de boletos distintos; a aba Notas fica sem contagem (a carga das notas e propria da aba)."
  - "O CSS das abas (pa-tabs, pa-tab, pa-tab-active, pa-tab-count) vive num <style> dentro de AbasNavegacao, sem tocar no admin-shell."
metrics:
  tasks: 3
  files: 8
  duration: "aprox. 1 h"
status: complete
commits: 3
plan_head_before: 58d64b47637030a72b504335906aba09bf02406d
plan_head_after: 6f97c63fc2992e8404f2c176634c8ca5a487cb08
actuals:
  tokens: 32900
  tasks: 3
  commits: 3
---

# Fase 47 Plano 04: Tela do cliente em quatro abas Summary

A tela `/contas-receber/[idcliente]` (2.778 linhas num arquivo) virou uma casca de 172 linhas com quatro abas compartilháveis pela URL (Contas em Aberto, Gerar Boleto, Boletos e Notas Fiscais), cada uma em componente próprio dentro de `[idcliente]/_abas/`, sem mudar endpoints, corpos de requisição, textos de confirmação nem regras de bloqueio (D-03).

## O que foi feito

A extração foi mecânica: um script Python copiou faixas exatas de linhas do arquivo original (`git show 74e02d8`, 2.778 linhas) para os arquivos novos. Só foram escritos à mão o JSX novo (abas, tabela somente leitura, cartões de cada aba) e os ajustes pedidos pelo plano.

**Tarefa 1 (tracer), commit 019cb6a.**
- `compartilhado.tsx`: interfaces exportadas, `EMAIL_CC_MAX`, `EMAIL_CC_PADRAO_TIMEOUT_MS`, `EMAIL_RE`, `mesclarEmailsCc`, `StatusEmailBadge`, `badgeClassName`, mais `AbaCliente`, `ABAS_CLIENTE` e `AbasNavegacao` (`nav.pa-tabs` com `role="tablist"`, botões `role="tab"` com `aria-selected`, contagem opcional, rolagem horizontal em tela estreita).
- `use-dados-cliente.ts`: `useDadosCliente(idcliente)` com o efeito de carga copiado sem mudança (dados do cliente, títulos, `nf-status`, `titulos-em-uso` de boleto e de NFS-e, histórico) e `recarregar(mostrarCarregando)`.
- `aba-contas-em-aberto.tsx`: tabela somente leitura com todos os títulos (Título, Vencimento, Valor, NF com link do PDF da NFS-e, pill do Boleto ou "Sem Boleto", situação VEN/AVC, rodapé com quantidade e total) e o histórico movido como está (`ordemItens` passou a estado local da aba).
- `page.tsx`: `PasswordGate` + `Suspense` + conteúdo interno com `useFiltrosUrl`; aba lida com `lerOpcao(obter("aba"), [...4 valores], "contas")` e trocada com `definir({ aba })`; `RecursosBootstrap`, `AdminShell` (mesmo título, subtítulo e ação de hoje), card Dados Cadastrais e as abas. Nesta tarefa as outras abas ainda usavam estados e modais do próprio page.tsx.

**Tarefa 2, commit 88dc8b3.** `aba-gerar-boleto.tsx` com seleção, barra de ações, modal de boleto (prévia, vencimento, observação, linha digitável com copiar) e modal de NFS-e (anexar e emitir automática); `estilos-modal.tsx` com `EstilosModal` (o `<style>` dos modais, sem alteração). Ajustes permitidos: linha "N título(s) já têm boleto emitido — veja a aba Boletos.", mensagem "Todos os títulos em aberto já têm boleto emitido." sem títulos livres, recarga via `onRecarregar` (`onRecarregar(true)` ao fechar o modal de NFS-e com recarga) e fim do `setNfseCarregada(false)` (a aba Notas recarrega ao montar).

**Tarefa 3, commit 6f97c63.** `aba-boletos.tsx` (grupos de boleto com PDF, Verificar, E-mail e Cancelar, estados e handlers de e-mail com CC padrão e o modal de e-mail) e `aba-notas.tsx` (NFS-e emitidas com remover anexo e Notas Fiscais Athos com busca por número, ambas abertas e carregadas ao montar, sem `IntersectionObserver`). `page.tsx` ficou só com a casca (172 linhas).

## Verificação (resultados reais)

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 depois de cada tarefa. `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0 (backend não foi alterado).
- `npm --prefix apps/frontend run build`: exit 0 nas três tarefas; a rota `/contas-receber/[idcliente]` aparece como dinâmica. `apps/frontend/next-env.d.ts` restaurado depois de cada build (não commitado). Único aviso do build: inferência de raiz do workspace pelo Next, que já existia.
- Gate de preservação de endpoints (os 21 trechos do `<verification>`): imprimiu PRESERVADO no baseline (HEAD antes do plano) e depois de cada uma das três tarefas.
- Controle extra: comparei todas as linhas do arquivo original com o conjunto de linhas dos arquivos novos. Das 2.778 linhas, 103 não aparecem literalmente nos novos; todas são mudanças pedidas pelo plano (interfaces e funções que ganharam `export`, formatadores movidos para `_shared`, `Script` trocado por `RecursosBootstrap`, cabeçalhos recolhíveis e `IntersectionObserver` das notas, `setLoadingTitulos`/`setNfseCarregada` substituídos por `onRecarregar`, cabeçalhos de seção da lista de títulos). Nenhuma linha de handler, modal ou chamada de API foi perdida.
- `confirm(` no diretório `[idcliente]`: 3 antes, 3 depois (cancelar boleto em `aba-boletos.tsx`, remover NFS-e na tabela em `aba-gerar-boleto.tsx` e remover anexo em `aba-notas.tsx`).
- `page.tsx`: 172 linhas (limite 350); `IntersectionObserver` em `aba-notas.tsx`: 0; `PasswordGate` e `useFiltrosUrl` presentes no page.tsx.
- `node apps/frontend/scripts/checar-filtros-url.mjs` (Node 22.22.1): exit 0, todas as checagens OK.
- Não foi feita verificação visual no navegador (fica para a verificação humana pós-fase prevista no plano).

## Deviations from Plan

### Auto-fixed Issues

Nenhum bug de comportamento. Ajustes de ambiente e de execução:

**1. [Rule 3 - Bloqueio] node_modules ausentes no worktree**
- **Found during:** início da Tarefa 1.
- **Issue:** o worktree não tem `node_modules` (raiz, `apps/frontend`, `apps/backend`).
- **Fix:** symlinks para os do repositório principal, como pedido; não commitados (cada `git add` foi feito arquivo a arquivo). Como o `.gitignore` usa `node_modules/` (só diretório), os symlinks aparecem como não rastreados no `git status`; não editei `.git/info/exclude` porque ele é compartilhado com o repositório principal.
- **Files modified:** nenhum arquivo rastreado.

**2. [Ajuste de execução] Base do worktree reposicionada**
- O worktree nasceu de um commit antigo (8cba258); executei `git reset --hard 58d64b4` (HEAD do repositório principal, que inclui 47-01 a 47-03) antes de começar, conforme instrução do orquestrador.

**3. [Detalhe do plano] Texto do cabeçalho do card em Gerar Boleto**
- O plano pede o cabeçalho "Títulos Disponíveis" e o aviso sobre boletos; o `h6` "Títulos com boleto emitido" do original foi substituído pelo cabeçalho "Boletos Emitidos" do card da aba Boletos. É só rótulo, sem efeito em regra.

## Known Stubs

Nenhum. A aba Notas não tem dados mockados: lê `/api/cobranca/nfse/cliente/:id` e `/api/athos/clientes/:id/notas-fiscais`, como antes.

## Observação para o verificador (não é desta tarefa)

A seção "Notas Fiscais Athos" da aba Notas continua dependendo de `buscarNotasFiscaisCliente`, que, segundo `deferred-items.md` (achado do 47-03), consulta a coluna inexistente `n.valornota` e por isso devolve lista vazia sem erro visível. Isso já existia antes do 47-04 (D-03: sem mudar comportamento) e segue como decisão pendente do usuário.

## Threat Flags

Nenhum. A superfície é a mesma de antes, com uma melhoria: a página do cliente passou a ficar atrás do `PasswordGate` (T-47-15); `?aba=` usa lista fechada de quatro valores (T-47-16); os três `confirm(` foram preservados (T-47-17). Nenhuma dependência nova (T-47-SC), nenhuma escrita no Athos e nenhum segredo em logs.

## Self-Check: PASSED

- Arquivos: os 7 arquivos de `_abas/` e o `page.tsx` existem.
- Commits 019cb6a, 88dc8b3 e 6f97c63 estão no histórico da branch (`git rev-list --count 58d64b4..HEAD` = 3).
