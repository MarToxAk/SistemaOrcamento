---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 06
subsystem: backend/propostas
tags: [nestjs, propostas, admin-only, snapshot, preco-servidor, prisma-fake]
requires: [55-01, 55-02, 55-03]
provides:
  - PropostasService (criarRascunho, obter, listar, atualizarCabecalho, adicionarItem, atualizarItem, removerItem, aplicarPercentualEmTodos, buscarProdutos, buscarCliente, listarAssinantesRecentes) e montarDetalhe
  - PropostasController (/api/propostas, AdminOnly na classe, rotas estaticas antes de :id)
  - PropostaError (codigo + mensagem legivel) e DTOs de proposta
  - criarPrismaPropostaFake (Prisma em memoria reutilizavel pelos planos 55-08 e 55-13)
  - PropostasModule registrado no AppModule
affects: [55-07, 55-08, 55-09, 55-10, 55-13, 55-15]
tech-stack:
  added: []
  patterns: [servidor recalcula preco a partir do snapshot, Decimal para texto via BigInt, erro com codigo no formato OrcamentoAthosError, Prisma em memoria com $transaction em array]
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas.errors.ts
    - apps/backend/src/modules/propostas/propostas.service.ts
    - apps/backend/src/modules/propostas/propostas.controller.ts
    - apps/backend/src/modules/propostas/propostas.module.ts
    - apps/backend/src/modules/propostas/dto/propostas.dto.ts
    - apps/backend/src/modules/propostas/__fixtures__/prisma-proposta.fake.ts
    - apps/backend/src/modules/propostas/propostas.http.test.ts
    - apps/backend/src/modules/propostas/propostas.service.test.ts
  modified:
    - apps/backend/src/modules/app.module.ts
key-decisions:
  - "Preco final nunca vem do navegador: DTOs com whitelist recusam precoUnitario; atualizarItem/aplicarPercentualEmTodos recalculam sempre por calcularItemProposta a partir do snapshot de precoBase e custoUnitario (D-02, D-09)."
  - "Ajuste VALOR e o novo preco unitario final em reais e substitui o preco base (D-02a); NENHUM e percentual 0 limpam o ajuste."
  - "Busca de proposta por nome de cliente usa ILIKE parametrizado via $queryRaw + where id in, porque o filtro JSON do Prisma 5.22 nao tem mode insensitive (desvio do texto do plano)."
  - "Item de outra proposta ou inexistente responde 404 PROPOSTA_NAO_ENCONTRADA (nao ha codigo de item no contrato de erros do plano)."
requirements-completed: [P55-CICLO, P55-MONT, P55-CLI, P55-PRECO]
duration: 55 min
completed: 2026-11-27
status: complete
actuals:
  tokens: 19800
  tasks: 3
  commits: 4
plan_head_before: c83639c8df1faa12503fbb7ba6de97ca5300a6cd
plan_head_after: e5001879969308a7ff57cc48f4acc1e4cf660544
---

# Phase 55 Plan 06: Backend de montagem de propostas Summary

Modulo `propostas` do backend: rascunho, itens com snapshot de preco e custo do Athos, ajuste (percentual ou preco digitado) e "aplicar percentual em todos" recalculados no servidor com BigInt, cabecalho com cliente do Athos e dados de orgao, listagem e rotas de apoio, tudo atras de `AdminOnly` e com um Prisma em memoria reutilizavel pelos planos seguintes.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Rascunho, item com snapshot (3,456 vira 3,46; total 6,92) e leitura por HTTP com chaves reais | a1c462a |
| 2 RED | 35 testes de servico + DTOs + stubs "not implemented" | bb43cf9 |
| 2 GREEN | Ajuste por item, aplicar percentual, remover, cabecalho, listagem, assinantes, produtos, cliente, rotas | 82b4403 |
| 3 | PropostasModule registrado no AppModule | e500187 |

## Accomplishments

- Tracer ponta a ponta por HTTP: `InternalAuthGuard` global real + `AdminAuthGuard` via `@AdminOnly()` + ValidationPipe do main.ts + service + util de calculo (55-01) + Prisma em memoria + Athos simulado. Verificado novamente apos a expansao (`⚡ Tracer verified end-to-end — expanding`).
- Contrato `PropostaDetalhe` implementado em `montarDetalhe`: dinheiro como texto (`"3.456"`, `"3.46"`, `"6.92"`), `margemPercentual` e `abaixoDoCusto` por item, `assinante`, `pdfDisponivel`; `pdfSnapshot` nunca e devolvido.
- Rotas: `GET produtos`, `GET assinantes`, `GET clientes/:idcliente`, `GET /` (listagem), `POST /`, `GET :id`, `PATCH :id`, `POST :id/itens`, `PATCH :id/itens/:itemId`, `DELETE :id/itens/:itemId`, `POST :id/aplicar-percentual`; estaticas declaradas antes de `:id` e provadas por teste HTTP.
- Edicao so em RASCUNHO: `carregarEditavel` responde 409 `PROPOSTA_NAO_EDITAVEL` (mensagem manda duplicar) nos quatro status restantes, testado em todas as mutacoes.
- Editar nome, quantidade ou ajuste nao chama o Athos (contagem de `obterProdutoProposta` igual a 1 apos a adicao).
- VALOR 2.90 sobre base 2.000 e sobre base 3.500 resulta 2.90 (nunca 4.90); percentual invalido (-100, 10.5555, 1000.001) responde 422 `VALOR_INVALIDO` sem gravar.
- `criarPrismaPropostaFake()` com delegates `proposta` e `propostaItem`, `$transaction` em array, `$queryRaw` restrito a busca de cliente, e `_propostas`/`_itens` para semear e inspecionar.

