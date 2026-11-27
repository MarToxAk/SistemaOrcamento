---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 05
subsystem: api
tags: [pdf-templates, familia, seed, nestjs, prisma, proposta]
status: complete

requires:
  - phase: 55-02
    provides: enum PdfTemplateFamilia e coluna PdfTemplate.familia (default ORCAMENTO)
provides:
  - ativacao de template escopada por familia (ORCAMENTO | PROPOSTA)
  - PdfTemplatesRepository.getActiveSource(familia) com ordem deterministica (updatedAt desc)
  - PdfTemplatesService.create/list com familia e getFamilia(id)
  - GET/POST /pdf-templates com familia validada (400 fora do enum); preview generico recusa PROPOSTA
  - seed com preset proposta-institucional (isActive so no create), seedPresets/PRESETS exportados
affects: [55-07, 55-15]

actuals:
  tokens: 10800
  tasks: 3
  commits: 3
plan_head_before: c83639c8df1faa12503fbb7ba6de97ca5300a6cd
plan_head_after: 1a3fd4573d6b453501dc26609d2e8086ddf67737

tech-stack:
  added: []
  patterns:
    - "activate faz updateMany({ where: { familia } }) na mesma $transaction: isolamento por familia"
    - "Seed com update diferenciado por familia: PROPOSTA nunca regrava isActive (boot do container nao desfaz a escolha do operador)"
    - "Script de seed sem efeito colateral na importacao (PrismaClient so em require.main === module)"

key-files:
  created:
    - apps/backend/src/modules/pdf-templates/pdf-templates.familia.test.ts
    - apps/backend/src/modules/pdf-templates/pdf-templates.seed.test.ts
  modified:
    - apps/backend/src/modules/pdf-templates/pdf-templates.types.ts
    - apps/backend/src/modules/pdf-templates/pdf-templates.repository.ts
    - apps/backend/src/modules/pdf-templates/pdf-templates.service.ts
    - apps/backend/src/modules/pdf-templates/pdf-templates.controller.ts
    - apps/backend/src/modules/pdf-templates/pdf-templates.service.test.ts
    - apps/backend/src/modules/pdf-templates/pdf-templates.controller.test.ts
    - apps/backend/scripts/seed-pdf-templates.ts

key-decisions:
  - "getActiveSource() sem argumento continua resolvendo ORCAMENTO: QuotesPdfStorageService permanece intocado (guard git diff 8636fbe limpo)."
  - "Divida registrada (fora de escopo): o seed ainda reescreve isActive dos presets ORCAMENTO a cada boot (reativa o colorful)."

patterns-established:
  - "Controller converte familia via resolverFamilia() (ausente => ORCAMENTO, invalida => BadRequestException)"

requirements-completed: [P55-PDF]

duration: 20min
completed: 2026-11-27
---

# Phase 55 Plan 05: Templates de PDF por familia Summary

**Galeria, ativacao, resolucao do template ativo e seed de templates de PDF isolados por familia (ORCAMENTO | PROPOSTA), de modo que ativar um template de proposta nunca desativa o PDF de orcamento da grafica.**

## Performance

- **Tasks:** 3 (1 tracer + 2 auto/TDD)
- **Commits:** 3 (a39ba49, e1b17ac, 1a3fd45)
- **Verificacao final:** `npm --prefix apps/backend run test -- src/modules/pdf-templates src/modules/quotes/quotes-pdf-storage` (7 suites, 83 testes verdes) e `tsc -p tsconfig.json --noEmit` limpo.

## Accomplishments

- **Tracer (Task 1):** Prisma em memoria + `PdfTemplatesService` e `PdfTemplatesRepository` reais provam ponta a ponta que ativar PROPOSTA mantem o ORCAMENTO ativo (e o inverso), que um segundo PROPOSTA desativa so o primeiro, que `list()` filtra por familia e que a resolucao do ativo e deterministica. Tracer verificado ponta a ponta antes de expandir.
- **Controller (Task 2):** `GET /pdf-templates?familia=` (padrao ORCAMENTO, 400 para valor invalido), `POST` com `familia` opcional validada, e o preview generico responde 400 orientando `/propostas/templates/preview` quando o template e PROPOSTA.
- **Seed (Task 3):** `seedPresets(prisma, templatesDir)` e `PRESETS` exportados; `PrismaClient` so e criado na execucao direta; preset `proposta-institucional` (PROPOSTA) grava `isActive` apenas no `create`. Teste importa o script real. Execucao direta via ts-node confirmada (chega ao upsert e falha so por nao haver banco).

## Task Commits

1. **Task 1: isolar templates por familia (tracer)** - `a39ba49` (feat)
2. **Task 2: controller com filtro/validacao de familia e recusa de preview cruzado** - `e1b17ac` (feat)
3. **Task 3: seed com preset de proposta, isActive so no create e teste do seed real** - `1a3fd45` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock do servico no teste do controller sem `getFamilia`**
- **Found during:** Task 2
- **Issue:** o preview agora consulta `getFamilia` antes de `getSource`; o mock existente de `PdfTemplatesService` nao tinha o metodo.
- **Fix:** acrescentado `getFamilia: jest.fn()` ao mock (ajuste de contrato). Nenhuma afirmacao existente foi removida ou enfraquecida.
- **Files modified:** apps/backend/src/modules/pdf-templates/pdf-templates.controller.test.ts
- **Commit:** e1b17ac

**2. [Rule 1 - Ajuste menor] Comentario do seed citava a guarda literalmente**
- **Found during:** Task 3
- **Issue:** o grep de aceitacao `require.main === module` esperava exatamente 1 ocorrencia; o cabecalho do script tinha uma segunda, no comentario.
- **Fix:** comentario reescrito sem o literal.
- **Commit:** 1a3fd45

Fora isso: plano executado como escrito.

## Guards

- `git diff 8636fbe -- apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`: sem diferencas.
- `git diff 8636fbe -- apps/backend/src/modules/pdf-templates/pdf-templates.presets.test.ts`: sem diferencas.

## Known Stubs

Nenhum. O arquivo `apps/backend/templates/proposta-institucional.hbs` ainda nao existe: o seed o pula com aviso (comportamento planejado; criado no plano 55-07).

## Threat Flags

Nenhum alem do threat_model do plano (T-55-15 a T-55-18 mitigados: ativacao escopada por familia, seed sem isActive no update de PROPOSTA, `validateUpload` inalterado, preview cruzado recusado).

## Notes

- Falha pre-existente conhecida e ignorada: `pesquisa-revogacao.service.test.ts` (nao executada neste plano, fora do escopo).
- STATE.md e ROADMAP.md nao foram alterados (responsabilidade do orquestrador).

## Self-Check: PASSED

- Arquivos criados presentes: pdf-templates.familia.test.ts, pdf-templates.seed.test.ts.
- Commits presentes no historico: a39ba49, e1b17ac, 1a3fd45.
