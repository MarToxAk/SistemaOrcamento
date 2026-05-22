---
phase: 27-dashboard-contas-receber
verified: 2026-05-21T12:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Navegar para /contas-receber com o servidor rodando e verificar renderização dos Top Cards"
    expected: "Três cards exibem Total a Receber, Inadimplência Ativa e Clientes Devedores com valores formatados em BRL (R$ X.XXX,XX)"
    why_human: "Requer servidor ativo e banco Athos acessível; formatação toLocaleString pt-BR não pode ser verificada por grep"
  - test: "Clicar em um card de cliente para expandir o accordion de títulos"
    expected: "Fetch lazy para /api/athos/contas-receber/cliente/:id/titulos ocorre somente na primeira expansão; tabela de títulos exibe numerotitulo, datavencimento, valor, numeroordem e obs."
    why_human: "Comportamento dinâmico de fetch lazy e renderização condicional — não verificável estaticamente"
  - test: "Verificar botão Atualizar"
    expected: "Clicar em Atualizar re-executa fetchDashboard() e atualiza os dados sem reload de página"
    why_human: "Comportamento de evento click em runtime"
  - test: "Verificar link de navegação Contas a Receber na página /status"
    expected: "Link visível ao lado dos botões Atualizar e Novo Orçamento no header; clicar navega para /contas-receber"
    why_human: "Posicionamento visual e navegação — requer browser"
  - test: "Verificar botão WhatsApp em cliente com telefone cadastrado"
    expected: "Link abre https://wa.me/55{ddd}{telefone} em nova aba; clientes sem telefone não exibem o botão"
    why_human: "Requer dados reais do banco para verificar presença/ausência condicional do botão"
---

# Phase 27: Dashboard de Contas a Receber — Relatório de Verificação

**Phase Goal:** Implementar interface analítica read-only (/contas-receber) para monitoramento operacional de inadimplência — operador vê quem deve, quanto, há quantos dias e contato direto do cliente.
**Verificado:** 2026-05-21T12:00:00Z
**Status:** human_needed
**Re-verificação:** Não — verificação inicial

---

## Observação sobre Requirements CR-01..CR-05

Os IDs `CR-01` a `CR-05` **não existem em `.planning/REQUIREMENTS.md`** (o arquivo atual contém apenas EFIWH-01, EFIWH-02, EFIWH-03 da v1.9). O `ROADMAP.md` declara os IDs como requisitos da fase 27, mas a definição formal não foi registrada no REQUIREMENTS.md. A verificação foi conduzida contra os **success criteria do ROADMAP.md** (5 critérios) e os **must_haves dos dois PLAN.md**, que são as fontes autoritativas disponíveis.

---

## Conquista do Objetivo

### Verdades Observáveis

