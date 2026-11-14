---
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
verified: 2026-11-14T13:10:00Z
status: human_needed
score: 11/13 must-haves verified
covered_files:
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-01-PLAN.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-01-SUMMARY.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-02-PLAN.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-02-SUMMARY.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-03-PLAN.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-03-SUMMARY.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-04-PLAN.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-04-SUMMARY.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-05-PLAN.md"
  - ".planning/phases/48-contas-a-receber-escolher-a-ordena-o-data-nome-pago/48-05-SUMMARY.md"
  - "apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts"
  - "apps/backend/src/modules/cobranca/cobranca.service.titulos-em-uso.test.ts"
  - "apps/backend/src/modules/cobranca/cobranca.service.ts"
  - "apps/backend/src/modules/integrations/athos/athos.service.dashboard.test.ts"
  - "apps/backend/src/modules/integrations/athos/athos.service.ts"
  - "apps/frontend/scripts/checar-ordenacao.mjs"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-notas.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/compartilhado.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts"
  - "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"
  - "apps/frontend/src/app/contas-receber/_componentes/boletos-consolidados.tsx"
  - "apps/frontend/src/app/contas-receber/_componentes/notas-fiscais.tsx"
  - "apps/frontend/src/app/contas-receber/_componentes/seletor-ordenacao.tsx"
  - "apps/frontend/src/app/contas-receber/_shared/ordenacao.ts"
  - "apps/frontend/src/app/contas-receber/notas/page.tsx"
  - "apps/frontend/src/app/contas-receber/page.tsx"
covered_digest: "v4:sha256:362c4038d8b7181b77d90723602f9190e1ae8c8a32c39a30fd697693848eea2f"
behavior_unverified: 2
overrides_applied: 0
behavior_unverified_items:
  - truth: "Notas: a ordenacao roda antes da paginacao de 50 e trocar a ordem volta para a pagina 1 (D-07/D-08)"
    test: "Em /contas-receber/notas com mais de 50 notas, ir para a pagina 2, trocar Ordenar Por para Nome (e depois inverter a direcao); conferir que a URL perde ?pagina= e que a pagina 2 continua a sequencia da pagina 1 na ordem escolhida. Repetir na aba Notas do cliente (pagina interna) se houver mais de 50 notas."
    expected: "Troca de ordem leva para a pagina 1; as paginas seguintes continuam a mesma ordem; o aviso das 500 NFS-e mais recentes continua aparecendo quando truncado"
    why_human: "O codigo ordena `filtradas` antes de `paginar` e grava `pagina: null`, mas nenhum teste exercita a transicao de pagina no componente React"
  - truth: "Troca de aba na tela do cliente limpa ordem e dir, e cada aba abre no seu padrao (D-07)"
    test: "Em /contas-receber/<id>?aba=boletos escolher Pago (desc), trocar para a aba Notas e depois voltar para Boletos"
    expected: "Ao trocar de aba a URL perde ordem e dir; Notas abre por emissao mais recente; Boletos volta para vencimento crescente"
    why_human: "A transicao esta em `onSelecionar` de [idcliente]/page.tsx (`ordem: null, dir: null`), sem teste de componente"
