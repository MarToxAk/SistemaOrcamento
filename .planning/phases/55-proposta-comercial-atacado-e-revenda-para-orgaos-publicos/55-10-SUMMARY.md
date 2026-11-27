---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 10
subsystem: frontend/propostas
tags: [nextjs, cabecalho-da-proposta, cliente-athos, orgao-publico, assinante, tracer]
requires: [55-06, 55-09, 55-14]
provides:
  - ClientePainel (busca do cliente no Athos por TomadorAthosSearch, snapshot com razao social real e "não informado" por campo, trocar e remover)
  - OrgaoPainel (processo/pregao, setor, e-mail e telefone de contato, sobrescritas para o PDF como clienteOverride, limpar sobrescritas)
  - CondicoesPainel (validade, prazo de entrega, observacao com contador, assinante entre recentes ou digitado)
  - campos-cabecalho.tsx (useGravacao serializado, IndicadorGravacao, CampoTexto que grava ao sair do campo)
  - pagina /propostas/[id] com os tres paineis e desabilitado = !podeEditar(status)
affects: [55-18]
tech-stack:
  added: []
  patterns: [gravacao ao sair do campo com fila serializada por painel, mesclagem de sobrescritas sobre o ultimo objeto enviado, regra de edicao decidida uma vez na pagina]
key-files:
  created:
    - apps/frontend/src/app/propostas/_componentes/cliente-painel.tsx
    - apps/frontend/src/app/propostas/_componentes/orgao-painel.tsx
    - apps/frontend/src/app/propostas/_componentes/condicoes-painel.tsx
    - apps/frontend/src/app/propostas/_componentes/campos-cabecalho.tsx
  modified:
    - apps/frontend/src/app/propostas/[id]/page.tsx
    - apps/frontend/src/app/propostas/_shared/tipos.ts
key-decisions:
  - "O assinante NAO vai no PATCH do cabecalho: o backend (UpdatePropostaDto, com forbidNonWhitelisted) so recebe assinante em POST gerar (GerarPropostaDto). A pagina guarda o assinante em estado (e em sessionStorage da aba) e o passa ao CondicoesPainel; o plano 55-18 le esse estado para preencher o modal de gerar."
  - "Sugestao de contato do Athos e um botao explicito 'Usar o e-mail/telefone do Athos' que so grava ao clicar; nada e preenchido nem gravado sozinho, o que evita regravar depois que o operador apaga."
  - "O servidor troca TODO o objeto clienteOverride a cada PATCH: o OrgaoPainel mescla sobre o ultimo objeto enviado (ref) e envia o objeto completo, ou null quando fica vazio."
  - "As gravacoes de um painel sao serializadas por uma cadeia de promessas, para que a resposta de uma nao sobreponha a mais recente."
  - "desabilitado e calculado uma vez na pagina por !podeEditar(proposta.status) e repassado aos tres paineis e a tabela; os paineis nao reimplementam a regra."
requirements-completed: [P55-CLI, P55-CICLO, P55-PDF]
duration: 35 min
completed: 2026-11-27
status: complete
actuals:
  tokens: 10500
  tasks: 1
  commits: 1
plan_head_before: 4f33d5d5e2a36116b8e9cf8c88ef60133cdbd03f
plan_head_after: e6d7ab873cfb7b2b3ecf606fc667b7836821bafa
---

# Phase 55 Plan 10: Cabecalho da proposta (cliente, orgao, condicoes e assinante) Summary

Tela da proposta completa com o cabecalho: cliente do Athos (snapshot com razao social real e campos ausentes marcados "não informado"), dados de orgao com sobrescritas somente para o PDF, validade, prazo, observacao e assinante, tudo gravado ao sair do campo pelo proxy e somente leitura fora de RASCUNHO.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Associar cliente do Athos e gravar cabecalho, dados de orgao, condicoes e assinante | e6d7ab8 |

## Accomplishments