## Verification

- `npm --prefix apps/backend run test -- src/modules/propostas`: 3 suites (calc.util, http, service), 73 testes passando.
- `tsc -p tsconfig.json --noEmit` do backend: limpo.
- Suite completa do backend: 120 suites passaram, 3 skipped; unica falha e a pre-existente `pesquisa-revogacao.service.test.ts` (4 testes, dependente de data), fora do escopo.
- Criterios de aceitacao: `AdminOnly` 3 ocorrencias no controller; `export class PropostaError` 1; `calcularItemProposta` usado no servico (sem regra de arredondamento reimplementada); `aplicarPercentualEmTodos` presente; `PropostasModule` 2 ocorrencias em `app.module.ts`; `AthosModule` 3 ocorrencias em `propostas.module.ts`; Task 3 alterou apenas `propostas.module.ts` e `app.module.ts`.
- RED da tarefa 2: 34 de 35 testes falharam nas asserções contra stubs que lancam "not implemented" (o 35o cobre regras de `adicionarItem` ja entregues no tracer). Plano e `type: execute`, entao a classificacao formal `check tdd-red-evidence` nao se aplica.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Filtro JSON `mode: "insensitive"` nao existe no Prisma 5.22**
- **Found during:** Task 2 (GREEN, typecheck)
- **Issue:** o plano mandava filtrar `q` texto por `clienteSnapshot` com `string_contains` e `mode: "insensitive"`; o tipo `JsonNullableFilter` do Prisma 5.22 nao aceita `mode` (TS2353), e sem ele a busca diferenciaria maiusculas, contra o requisito.
- **Fix:** `listar` faz um `$queryRaw` parametrizado (`Prisma.sql`, ILIKE sobre `razaoSocial` e `nomeFantasia` do snapshot, coringas `%`, `_` e `\` do texto escapados) e filtra a listagem por `where.id in (...)`. O fake ganhou um `$queryRaw` restrito a essa busca; os testes validam os valores enviados ao SQL (padrao escapado, texto nunca interpolado) em vez do formato do `where` JSON.
- **Files modified:** propostas.service.ts, __fixtures__/prisma-proposta.fake.ts, propostas.service.test.ts
- **Commit:** 82b4403

**2. [Rule 3 - Blocking] Ambiente do worktree sem node_modules e sem Prisma client**
- **Found during:** inicio da Task 1 (precondicao)
- **Fix:** `npm ci` + `npm --prefix apps/backend run prisma:generate` (nada versionado). Precondicao do tracer atendida (`model Proposta` no schema e `PropostaStatus` no client gerado).

### Notas de interpretacao (sem desvio de comportamento)

- `.planning/` ja continha os SUMMARY de 55-01..55-03; STATE.md e ROADMAP.md nao foram tocados (o orquestrador os atualiza).
- Resposta da listagem (`PropostaListagem`) usa `PropostaResumo` sem custo, margem ou itens; o contrato do plano so definia `{ itens, total, pagina, tamanho }`.
- A mutacao e a checagem de status nao sao atomicas entre si (leitura do status + `$transaction` em array de operacoes). Janela residual conhecida: um lancamento (55-08) que mude o status para LANCANDO entre a leitura e a escrita; aceitavel para uso administrativo de um operador, e o 55-08 deve reservar com `updateMany` condicionado a `status: RASCUNHO` (suportado pelo fake).

**Total deviations:** 2 (1 bug de API do Prisma, 1 ambiente). **Impact:** a busca por cliente e mais correta do que o texto do plano; nenhuma mudanca de contrato HTTP.

## Known Stubs

None.

## Threat Flags

None alem do mapeado (T-55-19 a T-55-24). A nova consulta bruta (`$queryRaw` ILIKE) e parametrizada, de leitura, somente sobre a tabela `Proposta` (banco do Sistema, nao o Athos) e alcancavel apenas por rota AdminOnly.

## Self-Check: PASSED

- Arquivos criados existem: propostas.errors.ts, propostas.service.ts, propostas.controller.ts, propostas.module.ts, dto/propostas.dto.ts, __fixtures__/prisma-proposta.fake.ts, propostas.http.test.ts, propostas.service.test.ts.
- Commits a1c462a, bb43cf9, 82b4403 e e500187 presentes na branch (4 commits medidos de `plan_head_before` a `plan_head_after`).
