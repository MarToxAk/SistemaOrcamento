# Roadmap â€” Sistema de OrÃ§amento BomCusto

**Version:** 1.0
**Date:** 2026-05-01
**Granularity:** Coarse (3-5 fases)

---

## Phase 1 â€” SeguranÃ§a e AutenticaÃ§Ã£o
**Status:** in-review
**Goal:** Nenhum endpoint interno acessÃ­vel sem autenticaÃ§Ã£o. Webhooks validados. Sistema falha rÃ¡pido se mal configurado.

**Requirements covered:** FR-01.1, FR-01.2, FR-01.3, FR-01.4, FR-01.5, FR-02.2, NFR-01

### Plans
- **1.1** Guard global NestJS com autenticaÃ§Ã£o via Chatwoot API token (verificar agente ativo) â€” proteger todos os endpoints exceto rotas pÃºblicas definidas
- **1.2** ValidaÃ§Ã£o de assinatura HMAC-SHA256 nos webhooks EFI (`x-gn-signature`) â€” rejeitar 401 se invÃ¡lida
- **1.3** ValidaÃ§Ã£o de variÃ¡veis de ambiente na inicializaÃ§Ã£o com `@nestjs/config` + `class-validator` â€” crash fast se faltam crÃ­ticas
- **1.4** Rate limiting com `@nestjs/throttler` â€” limites stricter em endpoints de pagamento, NFS-e e PDF

**UAT:**
- [ ] Acessar `/api/quotes` sem token â†’ 401
- [ ] Acessar `/api/quotes` com token Chatwoot vÃ¡lido â†’ 200
- [ ] Simular webhook EFI sem assinatura â†’ 401
- [ ] Simular webhook EFI com assinatura vÃ¡lida â†’ 200
- [ ] Iniciar backend sem `DATABASE_URL` â†’ processo encerra com erro descritivo
- [ ] `/api/quotes/:id/approve?token=...` acessÃ­vel sem autenticaÃ§Ã£o â†’ 200

---

## Phase 2 â€” Confiabilidade de IntegraÃ§Ãµes
**Status:** not-started
**Goal:** Falhas em NFS-e, EFI PIX e Chatwoot sÃ£o visÃ­veis nos logs e retornam mensagens claras. `enviarParaCliente` Ã© assÃ­ncrono e nÃ£o trava requisiÃ§Ãµes.

**Requirements covered:** FR-02.1, FR-02.3, FR-02.4, FR-05.2, NFR-02, NFR-03

### Plans
- **2.1** Logging estruturado com `@nestjs/common Logger` em todas as integraÃ§Ãµes â€” substituir `console.*` e adicionar contexto (quoteId, operaÃ§Ã£o, erro)
- **2.2** Interceptor de logging para todas as requisiÃ§Ãµes mutÃ¡veis â€” IP, userId, rota, status da resposta
- **2.3** Queue assÃ­ncrona com BullMQ para `enviarParaCliente` â€” endpoint HTTP retorna imediatamente, worker processa
- **2.4** Athos connection pool com `pg.Pool` (max 5 conexÃµes) â€” substituir `new pg.Client()` por request
- **2.5** Endpoint health check expandido â€” status real de cada integraÃ§Ã£o (DB, MinIO, EFI, NFS-e, Chatwoot)

**UAT:**
- [ ] Chamar `POST /api/quotes/:id/enviar` com MinIO indisponÃ­vel â†’ resposta HTTP imediata, erro no worker logado
- [ ] Emitir NFS-e com tomador sem CPF/CNPJ â†’ erro 400 com mensagem clara em portuguÃªs
- [ ] Logs de erro de integraÃ§Ã£o devem conter quoteId e nome da operaÃ§Ã£o
- [ ] `GET /api/health` retorna status de cada integraÃ§Ã£o

---

## Phase 3 â€” CorreÃ§Ãµes de Fluxo e Qualidade de Dados
**Status:** not-started
**Goal:** MÃ¡quina de estados Ã­ntegra, paginaÃ§Ã£o segura, token de aprovaÃ§Ã£o invalidado apÃ³s uso, `isAssociated` como campo real.

**Requirements covered:** FR-03.1, FR-03.2, FR-03.3, FR-03.4, NFR-04

