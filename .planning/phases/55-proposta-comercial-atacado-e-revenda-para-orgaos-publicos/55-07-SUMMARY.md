---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 07
subsystem: backend/propostas-pdf
tags: [pdf, handlebars, puppeteer, minio, snapshot, proposta, institucional]
status: complete
requires: [55-02, 55-05, 55-06]
provides:
  - propostas-pdf.util (formatadores pt-BR sem Intl, montarContextoProposta por lista branca, PROPOSTA_MOCK, tipos PropostaParaPdf, ContextoPropostaPdf, PdfSnapshotProposta)
  - proposta-institucional.hbs (preset institucional da familia PROPOSTA)
  - QuotesPdfStorageService.renderHtmlFromSource, renderPdfMultipagina, armazenarPdf e resolveLogoDataUri publico (aditivos)
  - PropostasPdfService (capturarSnapshot, gerarOficial(proposta, snapshot), gerarPrevia, gerarPreviaTemplate, baixarOficial, existeOficial)
affects: [55-08, 55-13, 55-15]
requirements-completed: [P55-PDF]
tech-stack:
  added: []
  patterns:
    - "Contexto do template por lista branca de campos (D-12): custo, preco base, ajuste, margem e nome do Athos nunca sao lidos"
    - "PDF oficial renderizado so a partir de um snapshot de emissao (template, banco, empresa) capturado antes do lancamento"
    - "Render multipagina sem escala: margens reais do page.pdf, rodape com Pagina N de M, mesma rede bloqueada do render de orcamento"
key-files:
  created:
    - apps/backend/src/modules/propostas/propostas-pdf.util.ts
    - apps/backend/src/modules/propostas/propostas-pdf.test.ts
    - apps/backend/templates/proposta-institucional.hbs
    - apps/backend/src/modules/propostas/propostas-pdf.service.ts
    - apps/backend/src/modules/propostas/propostas-pdf.service.test.ts
    - apps/backend/src/modules/propostas/propostas-pdf.smoke.test.ts
  modified:
    - apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
    - apps/backend/src/modules/propostas/propostas.module.ts
key-decisions:
  - "PDF_INDISPONIVEL usa HTTP 503 (o 55-06 so definiu o codigo, nao o status)."
  - "capturarSnapshot tambem recusa EMPRESA_NOME/EMPRESA_CNPJ vazios: documento para orgao publico nao sai sem razao social e CNPJ da empresa."
  - "Quantidade usa separador de milhar (10.000) e moeda e formatada sem Intl, deterministica entre ambientes."
  - "PROPOSTA_MOCK e previa:true (marca d'agua, sem numero), para nunca parecer uma proposta oficial."
metrics:
  duration: 50 min
  completed: 2026-11-27
actuals:
  tokens: 18000
  tasks: 2
  commits: 2
plan_head_before: a95a67be28d94b5f24f68bd064401c3444aae2a9
plan_head_after: 81e0d8200036510e50291ef3566c62e12f718d3e
---

# Phase 55 Plan 07: PDF institucional da proposta Summary

PDF institucional da proposta comercial: contexto montado por lista branca (nunca custo nem margem), template Handlebars da familia PROPOSTA com o teal da marca como unico acento, render multipagina hardened sem escala, armazenamento sob `propostas/` e snapshot de emissao que torna o PDF oficial reproduzivel.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Contexto por lista branca e template institucional rendendo o HTML sem custo | 938122f |
| 2 | Render multipagina, armazenamento, snapshot de emissao e PropostasPdfService | 81e0d82 |

## Accomplishments

- **Tracer (Task 1):** dados da proposta -> lista branca -> template real -> HTML com numero, cliente, item, total e banco, sem custo. 18 testes (a)-(j) do plano mais formatadores, ordenacao, orgao/assinante condicionais e `PROPOSTA_MOCK`. Verificado ponta a ponta antes de expandir.
- **Template:** A4, fontes do sistema (Liberation Sans), escala de cinza com `--accent:#0e6d73` declarado uma unica vez e usado so em linhas e titulos; seis colunas exatas (Codigo, Descricao, Un., Quantidade, Valor unitario, Total); `thead` repetido, `tr` sem quebra; logo da empresa so quando fornecido como data URI; marca d'agua "PRÉVIA" so na previa. Sem helper, chave tripla, script, handler ou URL externa; passa em `validateUpload`.
- **Render (Task 2):** `renderHtmlFromSource` (mesma compilacao hardened), `renderPdfMultipagina` (rede bloqueada, timeout de 30 s, margens 16/18/14 mm, sem escala, rodape escapado com "Pagina N de M") e `armazenarPdf` (sem URL publica). `resolveLogoDataUri` passou a publico. Suites de quotes-pdf-storage sem edicao e verdes.
- **PropostasPdfService:** `capturarSnapshot` e o unico ponto que le `propostaConfig`, `EMPRESA_*` e o template ativo (BANCO ou EMPACOTADO); `gerarOficial` renderiza so pelo snapshot (valida a forma, exige numero e data do Athos) e grava em `propostas/<id>/Proposta-<id>.pdf`; `gerarPrevia` e `gerarPreviaTemplate` nunca armazenam.
- **Smoke real:** com Chromium, 60 itens geram PDF valido com 2 ou mais paginas; verificacao visual de um PDF de 40 itens (4 paginas) conferiu cabecalho da tabela repetido, rodape "Pagina N de 4", marca d'agua da previa e bloco final (condicoes, banco, observacao, assinatura).

