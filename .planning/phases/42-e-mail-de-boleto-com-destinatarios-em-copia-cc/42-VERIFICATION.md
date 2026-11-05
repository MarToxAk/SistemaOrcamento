---
phase: 42-e-mail-de-boleto-com-destinatarios-em-copia-cc
verified: 2026-11-05T15:00:00Z
status: human_needed
score: 7/11 must-haves verified
covered_files:
  - ".planning/phases/42-e-mail-de-boleto-com-destinatarios-em-copia-cc/42-01-PLAN.md"
  - ".planning/phases/42-e-mail-de-boleto-com-destinatarios-em-copia-cc/42-01-SUMMARY.md"
  - ".planning/phases/42-e-mail-de-boleto-com-destinatarios-em-copia-cc/42-02-PLAN.md"
  - ".planning/phases/42-e-mail-de-boleto-com-destinatarios-em-copia-cc/42-02-SUMMARY.md"
  - "apps/backend/prisma/migrations/20261105120000_add_cobranca_email_envio_cc/migration.sql"
  - "apps/backend/prisma/migrations/20261105130000_add_cobranca_email_cc_padrao/migration.sql"
  - "apps/backend/prisma/schema.prisma"
  - "apps/backend/src/modules/cobranca/cobranca.controller.ts"
  - "apps/backend/src/modules/cobranca/cobranca.service.ts"
  - "apps/backend/src/modules/cobranca/dto/enviar-email-cobranca.dto.ts"
  - "apps/backend/src/modules/cobranca/dto/salvar-cc-padrao.dto.ts"
  - "apps/backend/src/modules/cobranca/email-envio.service.test.ts"
  - "apps/backend/src/modules/cobranca/email-envio.service.ts"
  - "apps/frontend/src/app/api/cobranca/email/cc-padrao/[idclienteAthos]/route.ts"
  - "apps/frontend/src/app/api/cobranca/email/enviar/route.ts"
  - "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"
covered_digest: "v4:sha256:ee072ee1a7c7cc8ce7828d0043504a4116b8509bb68abc87cc8ba63291796384"
behavior_unverified: 4
overrides_applied: 0
behavior_unverified_items:
  - truth: "D-01/D-07: operador adiciona e remove e-mails no campo 'Cópia (CC)' (chips, Enter/vírgula/botão Adicionar) no modal a cada envio"
    test: "Abrir o modal de e-mail, digitar e-mails (Enter, vírgula, botão Adicionar), remover chip pelo X, tentar e-mail inválido e 11º e-mail"
    expected: "Chips aparecem/somem; inválido mostra erro e não envia; 11º é recusado com mensagem de limite"
    why_human: "Interação de UI em React (estado + eventos) sem teste de frontend no repo; só tsc e leitura do código provam presença"
  - truth: "D-01: ao abrir o modal o CC vem pré-preenchido com a lista salva do cliente (sem o destinatário principal)"
    test: "Com padrão salvo no Postgres, abrir o modal do mesmo cliente"
    expected: "Chips pré-carregados, principal ausente; sem padrão -> vazio; backend fora -> aviso amarelo e modal segue utilizável"
    why_human: "Depende de fetch real ao GET + Postgres; corrida de aberturas do modal (emailCcCargaSeq) não é coberta por teste"
  - truth: "D-06: padrão só é salvo com checkbox marcado e envio ok; lista vazia com checkbox remove o padrão"
    test: "Enviar com/sem checkbox; reabrir o modal; enviar com lista vazia + checkbox"
    expected: "Sem checkbox o CC pontual não persiste; com checkbox persiste; vazio+checkbox zera o padrão"
    why_human: "Fluxo cliente->proxy->backend->Postgres sem teste automatizado de ponta a ponta"
  - truth: "Falha ao carregar ou salvar o padrão nunca impede nem desfaz o envio"
    test: "Simular falha do PUT cc-padrao (derrubar rota/forçar 500) após envio ok"
    expected: "E-mail enviado e tela de sucesso com alerta amarelo 'não foi possível salvar a lista de cópia como padrão'"
    why_human: "try/catch presente no código (page.tsx confirmarEnviarEmail), mas nenhum teste exercita a invariante"
