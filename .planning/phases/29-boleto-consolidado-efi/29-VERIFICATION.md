---
phase: 29-boleto-consolidado-efi
verified: 2026-05-22T03:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Acessar /contas-receber/[idcliente] com ID válido, selecionar 1+ títulos e clicar em Gerar Boleto"
    expected: "Modal Estado 1 abre com resumo dos títulos, data pré-preenchida (readonly + badge) quando todos têm mesma datavencimento, ou campo vazio + alert-danger quando datas divergentes"
    why_human: "Comportamento condicional de datas depende de dados reais do Athos em runtime; navegador necessário para verificar renderização do modal"
  - test: "Com campo de data vazio, verificar se botão Confirmar Geração está desabilitado; preencher data no passado e confirmar desabilitamento"
    expected: "Botão disabled quando expireAt vazio ou < hoje; campo mostra is-invalid + invalid-feedback para data no passado"
    why_human: "Validação client-side interativa não verificável estaticamente"
  - test: "Clicar em Confirmar Geração (data futura válida) — observar Estado 2 (Loading)"
    expected: "Spinner centralizado aparece, botões desaparecem, backdrop não fecha com click durante loading"
    why_human: "Transição de estado e bloqueio de interação durante loading requer execução real"
  - test: "Aguardar resposta da API: sucesso → Estado 3; erro de rede ou backend → Estado 4"
    expected: "Estado 3: valor + vencimento formatados, linha digitável em mono, botão Copiar muda para 'Copiado! ✔' por 2s, botão Abrir Boleto abre nova aba. Estado 4: mensagem + HTTP status secundário, 'Tentar Novamente' volta ao Estado 1"
    why_human: "Requer EFI sandbox credentials para Estado 3; Estado 4 pode ser simulado mas fluxo completo exige integração"
  - test: "Testar webhook POST /cobranca/boleto/notificacao sem x-internal-api-key (curl direto)"
    expected: "HTTP 200 com {ok:true} sempre, independente do token"
    why_human: "Endpoint público — verificar que InternalAuthGuard realmente isenta a rota @Public()"
  - test: "Testar POST /cobranca/boleto com expireAt no passado via curl com x-internal-api-key"
    expected: "HTTP 400 com mensagem 'A data de vencimento informada já passou. Informe uma data futura.'"
    why_human: "Requer backend em execução e credencial x-internal-api-key disponível no ambiente"
---

# Phase 29: Boleto Consolidado via EFI Bank — Relatório de Verificação

**Phase Goal:** Operador gera boleto bancário consolidado via EFI Bank, obtém link PDF + linha digitável, e a cobrança fica registrada no banco.
**Verificado:** 2026-05-22T03:00:00Z
**Status:** human_needed
**Re-verificação:** Não — verificação inicial

---

## Goal Achievement

### Truths Observáveis

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| 1 | POST /cobranca/boleto cria boleto na EFI com soma dos títulos e retorna shape completo (cobrancaId, chargeId, linkBoleto, barcodeLinhaDigitavel, valor, expireAt, nomeArquivo) | ✓ VERIFIED | `cobranca.service.ts` L193-201: retorna exatamente esse shape; L147-155: extrai `charge_id`, `link`, `barcode` do endpoint `/v1/charge/one-step` |
| 2 | CobrancaService valida que todos idcontasReceber existem nos títulos do cliente antes de chamar EFI | ✓ VERIFIED | `cobranca.service.ts` L41-49: loop com `BadRequestException('Título ${id} não encontrado para este cliente.')` |
| 3 | Se expireAt for data passada, o endpoint retorna 400 com mensagem clara | ✓ VERIFIED | `cobranca.service.ts` L56-61: `if (dto.expireAt < hoje) throw new BadRequestException('A data de vencimento informada já passou...')` |
| 4 | CobrancaBoleto + CobrancaBoletoTitulo[] são criados no Prisma após criação bem-sucedida na EFI | ✓ VERIFIED | `cobranca.service.ts` L170-187: `prisma.cobrancaBoleto.create` com `titulos.createMany` (nested write) |
| 5 | POST /cobranca/boleto/notificacao é público (@Public), recebe token EFI, consulta GET /v1/notification/{token} e atualiza status para 'pago' quando paid | ✓ VERIFIED | `cobranca.controller.ts` L26-27: `@Public()` + `@Post("boleto/notificacao")`; `cobranca.service.ts` L237: `GET /v1/notification/${token}`; L265-273: update para 'pago' com idempotência |
| 6 | Auth com EFI Cobranças usa o padrão de createCardPaymentLink() — POST /v1/authorize com Basic base64 + grant_type=client_credentials, depois Bearer token | ✓ VERIFIED | `cobranca.service.ts` L84-108: idêntico ao padrão documentado; `basic = Buffer.from(...).toString("base64")` + POST /v1/authorize |
| 7 | Modal exibe linkBoleto (Abrir Boleto em nova aba) e barcodeLinhaDigitavel copiável | ✓ VERIFIED | `page.tsx` L573-598: input readOnly com `barcodeLinhaDigitavel` + botão `navigator.clipboard`; L608-615: link com `target="_blank" rel="noopener noreferrer"` |

