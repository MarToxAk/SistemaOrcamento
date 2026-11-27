---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 17
subsystem: backend/propostas
tags: [nestjs, propostas, lancamento, athos, recuperacao, concorrencia, pdf-snapshot, tdd]
status: complete
requires: [55-04, 55-07, 55-08]
provides:
  - PropostasService.gerar refinado (classificacao definitivo x ambiguo do erro do Athos)
  - PropostasService.recuperarLancamento (somente LANCANDO e apos 120 s, por marcador ref, sem novo INSERT)
  - finalizarLancamento privado compartilhado por gerar e recuperarLancamento
  - POST /api/propostas/:id/recuperar (AdminOnly, Throttle sensivel, ParseUUIDPipe)
  - tipo PropostaRecuperada
affects: [55-11, 55-12, 55-13, 55-18]
requirements-completed: [P55-ATHOS, P55-CICLO, P55-PDF]
tech-stack:
  added: []
  patterns:
    - "Erro do Athos classificado por conjunto fechado de codigos definitivos (transacao revertida); todo o resto e ambiguo e confirmado por consulta ao marcador ref antes de decidir"
    - "Finalizacao pos-COMMIT em um unico metodo: updateMany condicionado a LANCANDO, falha local cita o numero do orcamento e mantem LANCANDO"
    - "Relogio controlavel nos testes com jest.useFakeTimers que simula somente Date (doNotFake nos demais)"
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas.lancamento.test.ts
  modified:
    - apps/backend/src/modules/propostas/propostas.service.ts
    - apps/backend/src/modules/propostas/propostas.controller.ts
    - apps/backend/src/modules/propostas/propostas.http.test.ts
key-decisions:
  - "Definitivos: ESCRITA_DESABILITADA, VALOR_INVALIDO, VALOR_FORA_DO_LIMITE, CLIENTE_INEXISTENTE, PRODUTO_INEXISTENTE, PRODUTO_INATIVO, QUANTIDADE_FRACIONADA, CONFIG_INVALIDA, FORMA_PAGAMENTO_INVALIDA, PERMISSAO_NEGADA; qualquer outro erro (inclusive nao-OrcamentoAthosError) e ambiguo."
  - "Finalizacao sempre por updateMany com status LANCANDO (o tracer aceitava tambem RASCUNHO); contagem diferente de 1 e tratada como falha local pos-COMMIT, com o numero do orcamento no erro."
  - "recuperarLancamento com lancandoEm nulo trata a proposta como elegivel (sem data de reserva nao ha lancamento em curso a proteger)."
  - "pdfSnapshot ausente na recuperacao nao recaptura: o PDF e pulado com aviso e a proposta fica ENVIADA (55-13 regenera)."
metrics:
  duration: 40 min
  completed: 2026-11-27
actuals:
  tokens: 21000
  tasks: 1
  commits: 3
plan_head_before: 4f33d5d5e2a36116b8e9cf8c88ef60133cdbd03f
plan_head_after: 456a7e293e3dc901da03b0d64781f46b0ef96d02
---

# Phase 55 Plan 17: Lancamento seguro da proposta no Athos Summary

Lancar a proposta no Athos (unica acao one-way da fase) ficou seguro por construcao: erro definitivo reverte a RASCUNHO, erro ambiguo e confirmado pelo marcador ref antes de decidir, falha local depois do COMMIT nunca esconde o orcamento, `POST :id/recuperar` finaliza orfaos sem novo INSERT e sem recapturar o snapshot, e duas chamadas simultaneas a gerar produzem um unico INSERT.

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 (TDD) | concorrencia, ordem do snapshot, erro definitivo e ambiguo, recuperacao de orfao, falha de PDF e rota recuperar | add9959 (RED), 0d7c4a1 (GREEN), 456a7e2 (HTTP) |

## Accomplishments