| # | Verdade | Status | Evidência |
|---|---------|--------|-----------|
| 1 | GET /api/athos/contas-receber/dashboard retorna { summary, clientes } com 200 quando x-api-token válido | VERIFIED | `athos.controller.ts:238-244` — rota GET "contas-receber/dashboard" chama `validateAthosToken` e delega para `athosService.buscarDashboardContasReceber()` |
| 2 | summary contém total_a_receber, total_atrasado e total_clientes_devedores | VERIFIED | `athos.service.ts:1694-1698` — summary calculado via reduce sobre array mapeado; todos os três campos retornados |
| 3 | clientes é array com até 100 itens ordenados por total_atrasado DESC NULLS LAST, total_devido DESC | VERIFIED | `athos.service.ts:1664-1665` — `ORDER BY total_atrasado DESC NULLS LAST, total_devido DESC` + `LIMIT 100` no SQL exato |
| 4 | Cada item de clientes inclui todos os 11 campos especificados (idcliente, nome_cliente, telefone_completo, emailcliente, emailcobrancacliente, limitecredito, bloqueaprazo, total_devido, total_atrasado, titulos_pendentes, maior_atraso_dias) | VERIFIED | `athos.service.ts:1625-1692` — todos os 11 campos mapeados com `Number()` para numéricos e tratamento de null |
| 5 | GET /api/athos/contas-receber/cliente/:idcliente/titulos retorna array de títulos com numerotitulo, datavencimento, valor, observacao, idvenda, numeroordem | VERIFIED | `athos.service.ts:1706-1768` — SQL com `LEFT JOIN venda v ON v.idvenda = cr.idvenda`, todos os campos mapeados |
| 6 | Ambos os endpoints retornam 401 sem x-api-token | VERIFIED | `athos.controller.ts:243,260` — `this.validateAthosToken(authorization, xApiToken)` é a primeira chamada em ambas as rotas; `validateAthosToken` lança `UnauthorizedException` (linha 46 do controller) |
| 7 | Rota /contas-receber existe e exibe o dashboard de inadimplência | VERIFIED | `apps/frontend/src/app/contas-receber/page.tsx` — 372 linhas, Client Component completo com `'use client'` |
| 8 | Top Cards mostram Total a Receber, Inadimplência Ativa e Clientes Devedores com valores formatados em BRL | VERIFIED | `page.tsx:165-198` — três cards Bootstrap com `formatBRL(summary.total_a_receber)`, `formatBRL(summary.total_atrasado)`, `summary.total_clientes_devedores` |
| 9 | Grid exibe card por cliente com badge de criticidade, barra de progresso e botão WhatsApp condicional | VERIFIED | `page.tsx:207-288` — `getBadgeClass/getBadgeLabel` por `maior_atraso_dias`; barra de progresso condicional `limitecredito > 0`; botão WhatsApp condicional `telefone_completo` não nulo |
| 10 | Card expandido (accordion) carrega títulos via GET /api/athos/contas-receber/cliente/:id/titulos | VERIFIED | `page.tsx:83-101` — `handleToggleCliente` faz fetch lazy para `/api/athos/contas-receber/cliente/${idcliente}/titulos` somente na primeira expansão |
| 11 | Botão Atualizar recarrega dados sem reload da página | VERIFIED | `page.tsx:146-149` — `onClick={() => void fetchDashboard()}` no botão Atualizar |
| 12 | Link Contas a Receber aparece no header de /status ao lado dos botões Atualizar e Novo Orçamento | VERIFIED | `status/page.tsx:319-321` — `<a href="/contas-receber" className="btn btn-sm btn-outline-warning"><i className="bi bi-receipt me-1" />Contas a Receber</a>` dentro da div de ação (linha 315: `d-flex align-items-center gap-2 flex-wrap`) |

**Pontuação (success criteria ROADMAP):** 5/5 critérios verificados

---

### Artefatos Obrigatórios

| Artefato | Descrição | Status | Detalhes |
|----------|-----------|--------|---------|
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | Métodos buscarDashboardContasReceber() e buscarTitulosClienteContasReceber() | VERIFIED | Linhas 1619–1768; SQL completo, try/finally, tipagem TypeScript correta |
| `apps/backend/src/modules/integrations/athos/athos.controller.ts` | Rotas GET contas-receber/dashboard e GET contas-receber/cliente/:idcliente/titulos | VERIFIED | Linhas 232–267; decorators Swagger, validateAthosToken, BadRequestException para idcliente inválido |
| `apps/frontend/src/app/contas-receber/page.tsx` | Página /contas-receber com 3 seções: Top Cards, Grid de Cards, Accordion de títulos | VERIFIED | 372 linhas, todos os elementos implementados incluindo DashboardSummary, ClienteDevedor, TituloReceber |
| `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` | Next.js API Route proxy server-side para dashboard | VERIFIED | 22 linhas; usa `backendFetch`, adiciona `x-api-token` via `ATHOS_API_TOKEN` server-side |
| `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts` | Next.js API Route proxy server-side para títulos lazy | VERIFIED | 31 linhas; validação numérica de idcliente, proxy para backend com token server-side |
| `apps/frontend/src/app/status/page.tsx` | Link de navegação /contas-receber no header | VERIFIED | Linha 319; dentro da div de ação correta (não em bloco condicional) |

---