**Score:** 7/7 truths verificadas

---

### Artefatos Obrigatórios

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `apps/backend/src/modules/cobranca/cobranca.module.ts` | CobrancaModule com imports EfiModule, AthosModule | ✓ VERIFIED | Existe, importa EfiModule + AthosModule, declara CobrancaController + CobrancaService |
| `apps/backend/src/modules/cobranca/cobranca.service.ts` | criarBoleto() + processarNotificacaoEFI() | ✓ VERIFIED | Ambos os métodos implementados com todos os passos; 289 linhas, substancial |
| `apps/backend/src/modules/cobranca/cobranca.controller.ts` | POST /cobranca/boleto (auth) + POST /boleto/notificacao (@Public) | ✓ VERIFIED | Dois endpoints implementados, @Public() correto, @HttpCode(HttpStatus.OK) no webhook |
| `apps/backend/src/modules/cobranca/dto/criar-boleto.dto.ts` | DTO com validação class-validator | ✓ VERIFIED | Existe com @IsInt, @IsPositive, @IsArray, @ArrayMinSize(1), @IsDateString |
| `apps/backend/src/modules/app.module.ts` | CobrancaModule + AthosModule registrados | ✓ VERIFIED | L20: `import { CobrancaModule }...`; L70: `CobrancaModule` no array imports |
| `apps/frontend/src/app/api/cobranca/boleto/route.ts` | Proxy POST para backend com x-internal-api-key | ✓ VERIFIED | Existe; usa `backendFetch` que injeta x-internal-api-key automaticamente; valida body |
| `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` | Modal 4 estados + onClick conectado | ✓ VERIFIED | Modal completo L414-667; botão "Gerar Boleto" L397: `onClick={abreBoletoModal}` |

---

### Verificação de Key Links

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|---------|
| `cobranca.controller.ts` → backend route | `@Public()` em notificacao | `import { Public } from '../security/public.decorator'` | ✓ WIRED | L3: import correto; L26: `@Public()` antes de `@Post("boleto/notificacao")` |
| `cobranca.service.ts` → Prisma | `prisma.cobrancaBoleto.create` | nested write com titulos.createMany | ✓ WIRED | L170-187: create com `titulos.createMany` conforme especificado |
| `page.tsx onClick` → `abreBoletoModal()` | useState boletoModalState | `setBoletoModalState('confirm')` | ✓ WIRED | L397: `onClick={abreBoletoModal}`; L154: `setBoletoModalState("confirm")` |
| `Estado 1 Confirmar` → `POST /api/cobranca/boleto` | `fetch('/api/cobranca/boleto', ...)` | L161: `fetch("/api/cobranca/boleto", { method: "POST"... })` | ✓ WIRED | Body inclui idclienteAthos, idcontasReceber, expireAt |
| `Estado 3 Sucesso` → linkBoleto | `target='_blank' rel='noopener noreferrer'` | L611-612 | ✓ WIRED | `href={boletoResult.linkBoleto}` + `download={boletoResult.nomeArquivo}` |
| `route.ts` → backend via backendFetch | `backendFetch('/cobranca/boleto', { method: 'POST'... })` | L34: chamada presente | ✓ WIRED | backendFetch injeta x-internal-api-key via `internalHeaders()` em `backend-client.ts` |
| `cobranca.service.ts` → EfiService | DESVIO: usa axios direto | constructor não injeta EfiService | ⚠️ DESVIO DOCUMENTADO | EfiModule importado no módulo mas EfiService não injetado no serviço. Implementação duplica auth inline (padrão idêntico ao createCardPaymentLink). Funcionalidade atingida por caminho alternativo. Ver análise abaixo. |