- **`gerar` refinado:** a chamada `criarOrcamentoProposta` passa por `resolverErroDoAthos`. Definitivo: `reverterReserva` (updateMany condicionado a LANCANDO; limpa `lancandoEm` e `pdfSnapshot`) e repassa o MESMO erro. Ambiguo: `buscarOrcamentoPorRefProposta(refDoOrcamento(id))`; achou = segue para a finalizacao como sucesso, sem novo INSERT; null = reverte e repassa o erro original; consulta tambem falhou = fica LANCANDO com `PropostaError` 409 LANCAMENTO_EM_ANDAMENTO que orienta a recuperar.
- **`finalizarLancamento` (privado, compartilhado):** grava ENVIADA, ids, data/hora e total por `updateMany` condicionado a LANCANDO; se o Prisma falhar (ou a contagem nao for 1) registra `logger.error` com idorcamento e ref e lanca 409 citando o numero do orcamento (proposta segue LANCANDO); depois gera o PDF com o snapshot recebido, fora de transacao; falha de PDF so loga e responde `pdfDisponivel: false` com aviso, sem relancar e com o `pdfSnapshot` preservado.
- **`recuperarLancamento(id)`:** exige LANCANDO (senao 409 TRANSICAO_INVALIDA) e `lancandoEm` com mais de 120 s (senao 409 LANCAMENTO_EM_ANDAMENTO, sem consultar o Athos); acha pelo ref e finaliza com o `pdfSnapshot` ja gravado na proposta; nao achando devolve a RASCUNHO com `{ id, status: "RASCUNHO", mensagem }`. Nunca chama `criarOrcamentoProposta` nem `capturarSnapshot`.
- **Rota `POST :id/recuperar`:** `ParseUUIDPipe`, `@Throttle({ default: THROTTLE_SENSITIVE })`, sob o `@AdminOnly()` da classe; a rota `:id/gerar` do 55-08 foi preservada (1 ocorrencia de cada).
- **Testes (`propostas.lancamento.test.ts`, 33 casos):** concorrencia (Promise.all: `criarOrcamentoProposta` exatamente 1 vez, segunda com 409); flag desligada, cliente ausente e sem itens falham antes de snapshot e reserva; `capturarSnapshot` antes da `updateMany` da reserva (`invocationCallOrder`), snapshot gravado na mesma atualizacao e o mesmo objeto (`toBe`) entregue a `gerarOficial`; PDF_INDISPONIVEL deixa RASCUNHO sem chamar o Athos; entrada ao Athos com so quatro chaves por item e ref do id; 10 codigos definitivos; 3 erros ambiguos x (achou, nao achou); consulta por ref falhando; orfao pos-COMMIT; recuperar antes (119 s) e depois (121 s) do limite com relogio controlavel; recuperar sem orcamento, fora de LANCANDO e inexistente; falha de PDF; detalhe sem `pdfSnapshot`.
- **Testes HTTP (`propostas.http.test.ts`, 10 casos novos):** gerar sem `confirmar`, com `confirmar` false ou texto, sem `assinanteNome` e com ele vazio respondem 400 sem chamar o servico; sem chaves 401; UUID invalido 400; flag desligada propaga 503 `ESCRITA_DESABILITADA` pelo fluxo real; gerar valido 201 e o detalhe seguinte sem `pdfSnapshot` nem o conteudo do template; recuperar chama `recuperarLancamento`, 401 sem chaves, 400 UUID invalido, 409 TRANSICAO_INVALIDA pela rota.

## Verification