## Verification

- `npm --prefix apps/backend run test -- src/modules/propostas src/modules/quotes/quotes-pdf-storage src/modules/pdf-templates`: 12 suites passaram (192 testes), 1 skipped (smoke sem a variavel).
- `RUN_PUPPETEER_SMOKE=1 ... propostas-pdf.smoke.test.ts`: 2 de 2 testes executados e passando (nao skipped).
- `tsc -p tsconfig.json --noEmit` do backend: limpo.
- Suite completa do backend: 125 suites passaram; unica falha e a pre-existente `pesquisa-revogacao.service.test.ts` (4 testes, dependente de data), fora do escopo.
- Criterios de aceitacao: `{{{` = 0 e URL externa = 0 no template; `export function montarContextoProposta` = 1; `renderPdfMultipagina` presente no storage; `private async resolveLogoDataUri` = 0; `git diff --quiet 8636fbe` dos dois testes de storage = exit 0; leituras de `propostaConfig` fora de comentarios no servico = 1.
- RED: o plano e `type: execute`; na Task 1 o util e o template foram escritos junto com o teste (sem commit RED separado), entao nao ha evidencia de RED por commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cabecalhos numericos da tabela alinhados a esquerda**
- **Found during:** Task 2 (conferencia visual do PDF de 40 itens)
- **Issue:** `table.itens th{text-align:left}` tinha especificidade maior que `.r`/`.c`, entao Quantidade, Valor unitario e Total apareciam a esquerda sobre numeros a direita; "Valor unitario" quebrava em duas linhas.
- **Fix:** seletores `table.itens .r` e `table.itens .c`, `white-space:nowrap` nos `th` e larguras 18%/14%.
- **Files modified:** apps/backend/templates/proposta-institucional.hbs
- **Commit:** 81e0d82

**2. [Rule 3 - Blocking] Ambiente do worktree**
- `npm ci --ignore-scripts` e `prisma:generate` (nada versionado). O Chromium do Puppeteer ja estava em `~/.cache/puppeteer` (precondicao da Task 2 atendida).

### Notas de interpretacao (sem desvio de comportamento)

- Fixtures de teste usam dados fictícios (empresa, CNPJ e banco de teste); dados reais da empresa nao foram colocados em arquivos versionados.
- `PdfTemplatesService` entrou como provider do `PropostasModule` conforme o plano, ainda sem consumidor neste plano (sera usado pelas rotas de previa do 55-13).
- `renderHtml` do storage nao foi refatorado para compartilhar a compilacao: `renderHtmlFromSource` repete a mesma configuracao hardened para manter a mudanca estritamente aditiva.
- A busca de candidatos do `.hbs` empacotado tenta `cwd/apps/backend/templates`, `cwd/templates` (cwd em apps/backend, como no jest) e o relativo ao arquivo; o Dockerfile copia o diretorio para `apps/backend/templates`.

**Total deviations:** 1 bug (visual de CSS), 1 ambiente. **Impact:** nenhuma mudanca de contrato.

## Known Stubs

None. Os textos "exemplo" de `PROPOSTA_MOCK` sao intencionais (previa de template da galeria).

## Threat Flags

None alem do threat_model do plano. T-55-25 (lista branca + custo sentinela no JSON e no HTML), T-55-26 (escape padrao, teste com tag e aspas), T-55-27 (rede bloqueada, logo como data URI, template sem URL), T-55-28 (`validateUpload` no preset, `knownHelpersOnly`), T-55-29 (sem URL publica, prefixo fixo `propostas/`), T-55-30 (limite de 200 itens do util, timeout de 30 s) e T-55-54 (snapshot + testes de reproducibilidade) mitigados.

## Notes for downstream plans

- **55-08:** chamar `capturarSnapshot()` ANTES de reservar a proposta e gravar o resultado em `Proposta.pdfSnapshot`; depois `gerarOficial(proposta, snapshot)`. Erros `PropostaError` com `PDF_INDISPONIVEL` (503) saem dessas duas chamadas.
- **55-13:** `gerarOficial` com o snapshot gravado regenera o mesmo PDF; `gerarPrevia(proposta)` e `gerarPreviaTemplate(source)` precisam de rota autenticada, `validateUpload(source)` antes do preview e Throttle (T-55-56/57).

## Self-Check: PASSED

- Arquivos existem: propostas-pdf.util.ts, propostas-pdf.test.ts, proposta-institucional.hbs, propostas-pdf.service.ts, propostas-pdf.service.test.ts, propostas-pdf.smoke.test.ts; modificados quotes-pdf-storage.service.ts e propostas.module.ts.
- Commits 938122f e 81e0d82 presentes na branch (2 commits medidos de `plan_head_before` a `plan_head_after`).
