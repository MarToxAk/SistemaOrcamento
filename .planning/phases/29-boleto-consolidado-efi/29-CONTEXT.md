# Phase 29: Boleto Consolidado via EFI Bank - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar a geração de boleto bancário consolidado (múltiplos títulos selecionados) via API EFI Cobranças, conectando o botão "Gerar Boleto" da página `/contas-receber/[idcliente]` ao fluxo completo: validação de datas, criação do boleto na EFI, registro em `CobrancaBoleto`/`CobrancaBoletoTitulo`, retorno de link PDF + linha digitável ao frontend, e atualização de status via webhook EFI.

</domain>

<decisions>
## Implementation Decisions

### Tipo de Cobrança

- **D-01:** Boleto bancário tradicional — não Pix. Endpoint EFI: `POST /v1/charge/one-step` com `payment_method: "banking_billet"`.
- **D-02:** Base URL: `EFI_COBRANCA_BASE_URL` (já configurado, padrão sandbox `cobrancas-h.api.efipay.com.br`). Produção: `cobrancas.api.efipay.com.br`.
- **D-03:** Auth: mesmo padrão de `createCardPaymentLink()` — Basic Auth com `EFI_CLIENT_ID:EFI_CLIENT_SECRET` para obter token OAuth2 em `POST /v1/authorize`. Reutilizar lógica idêntica de `createCardPaymentLink()`.
- **D-04:** Env vars reutilizados (já existem no `.env`): `EFI_COBRANCA_BASE_URL`, `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`. Nenhuma variável nova necessária.

### Vencimento do Boleto

- **D-05:** O vencimento do boleto usa o campo `datavencimento` da tabela `conta_receber` no Athos.
- **D-06:** Validação de datas — fluxo:
  1. Frontend lê `datavencimento` dos títulos selecionados (já disponível em `TituloReceber` da Fase 28)
  2. Se todos os títulos têm a mesma `datavencimento` → usa essa data como `expire_at`
  3. Se há datas diferentes → exibe erro: "Os títulos selecionados possuem datas de vencimento diferentes. Informe uma data de vencimento manualmente." + campo `<input type="date">` para o operador definir
  4. A data final escolhida (automática ou manual) é enviada ao backend como `expireAt: "YYYY-MM-DD"`
- **D-07:** Validação também no backend: se `expireAt` for no passado, retornar 400 com mensagem clara.

### Arquitetura — Novo Módulo

- **D-08:** Novo módulo NestJS: `CobrancaModule` em `apps/backend/src/modules/cobranca/`.
  - `cobranca.module.ts` — importa `PrismaModule`, `EFIModule`, `AthosModule`
  - `cobranca.service.ts` — lógica de negócio
  - `cobranca.controller.ts` — rotas protegidas por `x-internal-api-key`
- **D-09:** Registrar `CobrancaModule` em `AppModule`.
- **D-10:** Autenticação: `x-internal-api-key` (mesmo guard `ApiKeyGuard` das outras rotas internas). Não `validateAthosToken` — é rota interna, não Athos.

### Endpoint de Criação

- **D-11:** `POST /cobranca/boleto` — recebe:
  ```json
  {
    "idclienteAthos": 123,
    "idcontasReceber": [10, 11, 12],
    "expireAt": "2026-06-15"
  }
  ```
- **D-12:** `CobrancaService.criarBoleto()` — passos:
  1. Busca títulos no Athos via `AthosService.buscarTitulosClienteContasReceber(idclienteAthos)` e filtra pelos `idcontasReceber` recebidos
  2. Valida que todos `idcontasReceber` existem e têm status AVC/VEN
  3. Calcula `valor = soma dos valores dos títulos`
  4. Busca dados do cliente via `AthosService.buscarDadosClienteContasReceber(idclienteAthos)` para `customer.name`
  5. Cria boleto na EFI (`/v1/charge/one-step`)
  6. Salva `CobrancaBoleto` + `CobrancaBoletoTitulo[]` no Prisma
  7. Retorna shape de resposta
