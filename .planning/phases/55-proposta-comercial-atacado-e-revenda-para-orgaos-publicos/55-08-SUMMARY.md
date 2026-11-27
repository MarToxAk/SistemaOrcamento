---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 08
subsystem: backend/propostas
tags: [nestjs, propostas, lancamento, athos, compare-and-set, pdf-snapshot, tracer, clone-it]
status: complete
requires: [55-04, 55-06, 55-07]
provides:
  - PropostasService.gerar (compare-and-set RASCUNHO -> LANCANDO com pdfSnapshot, Athos, ENVIADA, PDF oficial)
  - PropostasService.obterParaPdf (linhas do Prisma no formato PropostaParaPdf)
  - POST /api/propostas/:id/gerar (AdminOnly, Throttle sensivel)
  - GerarPropostaDto e tipo PropostaGerada
  - Prisma em memoria com propostaConfig, pdfTemplate e orcamentoItemCorrecao
  - IT HTTP ponta a ponta contra o clone athos-teste (propostas.clone.it.test.ts)
affects: [55-11, 55-12, 55-13, 55-17, 55-18]
requirements-completed: [P55-ATHOS, P55-CICLO, P55-PDF]
tech-stack:
  added: []
  patterns:
    - "Reserva por compare-and-set antes de qualquer chamada ao Athos, com o snapshot do PDF gravado na mesma atualizacao atomica"
    - "Tudo que depende de configuracao (flag, snapshot do PDF) e validado ANTES da reserva; falha de preparacao depois dela reverte para RASCUNHO"
    - "IT HTTP com servicos reais (Athos, PDF em Chromium) e so o armazenamento MinIO trocado por um mapa em memoria"
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas.clone.it.test.ts
  modified:
    - apps/backend/src/modules/propostas/propostas.service.ts
    - apps/backend/src/modules/propostas/propostas.controller.ts
    - apps/backend/src/modules/propostas/dto/propostas.dto.ts
    - apps/backend/src/modules/propostas/__fixtures__/prisma-proposta.fake.ts
    - apps/backend/src/modules/propostas/propostas.service.test.ts
    - apps/backend/src/modules/propostas/propostas.http.test.ts
key-decisions:
  - "Segunda chamada de gerar sobre proposta ja ENVIADA responde 409 TRANSICAO_INVALIDA; LANCANDO responde 409 LANCAMENTO_EM_ANDAMENTO (conforme o plano)."
  - "Assinante so com espacos e recusado com 422 ASSINANTE_OBRIGATORIO (codigo ja existia em PropostaCodigo), alem do MinLength do DTO."
  - "Falha de preparacao da entrada do Athos (passo 5) reverte a reserva (status RASCUNHO, lancandoEm e pdfSnapshot limpos); so o erro do proprio passo de chamada ao Athos deixa LANCANDO, deliberadamente, ate o 55-17."
metrics:
  duration: 35 min
  completed: 2026-11-27
actuals:
  tokens: 14000
  tasks: 1
  commits: 1
plan_head_before: 4804a195822d88ef2c5cd893fff8af78a4154690
plan_head_after: f8ac408356098492e32b327d6c5f16c42f14bbe8
---

# Phase 55 Plan 08: Tracer do lancamento da proposta Summary

`POST /propostas/:id/gerar` lanca a proposta no Athos e emite o PDF oficial: valida, confere a flag, captura o snapshot do PDF, reserva RASCUNHO para LANCANDO por compare-and-set gravando o snapshot na mesma atualizacao, so entao chama o Athos com preco final sem desconto, finaliza como ENVIADA e gera o PDF a partir do MESMO snapshot. Provado por HTTP contra o clone athos-teste.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | gerar por HTTP contra o clone: compare-and-set, orcamento no Athos e PDF real | f8ac408 |

## Accomplishments