- `ClientePainel`: reutiliza `TomadorAthosSearch` (busca por nome, documento ou id); ao escolher, envia `{ idclienteAthos }` e exibe o snapshot devolvido pelo servidor (razao social, nome fantasia, CPF/CNPJ formatado, e-mail, telefone, logradouro, numero, complemento, bairro, cidade, UF e CEP), com "não informado" discreto em cada campo ausente (D-25). "Trocar cliente" reabre a busca, "Remover cliente" envia `idclienteAthos: null` (com confirmacao). Texto fixo de orientacao para cadastrar no Athos desktop (D-15).
- `OrgaoPainel`: processo/pregao/dispensa, setor/responsavel, e-mail e telefone de contato (D-16), cada um gravado ao sair do campo com `null` para limpar. Secao recolhivel "Sobrescrever dados no PDF" com razao social, documento e os sete campos de endereco enviados como `clienteOverride` (o snapshot do Athos aparece como dica em cada campo), selo "em uso" e botao "Limpar sobrescritas".
- `CondicoesPainel`: validade e prazo de entrega em dias inteiros de 1 a 365 (D-20, validacao local com mensagem), observacao com contador `n/2000` (D-21), lista suspensa de assinantes recentes (`GET /api/propostas/assinantes`) que preenche nome, cargo e CPF, mais campos digitaveis (D-19).
- `campos-cabecalho.tsx`: `useGravacao` (estado Salvando.../Salvo/erro, gravacoes serializadas), `IndicadorGravacao` e `CampoTexto` (grava ao sair, Enter confirma, volta ao valor do servidor quando ele muda).
- `[id]/page.tsx`: `salvarCabecalho` = `PATCH /api/propostas/<id>` pela funcao `enviar` ja existente (a resposta completa vira o estado); `desabilitado = !podeEditar(proposta.status)` repassado a `ClientePainel`, `OrgaoPainel`, `CondicoesPainel` e `TabelaItens`; fora de RASCUNHO o assinante exibido e o do servidor.
- `tipos.ts`: `EnderecoSnapshot`, `ClienteSnapshot` ampliado, `ClienteOverride`, `Assinante`, `AssinanteRecente` e `CamposCabecalho`; `PropostaDetalhe.clienteOverride` agora tipado como `ClienteOverride | null`.

## Verification

- `node apps/frontend/scripts/checar-propostas-formatadores.mjs`: exit 0, 61 linhas OK (inclui os OK de `podeEditar`), zero SKIP.
- `npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json`: exit 0, sem `error TS`.
- Greps de aceitacao: `TomadorAthosSearch` em cliente-painel = 2 (>=2); `não informado` = 2 (>=1); `desabilitado` em condicoes-painel = 15 (>=2); `assinantes` em condicoes-painel = 2 (>=1); `dangerouslySetInnerHTML` nos componentes e na pagina = 0 (T-55-47).
- Nao executado: verificacao visual no navegador e chamada real ao backend (plano 55-11); nao ha harness de teste de componentes React nem configuracao de eslint neste frontend.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Contrato] Assinante nao pode ir no PATCH do cabecalho**
- **Found during:** Task 1 (leitura do contrato do backend)
- **Issue:** o plano manda gravar o assinante "no mesmo PATCH", mas `UpdatePropostaDto` (= `CreatePropostaDto`) nao tem campos de assinante e o `ValidationPipe` global usa `whitelist` e `forbidNonWhitelisted`, entao o PATCH responderia 400. O servidor so recebe `assinanteNome`, `assinanteCargo` e `assinanteCpf` em `POST gerar` (`GerarPropostaDto`).
- **Fix:** o assinante fica no estado da pagina (com copia em `sessionStorage` por proposta) e nao e enviado no PATCH; o painel avisa "O assinante é gravado na proposta ao gerá-la". O plano 55-18 deve ler esse estado ao abrir o modal de gerar (`assinante` e `alterarAssinante` na pagina). Nao houve mudanca de backend (fora do escopo e em edicao pelo plano 55-17).
- **Files modified:** `condicoes-painel.tsx`, `[id]/page.tsx`
- **Commit:** e6d7ab8

**2. [Rule 3 - Blocking] Worktree sem node_modules**
- **Fix:** `npm ci` na raiz do worktree (nada versionado).

### Notas de interpretacao (sem desvio de comportamento)

- "Preencher o contato a partir do snapshot como sugestao inicial" foi implementado como botao "Usar o e-mail/telefone do Athos: ..." que so grava ao clicar, em vez de preencher e gravar sozinho (um preenchimento automatico voltaria depois que o operador apagasse o campo).
- Foi criado `_componentes/campos-cabecalho.tsx` (fora da lista de arquivos do plano) para nao repetir o estado Salvando.../Salvo/erro e o campo que grava ao sair nos tres paineis.
- Um `npx eslint` exploratorio tentou baixar o eslint (o projeto nao tem configuracao de eslint); nada foi instalado no projeto nem versionado.

## Known Stubs

None.

## Threat Flags

None. Todo texto do Athos e do operador e renderizado como texto React (T-55-47); `desabilitado` vem de `!podeEditar(status)` e o servidor continua recusando edicao fora de RASCUNHO (T-55-64).

## Notes for 55-18

- A pagina `[id]/page.tsx` guarda `assinante` (`{ nome, cargo, cpf }` em texto) e `alterarAssinante`; o modal de gerar deve usá-los como valores iniciais e enviar `assinanteNome`, `assinanteCargo`, `assinanteCpf` em `POST gerar`.
- Os paineis ficam acima da tabela de itens; as acoes da proposta entram no topo da pagina.

## Self-Check: PASSED

- Arquivos criados e modificados existem (cliente-painel, orgao-painel, condicoes-painel, campos-cabecalho, page, tipos).
- Commit e6d7ab8 e ancestral de HEAD.