human_verification:
  - test: "1. Aplicar migrations no deploy"
    expected: "`prisma migrate deploy` (bootstrap-runtime.sh) aplica 20261105120000_add_cobranca_email_envio_cc e 20261105130000_add_cobranca_email_cc_padrao sem erro; reexecutar não falha (IF NOT EXISTS). Conferir com \\d \"CobrancaEmailEnvio\" (coluna cc text[] not null default '{}') e \\d \"CobrancaEmailCcPadrao\"."
    why_human: "Nenhum Postgres foi tocado nesta verificação; só leitura do SQL"
  - test: "2. Envio real por SMTP com Cc recebido"
    expected: "Em /contas-receber/[idcliente] enviar boleto com 2 CC (um com maiúsculas repetido e um igual ao principal para testar a deduplicação). O principal recebe com cabeçalho Cc listando só os 2 distintos; as caixas dos CC recebem a mensagem; sem Bcc; corpo/anexos idênticos aos de antes; o CC recebe o mesmo link de confirmação."
    why_human: "Os testes mockam o transporte nodemailer; entrega real, cabeçalho Cc e anexos só se confirmam em SMTP real"
  - test: "3. CC gravado no histórico e no tooltip"
    expected: "SELECT cc FROM \"CobrancaEmailEnvio\" ORDER BY id DESC LIMIT 1 mostra os CC normalizados; envio sem CC grava {}. O tooltip do badge de status do título mostra '(cópia: ...)' após recarregar a lista."
    why_human: "Depende de Postgres real e render do tooltip"
  - test: "4. Salvar e pré-preencher padrão com Postgres real"
    expected: "Enviar com CC + checkbox 'Salvar como padrão deste cliente' marcado -> aviso 'Lista de cópia salva como padrão'. Reabrir o modal desse cliente: chips pré-preenchidos. Em outro cliente: vazio. Enviar sem o checkbox com CC novo e reabrir: padrão antigo permanece. Enviar com lista vazia + checkbox: padrão removido (linha com emails {})."
    why_human: "Fluxo ponta a ponta UI->proxy->backend->Postgres sem teste automatizado"
  - test: "5. Autenticação das rotas de padrão"
    expected: "curl sem x-internal-api-key em GET/PUT /cobranca/email/cc-padrao/1 retorna 401/403; proxy Next sem sessão admin retorna 401."
    why_human: "Cobertura de guard é por leitura (APP_GUARD global, sem @Public); não há teste de integração HTTP"
---

# Phase 42: E-mail de boleto com destinatários em cópia (CC) Verification Report

**Phase Goal:** No envio de boleto por e-mail, o operador pode adicionar um ou mais e-mails extras como destinatários em cópia (CC), além do e-mail do cliente; cada cliente pode ter lista fixa de CC salva, editável a cada envio.
**Verified:** 2026-11-05
**Status:** human_needed (nenhum gap automatizável; restam itens que exigem SMTP/Postgres reais e interação de UI)
**Re-verification:** Não — verificação inicial

## Goal Achievement