human_verification:
  - test: "Em /contas-receber/boletos trocar o seletor Ordenar Por (Data de Vencimento, Nome, Pago), inverter a direcao pelo botao de seta e clicar nos cabecalhos Cliente, Vencimento e Status"
    expected: "A tabela reordena; a URL ganha ?ordem=&dir= (o padrao data/asc limpa os parametros); clicar no mesmo cabecalho inverte a direcao; aria-sort/icone acompanham"
    why_human: "Interacao visual no navegador; so as funcoes puras sao testadas"
  - test: "Com uma ordem nao padrao escolhida em cada tela (/boletos, /notas, /contas-receber, aba Boletos e aba Notas do cliente), dar F5 e colar o link numa aba nova; testar tambem ?ordem=xyz&dir=abc e /contas-receber/notas?ordem=pago"
    expected: "F5 e link colado reproduzem a ordem; valores invalidos (e ordem=pago nas notas, ordem=nome na tela do cliente) caem no padrao sem erro"
    why_human: "Persistencia via router.replace/useSearchParams so pode ser vista no navegador"
  - test: "Em /contas-receber ordenar os clientes por Pago (desc e asc) e comparar o valor da coluna Pago de 2-3 clientes com o 'Total pago' da tela de cada cliente"
    expected: "Valores iguais (mesma soma de conta_recebida.valorpago); quem pagou mais/menos no topo conforme a direcao; clientes com '—' no fim; sem parametros a ordem continua total atrasado decrescente como antes"
    why_human: "Depende de dados reais do Athos e do backend 48-02 publicado"
  - test: "Em /contas-receber/notas com mais de uma pagina, ordenar por Nome e por Data, navegar entre paginas e trocar a ordem estando na pagina 2"
    expected: "A ordem vale para todas as paginas e trocar a ordem volta para a pagina 1; downloads PDF/XML/ZIP e selecao seguem iguais"
    why_human: "Transicao de pagina no componente sem teste (ver behavior_unverified_items)"
  - test: "Na tela de um cliente com boleto pago e pendente: aba Boletos, alternar Data de Vencimento / Pago e a direcao; aba Notas, inverter a direcao; trocar de aba e voltar"
    expected: "Boletos mostram 'Venc. DD/MM/AAAA' e 'Pago em DD/MM/AAAA'; criterio Nome nao aparece em nenhuma das duas abas; aba Notas sem cabecalho Cliente; trocar de aba limpa ordem e dir"
    why_human: "Interacao visual e transicao de estado de URL sem teste de componente"
  - test: "Publicar o backend do plano 48-02 (VPS) e conferir que GET cobranca/boleto/dashboard traz dataPagamento, POST titulos-em-uso traz expireAt/dataPagamento e GET athos/contas-receber/dashboard traz total_pago numerico (nao null) — este ultimo executa `cr.idcliente = ANY($1)` no Athos PostgreSQL 9.0.5 de producao"
    expected: "Campos presentes; total_pago numerico; nenhum warning 'falha ao calcular total_pago' no log do backend"
    why_human: "Antes do deploy os campos nao chegam (frontend mostra '—' e manda pagos sem data para o fim); a consulta nova so foi exercitada com mock no Jest, nao contra o PG 9.0.5 real"
---

# Fase 48: Contas a receber — escolher a ordenação (data, nome, pago) — Relatório de Verificação

**Objetivo da fase:** Permitir escolher a ordem das listas de contas a receber (boletos consolidados, lista de clientes e boletos/notas da tela do cliente) por data, nome e pago/situação de pagamento, com direção crescente/decrescente, guardada na URL.
**Verificado em:** 2026-11-14T13:10:00Z
**Status:** human_needed
**Re-verificação:** Não — verificação inicial

Base de comparação: `03e725a` (contexto da fase) até `HEAD` (`c7b3f42`). 17 arquivos de código alterados, nenhum fora do escopo declarado nos planos.

## Atingimento do objetivo

### Verdades observáveis (must_haves)