### Plans
- **3.1** `approveByToken` â€” passar por `changeStatus()` em vez de escrever status diretamente; invalidar token apÃ³s uso
- **3.2** PaginaÃ§Ã£o default em `list()` â€” `take=50` padrÃ£o, mÃ¡ximo `200`, retornar `total` no response
- **3.3** Migration `isAssociated Boolean @default(false)` â€” substituir magic string `__associated__` em `notes`
- **3.4** `resolveCustomer` â€” upsert dentro de transaÃ§Ã£o para eliminar race condition
- **3.5** Identificadores SQL dinÃ¢micos no Athos (`loadItems`) â€” cotar colunas com double-quotes

**UAT:**
- [ ] `GET /api/quotes` sem `take` retorna mÃ¡ximo 50 registros + campo `total`
- [ ] Aprovar orÃ§amento com token expirado â†’ 400 com mensagem clara
- [ ] Usar token de aprovaÃ§Ã£o duas vezes â†’ segunda tentativa retorna 400
- [ ] `isAssociated` aparece como campo booleano no response (nÃ£o mais em `notes`)

---

## Phase 4 â€” Testes e CI
**Status:** not-started
**Goal:** Cobertura de testes para fluxos crÃ­ticos. CI executa testes em todo PR. Nenhuma regressÃ£o passa despercebida.

**Requirements covered:** FR-06.1, FR-06.2, FR-06.3

### Plans
- **4.1** Setup de testes com Jest + `@nestjs/testing` â€” substituir Node built-in test runner
- **4.2** Testes unitÃ¡rios: `changeStatus` (todas as transiÃ§Ãµes vÃ¡lidas/invÃ¡lidas), `approveByToken`, normalizaÃ§Ã£o de status
- **4.3** Testes de integraÃ§Ã£o com mocks (nock/msw): webhook EFI, emissÃ£o NFS-e, envio Chatwoot
- **4.4** GitHub Actions CI â€” executar testes em PRs para `main` e `dev`

**UAT:**
- [ ] `npm test` executa sem erros
- [ ] `changeStatus` de `CANCELADO` para `EM_PRODUCAO` lanÃ§a exceÃ§Ã£o no teste
- [ ] PR para `main` sem testes passando â†’ CI bloqueia merge
- [ ] Teste de webhook EFI com payload falso â†’ processWebhook rejeita

---

## Phase 5 â€” UX do Painel e Ãrea do Cliente
**Status:** not-started
**Goal:** Painel interno usÃ¡vel com feedback visual claro. Ãrea do cliente para status e aprovaÃ§Ã£o funcional.

**Requirements covered:** FR-04.1, FR-04.2, FR-04.3, FR-07.1, FR-07.2, FR-07.3

### Plans
- **5.1** Painel interno â€” filtros de status funcionais, loading states, feedback de aÃ§Ãµes (toast/alert)
- **5.2** FormulÃ¡rio de criaÃ§Ã£o â€” validaÃ§Ã£o client-side antes de submeter, campos obrigatÃ³rios destacados
- **5.3** Badge/indicador de status de integraÃ§Ãµes por orÃ§amento (NFS-e emitida âœ“, PIX pago âœ“, PDF gerado âœ“)
- **5.4** PÃ¡gina do cliente â€” `/status/:id` e `/orcamento/:id/approve` com UX adequada para uso mobile

**UAT:**
- [ ] Filtrar orÃ§amentos por status `APROVADO` â†’ lista atualiza sem recarregar pÃ¡gina
- [ ] Submeter formulÃ¡rio sem campos obrigatÃ³rios â†’ erro inline visÃ­vel
- [ ] Cliente acessa link de aprovaÃ§Ã£o no mobile â†’ tela legÃ­vel e botÃ£o de aprovar funcional
- [ ] OrÃ§amento com NFS-e emitida exibe indicador visual no detalhe

---

## Backlog (Future)

- RelatÃ³rios e exportaÃ§Ã£o CSV de orÃ§amentos
- NotificaÃ§Ãµes em tempo real (WebSocket) para mudanÃ§a de status
- Refactor gradual de `quotes.service.ts` â€” extrair `QuotePaymentService`, `QuoteMessagingService`, `QuoteApprovalService`
- Migrar PDF de Puppeteer para Gotenberg (menos dependÃªncias de OS)
- Redis para cache do token EFI (preparaÃ§Ã£o para mÃºltiplas rÃ©plicas)

---
*Roadmap v1.0 â€” 2026-05-01*