Verificação feita no código real (diff `73bb479..HEAD`), não nos SUMMARYs. O backend está completo, ligado e coberto por testes; o frontend está implementado e tipa, mas não tem teste de interação, daí os itens humanos.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01/D-07 Campo "Cópia (CC)" com chips (Enter/vírgula/Adicionar/remover) no modal | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `page.tsx`: `mesclarEmailsCc`, `adicionarEmailCc`, `removerEmailCc`, chips `badge rounded-pill` + `btn-close`, `onKeyDown` Enter/`,`; sem dependência nova; `tsc` frontend ok. Sem teste de UI |
| 2 | D-03 Único caminho `enviarBoletoENotas` envia `cc` no `sendMail` (To = principal) | ✓ VERIFIED | `email-envio.service.ts`: `...(cc.length > 0 ? { cc } : {})` no `sendMail`; testes 8, 14 passam. `enviarBoletoENotas` é o único caller de `sendMail` do módulo |
| 3 | D-02 Inválido -> 400; duplicados/principal removidos (case-insensitive); >10 -> 400 | ✓ VERIFIED | `normalizarListaCc` + `EMAIL_CC_MAX=10`; DTO `IsEmail each` + `ArrayMaxSize`; testes 9, 10, 12, 13, 15 (ValidationPipe real com `forbidNonWhitelisted`) |
| 4 | D-04 Sem CC -> sem Cc/Bcc, nunca `EMPRESA_EMAIL` | ✓ VERIFIED | Teste 11 com `EMPRESA_EMAIL` configurado: `cc` e `bcc` undefined; grep: nenhum `bcc` no service |
| 5 | D-05 `CobrancaEmailEnvio.cc` gravado (migration aditiva idempotente) + tooltip mostra CC | ✓ VERIFIED (migração não aplicada) | `schema.prisma` `cc String[] @default([])`; migration `ADD COLUMN IF NOT EXISTS "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`; `prisma.cobrancaEmailEnvio.create({ data: { cc } })`; `cobranca.service.ts` seleciona `cc` em `ultimoEmail`; `StatusEmailBadge` title usa `ultimoEmail.cc`; testes 16, 17. Aplicação real em item humano 1/3 |
| 6 | Corpo/layout/pixel/confirmação inalterados | ✓ VERIFIED | `git diff 73bb479..HEAD` do service não contém nenhum hunk em `montarCorpoHtml`/`montarCorpoTexto` (0 ocorrências); hunks só no topo, `enviarBoletoENotas` e novos métodos |
| 7 | D-06 Tabela própria `CobrancaEmailCcPadrao` (chave `idclienteAthos`), fora do Athos, migration idempotente | ✓ VERIFIED | model Prisma `@id idclienteAthos`; `CREATE TABLE IF NOT EXISTS`; nenhum arquivo de `integrations/athos` alterado no diff da fase; cliente Prisma gerado contém o model (`tsc` backend ok) |
| 8 | GET/PUT `/cobranca/email/cc-padrao/:idclienteAthos` autenticados, lista normalizada | ✓ VERIFIED | `cobranca.controller.ts` rotas `@Get`/`@Put` sem `@Public` (únicos `@Public` são pixel, confirmar e linha 235 pré-existentes); `InternalAuthGuard` é `APP_GUARD` global; `salvarCcPadrao` usa `normalizarListaCc` + `upsert`; testes 18–25 incl. ValidationPipe com `SalvarCcPadraoDto`. Proxy Next usa `requireAdminSession` em GET e PUT |
| 9 | D-01 Modal pré-preenchido com padrão (sem o principal) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `abreEmailModal` -> `carregarCcPadrao` -> `fetch /api/cobranca/email/cc-padrao/${idcliente}` -> `mesclarEmailsCc([], emails, principal)`; guarda de corrida `emailCcCargaSeq`. Sem teste |
| 10 | D-06 Salva padrão só com checkbox (default desmarcado) e envio ok; vazio+checkbox remove | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `useState(false)`; PUT só dentro de `if (res.ok)` e `if (emailCcSalvarPadrao)`; backend aceita `[]` (teste 22). Fluxo UI não testado |
| 11 | Falha ao carregar/salvar padrão nunca impede/desfaz o envio | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | GET: `try/catch` -> `emailCcPadraoAviso`, modal segue; PUT: `try/catch` -> `emailCcPadraoResultado="falhou"` após o envio já concluído, alerta amarelo. Invariante não exercida por teste |