| # | Verdade | Status | Evidência |
|---|---------|--------|-----------|
| 1 | `_shared/ordenacao.ts` é módulo puro (sem imports), com padrões D-06 (boletos data asc, notas data desc, clientes atrasado desc) e valor inválido caindo no padrão (ordem inválida -> padrão inteiro; dir inválida -> direção inicial do critério) | VERIFICADO | 0 linhas `import` no arquivo; configs nas linhas 46-102; `lerOrdenacao` 105-114; `checar-ordenacao.mjs` 21/21 OK ("lerOrdenacao valida, invalida e padrao", "toda config tem rotulos e padrao coerentes") |
| 2 | Nome A-Z/Z-A sem acento/maiúscula (D-03) | VERIFICADO | `compararTexto` usa `localeCompare(..., "pt-BR", { sensitivity: "base" })`; checks "compararTexto ignora acento e maiuscula", "ordenarBoletos nome asc e desc sem diferenciar acento", "ordenarClientes nome ignora acento" |
| 3 | Pago dos boletos agrupa por situação conforme a direção, com data de pagamento como desempate e nulos por último (D-04) | VERIFICADO | `ordenarBoletos` 176-188; checks "pago desc" e "pago asc" OK |
| 4 | SeletorOrdenacao (Ordenar Por + botão de direção) e ThOrdenavel (cabeçalho clicável com aria-sort) existem e estão ligados às listas (D-05) | VERIFICADO | `seletor-ordenacao.tsx` 92 linhas; `SeletorOrdenacao` usado em boletos-consolidados, page.tsx (clientes), notas-fiscais (página e aba) e aba-boletos; `ThOrdenavel` em Cliente/Vencimento/Status (boletos), Cliente/Total devido/Atrasado/Pago (clientes), Cliente/Emissão (NFS-e e NF-e) |
| 5 | Ordem em `?ordem=&dir=` via `useFiltrosUrl` nas 5 telas; o padrão não grava parâmetros (D-07) | VERIFICADO | `lerOrdenacao(obter("ordem"), obter("dir"), CONFIG_*)` em boletos-consolidados:200, page.tsx:140, notas/page.tsx:30, aba-boletos:40, aba-notas:23; gravação via `definir(ordenacaoParaUrl(...))`; nenhum `useState` guarda a ordem nessas telas (só o fallback interno de NotasFiscais, não usado pelas duas telas). F5/link: ver verificação humana |
| 6 | /contas-receber/boletos: Data (vencimento), Nome, Pago; filtra e depois ordena no navegador, sem chamada nova (D-01, D-02, D-08) | VERIFICADO | `visiveis = ordenarBoletos(filtrarBoletos(boletos, filtros), ordenacao)`; nenhum fetch novo no diff |
| 7 | Clientes: ordem na URL (atrasado/devido/nome/pago), padrão total atrasado desc com empate por devido desc como antes; coluna e critério Pago com `total_pago` (D-01, D-04, D-06) | VERIFICADO | page.tsx: `ordenarClientes(clientesFiltrados, ordenacao)`, coluna Pago com `formatBRL(total_pago)` ou "—"; check "ordenarClientes padrao atrasado desc reproduz a ordem do backend" |
| 8 | Notas: critério Pago ausente; Nome ausente na tela do cliente (D-03, D-04) | VERIFICADO | `CONFIG_NOTAS.permitidas = ["data","nome"]`, `CONFIG_NOTAS_CLIENTE = ["data"]`, `CONFIG_BOLETOS_CLIENTE = ["data","pago"]`; `NotasFiscais` com `mostrarCliente=false` usa `CONFIG_NOTAS_CLIENTE` e não renderiza o `ThOrdenavel` de Cliente; check "notas nao tem pago nem nome na tela do cliente" |
| 9 | Notas ordenadas antes da paginação de 50 e troca de ordem volta à página 1 (D-07, D-08) | PRESENT_BEHAVIOR_UNVERIFIED | `filtradas = ordenarNotas(filtrarNotasExibicao(...))` e só depois `paginar(filtradas, ...)` (notas-fiscais.tsx ~150-171); /notas grava `{ ...ordenacaoParaUrl(...), pagina: null }`; aba do cliente zera `paginaInterna`. Presente e ligado, mas nenhum teste exercita a transição de página |
| 10 | Aba Boletos do cliente: Data (expireAt) e Pago (dataPagamento), com "Venc." e "Pago em" visíveis | VERIFICADO | aba-boletos.tsx `gruposOrdenados = ordenarBoletos(...)`; use-dados-cliente copia `expireAt`/`dataPagamento` do POST titulos-em-uso existente; tipo em compartilhado.tsx |
| 11 | Troca de aba na tela do cliente limpa ordem/dir | PRESENT_BEHAVIOR_UNVERIFIED | [idcliente]/page.tsx:128 `definir({ aba: ..., ordem: null, dir: null })`; é a única troca de aba (link de boletos-consolidados usa URL nova `?aba=boletos`). Sem teste de componente |
| 12 | Backend só leitura: `dataPagamento` no boleto/dashboard; `expireAt` + `dataPagamento` no titulos-em-uso; `total_pago` por cliente com SELECT fixo `cr.idcliente = ANY($1)`, try/catch isolado, mesma definição do "Total pago" da tela do cliente | VERIFICADO | cobranca.service.ts: `dataPagamento` só quando `status === "pago"`; athos.service.ts 2070-2102: SELECT fixo com ids como parâmetro, falha -> `total_pago = null` sem afetar o resto; a definição bate com `buscarHistoricoClienteContasReceber` (SUM(cre.valorpago) JOIN conta_recebida WHERE cr.idcliente). SQL compatível com PG 9.0.5 por inspeção (`= ANY(array)`, `COALESCE`, `GROUP BY`; sem funções PG10+). Jest: 7 testes novos nomeados passam |
| 13 | Sem rota nova, sem escrita no Athos, sem ordenação/paginação no servidor; D-03 da fase 47 preservado | VERIFICADO | `git diff 03e725a HEAD` vazio para cobranca.controller.ts, athos.controller.ts, email-envio.service.ts, `apps/frontend/src/app/api/**`, prisma, filtros-boletos.ts, filtros-url.ts, use-filtros-url.ts; nenhuma linha adicionada com `@Get/@Post/...`, `INSERT`, `UPDATE` ou `DELETE`; consulta principal de clientes (ORDER BY/LIMIT 100) intacta; arquivos de baixa/avisos (`cobranca-baixa-athos*`, `cobranca-aviso-vencimento*`) sem alteração; suíte cobranca 306/306 |