**Análise do desvio EfiService:** O plano especificava injeção de EfiService via NestJS DI, mas a implementação duplicou o padrão de auth diretamente com axios. A mesma lógica Basic Auth + POST /v1/authorize + Bearer está presente em `cobranca.service.ts` L84-108 (criarBoleto) e L210-232 (processarNotificacaoEFI). O resultado funcional é idêntico — a truth "auth usa exatamente o padrão de createCardPaymentLink()" é verificada. EfiModule permanece importado no módulo sem uso direto no service (dead import, não erro). TypeScript compila limpo.

---

### Data-Flow Trace (Level 4)

| Artefato | Variável de Dados | Fonte | Produz Dados Reais | Status |
|----------|------------------|-------|--------------------|--------|
| `page.tsx` modal Estado 3 | `boletoResult` | `confirmarGerarBoleto()` → `fetch('/api/cobranca/boleto')` → backend real | Sim — via EFI API sandbox/produção | ✓ FLOWING |
| `cobranca.service.ts` `criarBoleto()` | `titulos` | `athosService.buscarTitulosClienteContasReceber(idclienteAthos)` + filtro por idcontasReceber | Sim — query real ao Athos | ✓ FLOWING |
| `cobranca.service.ts` `criarBoleto()` | `boleto` (CobrancaBoleto) | `prisma.cobrancaBoleto.create(...)` | Sim — escrita real no banco | ✓ FLOWING |
| `cobranca.service.ts` `processarNotificacaoEFI()` | `chargeId`, `status` | `GET /v1/notification/${token}` (EFI API) | Sim — consulta real à EFI | ✓ FLOWING |

---

### Verificações Spot-Check (Automáticas)

| Comportamento | Verificação | Resultado | Status |
|---------------|-------------|-----------|--------|
| TypeScript backend compila sem erros | `npx tsc --noEmit -p apps/backend/tsconfig.json` | Saída vazia (zero erros) | ✓ PASS |
| TypeScript frontend compila sem erros | `npx tsc --noEmit -p apps/frontend/tsconfig.json` | Saída vazia (zero erros) | ✓ PASS |
| Commits das 4 tasks existem no git | `git log --oneline` | `6058c50`, `acae64d`, `8e31084`, `377c749` confirmados | ✓ PASS |
| Nenhum `fw-bold` no arquivo page.tsx | `grep -n "fw-bold" page.tsx` | Zero resultados | ✓ PASS |
| `boletoModalState` usado >= 8 vezes | `grep -c "boletoModalState" page.tsx` | 11 ocorrências | ✓ PASS |
| @Public() presente no webhook | `grep -n "@Public" cobranca.controller.ts` | L26: `@Public()` antes do endpoint notificacao | ✓ PASS |
| CobrancaModule no app.module.ts | `grep "CobrancaModule" app.module.ts` | L20 (import) + L70 (array imports) | ✓ PASS |
| Modelos Prisma CobrancaBoleto existem | `grep "CobrancaBoleto" schema.prisma` | L230 + L243: ambos os modelos presentes | ✓ PASS |

---

### Cobertura de Requisitos

| Requisito | Plano | Descrição | Status | Evidência |
|-----------|-------|-----------|--------|-----------|
| BOL-01 | 29-01, 29-02 | Gerar boleto único consolidando múltiplos títulos — POST recebe lista de idcontareceber e gera cobrança EFI com valor igual à soma | ✓ SATISFEITO | `cobranca.service.ts` L36-53: soma dos títulos filtrados; `criarBoleto()` chama `/v1/charge/one-step` |
| BOL-02 | 29-01, 29-02 | Boleto retorna link e linha digitável copiável — resposta inclui linkBoleto e barcodeLinhaDigitavel; frontend exibe modal com Abrir Boleto e linha copiável | ✓ SATISFEITO | Service L193-201: ambos na resposta; page.tsx L573-615: modal Estado 3 exibe ambos |
| BOL-03 | 29-01 | Registro da cobrança gerada — tabela Prisma com txid EFI, idcliente, idcontareceber[], valor, data, status | ✓ SATISFEITO | `prisma.cobrancaBoleto.create` L170-187 + `CobrancaBoletoTitulo.createMany`; schema.prisma confirma tabelas |

