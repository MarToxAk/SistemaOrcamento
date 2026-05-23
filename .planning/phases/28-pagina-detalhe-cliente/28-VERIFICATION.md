---
phase: 28-pagina-detalhe-cliente
verified: 2026-05-22T17:30:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Navegar para /contas-receber, clicar em 'Ver Detalhe' em um card de cliente"
    expected: "Página /contas-receber/[idcliente] carrega com nome, telefone, email e limite de crédito do cliente exibidos via Athos"
    why_human: "Requer backend Athos rodando e dados reais de cliente no banco; integração viva não verificável via grep"
  - test: "Na página de detalhe, verificar tabela de títulos carregada"
    expected: "Tabela exibe títulos AVC/VEN com checkbox individual, numerotitulo, datavencimento, valor e badge de status correto (VEN vermelho, AVC azul)"
    why_human: "Requer API /titulos respondendo dados reais do Athos; comportamento de renderização condicional AVC/VEN depende de dados dinâmicos"
  - test: "Marcar um título com checkbox"
    expected: "Barra de ações sticky aparece na parte inferior com o total do título selecionado formatado em BRL e botões 'Gerar Boleto' / 'Emitir NFS-e' visíveis"
    why_human: "Estado de interação React (selectedIds) e renderização condicional requerem execução no browser"
  - test: "Desmarcar todos os títulos"
    expected: "Barra de ações desaparece completamente do DOM (inspecionar elementos confirma ausência do nó)"
    why_human: "Ausência do nó no DOM requer inspeção browser; grep não verifica comportamento de unmount"
  - test: "Clicar checkbox 'Selecionar todos' quando alguns títulos estão marcados"
    expected: "Checkbox exibe estado indeterminate; clicar novamente seleciona todos; clicar de novo desmarca todos"
    why_human: "Estado indeterminate é propriedade DOM imperativa (useRef) não verificável estaticamente"
  - test: "Clicar 'Gerar Boleto' ou 'Emitir NFS-e' na barra de ações"
    expected: "Nada acontece (onClick vazio — intencional, implementação nas Phases 29 e 30)"
    why_human: "Comportamento de ausência de efeito requer execução no browser"
---

# Phase 28: Página de Detalhe do Cliente Verification Report

**Phase Goal:** Operador acessa dados completos de um cliente e seus títulos em aberto a partir do dashboard, com a estrutura de banco de dados pronta para cobrança e NFS-e.
**Verified:** 2026-05-22T17:30:00Z
**Status:** human_needed
**Re-verification:** Não — verificação inicial

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicar em cliente em /contas-receber navega para /contas-receber/[idcliente] com dados cadastrais via Athos | ✓ VERIFIED | `page.tsx` L255: `href={/contas-receber/${cliente.idcliente}}`; L258: "Ver Detalhe"; detalhe page faz fetch para `/api/athos/contas-receber/cliente/${idcliente}` que proxeia para backend `/athos/.../dados` com JOIN PF/PJ |
| 2 | Página lista todos os títulos AVC + VEN em tabela com checkbox, numerotitulo, datavencimento, valor e status | ✓ VERIFIED | `[idcliente]/page.tsx` L215-272: `table.table-sm.table-hover.table-bordered` com 5 colunas; L243: `checked={selectedIds.has(titulo.idcontareceber)}`; L253-258: badges VEN/AVC condicionais; fetch para `/titulos` wired |
| 3 | Checkbox "Selecionar todos" na thead + contador de valor total em tempo real | ✓ VERIFIED | L220-226: checkbox com `ref={checkboxRef}` e `onChange={handleToggleAll}`; L59-63: `useEffect` impõe `indeterminate`; L263-270: `tfoot` com `{selectedIds.size} título(s) selecionado(s) — Total: {formatBRL(totalSelecionado)}` |
| 4 | Barra de ações com "Gerar Boleto" e "Emitir NFS-e" aparece somente quando ≥1 título selecionado | ✓ VERIFIED | L279: `{selectedIds.size > 0 && (` — renderização condicional; L296: `btn-warning` "Gerar Boleto"; L305: `btn-primary` "Emitir NFS-e"; removida do DOM quando zero |
| 5 | Migration Prisma cria tabelas CobrancaBoleto e NfseEmitida sem conflito | ✓ VERIFIED | `schema.prisma` L230-274: 4 modelos presentes com relações bidirecionais e `@@index` em FKs; `migration.sql` (20260522155308) cria 4 tabelas com FKs e índices; migration aditiva — nenhum modelo existente modificado |