**Pontuação:** 11/13 verdades verificadas (2 presentes, comportamento não exercitado por teste)

### Artefatos obrigatórios

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `apps/frontend/src/app/contas-receber/_shared/ordenacao.ts` | funções puras + configs | VERIFICADO | 269 linhas, sem imports, consumido por 6 arquivos |
| `apps/frontend/src/app/contas-receber/_componentes/seletor-ordenacao.tsx` | SeletorOrdenacao + ThOrdenavel com aria-sort | VERIFICADO | usado em 5 telas |
| `apps/frontend/src/app/contas-receber/_componentes/boletos-consolidados.tsx` | tabela ordenada pela URL | VERIFICADO | `ordenarBoletos(filtrarBoletos` |
| `apps/frontend/scripts/checar-ordenacao.mjs` | checagem executável | VERIFICADO | 21 casos OK |
| `apps/frontend/src/app/contas-receber/page.tsx` | clientes ordenados + coluna Pago | VERIFICADO | `CONFIG_CLIENTES`, `total_pago` |
| `apps/frontend/src/app/contas-receber/_componentes/notas-fiscais.tsx` | ordenarNotas antes de paginar | VERIFICADO | ordem -> paginar |
| `apps/frontend/src/app/contas-receber/notas/page.tsx` | ordem da URL + página zerada | VERIFICADO | `pagina: null` junto da ordem |
| `apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-notas.tsx` | `CONFIG_NOTAS_CLIENTE` | VERIFICADO | |
| `apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx` | grupos ordenados + datas | VERIFICADO | |
| `apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts` / `compartilhado.tsx` | expireAt/dataPagamento | VERIFICADO | |
| `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` | `ordem: null` na troca de aba | VERIFICADO | |
| `apps/backend/src/modules/cobranca/cobranca.service.ts` | dataPagamento/expireAt | VERIFICADO | |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | total_pago `cr.idcliente = ANY($1)` | VERIFICADO | |

### Verificação de ligações (key links)

| De | Para | Via | Status |
|----|------|-----|--------|
| boletos-consolidados.tsx | use-filtros-url.ts / ordenacao.ts | `obter` -> `lerOrdenacao`; `definir(ordenacaoParaUrl)`; `ordenarBoletos(filtrarBoletos(...))` | LIGADO |
| page.tsx (clientes) | ordenacao.ts / proxy dashboard | `CONFIG_CLIENTES`, `ordenarClientes`; `total_pago` chega pelo proxy (repasse `NextResponse.json(data)`) | LIGADO |
| notas/page.tsx | notas-fiscais.tsx | props `ordenacao`/`onMudarOrdenacao` | LIGADO |
| notas-fiscais.tsx | ordenacao.ts | `ordenarNotas(` antes de `paginar` | LIGADO |
| aba-notas.tsx / aba-boletos.tsx | use-filtros-url.ts | `lerOrdenacao(obter(...), CONFIG_*_CLIENTE)` | LIGADO |
| use-dados-cliente.ts | proxy titulos-em-uso | POST existente; copia `expireAt`/`dataPagamento` | LIGADO |
| cobranca.service.ts / athos.service.ts | proxies Next | proxies repassam o JSON inteiro, sem alteração | LIGADO |

### Fluxo de dados (Nível 4)

