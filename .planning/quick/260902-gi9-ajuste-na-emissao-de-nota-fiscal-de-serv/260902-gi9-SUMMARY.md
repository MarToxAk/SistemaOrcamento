---
phase: 260902-gi9-ajuste-na-emissao-de-nota-fiscal-de-serv
plan: 01
subsystem: nfse
tags: [nestjs, nextjs, prisma, athos-postgres, dps, nfse-nacional]

requires:
  - phase: 260804-g0t
    provides: "NfseNacionalService.emitir + buildAndSignDps aceitando tomador.endereco (grupo <end>) e correcao do codigoMunicipio"
  - phase: cobranca (v2.1/v2.2)
    provides: "Padrao de referencia buscarTomadorNfse + resolucao best-effort de endereco a partir do Athos"
provides:
  - "NfseService.resolverTomadorQuote(quoteId): resolve idclienteAthos/documento/nome/endereco a partir do orcamento, best-effort"
  - "GET /quotes/:quoteId/nfse/tomador (backend) e proxy GET /api/quotes/[id]/nfse/tomador (frontend)"
  - "Card de emissao de NFS-e em /orcamento/[id] com descricao do servico, IBS/CBS e endereco do tomador em leitura, com auto-preenchimento"
affects: [nfse, orcamento, athos-integration]

actuals:
  tokens: 5340
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Resolucao de tomador Athos por orcamento reutiliza o padrao externalQuoteId -> buscarOrcamentoPorNumero -> mapped.idcliente -> buscarClientePorId ja usado em quotes.service.ts"

key-files:
  created:
    - apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts
    - apps/frontend/src/app/api/quotes/[id]/nfse/tomador/route.ts
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.controller.ts
    - apps/backend/src/modules/integrations/nfse/nfse.module.ts
    - apps/frontend/src/app/orcamento/[id]/page.tsx

key-decisions:
  - "D-00 (confirmada pelo usuario): alvo do ajuste e /orcamento/[id] + NfseService; cobranca/** e contas-receber/** intocados"
  - "D-01: endereco do tomador resolvido sempre no backend a partir do Athos, nunca aceito do frontend"
  - "D-04: resolucao Athos e best-effort — qualquer falha e logada e a emissao segue sem endereco"
  - "D-06: EmitirNfseNacionalDto nao mudou — descricaoServico e incluirIbsCbs ja eram opcionais"

patterns-established:
  - "resolverTomadorQuote como metodo publico reutilizavel (chamado tanto pelo endpoint GET quanto internamente por emitirQuoteNfseAutomatica)"

requirements-completed: [QUICK-260902-gi9]

coverage:
  - id: D1
    description: "resolverTomadorQuote devolve documento/nome/endereco do cliente Athos vinculado ao orcamento, ou tudo nulo sem cliente vinculado"
    requirement: QUICK-260902-gi9
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts#Teste 1 e Teste 2"
        status: pass
    human_judgment: false
  - id: D2
    description: "emitirQuoteNfseAutomatica repassa tomador.endereco (sem uf) para nfseNacionalService.emitir quando o Athos tem endereco, e continua funcionando (endereco undefined) quando o Athos falha ou o orcamento nao tem cliente"
    requirement: QUICK-260902-gi9
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts#Teste 3 e Teste 4"
        status: pass
    human_judgment: false
  - id: D3
    description: "emitirQuoteNfseAutomatica repassa descricaoServico e incluirIbsCbs do DTO para o builder de DPS"
    requirement: QUICK-260902-gi9
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts#Teste 5"
        status: pass
    human_judgment: false
  - id: D4
    description: "Formulario de emissao em /orcamento/[id] ganha campos de descricao do servico, checkbox IBS/CBS e endereco do tomador (leitura), com auto-preenchimento de CPF/CNPJ/nome/endereco a partir do cliente Athos associado ao orcamento"
    human_judgment: true
    rationale: "Requer backend + Athos reais rodando para validar visualmente o pre-preenchimento; verificacao humana diferida no proprio plano (item 5 de <verification>)"

duration: ~25min
completed: 2026-09-02
status: complete
---

# Quick Task 260902-gi9: Ajuste na Emissao de NFS-e do Orcamento Summary

**Formulario de emissao de NFS-e em `/orcamento/[id]` ganha paridade com contas a receber: endereco do tomador resolvido no backend a partir do Athos e embarcado na DPS, descricao do servico e grupo IBS/CBS, com auto-preenchimento de CPF/CNPJ/nome/endereco quando o orcamento tem cliente associado.**

## Performance

- **Duration:** ~25min
- **Completed:** 2026-09-02
- **Tasks:** 2 completed
- **Files modified:** 6 (2 criados, 4 modificados)