### Verificação de Links-Chave

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|---------|
| `athos.controller.ts` | `athos.service.ts` | `this.athosService.buscarDashboardContasReceber()` | WIRED | Linha 244 — chamada direta ao serviço |
| `athos.controller.ts` | `athos.service.ts` | `this.athosService.buscarTitulosClienteContasReceber(id)` | WIRED | Linha 265 — chamada com parâmetro numérico validado |
| `athos.service.ts` | `conta_receber` (Athos DB) | `pool.connect() + client.query(SQL)` | WIRED | Linha 1643 — SQL com `INNER JOIN conta_receber cr ON c.idcliente = cr.idcliente` |
| `contas-receber/page.tsx` | `/api/athos/contas-receber/dashboard` | `fetch no useEffect + botão Atualizar` | WIRED | Linha 69 — `fetch("/api/athos/contas-receber/dashboard", { cache: "no-store" })` |
| `contas-receber/page.tsx` | `/api/athos/contas-receber/cliente/:id/titulos` | `fetch lazy ao expandir` | WIRED | Linha 93 — fetch dentro de `handleToggleCliente` |
| `dashboard/route.ts` | backend NestJS `/athos/contas-receber/dashboard` | `backendFetch + x-api-token header` | WIRED | Linha 12 — `backendFetch("/athos/contas-receber/dashboard", ...)` |
| `[idcliente]/titulos/route.ts` | backend NestJS `/athos/contas-receber/cliente/:id/titulos` | `backendFetch + x-api-token header` | WIRED | Linha 21 — `backendFetch(\`/athos/contas-receber/cliente/${id}/titulos\`, ...)` |

---

### Rastreamento de Fluxo de Dados (Nível 4)

| Artefato | Variável de dados | Fonte | Produz dados reais | Status |
|----------|------------------|-------|--------------------|--------|
| `contas-receber/page.tsx` | `summary`, `clientes` | `fetchDashboard()` → `/api/athos/contas-receber/dashboard` → `buscarDashboardContasReceber()` → SQL `conta_receber` | Sim — query SQL real com INNER JOIN, filtro `statusconta='ABE'`, LIMIT 100 | FLOWING |
| `contas-receber/page.tsx` | `titulosMap[idcliente]` | `handleToggleCliente()` → `/api/athos/contas-receber/cliente/:id/titulos` → `buscarTitulosClienteContasReceber()` → SQL `conta_receber LEFT JOIN venda` | Sim — query parametrizada com `$1 = idcliente`, `statusconta='ABE'` | FLOWING |

---

### Spot-Checks Comportamentais

| Comportamento | Verificação | Resultado | Status |
|--------------|-------------|-----------|--------|
| `buscarDashboardContasReceber` declarado em service | `grep -c "buscarDashboardContasReceber" athos.service.ts` | 2 linhas (declaração + log) | PASS |
| `buscarTitulosClienteContasReceber` declarado em service | `grep -c "buscarTitulosClienteContasReceber" athos.service.ts` | 2 linhas | PASS |
| Rotas registradas no controller | `grep -n "contas-receber/dashboard\|contas-receber/cliente"` | Linhas 238, 254 | PASS |
| `'use client'` na primeira linha da página | `head -1 contas-receber/page.tsx` | `"use client";` | PASS |
| Link /contas-receber no header de /status | `grep -n "contas-receber" status/page.tsx` | Linha 319, dentro de div de ação (linha 315) | PASS |
| Commits documentados existem | `git log --oneline` | `26da828`, `9a38141`, `e249e78`, `55661ef` — todos presentes | PASS |

---

### Cobertura de Requisitos

| Requisito | Plano | Descrição (derivada de ROADMAP success criteria) | Status | Evidência |
|-----------|-------|--------------------------------------------------|--------|-----------|
| CR-01 | 27-01, 27-02 | GET /api/athos/contas-receber/dashboard retorna clientes agrupados com total_devido, total_atrasado e contagem de títulos | SATISFIED | `athos.service.ts:1619-1704`; `dashboard/route.ts` |
| CR-02 | 27-01, 27-02 | Top Cards exibem totais globais (a receber, inadimplência, clientes devedores) | SATISFIED | `contas-receber/page.tsx:165-198` |
| CR-03 | 27-01, 27-02 | Grid de cards por cliente com barra de progresso de limite de crédito e badges de criticidade | SATISFIED | `contas-receber/page.tsx:207-288` |
| CR-04 | 27-02 | Drawer/accordion de títulos individuais por cliente com vínculo a venda (numeroordem) | SATISFIED | `contas-receber/page.tsx:292-352`; `[idcliente]/titulos/route.ts` |
| CR-05 | 27-02 | Dashboard atualiza via botão Atualizar manual (sem real-time nesta fase) | SATISFIED | `contas-receber/page.tsx:143-150` — `onClick={() => void fetchDashboard()}` |