| Artefato | Dado | Origem | Dado real | Status |
|----------|------|--------|-----------|--------|
| Coluna Pago (clientes) | `total_pago` | SELECT SUM(conta_recebida.valorpago) no Athos | Sim (após deploy do 48-02) | FLUINDO (pendente deploy) |
| "Pago em" / critério Pago (boletos) | `dataPagamento` | `CobrancaBoleto.athosBaixaDataPagamento` (Prisma) | Sim; null em pagos antes da Fase 43 | FLUINDO |
| "Venc." (aba Boletos) | `expireAt` | `CobrancaBoleto.expireAt` via titulos-em-uso | Sim | FLUINDO |

### Checagens comportamentais

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| Jest cobranca | `npm --prefix apps/backend run test -- cobranca --no-coverage` | 22 suítes, 306 testes passaram | PASSOU |
| Jest athos | `npm --prefix apps/backend run test -- integrations/athos --no-coverage` | 26 suítes passaram (1 pulada), 491 passaram, 10 pulados | PASSOU |
| Tipos backend | `npx tsc --noEmit -p apps/backend/tsconfig.json` | rc=0 | PASSOU |
| Tipos frontend | `npx tsc --noEmit -p apps/frontend/tsconfig.json` | rc=0 | PASSOU |
| Build frontend | `npm --prefix apps/frontend run build` | rc=0; /contas-receber, /boletos, /notas, /[idcliente] compilados; `next-env.d.ts` foi alterado pelo build e restaurado com `git checkout` | PASSOU |
| checar-filtros-boletos.mjs | `node apps/frontend/scripts/checar-filtros-boletos.mjs` | rc=0 | PASSOU |
| checar-filtros-url.mjs | `node apps/frontend/scripts/checar-filtros-url.mjs` | rc=0 | PASSOU |
| checar-notas.mjs | `node apps/frontend/scripts/checar-notas.mjs` | rc=0 | PASSOU |
| checar-ordenacao.mjs | `node apps/frontend/scripts/checar-ordenacao.mjs` (Node 22.22.1) | rc=0, 21 OK | PASSOU |

### Execução de probes

Não se aplica: a fase não declara probes `scripts/*/tests/probe-*.sh`.

### Cobertura de requisitos (IDs locais definidos no 48-01-PLAN.md)

| Requisito | Planos | Descrição | Status | Evidência |
|-----------|--------|-----------|--------|-----------|
| ORD-01 | 01, 03, 04, 05 | Seletor "Ordenar Por" + direção + cabeçalho clicável | SATISFEITO (visual pendente) | Verdade 4 |
| ORD-02 | 01, 03, 04, 05 | Ordem na URL; inválido cai no padrão | SATISFEITO (F5/link pendente) | Verdades 1, 5 |
| ORD-03 | 01, 02, 05 | Boletos por Data/Nome/Pago; padrão vencimento crescente | SATISFEITO | Verdades 3, 6, 10 |
| ORD-04 | 04 | Notas por emissão/Nome; padrão emissão mais recente | SATISFEITO (paginação pendente) | Verdades 8, 9 |
| ORD-05 | 02, 03 | Clientes na URL + critério Pago | SATISFEITO (dados reais pendentes) | Verdades 7, 12 |
| ORD-06 | todos | Ordenação no navegador; backend só leitura; D-03 da fase 47 | SATISFEITO | Verdade 13 |

Nenhum requisito órfão: o ROADMAP lista ORD-01..ORD-06 e todos aparecem em pelo menos um plano.

### Anti-padrões

Nenhum. A busca por `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` nos 17 arquivos alterados só encontrou a palavra "TODOS" em comentários (falso positivo). Os campos opcionais (`total_pago?`, `expireAt?`, `dataPagamento?`) não são stubs: o backend os preenche e o frontend degrada para "—" / fim da lista antes do deploy.

### Observações

