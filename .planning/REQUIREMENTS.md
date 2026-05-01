# Requirements — Sistema de Orçamento BomCusto

**Version:** 1.0
**Date:** 2026-05-01
**Status:** Active

---

## Functional Requirements

### FR-01 — Autenticação e Autorização
- **FR-01.1** O sistema deve autenticar usuários via Chatwoot (API token + verificação de agente ativo)
- **FR-01.2** Endpoints do backend devem exigir autenticação — sem acesso anônimo ao painel
- **FR-01.3** Roles: `ADMIN`, `VENDEDOR`, `ATENDENTE` — cada role com permissões distintas
- **FR-01.4** Rota `/status` e `/orcamento/:id/approve` são públicas (clientes acessam sem login)
- **FR-01.5** Webhooks EFI devem validar assinatura HMAC-SHA256 (`x-gn-signature`) — rejeitar 401 se inválida

### FR-02 — Confiabilidade de Integrações
- **FR-02.1** Todos os erros de integração externa (NFS-e, EFI, Chatwoot, MinIO) devem ser logados com contexto (quoteId, operação, payload parcial)
- **FR-02.2** O sistema deve inicializar com falha rápida se variáveis de ambiente críticas estiverem ausentes (`DATABASE_URL`, `EFI_CLIENT_ID`, `NFSE_TOKEN`, `MINIO_ACCESS_KEY`, etc.)
- **FR-02.3** `enviarParaCliente` deve executar de forma assíncrona (queue) para não travar requisições HTTP
- **FR-02.4** Erros de NFS-e devem retornar mensagem clara ao usuário — nunca silencioso

### FR-03 — Fluxo de Orçamentos
- **FR-03.1** Token de aprovação deve ser invalidado após primeiro uso bem-sucedido
- **FR-03.2** `approveByToken` deve passar pela máquina de estados (`changeStatus`) — não escrever status diretamente
- **FR-03.3** `list()` deve ter paginação com limite padrão de 50 e máximo de 200 registros
- **FR-03.4** Campo `isAssociated` deve ser migrado do magic string `__associated__` para campo booleano dedicado

### FR-04 — Área do Cliente
- **FR-04.1** Página `/status` deve exibir status atual do orçamento sem autenticação
- **FR-04.2** Página de aprovação deve funcionar apenas com token válido e não-expirado
- **FR-04.3** Após aprovação, cliente deve ver confirmação clara com próximos passos

### FR-05 — Observabilidade e Auditoria
- **FR-05.1** Todas as operações mutáveis (mudança de status, emissão de NFS-e, pagamento, merge) devem ser registradas com IP, userId e timestamp
- **FR-05.2** Interceptor de logging estruturado para todas as requisições ao backend
- **FR-05.3** Endpoint de health check com status das integrações externas

### FR-06 — Testes
- **FR-06.1** Cobertura de testes para: máquina de status (`changeStatus`), `approveByToken`, parsing de webhook EFI
- **FR-06.2** Testes de integração com mocks para: NFS-e SOAP, EFI HTTP, Chatwoot API
- **FR-06.3** CI deve executar testes automaticamente em todo PR/push para `main`

### FR-07 — UX e Interface
- **FR-07.1** Tela de lista de orçamentos deve ter filtros funcionais e feedback de carregamento
- **FR-07.2** Formulário de criação deve validar campos obrigatórios antes de submeter
- **FR-07.3** Status das integrações deve ser visível no painel (NFS-e emitida, PIX pago, etc.)

---

## Non-Functional Requirements

### NFR-01 — Segurança
- Nenhum endpoint (exceto rotas públicas definidas) deve ser acessível sem autenticação
- Secrets nunca em logs — mascarar tokens e chaves
- Rate limiting em endpoints de pagamento, NFS-e e geração de PDF

### NFR-02 — Performance
- `list()` de orçamentos deve responder em < 500ms para até 50 registros
- PDF deve ser gerado e armazenado em < 10s
- Conexão com Athos via `pg.Pool` — máximo 5 conexões simultâneas

### NFR-03 — Confiabilidade
- Sistema deve inicializar ou falhar imediatamente — sem modo degradado silencioso
- Falha em integração externa não deve derrubar o processo principal

### NFR-04 — Manutenibilidade
- `quotes.service.ts` deve ser refatorado gradualmente — extrair sub-services por responsabilidade
- Nenhum `as any` novo introduzido — usar tipos Prisma adequados

---

## Out of Scope (v1)

- Autenticação OAuth própria — apenas Chatwoot
- App mobile
- Multi-tenant
- Pagamento via cartão próprio (EFI já suporta)
- Relatórios e dashboards analíticos
- Gestão de estoque

---
*Requirements v1.0 — 2026-05-01*