---

### Anti-Patterns Encontrados

| Arquivo | Linha | Pattern | Severidade | Impacto |
|---------|-------|---------|------------|---------|
| `page.tsx` | 405 | `TODO: Phase 30 — Emitir NFS-e` | ℹ️ Info | Fora do escopo da Phase 29; referencia trabalho futuro formal (Phase 30). Não é blocker. |
| `cobranca.module.ts` | 4,9 | EfiModule importado mas EfiService não injetado no service | ⚠️ Warning | Dead import — não causa erro de compilação nem falha funcional. CobrancaService implementa auth inline. Pode ser removido em refactor futuro. |

---

### Verificação Humana Necessária

Os checks automáticos passaram (7/7 truths verificadas, TypeScript limpo, commits presentes). Os itens abaixo requerem execução do ambiente para confirmação final:

#### 1. Fluxo Modal — Datas Iguais vs Divergentes

**Teste:** Acessar `/contas-receber/[idcliente]` com cliente que tem títulos; selecionar títulos com mesma datavencimento e clicar "Gerar Boleto"
**Esperado:** Modal abre com campo de data pré-preenchido (readonly) e badge "Preenchido automaticamente"
**Por que humano:** Depende de dados reais do Athos em runtime; requer navegador

#### 2. Fluxo Modal — Validação de Data

**Teste:** Com modal aberto, informar data no passado no campo de vencimento
**Esperado:** Campo `is-invalid` + feedback inline; botão "Confirmar Geração" permanece desabilitado
**Por que humano:** Interação de formulário client-side requer navegador

#### 3. Estado Loading — Bloqueio de Interação

**Teste:** Clicar "Confirmar Geração" e observar Estado 2
**Esperado:** Spinner visível, botões ocultos, clique no backdrop não fecha modal durante loading
**Por que humano:** Comportamento visual e interativo durante chamada assíncrona

#### 4. Estado Sucesso + Linha Digitável Copiável

**Teste:** Com credenciais EFI sandbox configuradas, gerar boleto válido
**Esperado:** Estado 3 exibe valor, vencimento, linha digitável em fonte monospace, botão "Copiar" muda para "Copiado! ✔" por 2s, "Abrir Boleto" abre URL EFI em nova aba
**Por que humano:** Requer EFI sandbox credentials e execução real da API

#### 5. Webhook @Public — Sem Auth Guard

**Teste:** `curl -X POST http://localhost:4000/api/cobranca/boleto/notificacao -H "Content-Type: application/json" -d '{"token":"token_invalido"}'` (sem x-internal-api-key)
**Esperado:** HTTP 200 com `{"ok":true}`
**Por que humano:** Requer backend em execução para confirmar que InternalAuthGuard isenta rota @Public()

#### 6. Validação 400 para Data Passada

**Teste:** `curl -X POST .../cobranca/boleto -H "x-internal-api-key: $KEY" -d '{"idclienteAthos":1,"idcontasReceber":[1],"expireAt":"2020-01-01"}'`
**Esperado:** HTTP 400 com mensagem de data no passado
**Por que humano:** Requer backend em execução com dados Athos disponíveis

---

### Resumo de Gaps

Nenhum gap blocker identificado. Todos os 7 must-haves verificados como IMPLEMENTED na codebase:

- Backend CobrancaModule completo com criarBoleto() e processarNotificacaoEFI()
- Auth EFI via Basic Auth + Bearer token idêntico ao padrão estabelecido
- Persistência Prisma com nested write (CobrancaBoleto + CobrancaBoletoTitulo[])
- Route Handler proxy Next.js com backendFetch (x-internal-api-key server-side)
- Modal 4 estados completo com lógica de datas, loading, sucesso e erro
- TypeScript compila sem erros em backend e frontend
- Commits documentados e verificados no git

**Desvio não-blocker documentado:** EfiService não injetado em CobrancaService (usa axios direto). Funcionalidade equivalente preservada. EfiModule permanece como dead import no módulo.

A verificação aguarda confirmação humana dos 6 itens de comportamento em runtime acima para transição de `human_needed` para `passed`.

---

_Verificado: 2026-05-22T03:00:00Z_
_Verificador: Claude (gsd-verifier)_
