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

## Fluxo de Pagamento
1. Orçamento aprovado → gera cobrança PIX na EFI
2. Cliente paga → EFI dispara webhook
3. Backend valida webhook, atualiza `Quote.status`:
   - Pagamento total → `APROVADO` (ou próximo status)
   - Pagamento parcial → `PAGAMENTO_PARCIAL`
4. Evento salvo em `PaymentTransaction`

## Script utilitário
`scripts/convert_pem_to_base64.py` — converte certificados PEM para base64 (necessário para as env vars `EFI_CERT_PEM` e `EFI_KEY_PEM`)

**Why:** EFI Pay é o gateway de pagamentos integrado; mTLS é exigido pela EFI para webhooks PIX seguros.
**How to apply:** Ao testar localmente, os certificados PEM precisam ser codificados em base64 e colados nas variáveis. Em produção, estão no stack.env.