- `npm --prefix apps/backend run test -- src/modules/propostas/propostas.lancamento.test.ts src/modules/propostas/propostas.service.test.ts src/modules/propostas/propostas.http.test.ts`: 3 suites, 90 testes passando.
- `npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit`: sem erros.
- IT do 55-08 no clone (`propostas.clone.it.test.ts`, `ATHOS_IT_CLONE=1`, 127.0.0.1:5440, `PROPOSTA_ESCRITA_ATIVA=true`): 3 de 3 passando (nao skipped) depois do refino e da extracao da finalizacao. Senha do clone passada so inline na linha de comando, em nenhum arquivo. `SELECT count(*) FROM orcamento WHERE obs LIKE '[PROPOSTA]%'` no clone depois da execucao: 0. Nenhuma conexao a 192.168.33.198 ou 100.102.146.44.
- Suite completa do modulo: `npm --prefix apps/backend run test -- src/modules/propostas`: 7 suites passaram, 2 skipped (IT do clone e smoke do Chromium sem as variaveis, como esperado), 165 testes passando.
- Aceitacao: `grep -c recuperarLancamento propostas.service.ts` = 5 (>= 1); `Post(":id/gerar")` = 1; `Post(":id/recuperar")` = 1.
- Limite de verificacao (do plano): este plano nao acrescenta SQL ao Athos (usa `buscarOrcamentoPorRefProposta` do 55-04); o IT roda no clone PostgreSQL 14 e a producao roda 9.0.5, entao a compatibilidade da recuperacao por ref com 9.0.5 segue por revisao e pelas assertivas de texto do 55-04, nao por execucao em 9.0.5.

## Deviations from Plan

### Notas de interpretacao (sem desvio de comportamento)

- `__fixtures__/prisma-proposta.fake.ts` estava listado em `files_modified`, mas nao precisou de alteracao: o fake do 55-08 (`updateMany` com `in`, Json `pdfSnapshot`, `_propostas` para semear estado) ja cobria todos os casos. O arquivo ficou intacto.
- A reserva `updateMany` e a falha local pos-COMMIT sao simuladas por `jest.spyOn` sobre o `updateMany` do fake (lanca so quando `data.status === "ENVIADA"`), em vez de estender o fake.
- Para o 503 por flag desligada no teste HTTP, o servico real roda com `exigirEscritaPropostaAtiva` simulado lancando `OrcamentoAthosError`, provando a propagacao ponta a ponta pela rota, em vez de simular o servico inteiro.

None - plan executed as written; no auto-fixes (Rules 1 a 3) were needed.

## Known Stubs

None.

## Threat Flags

None alem do threat_model do plano. Mitigados e provados por teste: T-55-32 (falha local pos-COMMIT mantem LANCANDO, loga idorcamento e ref e cita o numero; recuperar reencontra pelo ref), T-55-33 (flag antes da reserva; definitivo reverte; ambiguo so mantem LANCANDO se a consulta falhar), T-55-34 (confirmar e assinanteNome exigidos, 400 e 401 por HTTP), T-55-38 (Throttle sensivel nas duas rotas; compare-and-set com Promise.all), T-55-62 (recuperar so em LANCANDO e apos 120 s, updateMany condicionado ao status, nunca chama `criarOrcamentoProposta`, testado a 119 s e 121 s).

## Notes for downstream plans

- **55-13:** a regeneracao do PDF (`GET /propostas/:id/pdf`) parte do `pdfSnapshot` preservado em ENVIADA com `pdfDisponivel` falso; este plano nao toca no Athos nesse caminho.
- **55-18 / 55-11 / 55-12:** o frontend deve oferecer a acao "recuperar" quando a proposta estiver em LANCANDO (a rota responde 409 antes de 120 s e 201 com `{ status: "ENVIADA" | "RASCUNHO" }` depois). A flag `PROPOSTA_ESCRITA_ATIVA` so deve ser ligada em producao por decisao humana no 55-12; o tratamento de erro do 55-08 que a mantinha desligada esta concluido aqui.

## Self-Check: PASSED

- Arquivos: propostas.lancamento.test.ts (criado), propostas.service.ts, propostas.controller.ts, propostas.http.test.ts (modificados) presentes.
- Commits add9959, 0d7c4a1 e 456a7e2 presentes na branch (3 medidos de `plan_head_before` a `plan_head_after`).