- **D-13:** Resposta do endpoint:
  ```json
  {
    "cobrancaId": 1,
    "chargeId": 4567,
    "linkBoleto": "https://visualizacao.efipay.com.br/...",
    "barcodeLinhaDigitavel": "03399.12345 ...",
    "valor": 1250.00,
    "expireAt": "2026-06-15"
  }
  ```
- **D-14:** Body EFI (`/v1/charge/one-step`):
  ```json
  {
    "items": [{ "name": "Cobrança #idclienteAthos", "value": <centavos>, "amount": 1 }],
    "customer": { "name": "<nome_cliente>", "cpf": "<cpf_se_disponivel>" },
    "settings": {
      "payment_method": "banking_billet",
      "expire_at": "YYYY-MM-DD",
      "request_delivery_address": false
    },
    "metadata": {
      "custom_id": "cr-<idclienteAthos>-<timestamp>",
      "notification_url": "<webhook_url>/api/cobranca/boleto/notificacao"
    }
  }
  ```
- **D-15:** `customer.cpf` — tentar extrair CPF de `buscarClientePorId()`. Se não disponível (PJ ou sem dados), usar somente `name`. O campo CPF/CNPJ não é obrigatório para criar o boleto mas é recomendado pela EFI.

### Webhook de Atualização de Status

- **D-16:** Novo endpoint `POST /cobranca/boleto/notificacao` (público, sem auth guard) — a EFI envia POST com `token` no body ou query.
- **D-17:** Fluxo do webhook:
  1. Recebe `token` da EFI
  2. Chama `GET /v1/notification/{token}` na API EFI Cobranças com Bearer token OAuth2
  3. Extrai `notification.data.charge.status` e `notification.data.charge.charge_id`
  4. Busca `CobrancaBoleto` pelo `chargeId`
  5. Se `status === "paid"` → atualiza `CobrancaBoleto.status = "pago"`
  6. Idempotente — múltiplas notificações do mesmo evento não causam problema
- **D-18:** Webhook retorna HTTP 200 independentemente do resultado (evita retentativas EFI por falha).

### Frontend — Modal de Boleto

- **D-19:** Ao clicar "Gerar Boleto" em `/contas-receber/[idcliente]/page.tsx`:
  1. Verificar datas de vencimento dos títulos selecionados
  2. Se datas iguais → pré-preencher campo de data com a data comum
  3. Se datas diferentes → mostrar erro + campo de data vazio para o operador preencher
  4. Operador confirma → POST para `/api/cobranca/boleto` (Route Handler Next.js)
- **D-20:** Modal pós-geração exibe:
  - Link do boleto (botão "Abrir Boleto" abrindo em nova aba)
  - Linha digitável copiável (botão copiar)
  - Valor + vencimento
- **D-21:** Novo Route Handler proxy: `apps/frontend/src/app/api/cobranca/boleto/route.ts` — POST com `x-internal-api-key` via `INTERNAL_API_KEY`.

### Claude's Discretion

- `CobrancaService` injeta `EFIService` via NestJS DI — não cria cliente HTTP próprio
- `chargeId` salvo como `Int` no `CobrancaBoleto.txidEfi` (era `String?` no schema — ajustar para `Int? @default(null)` OU salvar como String com `chargeId.toString()`)
- Usar `String` para `txidEfi` — salvar `chargeId.toString()` para consistência com o campo existente
- `CobrancaBoleto.linkBoleto` e `pixPayload` (campo já no schema da Fase 28) preenchidos no create

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### EFI API — Boleto
- `https://dev.efipay.com.br/docs/api-cobrancas/boleto` — documentação oficial EFI boleto
- Endpoint criação: `POST /v1/charge/one-step` com `payment_method: "banking_billet"`
- Auth: `POST /v1/authorize` Basic Auth `EFI_CLIENT_ID:EFI_CLIENT_SECRET`
- Notification: `GET /v1/notification/{token}`