**Score:** 5/5 truths verified

---

### Must-Haves dos Planos (28-01 e 28-02)

#### Plan 28-01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /athos/contas-receber/cliente/:idcliente/dados retorna campos de dados cadastrais | ✓ VERIFIED | `athos.controller.ts` L277: `@Get("contas-receber/cliente/:idcliente/dados")`; L288: chama `buscarDadosClienteContasReceber(id)`; validação 400 + 404 presentes |
| 2 | Tabelas CobrancaBoleto, CobrancaBoletoTitulo, NfseEmitida, NfseEmitidaTitulo existem no banco sem conflito | ✓ VERIFIED | `schema.prisma` L230-274: todos os 4 modelos com estrutura exata do plano; `migration.sql` aplicada (arquivo em migrations/) |
| 3 | Migration aplicada sem erro | ✓ VERIFIED | Arquivo `20260522155308_add_cobranca_boleto_nfse_emitida/migration.sql` existe; SUMMARY documenta execução bem-sucedida; commits `4954ca9` confirmados no git log |

#### Plan 28-02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clique em "Ver Detalhe" em /contas-receber navega para /contas-receber/[idcliente] | ✓ VERIFIED | `page.tsx` L253-260: `<a href={/contas-receber/${cliente.idcliente}}>Ver Detalhe</a>` |
| 2 | Página de detalhe exibe nome, telefone, email e limite de crédito via Athos | ✓ VERIFIED | `[idcliente]/page.tsx` L163-194: renderização condicional de `dadosCliente` com todos os campos; L67: fetch para `/api/athos/contas-receber/cliente/${idcliente}` |
| 3 | Tabela de títulos com checkbox, numerotitulo, datavencimento, valor e status badge | ✓ VERIFIED | `[idcliente]/page.tsx` L215-272: implementação completa — 5 colunas conforme especificado |
| 4 | Checkbox "Selecionar todos" com estado indeterminate | ✓ VERIFIED | L220-226: `ref={checkboxRef}` + L59-63: `useEffect` aplicando `checkboxRef.current.indeterminate = someSelected` |
| 5 | Rodapé com contagem e total em tempo real | ✓ VERIFIED | L263-270: `tfoot > tr > td colSpan={5}` com `{selectedIds.size} título(s) selecionado(s) — Total: {formatBRL(totalSelecionado)}` |
| 6 | Barra de ações sticky aparece somente quando selectedIds.size > 0 | ✓ VERIFIED | L279: `{selectedIds.size > 0 && (` — nó removido do DOM quando zero |
| 7 | Botões "Gerar Boleto" e "Emitir NFS-e" com onClick vazio (TODO Phase 29/30) | ✓ VERIFIED | L299-311: botões presentes; L300: `/* TODO: Phase 29 — Gerar Boleto */`; L309: `/* TODO: Phase 30 — Emitir NFS-e */` |

---

### Required Artifacts