- **`gerar`** na ordem do plano: carregar (404, 409), validar (CLIENTE_OBRIGATORIO 422, SEM_ITENS 422, assinante), `exigirEscritaPropostaAtiva()`, `capturarSnapshot()`, `updateMany` condicionado a `status: RASCUNHO` (contagem diferente de 1 = 409), entrada do Athos so com `idproduto`, `quantidade`, `precoUnitario` e `custoUnitario` (ref por `refDoOrcamento(id)`), conferencia do total recalculado contra `totalValor`, `criarOrcamentoProposta`, finalizacao ENVIADA com `idorcamentoAthos`, `senhaBalcao`, `athosData`, `athosHora`, PDF oficial fora de transacao com o snapshot da reserva (falha de PDF so loga e responde `pdfDisponivel: false` com aviso).
- **`obterParaPdf`** e `PropostaGerada` exportados; `montarDetalhe` continua sem `pdfSnapshot`.
- **Controller:** `POST :id/gerar` com `@Throttle({ default: THROTTLE_SENSITIVE })` e `ParseUUIDPipe`; `GerarPropostaDto` com `assinanteNome` (1 a 120), `assinanteCargo?` (ate 120), `assinanteCpf?` (ate 20) e `confirmar` com `@Equals(true)`.
- **Fake do Prisma:** `propostaConfig.findUnique` (banco fictício), `pdfTemplate.findFirst` (null, cai no template empacotado), `orcamentoItemCorrecao.findMany` (vazio) e `_config` para os testes do 55-17; `updateMany` com `status: { in: [...] }` e o Json `pdfSnapshot` ja eram suportados pelo fake.
- **IT HTTP (3 testes, nenhum skipped):** (1) flag desligada: 503 `ESCRITA_DESABILITADA`, status segue RASCUNHO, `criarOrcamentoProposta` nao chamado; (2) sem cliente 422, sem itens 422, sem `confirmar` 400; (3) tracer completo: cria, associa cliente juridico escolhido dinamicamente, adiciona dois produtos, ajusta um por VALOR 2,90 (abaixo do cadastro) e renomeia, gera (201 ENVIADA, `pdfDisponivel: true`) e confere nas tres tabelas `valoritem` igual ao preco final, `valordesconto` e `orcamentodesconto` 0, cabecalho `desconto` e `descontors` 0, `valor` igual a soma de `orcamentovalorfinalitem` e ao total da proposta, uma linha de pagamento, `obs` com o marcador, `athosData`/`athosHora`/`senhaBalcao` iguais aos do Athos; PDF armazenado em `propostas/...` comecando por `%PDF`; `pdfSnapshot` com banco, empresa e `template.source` nao vazio; `capturarSnapshot` antes de `criarOrcamentoProposta` (ordem e `invocationCallOrder`); entrada do Athos com exatamente as quatro chaves; segundo POST gerar 409 sem nova escrita (1 orcamento com aquele `obs`); `criarOrcamento` da Fase 44 nunca chamado.

## Tracer feedback gate

A tarefa nao carrega `gate="blocking-human"`. Os dois comandos `<verify>` foram executados ponta a ponta (IT no clone e suites + typecheck) e passaram; plano com uma unica tarefa, sem expansao posterior neste plano.

## Verification

