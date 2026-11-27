---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 13
subsystem: backend/propostas
tags: [nestjs, propostas, pdf, snapshot, previa, duplicar, status, template-preview, tracer]
status: complete
requires: [55-07, 55-08, 55-17]
provides:
  - PropostasService.obterPdf (arquivo armazenado, ou regenerado SO do pdfSnapshot gravado)
  - PropostasService.obterPrevia (gerarPrevia, SEM_ITENS 422)
  - PropostasService.duplicar (novo RASCUNHO sem Athos, sem dados de lancamento)
  - PropostasService.atualizarStatus (FECHADA / CANCELADA com aviso de cancelamento local)
  - GET :id/pdf, GET :id/previa, POST :id/duplicar, PATCH :id/status, POST templates/preview
  - AtualizarStatusPropostaDto, PreviewTemplatePropostaDto
affects: [55-15, 55-18]
requirements-completed: [P55-CICLO, P55-PDF]
tech-stack:
  added: []
  patterns:
    - "PDF oficial regenerado exclusivamente do snapshot gravado no lancamento; sem snapshot, 409 em vez de regenerar com dados de agora"
    - "Transicao manual de status por updateMany condicionado ao status lido (nao corre com gerar)"
    - "PDF devolvido pelo proprio buffer via @Res() (sem URL publica)"
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas.ciclo.test.ts
  modified:
    - apps/backend/src/modules/propostas/propostas.service.ts
    - apps/backend/src/modules/propostas/propostas.controller.ts
    - apps/backend/src/modules/propostas/dto/propostas.dto.ts
    - apps/backend/src/modules/propostas/propostas.http.test.ts
    - apps/backend/src/modules/propostas/propostas.clone.it.test.ts
key-decisions:
  - "PDF_INDISPONIVEL em obterPdf usa HTTP 409 (proposta sem numero ou sem snapshot), conforme este plano; o 503 do 55-07 continua para falha de configuracao na captura/render."
  - "POST templates/preview responde 200 (HttpCode) e valida o source com validateUpload tambem quando vem de templateId (defesa em profundidade)."
  - "O corpo acima de 100 kb e recusado pelo body parser (413) antes do limite de 200000 do DTO; o limite do DTO e coberto por teste de validacao direto."
metrics:
  duration: 45 min
  completed: 2026-11-27
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
plan_head_before: bd405b03852cb077831a6e478f73f2c0479d7900
plan_head_after: 313273ca40c0d3ff9a0acadd593de6f9fbd02d21
---

# Phase 55 Plan 13: Ciclo da proposta apos o lancamento Summary

PDF oficial servido do armazenamento (ou regenerado so do snapshot do lancamento), previa, duplicar sem Athos, marcar FECHADA/CANCELADA com aviso de cancelamento local e preview de template da familia PROPOSTA, todos sob AdminOnly, mais a regressao ampla do backend.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | PDF oficial por HTTP (armazenado ou regenerado do snapshot) e previa | a442d08 |
| 2 | duplicar e atualizarStatus com aviso de cancelamento local | 5ff9c90 |
| 3 | preview de template PROPOSTA e regressao ampla | 313273c |

## Accomplishments

- **obterPdf:** so ENVIADA/FECHADA/CANCELADA com `idorcamentoAthos`; arquivo existente e devolvido sem regenerar; senao exige `pdfSnapshot` (nulo = 409 pedindo para duplicar), regenera com `gerarOficial(obterParaPdf, pdfSnapshot)` e grava `pdfObjectName` e `pdfGeradoEm`. Nunca chama `capturarSnapshot` nem o Athos. O teste muda a configuracao simulada (banco, EMPRESA_NOME, snapshot corrente) depois do lancamento e afirma que o snapshot entregue e exatamente o gravado.
- **obterPrevia / rotas:** qualquer status, mesmo sem cliente, minimo 1 item (SEM_ITENS 422); sempre `gerarPrevia`, nunca `gerarOficial`, nada armazenado; `Content-Disposition: inline` com `Proposta-<numero>.pdf` e `Previa-Proposta.pdf`; previa com Throttle sensivel.
- **duplicar:** novo RASCUNHO com `duplicadaDeId`, itens (nomes, descricoes, ajustes, precos, quantidades, custos), cliente, orgao, validade, prazo, observacao e assinante; nada de numero, senha, data/hora do Athos, PDF, pdfSnapshot nem datas de lancamento; contagem zero de chamadas ao Athos; a partir de qualquer status, inclusive LANCANDO. Campos Json nulos omitidos.
- **atualizarStatus:** ENVIADA para FECHADA; RASCUNHO/ENVIADA/FECHADA para CANCELADA; demais 409 TRANSICAO_INVALIDA; `updateMany` condicionado ao status lido (teste de corrida); cancelar proposta lancada devolve aviso com o numero do orcamento que segue aberto no Athos e deve ser cancelado pelo Balcao.
- **POST templates/preview:** declarado antes das rotas com `:id`; `templateId` exige familia PROPOSTA (400 em portugues senao), `source` direto passa por `validateUpload` real (script, handler de evento e protocolo javascript recusados com 400); sem nenhum dos dois, 400; whitelist rejeita campos extras.
- Fake do Prisma ja suportava `create` com `itens.create` e `updateMany` com `where.status` (extensoes dos planos 55-08/55-17), sem alteracao.