### Codebase — Padrões de Referência
- `apps/backend/src/modules/integrations/efi/efi.service.ts` linhas 292-380 — `createCardPaymentLink()`: padrão idêntico de auth OAuth2 + POST `/v1/charge/one-step/link` com Cobranças API. Reutilizar EXATAMENTE esse padrão de auth.
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — página que contém botão "Gerar Boleto" (onClick vazio — conectar aqui)
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — `buscarDadosClienteContasReceber()` (Fase 28) e `buscarTitulosClienteContasReceber()` para buscar dados
- `apps/backend/prisma/schema.prisma` — modelos `CobrancaBoleto` + `CobrancaBoletoTitulo` (criados na Fase 28)
- `apps/backend/src/app.module.ts` — registrar `CobrancaModule` aqui
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` — Route Handler proxy como modelo para o novo `/api/cobranca/boleto/route.ts`

### Requisitos
- `.planning/REQUIREMENTS.md` — BOL-01, BOL-02, BOL-03

### Env vars (já existem)
- `EFI_COBRANCA_BASE_URL`, `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createCardPaymentLink()` em EFIService (linhas 292-380): auth OAuth2 + `/v1/charge/one-step/link` — copiar padrão de auth literal para o novo método de boleto
- `buscarDadosClienteContasReceber()`: retorna `nome_cliente`, `emailcliente`, `telefone_completo`
- `buscarTitulosClienteContasReceber()`: retorna array de títulos com `idcontareceber`, `valor`, `datavencimento`
- Guard `ApiKeyGuard`: usar em `CobrancaController` (mesmo guard das rotas internas)
- `backendFetch()`: usar no Route Handler frontend para adicionar `x-internal-api-key`

### Established Patterns
- Novo módulo NestJS: criar `cobranca.module.ts` + `cobranca.service.ts` + `cobranca.controller.ts`, importar no `app.module.ts`
- Route Handler Next.js: `await params` se dinâmico; `INTERNAL_API_KEY` para auth; `backendFetch()` para proxy
- Prisma: `prisma.cobrancaBoleto.create({ data: { ..., titulos: { createMany: { data: [...] } } } })` com nested write

### Integration Points
- `CobrancaModule` importa `EFIModule` (para injetar `EFIService`) e `PrismaModule`
- `CobrancaController.criarBoleto()` → `CobrancaService.criarBoleto()` → `EFIService` (boleto) + `PrismaService` (salvar) + `AthosService` (validar títulos)
- Webhook `POST /cobranca/boleto/notificacao` → `CobrancaService.processarNotificacaoEFI(token)` → EFI API + Prisma update
- Frontend: `onClick` do botão "Gerar Boleto" → modal de confirmação → `POST /api/cobranca/boleto` → `CobrancaController`

</code_context>

<specifics>
## Specific Ideas

- Validação de datas no frontend (antes de abrir modal de confirmação):
  ```typescript
  const datas = new Set(titulosSelecionados.map(t => t.datavencimento?.slice(0,10)));
  if (datas.size > 1) {
    setErroDatas("Os títulos selecionados possuem datas de vencimento diferentes. Informe uma data de vencimento.");
    setExpireAtManual(""); // campo manual
  } else {
    setExpireAtManual([...datas][0] ?? "");
  }
  ```
- EFI boleto body (valor em centavos):
  ```javascript
  value: Math.round(Number(totalValor.toFixed(2)) * 100) // mesmo padrão do cartão
  ```
- Salvar chargeId como String: `txidEfi: String(chargeId)` — campo já existe no schema como `String?`
- Webhook endpoint deve estar em `@Public()` ou ter guard diferente — EFI não envia API key interna

</specifics>

<deferred>
## Deferred Ideas

- Exibir cobranças geradas na página do cliente (histórico de boletos) → Phase 31 ou futuro
- Cancelamento de boleto via EFI API → fora do escopo desta fase
- Envio automático do link por e-mail/Chatwoot → fora do escopo
- Boleto com parcelamento → fora do escopo (BOL requirements não mencionam)

</deferred>

---

*Phase: 29-boleto-consolidado-efi*
*Context gathered: 2026-05-22*