- IT: `ATHOS_IT_CLONE=1 ... propostas.clone.it.test.ts`: 3 de 3 passando (nao skipped), executado duas vezes; apos cada execucao `SELECT count(*) FROM orcamento WHERE obs LIKE '[PROPOSTA]%'` no clone = 0.
- `npm --prefix apps/backend run test -- src/modules/propostas`: 6 suites passaram, 2 skipped (IT do clone e smoke do Chromium sem as variaveis), 119 testes passando.
- `tsc -p tsconfig.json --noEmit` do backend: limpo.
- Aceitacao: `capturarSnapshot` no servico = 1 ocorrencia (>= 1); `async gerar` = 1; `status: "LANCANDO"` = 2 (>= 1); `git diff --quiet 8636fbe -- athos-orcamento.service.test.ts` exit 0.
- Limite de verificacao (registrado no plano): o IT roda no clone PostgreSQL 14 e a producao roda 9.0.5; este plano nao acrescenta SQL ao Athos, entao a compatibilidade 9.0.5 segue coberta pelas assertivas de texto do 55-04. Nenhuma conexao a 192.168.33.198 ou 100.102.146.44; trava dupla 127.0.0.1:5440/athos mantida; a senha do clone foi passada so por variavel de ambiente na linha de comando (nao esta em nenhum arquivo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Construtor de `PropostasService` ganhou o quarto parametro**
- **Found during:** Task 1 (tipagem das suites do 55-06)
- **Issue:** injetar `PropostasPdfService` quebra a construcao manual em `propostas.service.test.ts` e o modulo de teste em `propostas.http.test.ts`.
- **Fix:** `propostas.service.test.ts` passa um stub `{ capturarSnapshot, gerarOficial }` (exposto no contexto como `propostasPdf` para os testes do 55-17); `propostas.http.test.ts` ganhou o provider stub. Nenhuma asserção existente foi alterada; as suites do 55-06 seguem verdes.
- **Files modified:** propostas.service.test.ts, propostas.http.test.ts
- **Commit:** f8ac408

**2. [Rule 3 - Blocking] Ambiente do worktree**
- `npm ci --ignore-scripts` e `prisma:generate` (nada versionado). Chromium do Puppeteer ja presente em `~/.cache/puppeteer`.

### Notas de interpretacao (sem desvio de comportamento)

- Preparacao da entrada do Athos (passo 5): o plano manda reverter para RASCUNHO se o total divergir; estendi a reversao a qualquer falha desse bloco (todas anteriores a chamada ao Athos), com mensagem 422 `VALOR_INVALIDO` e erro logado. A reversao limpa tambem `lancandoEm` e `pdfSnapshot`.
- Erro do passo de chamada ao Athos (`criarOrcamentoProposta`) NAO e capturado: deixa a proposta em LANCANDO, como o plano determina (tratamento no 55-17). Por isso a flag `PROPOSTA_ESCRITA_ATIVA` segue desligada ate o 55-17 concluir; o 55-17 e pre-requisito de 55-18 e 55-11.
- Se a finalizacao (`updateMany` para ENVIADA) nao atualizar exatamente 1 linha, `gerar` apenas registra erro com o numero do orcamento; o tratamento definitivo (falha de persistencia apos o COMMIT) e do 55-17.
- O IT instancia `AthosService` real com o Prisma em memoria (so `orcamentoItemCorrecao` e usado por ele) e fecha o pool do `AthosService` manualmente em `afterAll`, pois ele nao tem `onModuleDestroy`.

**Total deviations:** 2 (ambos Rule 3, de infraestrutura de teste). **Impact:** nenhuma mudanca de contrato.

## Known Stubs

None.

## Threat Flags

None alem do threat_model do plano. T-55-31 (compare-and-set antes do Athos, segundo POST 409 provado no IT; concorrencia simultanea fica no 55-17), T-55-36 (entrada do Athos com so quatro chaves e desconto 0 provados no IT) e T-55-55 (snapshot antes da reserva, ordem provada por `invocationCallOrder`) mitigados como planejado.

## Notes for downstream plans

- **55-17:** erro definitivo e ambiguo do Athos, recuperacao (`buscarOrcamentoPorRefProposta` com `refDoOrcamento(id)`, reusando o `pdfSnapshot` gravado), concorrencia simultanea (Promise.all), falha de PDF sem relancar. `_config.linha = null` no fake simula configuracao bancaria ausente; o contexto de teste ja expoe `propostasPdf` (stub).
- **55-13:** `obterParaPdf(id)` entrega a proposta para `gerarOficial`/`gerarPrevia`; o snapshot gravado fica em `Proposta.pdfSnapshot`.

## Self-Check: PASSED

- Arquivo existe: propostas.clone.it.test.ts; modificados: propostas.service.ts, propostas.controller.ts, dto/propostas.dto.ts, __fixtures__/prisma-proposta.fake.ts, propostas.service.test.ts, propostas.http.test.ts.
- Commit f8ac408 presente na branch (1 commit medido de `plan_head_before` a `plan_head_after`).