## Accomplishments
- `NfseService.resolverTomadorQuote` resolve idclienteAthos/documento/nome/endereco a partir do orcamento, reaproveitando o padrao `externalQuoteId -> buscarOrcamentoPorNumero -> mapped.idcliente -> buscarClientePorId` ja usado em `quotes.service.ts`, best-effort (nunca lanca por causa do Athos).
- `emitirQuoteNfseAutomatica` agora embarca `tomador.endereco` (logradouro/numero/bairro/cep/codigoMunicipio, sem `uf`) na DPS quando o cliente Athos tem endereco cadastrado — fecha a lacuna que causou rejeicao E288/E58 no fluxo do orcamento (o fluxo de contas a receber ja resolvia isso).
- Novo endpoint `GET /quotes/:quoteId/nfse/tomador` e proxy Next `GET /api/quotes/[id]/nfse/tomador` para pre-preenchimento.
- Card "Emitir NFS-e automaticamente" em `/orcamento/[id]` ganha descricao do servico (textarea, semeada a partir dos itens do orcamento), checkbox "Incluir Grupo IBS/CBS" e bloco de leitura do endereco do tomador, com aviso quando o cliente Athos nao tem endereco cadastrado.
- POST de emissao passa a enviar `descricaoServico` (quando preenchida) e `incluirIbsCbs`.

## Task Commits

Ciclo TDD (`tdd="true"`) para a Tarefa 1 — 2 commits (RED/GREEN); Tarefa 2 sem TDD — 1 commit:

1. **Tarefa 1 (RED):** `test(260902-gi9): add failing test for resolucao de tomador Athos na NFS-e do orcamento` - `8fbac9c` (test)
2. **Tarefa 1 (GREEN):** `feat(260902-gi9): resolver tomador Athos por orcamento e enviar endereco na DPS` - `3990402` (feat)
3. **Tarefa 2:** `feat(260902-gi9): proxy de tomador e paridade de campos no formulario de emissao do orcamento` - `8e3e9cf` (feat)

_TDD Gate Compliance: RED (`8fbac9c`, teste falhando com TS2339 antes da implementacao) seguido de GREEN (`3990402`, 5/5 testes verdes). Sem REFACTOR — nenhuma limpeza necessaria apos GREEN._

## Files Created/Modified
- `apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts` - 5 testes unitarios de `resolverTomadorQuote` e da propagacao de endereco/descricao/IBS-CBS em `emitirQuoteNfseAutomatica`
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` - novo metodo publico `resolverTomadorQuote` + injecao de `AthosService` + `emitirQuoteNfseAutomatica` passa a montar `tomador.endereco`
- `apps/backend/src/modules/integrations/nfse/nfse.controller.ts` - novo `GET /quotes/:quoteId/nfse/tomador`
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` - `AthosModule` adicionado aos imports (sem ciclo)
- `apps/frontend/src/app/api/quotes/[id]/nfse/tomador/route.ts` - proxy Next para o novo endpoint de tomador
- `apps/frontend/src/app/orcamento/[id]/page.tsx` - `abrirFormularioEmissao()` (semeia valor/descricao e busca tomador Athos assincronamente), campos novos no card de emissao, POST passa a enviar `descricaoServico`/`incluirIbsCbs`

## Decisions Made
- Endereco do tomador e sempre resolvido no backend a partir do Athos (D-01) — o DTO de entrada (`EmitirNfseNacionalDto`) nao ganhou campo de endereco, preservando D-06.
- `resolverTomadorQuote` e best-effort em toda a extensao Athos: so lanca `NotFoundException` se o proprio orcamento nao existir; qualquer falha do Athos (indisponibilidade, orcamento sem cliente vinculado) devolve o objeto todo nulo e loga em `debug`, preservando o comportamento atual de emissao sem endereco.
- Endereco do tomador no formulario e somente leitura por decisao de arquitetura (D-01) — nao ha input editavel para ele, apenas o texto formatado ou um aviso quando ausente.

## Deviations from Plan

None - plano executado exatamente como escrito. Os 5 testes descritos no `<behavior>` da Tarefa 1 foram implementados com os mesmos nomes e a mesma cobertura; a Tarefa 2 seguiu a acao descrita sem desvios.

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuracao de servico externo necessaria. Nenhuma variavel de ambiente nova.

## Next Phase Readiness

- Verificacao humana ponta-a-ponta (item 5 de `<verification>` do plano) permanece pendente: precisa backend + Athos real + certificado SEFIN para abrir um orcamento de cliente cadastrado, conferir o pre-preenchimento e confirmar no XML retornado que o grupo `<end>` esta presente com `cMun`/`CEP` corretos. Nao bloqueia o merge — mesmo padrao de verificacao diferida usado em quick tasks anteriores de NFS-e (ex.: 260828-e3v, 260827-ood).
- `apps/backend/src/modules/cobranca/**` e `apps/frontend/src/app/contas-receber/**` permanecem intocados (D-05), confirmado por `git status --porcelain` vazio em ambos os diretorios.

---
*Quick Task: 260902-gi9*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 7 files created/modified confirmed present on disk; all 3 task commits (`8fbac9c`, `3990402`, `8e3e9cf`) confirmed present in `git log --oneline --all`.
