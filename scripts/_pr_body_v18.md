## v1.8 - Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos

### Resumo
Garante que aprovacao/producao so ocorra para orcamentos com associacao Athos valida e pagamento confirmado. Implementa conciliacao via `relacao_orcamento_venda` ao abrir o orcamento.

### Mudancas principais
- **Guard EM_PRODUCAO**: bloqueia transicao sem `isAssociated=true` + (`approved` ou `saleExternalId`)
- **Fallback Athos**: detecta associacao via `idcliente > 0` quando aprovado por link
- **AthosService.buscarRelacaoOrcamentoVenda**: consulta `relacao_orcamento_venda` no pool Athos read-only
- **conciliarViaCaixaAthos**: fire-and-forget em `getById`, persiste `saleExternalId` de forma idempotente
- **Badge pagamento**: exibe `Pago no Caixa - Venda #N` na pagina publica quando `saleExternalId` presente
- **Notificacao Chatwoot**: enviada ao confirmar pagamento via caixa com numero da venda
- **Mensagens ASCII**: sem acentos para evitar encoding issues

### Requirements cobertos
APR-01, APR-02, APR-03, ATHC-01, ATHC-02, ATHC-03, TRG-01, TRG-02, TRG-03, TXT-01, TXT-02

### Testes
- 30/30 testes Jest passando
- UAT: 6/6 pass, 0 issues

### Stats
- 14 arquivos alterados, 1025 insercoes, 39 remocoes
- Tag: `v1.8`