| Artifact | Esperado | Status | Detalhes |
|----------|----------|--------|---------|
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | Método `buscarDadosClienteContasReceber()` com JOIN SQL | ✓ VERIFIED | L952-991: método completo com PoolClient, query parametrizada, try/finally client.release() |
| `apps/backend/src/modules/integrations/athos/athos.controller.ts` | Rota GET protegida por validateAthosToken | ✓ VERIFIED | L273-293: decoradores completos, validateAthosToken chamado, BadRequestException e NotFoundException presentes |
| `apps/backend/prisma/schema.prisma` | 4 novos modelos Prisma | ✓ VERIFIED | L230-274: CobrancaBoleto, CobrancaBoletoTitulo, NfseEmitida, NfseEmitidaTitulo com relações e índices |
| `apps/backend/prisma/migrations/20260522155308_add_cobranca_boleto_nfse_emitida/migration.sql` | Migration SQL gerada e aplicada | ✓ VERIFIED | Arquivo existe; CREATE TABLE + FK constraints + índices corretos |
| `apps/frontend/src/app/contas-receber/page.tsx` | Botão "Ver Detalhe" sem accordion inline | ✓ VERIFIED | L253-260: link "Ver Detalhe"; zero ocorrências de titulosMap/expandedId/handleToggleCliente |
| `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` | Proxy com await params e x-api-token | ✓ VERIFIED | L9: `await params`; L21: `backendFetch(.../dados)`; L15: `INTERNAL_API_KEY` |
| `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` | Client Component completo com seleção e barra de ações | ✓ VERIFIED | 331 linhas; "use client"; `use(params)`; selectedIds Set; indeterminate checkbox; barra condicional |

---

### Key Link Verification

| From | To | Via | Status | Detalhes |
|------|----|----|--------|---------|
| `athos.controller.ts GET .../dados` | `athos.service.ts buscarDadosClienteContasReceber` | injeção NestJS | ✓ WIRED | L288: `await this.athosService.buscarDadosClienteContasReceber(id)` |
| `prisma/schema.prisma CobrancaBoletoTitulo` | `prisma/schema.prisma CobrancaBoleto` | relation `cobrancaBoletoId` | ✓ WIRED | L248: `cobrancaBoleto CobrancaBoleto @relation(fields: [cobrancaBoletoId], references: [id])` |
| `[idcliente]/page.tsx` | `route.ts (dados)` | `fetch /api/athos/contas-receber/cliente/${idcliente}` | ✓ WIRED | L67: fetch exato especificado no must_have |
| `[idcliente]/page.tsx` | `titulos/route.ts` | `fetch .../titulos` | ✓ WIRED | L77: `fetch(.../titulos, ...)` |
| `route.ts (dados)` | `backend /athos/.../dados` | `backendFetch` com x-api-token | ✓ WIRED | L21: `backendFetch('/athos/contas-receber/cliente/${id}/dados')` |

---

### Data-Flow Trace (Level 4)

| Artifact | Variável de Dados | Fonte | Produz Dados Reais | Status |
|----------|------------------|-------|-------------------|--------|
| `[idcliente]/page.tsx` (dados do cliente) | `dadosCliente` | `fetch /api/.../route.ts` → `backendFetch` → `athos.service.ts` query SQL (JOIN cliente + cliente_fisico + cliente_juridico) | Sim — query parametrizada ao Athos, COALESCE PF/PJ | ✓ FLOWING |
| `[idcliente]/page.tsx` (tabela de títulos) | `titulos` | `fetch /api/.../titulos` → rota existente da Phase 27 | Sim — endpoint já existente e validado na Phase 27 | ✓ FLOWING |
| `[idcliente]/page.tsx` (totalSelecionado) | `totalSelecionado` | calculado localmente a partir de `titulos` (L55-57) | Sim — `titulos.filter(...).reduce(...)` em dados reais | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Comportamento | Verificação | Resultado | Status |
|--------------|------------|---------|--------|
| Módulo athos.service exporta buscarDadosClienteContasReceber | `grep -c "buscarDadosClienteContasReceber" athos.service.ts` | 2 ocorrências (definição + chamada interna) | ✓ PASS |
| Controller tem rota /dados | `grep "@Get.*contas-receber.*dados"` | L277 encontrado | ✓ PASS |
| page.tsx sem resíduos do accordion | `grep "titulosMap\|expandedId\|handleToggleCliente"` | 0 ocorrências | ✓ PASS |
| Schema tem 4 novos modelos | `grep "model Cobranca\|model Nfse"` | 4 modelos encontrados em schema.prisma | ✓ PASS |
| Migration SQL existe | glob migrations/20260522155308* | Arquivo migration.sql presente | ✓ PASS |
| selectedIds usado ≥5 vezes | `grep -c "selectedIds"` | 9 ocorrências | ✓ PASS |
| Commits declarados existem no git | `git log --oneline` | e62676a, 4954ca9, 0c16447, 32e156c todos presentes | ✓ PASS |

