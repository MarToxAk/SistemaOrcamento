---
name: Integração EFI Pay (Pagamentos PIX)
description: Geração de cobranças PIX, parcelamentos e recebimento de webhooks de pagamento
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Integração EFI Pay (Pagamentos PIX)

**Localização**: `apps/backend/src/modules/integrations/efi/`
**Tamanho**: efi.service.ts 27K

## O que faz
- Gera cobranças PIX para os orçamentos aprovados
- Suporta parcelamentos (campo `installments` na Quote)
- Recebe webhooks de confirmação de pagamento
- Atualiza `paidTotal`, `pendingTotal`, `paymentConfirmedAt` na Quote
- Registra cada transação em `PaymentTransaction`
- Pagamentos por cartão de crédito de orçamentos (`Quote.cardChargeId`) também são confirmados automaticamente via webhook dedicado (rota própria, payload diferente do PIX)

## Variáveis de Ambiente
```
EFI_BASE_URL           — URL base da API EFI
EFI_COBRANCA_BASE_URL  — URL para criação de cobranças
EFI_CLIENT_ID          — credencial OAuth
EFI_CLIENT_SECRET      — credencial OAuth
EFI_PIX_KEY            — chave PIX da empresa
EFI_CERT_PEM           — certificado mTLS (base64)
EFI_KEY_PEM            — chave privada mTLS (base64)
```

## Endpoints Expostos
- `GET /api/integrations/efi/status` — verifica configuração e conectividade
- `POST /api/integrations/efi/webhook/payment` — webhook de pagamento genérico
- `POST /api/integrations/efi/webhook/payment/pix` — webhook específico PIX
- `POST /api/integrations/efi/webhook/payment/card` — webhook específico de cartão de crédito (API Cobranças, payload `{notification: token}`)

## Auto-registro do webhook PIX no boot
`EfiService` implementa `OnModuleInit` e chama `registerPixWebhook()` ao subir, registrando a URL do webhook PIX na EFI via `PUT /v2/webhook/{EFI_PIX_KEY}` — não-bloqueante, ignora silenciosamente se faltar configuração (mTLS, `EFI_PIX_KEY`, `EFI_CLIENT_ID`/`EFI_CLIENT_SECRET`) ou em ambiente local (URL não pública).

## Fluxo de Pagamento
1. Orçamento aprovado → gera cobrança PIX na EFI
2. Cliente paga → EFI dispara webhook
3. Backend valida webhook, soma `paidTotal` e decide a quitação (ver "Fase 54" abaixo), atualizando `Quote.status`:
   - Quitado (paidTotal cobre o valor devido, com tolerância) → `APROVADO` (ou próximo status)
   - Abaixo disso → `PAGAMENTO_PARCIAL`
4. Evento salvo em `PaymentTransaction`

## Fase 54: pagamento efetivo e comprovante
- **Desconto do PIX à vista:** 5% quando o total passa de R$ 150, gravado em `Quote.paymentDiscount` (valor do desconto) e `Quote.paymentAmount` (valor efetivamente devido). Sem desconto abaixo do limite.
- **Quitação em centavos:** comparação de `paidTotal` com o valor devido em centavos, com tolerância de R$ 0,02 (`quote-payment.util.ts`). Substitui comparações em float.
- **Entrada 50% e 2 parcelas:** sem desconto (inclusive o PIX 50/50, corrigido nesta fase para não aplicar o desconto à vista).
- **Comprovante como nota privada no Chatwoot** ao confirmar o PIX, em ordem de preferência: (1) comprovante oficial da EFI via `GET /v2/gn/pix/comprovantes` (escopo `gn.receipts.read`, quando a aplicação o tiver); (2) PNG de layout próprio gerado pelo backend; (3) somente texto. Cada degrau cai para o seguinte se falhar; a falha do comprovante nunca derruba a confirmação do pagamento.
- **Risco conhecido (deferido, D-17):** o webhook de PIX (`/webhook/payment/pix`) é público e sem guarda de autenticação; hardening ficou fora desta fase.

## Script utilitário
`scripts/convert_pem_to_base64.py` — converte certificados PEM para base64 (necessário para as env vars `EFI_CERT_PEM` e `EFI_KEY_PEM`)

**Why:** EFI Pay é o gateway de pagamentos integrado; mTLS é exigido pela EFI para webhooks PIX seguros.
**How to apply:** Ao testar localmente, os certificados PEM precisam ser codificados em base64 e colados nas variáveis. Em produção, estão no stack.env.