**Score:** 7/11 verificados (4 presentes e ligados, comportamento de UI não exercitado -> `human_needed`)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `dto/enviar-email-cobranca.dto.ts` (`cc`, `EMAIL_CC_MAX`) | ✓ VERIFIED | Substantivo e usado por service, DTO de padrão e controller |
| `email-envio.service.ts` (`normalizarListaCc`, `cc` no sendMail/create, `buscarCcPadrao`, `salvarCcPadrao`) | ✓ VERIFIED | Ligado ao controller e a Prisma |
| `migrations/20261105120000_add_cobranca_email_envio_cc/migration.sql` | ✓ VERIFIED (não aplicada) | Contém `ADD COLUMN IF NOT EXISTS "cc"` |
| `migrations/20261105130000_add_cobranca_email_cc_padrao/migration.sql` | ✓ VERIFIED (não aplicada) | Contém `CREATE TABLE IF NOT EXISTS "CobrancaEmailCcPadrao"` |
| `dto/salvar-cc-padrao.dto.ts` | ✓ VERIFIED | Importado pelo controller |
| `api/cobranca/email/cc-padrao/[idclienteAthos]/route.ts` (GET, PUT) | ✓ VERIFIED | `requireAdminSession`, valida id, repassa via `backendFetch` |
| `api/cobranca/email/enviar/route.ts` | ✓ VERIFIED | Repassa `cc` só quando há itens |
| `contas-receber/[idcliente]/page.tsx` (`mesclarEmailsCc`, checkbox "Salvar como padrão deste cliente") | ✓ VERIFIED (existência/ligação) | Comportamento: ver itens humanos |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| page.tsx `confirmarEnviarEmail` | `/api/cobranca/email/enviar` | body `cc: ccFinal` | WIRED |
| proxy `enviar/route.ts` | DTO backend | `payload.cc` (DTO declara `cc`, `forbidNonWhitelisted` ok; teste 14) | WIRED |
| service | nodemailer `sendMail` | `cc.length > 0` | WIRED |
| `cobranca.service.ts` | `StatusEmailBadge` | `ultimoEmail.cc` no select, no retorno e no `title` | WIRED |
| page.tsx | proxy `cc-padrao` | GET em `abreEmailModal`, PUT pós-envio com checkbox | WIRED |
| proxy `cc-padrao` | controller | `backendFetch /cobranca/email/cc-padrao/:id` (GET/PUT) | WIRED |
| service | `prisma.cobrancaEmailCcPadrao` | `findUnique` / `upsert` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Variável | Fonte | Dados reais | Status |
|----------|----------|-------|-------------|--------|
| modal CC | `emailCc` | GET -> `findUnique` em `CobrancaEmailCcPadrao` | Sim (query Prisma) | FLOWING |
| tooltip badge | `ultimoEmail.cc` | `cobrancaEmailEnvio.emailEnvios select cc` | Sim | FLOWING |
| sucesso do modal | `emailResult.cc` | retorno de `enviarBoletoENotas` (lista normalizada) | Sim | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Testes do módulo cobranca | `npm --prefix apps/backend run test -- cobranca --no-coverage` | 6 suites, 58 testes, 0 falhas | ✓ PASS |
| Typecheck backend | `cd apps/backend && npx tsc --noEmit` | exit 0 | ✓ PASS |
| Typecheck frontend | `cd apps/frontend && npx tsc --noEmit` | exit 0 | ✓ PASS |

### Probe Execution

Não aplicável: a fase não declara probes (`probe-*.sh`).

### Requirements Coverage

IDs locais definidos em 42-01-PLAN.md (não existem em REQUIREMENTS.md; sem requisitos órfãos mapeados à Fase 42).

| Requisito | Plano | Descrição | Status | Evidência |
|-----------|-------|-----------|--------|-----------|
| CC-01 | 42-01/02 | Adicionar/remover CC no modal a cada envio | ? NEEDS HUMAN | Truths 1, 9 |
| CC-02 | 42-01/02 | Validação por item, dedupe, sem principal, limite 10 | ✓ SATISFIED | Truth 3, testes 9–15, 23–25 |
| CC-03 | 42-01 | CC no único caminho de envio; sem e-mail fixo | ✓ SATISFIED | Truths 2, 4 |
| CC-04 | 42-01 | CC no histórico, migration aditiva idempotente | ✓ SATISFIED (migração a aplicar) | Truth 5 |
| CC-05 | 42-02 | Lista fixa por cliente, GET/PUT, pré-preenche, opt-in | ? NEEDS HUMAN | Truths 7, 8 verificadas; 9, 10, 11 a confirmar |

### Anti-Patterns Found

Nenhum `TBD/FIXME/XXX` nos arquivos modificados. Nenhum stub: handlers fazem trabalho real, estados alimentados por fetch/Prisma.

### Gaps Summary

Nenhum gap bloqueante. Observações não bloqueantes:
- `ROADMAP.md` ainda mostra os planos 42-01/42-02 como `[ ]` e "Estado atual" desatualizado; atualizar no fechamento da fase (responsabilidade do orquestrador).
- `.planning/` tem alterações não commitadas alheias à fase (`state.json`, Fase 41 VERIFICATION, `.gitkeep` da fase 42 antiga); não afetam a verificação.
- Falta teste automatizado de frontend para o modal; a invariante "falha no padrão não desfaz o envio" depende de verificação manual (itens humanos acima).
- "Remover o padrão" grava linha com `emails = {}` em vez de apagar a linha; semanticamente equivalente (GET devolve lista vazia).

---

_Verified: 2026-11-05_
_Verifier: Claude (gsd-verifier)_
