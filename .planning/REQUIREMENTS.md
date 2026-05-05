# Requirements - Sistema de Orcamento BomCusto

## v1.9 — Webhook EFI PIX e Robustez de URLs de Integração

### EFIWH-01 — URL de webhook EFI usa sufixo /pix

**Contexto:** `getWebhookUrl()` em `efi.service.ts` gera a URL de notificação que é registrada na EFI Pay. Atualmente retorna `…/integrations/efi/webhook/payment` sem o sufixo `/pix`, fazendo o gateway enviar eventos para o endpoint errado.

**Requisito:** `getWebhookUrl()` deve retornar `${base}/integrations/efi/webhook/payment/pix`.

**URL de produção esperada:** `https://orcamentoapi.bomcustoilhabela.com.br/api/integrations/efi/webhook/payment/pix`

**Critério:** Chamada a `configureWebhook` usa a URL com `/pix`; endpoint `/webhook/payment/pix` (já `@Public()`) recebe os eventos corretamente.

---

### EFIWH-02 — NfseService trata variáveis de URL vazias

**Contexto:** `NFSE_SOAP_URL` e `NFSE_AUX_URL` podem estar definidas como string vazia no `.env`. O operador `??` não trata string vazia, causando erro `ENOENT '?wsdl'` porque o fallback para `DEFAULT_ENDPOINT` nunca é usado.

**Requisito:** Os getters de URL no `NfseService` devem usar `?.trim() || DEFAULT_ENDPOINT` em vez de `?? DEFAULT_ENDPOINT`.

**Critério:** Com `NFSE_SOAP_URL=` (vazio) o serviço usa o endpoint padrão sem erro; com `NFSE_SOAP_URL=https://...` usa o valor configurado.

---

### EFIWH-03 — Cobertura de testes do webhook /pix

**Contexto:** Com a correção do sufixo, os testes de webhook devem cobrir o endpoint `/pix` explicitamente.

**Requisito:** Testes existentes do webhook EFI devem validar que o endpoint `/webhook/payment/pix` processa o payload `pix[]` e que `getWebhookUrl()` retorna a URL com sufixo `/pix`.

**Critério:** `npm run test` passa; `grep '/pix'` encontra ao menos um `it()`/`describe()` nos specs de webhook.