---

### Requirements Coverage

| Requisito | Plano | Descrição | Status | Evidência |
|-----------|-------|-----------|--------|----------|
| CLI-01 | 28-01, 28-02 | Página de detalhe acessível de /contas-receber com dados cadastrais | ✓ SATISFIED | Link "Ver Detalhe" em page.tsx L255; rota /contas-receber/[idcliente] criada; dados exibidos via fetch ao Athos |
| CLI-02 | 28-02 | Lista de títulos com seleção por checkbox | ✓ SATISFIED | Tabela com 5 colunas, checkbox individual, "Selecionar todos" com indeterminate, contador e total em tempo real |
| CLI-03 | 28-02 | Barra de ações para títulos selecionados | ✓ SATISFIED | Barra sticky condicional `{selectedIds.size > 0 && ...}` com "Gerar Boleto" e "Emitir NFS-e" |

---

### Anti-Patterns Found

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---------|-------|--------|-----------|---------|
| `[idcliente]/page.tsx` | L300, L309 | `/* TODO: Phase 29 */` e `/* TODO: Phase 30 */` | ℹ️ Info | Intencionais — declarados como Known Stubs no SUMMARY-02; referenciados em fases formais do roadmap (Phase 29 e 30). Não são BLOCKERs pois possuem referência explícita a fases futuras documentadas. |

Nota sobre o padrão TODO: Os TODOs em L300 e L309 referenciam "Phase 29" e "Phase 30" — fases formais definidas no ROADMAP. Conforme a regra de debt markers, TODOs com referência a trabalho formal de acompanhamento não são BLOCKERs.

---

### Human Verification Required

Os checks automatizados confirmam que toda a estrutura de código está correta e wired. Os itens abaixo requerem execução no browser com o backend Athos disponível:

#### 1. Navegação e Dados Cadastrais do Cliente

**Teste:** Acessar /contas-receber → identificar um card de cliente → clicar em "Ver Detalhe"
**Esperado:** Navegação para /contas-receber/[idcliente]; dados de nome, telefone, email e limite de crédito exibidos; breadcrumb "← Contas a Receber" presente
**Por que humano:** Integração viva com o Athos — requer banco de dados Athos acessível e cliente real

#### 2. Tabela de Títulos com Dados Reais

**Teste:** Na página de detalhe, aguardar carregamento da tabela de títulos
**Esperado:** Títulos listados com datas de vencimento coloridas (vermelho=VEN, normal=AVC), badges VEN/AVC corretos, valores em BRL
**Por que humano:** Renderização condicional depende de dados dinâmicos da API /titulos

#### 3. Seleção por Checkbox e Barra de Ações

**Teste:** Marcar um título → verificar barra de ações → desmarcar todos
**Esperado:** Barra aparece com total correto ao marcar; desaparece (nó removido do DOM) ao desmarcar todos
**Por que humano:** Estado React (selectedIds Set) e conditional rendering requerem execução no browser

#### 4. Estado Indeterminate do Checkbox "Selecionar Todos"

**Teste:** Marcar alguns títulos (não todos) → inspecionar o checkbox do thead
**Esperado:** Checkbox exibe estado visual indeterminate (traço) quando seleção é parcial
**Por que humano:** Propriedade DOM imperativa `.indeterminate` aplicada via useRef — não verificável via análise estática

#### 5. Botões Gerar Boleto / Emitir NFS-e (onClick vazio intencional)

**Teste:** Com títulos selecionados, clicar em "Gerar Boleto" e "Emitir NFS-e"
**Esperado:** Nenhuma ação (onClick vazio — aguarda Phase 29 e 30)
**Por que humano:** Ausência de efeito colateral requer confirmação em runtime

---

### Gaps Summary

Nenhum gap técnico identificado. Todos os 5 success criteria do ROADMAP foram verificados como presentes e wired na base de código. Os itens de human verification são requisitos de teste de integração e UX, não falhas de implementação.

---

_Verified: 2026-05-22T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
