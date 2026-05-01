# Roadmap — Sistema de Orçamento BomCusto

**Version:** 1.0
**Date:** 2026-05-01
**Granularity:** Coarse (3-5 fases)

---

## Phase 1 — Segurança e Autenticação
**Status:** not-started
**Goal:** Nenhum endpoint interno acessível sem autenticação. Webhooks validados. Sistema falha rápido se mal configurado.

**Requirements covered:** FR-01.1, FR-01.2, FR-01.3, FR-01.4, FR-01.5, FR-02.2, NFR-01

### Plans
- **1.1** Guard global NestJS com autenticação via Chatwoot API token (verificar agente ativo) — proteger todos os endpoints exceto rotas públicas definidas
- **1.2** Validação de assinatura HMAC-SHA256 nos webhooks EFI (`x-gn-signature`) — rejeitar 401 se inválida
- **1.3** Validação de variáveis de ambiente na inicialização com `@nestjs/config` + `class-validator` — crash fast se faltam críticas
- **1.4** Rate limiting com `@nestjs/throttler` — limites stricter em endpoints de pagamento, NFS-e e PDF

**UAT:**
- [ ] Acessar `/api/quotes` sem token → 401
- [ ] Acessar `/api/quotes` com token Chatwoot válido → 200
- [ ] Simular webhook EFI sem assinatura → 401
- [ ] Simular webhook EFI com assinatura válida → 200
- [ ] Iniciar backend sem `DATABASE_URL` → processo encerra com erro descritivo
- [ ] `/api/quotes/:id/approve?token=...` acessível sem autenticação → 200

---

## Phase 2 — Confiabilidade de Integrações
**Status:** not-started
**Goal:** Falhas em NFS-e, EFI PIX e Chatwoot são visíveis nos logs e retornam mensagens claras. `enviarParaCliente` é assíncrono e não trava requisições.

**Requirements covered:** FR-02.1, FR-02.3, FR-02.4, FR-05.2, NFR-02, NFR-03

### Plans
- **2.1** Logging estruturado com `@nestjs/common Logger` em todas as integrações — substituir `console.*` e adicionar contexto (quoteId, operação, erro)
- **2.2** Interceptor de logging para todas as requisições mutáveis — IP, userId, rota, status da resposta
- **2.3** Queue assíncrona com BullMQ para `enviarParaCliente` — endpoint HTTP retorna imediatamente, worker processa
- **2.4** Athos connection pool com `pg.Pool` (max 5 conexões) — substituir `new pg.Client()` por request
- **2.5** Endpoint health check expandido — status real de cada integração (DB, MinIO, EFI, NFS-e, Chatwoot)

**UAT:**
- [ ] Chamar `POST /api/quotes/:id/enviar` com MinIO indisponível → resposta HTTP imediata, erro no worker logado
- [ ] Emitir NFS-e com tomador sem CPF/CNPJ → erro 400 com mensagem clara em português
- [ ] Logs de erro de integração devem conter quoteId e nome da operação
- [ ] `GET /api/health` retorna status de cada integração

---

## Phase 3 — Correções de Fluxo e Qualidade de Dados
**Status:** not-started
**Goal:** Máquina de estados íntegra, paginação segura, token de aprovação invalidado após uso, `isAssociated` como campo real.

**Requirements covered:** FR-03.1, FR-03.2, FR-03.3, FR-03.4, NFR-04

### Plans
- **3.1** `approveByToken` — passar por `changeStatus()` em vez de escrever status diretamente; invalidar token após uso
- **3.2** Paginação default em `list()` — `take=50` padrão, máximo `200`, retornar `total` no response
- **3.3** Migration `isAssociated Boolean @default(false)` — substituir magic string `__associated__` em `notes`
- **3.4** `resolveCustomer` — upsert dentro de transação para eliminar race condition
- **3.5** Identificadores SQL dinâmicos no Athos (`loadItems`) — cotar colunas com double-quotes

**UAT:**
- [ ] `GET /api/quotes` sem `take` retorna máximo 50 registros + campo `total`
- [ ] Aprovar orçamento com token expirado → 400 com mensagem clara
- [ ] Usar token de aprovação duas vezes → segunda tentativa retorna 400
- [ ] `isAssociated` aparece como campo booleano no response (não mais em `notes`)

---

## Phase 4 — Testes e CI
**Status:** not-started
**Goal:** Cobertura de testes para fluxos críticos. CI executa testes em todo PR. Nenhuma regressão passa despercebida.

**Requirements covered:** FR-06.1, FR-06.2, FR-06.3

### Plans
- **4.1** Setup de testes com Jest + `@nestjs/testing` — substituir Node built-in test runner
- **4.2** Testes unitários: `changeStatus` (todas as transições válidas/inválidas), `approveByToken`, normalização de status
- **4.3** Testes de integração com mocks (nock/msw): webhook EFI, emissão NFS-e, envio Chatwoot
- **4.4** GitHub Actions CI — executar testes em PRs para `main` e `dev`

**UAT:**
- [ ] `npm test` executa sem erros
- [ ] `changeStatus` de `CANCELADO` para `EM_PRODUCAO` lança exceção no teste
- [ ] PR para `main` sem testes passando → CI bloqueia merge
- [ ] Teste de webhook EFI com payload falso → processWebhook rejeita

---

## Phase 5 — UX do Painel e Área do Cliente
**Status:** not-started
**Goal:** Painel interno usável com feedback visual claro. Área do cliente para status e aprovação funcional.

**Requirements covered:** FR-04.1, FR-04.2, FR-04.3, FR-07.1, FR-07.2, FR-07.3

### Plans
- **5.1** Painel interno — filtros de status funcionais, loading states, feedback de ações (toast/alert)
- **5.2** Formulário de criação — validação client-side antes de submeter, campos obrigatórios destacados
- **5.3** Badge/indicador de status de integrações por orçamento (NFS-e emitida ✓, PIX pago ✓, PDF gerado ✓)
- **5.4** Página do cliente — `/status/:id` e `/orcamento/:id/approve` com UX adequada para uso mobile

**UAT:**
- [ ] Filtrar orçamentos por status `APROVADO` → lista atualiza sem recarregar página
- [ ] Submeter formulário sem campos obrigatórios → erro inline visível
- [ ] Cliente acessa link de aprovação no mobile → tela legível e botão de aprovar funcional
- [ ] Orçamento com NFS-e emitida exibe indicador visual no detalhe

---

## Backlog (Future)

- Relatórios e exportação CSV de orçamentos
- Notificações em tempo real (WebSocket) para mudança de status
- Refactor gradual de `quotes.service.ts` — extrair `QuotePaymentService`, `QuoteMessagingService`, `QuoteApprovalService`
- Migrar PDF de Puppeteer para Gotenberg (menos dependências de OS)
- Redis para cache do token EFI (preparação para múltiplas réplicas)

---
*Roadmap v1.0 — 2026-05-01*