1. **Limitação das 500 NFS-e mais recentes:** a ordenação de notas roda no navegador sobre a lista devolvida por `GET cobranca/notas`, que traz no máximo as 500 NFS-e mais recentes (aviso "Mostrando as 500 NFS-e mais recentes. Use o período para ver outras." quando `truncado`). Com a lista truncada, ordenar por Data ascendente ou por Nome considera só essas 500, não todo o histórico. O aviso existente continua aparecendo; para ver notas mais antigas o usuário precisa filtrar por período. Isso segue D-08 (lista não paginada no servidor) e não foi tratado como falha.
2. **Padrão dos boletos:** "vencimento crescente" coloca no topo tudo o que tem vencimento mais antigo, inclusive boletos pagos com vencimento passado (mesma ordem do backend antes da fase). Os atrasados pendentes aparecem no topo junto deles.
3. **Boletos pagos antes da Fase 43** não têm `athosBaixaDataPagamento`: no critério Pago ficam no fim do grupo dos pagos e não mostram "Pago em". Comportamento previsto (D-04).
4. **PostgreSQL 9.0.5:** a consulta de `total_pago` usa só recursos disponíveis no 9.0 (`= ANY($1)` com array de inteiros do node-pg, `COALESCE`, `SUM`, `GROUP BY`), mas foi validada apenas com mock no Jest; a confirmação real fica no item de verificação humana do deploy.

## Verificação humana necessária

### 1. Seletor e direção em /contas-receber/boletos
**Teste:** trocar Ordenar Por (Data de Vencimento, Nome, Pago), inverter pela seta e clicar em Cliente, Vencimento e Status.
**Esperado:** a tabela reordena; URL com `?ordem=&dir=`; padrão (data/asc) limpa os parâmetros; o mesmo cabeçalho inverte a direção.
**Por que humano:** interação visual.

### 2. F5 e link colado nas 5 telas
**Teste:** escolher ordem não padrão em /boletos, /notas, /contas-receber, aba Boletos e aba Notas do cliente; F5; colar o link em outra aba; testar `?ordem=xyz&dir=abc`, `/contas-receber/notas?ordem=pago` e `?aba=boletos&ordem=nome`.
**Esperado:** a ordem se repete; inválidos caem no padrão sem erro.
**Por que humano:** depende do roteador do Next no navegador.

### 3. Clientes por Pago comparados com "Total pago"
**Teste:** em /contas-receber ordenar por Pago (desc/asc) e comparar a coluna Pago de 2-3 clientes com o "Total pago" da tela de cada um; sem parâmetros conferir que a ordem é total atrasado decrescente.
**Esperado:** valores iguais; "—" no fim.
**Por que humano:** dados reais do Athos, backend 48-02 publicado.

### 4. Notas com mais de uma página
**Teste:** em /contas-receber/notas com mais de 50 notas, ordenar por Nome e por Data, navegar entre páginas, trocar a ordem estando na página 2; baixar um PDF e um ZIP.
**Esperado:** a ordem vale em todas as páginas; troca de ordem volta à página 1; downloads iguais.
**Por que humano:** transição de página sem teste de componente.

### 5. Abas do cliente
**Teste:** cliente com boleto pago e pendente: aba Boletos alternando Data/Pago e direção; aba Notas invertendo a direção; trocar de aba e voltar.
**Esperado:** "Venc." e "Pago em" visíveis; sem critério Nome; aba Notas sem cabeçalho Cliente; troca de aba limpa ordem e dir.
**Por que humano:** interação visual e transição de URL sem teste.

### 6. Backend 48-02 publicado
**Teste:** publicar o backend na VPS e conferir `dataPagamento` em boleto/dashboard, `expireAt`/`dataPagamento` em titulos-em-uso e `total_pago` numérico em athos/contas-receber/dashboard (consulta rodando no PG 9.0.5 de produção).
**Esperado:** campos presentes, `total_pago` não null, sem warning "falha ao calcular total_pago" no log.
**Por que humano:** antes do deploy os campos não chegam; a consulta só foi exercitada com mock.

## Resumo

Nenhuma lacuna encontrada no código. Todas as peças existem, têm conteúdo real e estão ligadas: funções puras testadas (21 casos), seletor e cabeçalhos nas 5 telas, ordem lida e gravada só na URL, notas ordenadas antes da paginação, troca de aba limpando a ordem, backend com três campos somente leitura cobertos por Jest e nenhuma alteração nos arquivos protegidos pelo D-03 da fase 47. O status é `human_needed` porque o comportamento visual e de navegação (F5, link, paginação, troca de aba) e os dados reais de `total_pago` dependem do navegador e do deploy do backend 48-02.

---

_Verificado: 2026-11-14T13:10:00Z_
_Verificador: Claude (gsd-verifier)_
