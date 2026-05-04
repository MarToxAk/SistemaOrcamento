# Requirements: Sistema de Orcamento BomCusto

**Defined:** 2026-05-04
**Core Value:** Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## v1.4 Requirements

Requirements para o milestone v1.4 (pagamentos EFI/Athos sem n8n).

### Webhook EFI

- [ ] **EFIW-01**: Endpoint de webhook EFI aceita notificacao sem exigir assinatura HMAC obrigatoria
- [ ] **EFIW-02**: Webhook continua com protecoes de resiliencia (throttle, idempotencia por eventId/txid)
- [ ] **EFIW-03**: Eventos de pagamento recebidos sao persistidos com metadados suficientes para auditoria

### Conciliacao Athos

- [ ] **ATHP-01**: Implementar `verificarPagamentoPorOrcamento` no AthosService com consulta real ao Athos
- [ ] **ATHP-02**: Checagem de pagamento via Athos considera `orcamentoId` e `vendaId` quando disponivel
- [ ] **ATHP-03**: Quando pagamento confirmado no Athos, status do orcamento e atualizado automaticamente no fluxo permitido

### Gatilhos de Verificacao

- [ ] **PCHK-01**: Ao abrir detalhe de orcamento, sistema dispara checagem de pagamento no Athos
- [ ] **PCHK-02**: Ao enviar orcamento para cliente, sistema dispara checagem de pagamento no Athos
- [ ] **PCHK-03**: Endpoint de status de pagamento retorna dados de conciliacao e resultado de sincronizacao de status

### Operacao e Observabilidade

- [ ] **OBSV-01**: Logs estruturados registram resultado de cada tentativa de conciliacao (sucesso, nao pago, erro)
- [ ] **OBSV-02**: Falhas de leitura no Athos nao derrubam o fluxo principal de orcamentos (degradacao graciosa)

## v2 Requirements

### Melhoria futura

- **POLL-01**: Implementar rotina de reconciliacao periodica em background para reduzir checagens por request
- **POLL-02**: Dashboard de divergencia entre status local e status Athos

## Out of Scope

| Feature | Reason |
|---------|--------|
| Envio para n8n | Requisito explicito: processamento deve ocorrer no backend da aplicacao |
| Bridge externa com LISTEN/NOTIFY | Aumenta dependencia operacional fora do backend principal |
| Reescrita completa do modulo de pagamentos | Escopo do milestone e conciliacao e webhook |
| Alterar gateway de pagamento | EFI permanece como provedor atual |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EFIW-01 | Phase 11 | Pending |
| EFIW-02 | Phase 11 | Pending |
| EFIW-03 | Phase 11 | Pending |
| ATHP-01 | Phase 12 | Pending |
| ATHP-02 | Phase 12 | Pending |
| ATHP-03 | Phase 12 | Pending |
| PCHK-01 | Phase 13 | Pending |
| PCHK-02 | Phase 13 | Pending |
| PCHK-03 | Phase 13 | Pending |
| OBSV-01 | Phase 13 | Pending |
| OBSV-02 | Phase 13 | Pending |

**Coverage:**
- v1.4 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-04 after milestone v1.4 definition*