**Observação:** Os IDs CR-01..CR-05 não estão definidos formalmente em `.planning/REQUIREMENTS.md`. Eles são referenciados apenas no ROADMAP.md. O REQUIREMENTS.md atual contém requisitos de outro milestone (EFIWH-01..03). Isso é uma lacuna de documentação — os requisitos da fase 27 deveriam ter sido registrados no REQUIREMENTS.md antes do planejamento.

---

### Anti-Padrões Encontrados

Nenhum anti-padrão encontrado nos arquivos modificados pela fase 27:

- Nenhum marcador TBD/FIXME/XXX/TODO em código de produção
- Nenhum `return null` ou array vazio hardcoded que flua para renderização
- Nenhum placeholder — todos os dados vêm de queries SQL reais
- WhatsApp URL sanitizada com `.replace(/\D/g, "")` antes de montar `wa.me/55...`
- Token ATHOS_API_TOKEN nunca exposto no bundle client-side (lido em Route Handlers server-side)

---

### Verificação Humana Necessária

#### 1. Renderização dos Top Cards com dados reais

**Teste:** Com servidor backend e banco Athos acessíveis, navegar para `/contas-receber`
**Esperado:** Três cards exibem valores formatados em BRL (ex.: "R$ 12.450,00"), spinner durante carregamento, mensagem "Nenhum cliente com contas em aberto" se banco vazio
**Por que humano:** Requer servidor ativo e formatação `toLocaleString('pt-BR')` verificável apenas em runtime

#### 2. Accordion de títulos com carregamento lazy

**Teste:** Clicar no botão "Títulos" de um card de cliente
**Esperado:** Spinner aparece durante fetch; tabela de títulos exibe numerotitulo, datavencimento vermelho se vencido, valor em BRL, badge `#numeroordem` quando disponível, "—" quando nulo
**Por que humano:** Comportamento dinâmico de fetch lazy — titulosMap só populado em runtime

#### 3. Botão Atualizar

**Teste:** Clicar no botão "Atualizar" no header da página /contas-receber
**Esperado:** Dados recarregados via `fetchDashboard()` sem reload da página
**Por que humano:** Comportamento de evento click — verificável apenas em browser

#### 4. Link de navegação visível em /status

**Teste:** Acessar `/status` e verificar presença do botão "Contas a Receber" no header
**Esperado:** Link visível entre os botões "Atualizar" e "Novo Orçamento", com ícone bi-receipt e cor amarela (btn-outline-warning); clicar navega para /contas-receber
**Por que humano:** Posicionamento visual e navegação entre rotas — requer browser

#### 5. Botão WhatsApp condicional

**Teste:** Verificar cards de clientes com e sem telefone cadastrado no Athos
**Esperado:** Apenas clientes com `telefone_completo` não nulo exibem o botão WhatsApp; clicar abre `https://wa.me/55{numero}` em nova aba
**Por que humano:** Requer dados reais do banco para verificar condicionalidade

---

### Resumo de Lacunas

**Nenhuma lacuna técnica encontrada.** Todos os artefatos existem, são substanciais e estão corretamente conectados. O fluxo de dados foi rastreado do componente React até as queries SQL no banco Athos.

**Lacuna de documentação (não bloqueante):** Os IDs CR-01..CR-05 estão declarados no ROADMAP.md mas não possuem definição formal em `.planning/REQUIREMENTS.md`. Isso não impede a entrega, mas prejudica rastreabilidade auditável.

O status `human_needed` reflete que 5 comportamentos dinâmicos (renderização com dados reais, accordion lazy, botão Atualizar, navegação, WhatsApp condicional) requerem verificação em browser com servidor ativo.

---

_Verificado: 2026-05-21T12:00:00Z_
_Verificador: Claude (gsd-verifier)_