## Verification

- `npm --prefix apps/backend run test -- src/modules/propostas src/modules/integrations/athos/athos-orcamento src/modules/pdf-templates src/modules/quotes/quotes-pdf-storage`: 21 suites passaram, 507 testes (3 suites skipped por dependerem de variaveis de ambiente, entre elas o IT do clone e o smoke do Chromium); inclui propostas.http, propostas.ciclo, propostas.lancamento, athos-orcamento.service, pdf-templates.familia e quotes-pdf-storage.
- `tsc -p tsconfig.json --noEmit` do backend: limpo.
- Suite completa do backend: 128 suites passaram; unica falha e a pre-existente `pesquisa-revogacao.service.test.ts` (4 testes, dependente de data), fora do escopo.
- Aceitacao: `Get(":id/pdf")` = 1, `Get(":id/previa")` = 1, `AtualizarStatusPropostaDto` no DTO >= 1, `templates/preview` no controller >= 1; `git diff --quiet 8636fbe -- athos-orcamento.service.test.ts` exit 0 (nenhum teste da Fase 44 alterado).
- Nenhum teste tocou o Athos (nenhuma conexao a 192.168.33.198, 100.102.146.44 nem ao clone). O IT do clone nao foi reexecutado: so recebeu um provider stub de `PdfTemplatesService` para a injecao do controller.
- Tracer feedback gate: a Task 1 nao tem `gate="blocking-human"`; o `<verify>` foi reexecutado ponta a ponta (suites HTTP + typecheck) e passou antes de expandir para as Tasks 2 e 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `PropostasController` agora injeta `PdfTemplatesService` e `PropostasPdfService`**
- **Found during:** Task 3
- **Issue:** os modulos de teste dos planos 55-06, 55-17 e do IT do clone constroem o controller sem esses providers.
- **Fix:** providers stub `{}` de `PdfTemplatesService` adicionados (sem alterar nenhuma asserção existente); `PropostasModule` ja fornecia ambos.
- **Files modified:** propostas.http.test.ts, propostas.clone.it.test.ts
- **Commit:** 313273c

**2. [Rule 1 - Bug] Preview de template respondia 201**
- **Found during:** Task 3 (RED/GREEN)
- **Issue:** POST do Nest responde 201 por padrao; o plano exige 200.
- **Fix:** `@HttpCode(200)`.
- **Commit:** 313273c

### Notas de interpretacao (sem desvio de comportamento)

- `source` acima de ~100 kb e recusado pelo body parser padrao do Express (413) antes do limite de 200000 caracteres do DTO; mantido (mais estrito). Teste HTTP aceita 400 ou 413 e o limite do DTO e verificado por validacao direta.
- Dados de teste fictícios (empresa, CNPJ, banco); nenhum dado real em arquivos versionados.

**Total deviations:** 2 auto-fixed. **Impact:** nenhuma mudanca de contrato.

## Known Stubs

None.

## Threat Flags

None alem do threat_model do plano. T-55-35 (download so por GET sob AdminOnly via buffer, sem URL publica), T-55-37 (aviso de cancelamento local com o numero do orcamento, testado), T-55-56 (Throttle sensivel em previa, preview de template e duplicar) e T-55-57 (validateUpload e recusa de familia errada, testados com 400) mitigados.

## Notes for downstream plans

- **55-18 / 55-15:** o frontend deve repetir o aviso de cancelamento local; `GET :id/pdf` devolve 409 `PDF_INDISPONIVEL` para RASCUNHO, LANCANDO, sem numero ou sem snapshot; `POST templates/preview` responde 200 com `application/pdf`.

## Self-Check: PASSED

- Arquivos existem: propostas.ciclo.test.ts (criado); modificados: propostas.service.ts, propostas.controller.ts, dto/propostas.dto.ts, propostas.http.test.ts, propostas.clone.it.test.ts.
- Commits a442d08, 5ff9c90 e 313273c presentes na branch (3 commits medidos de `plan_head_before` a `plan_head_after`).
