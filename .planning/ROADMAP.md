# Roadmap - Sistema de Orcamento BomCusto

Version: 1.4
Date: 2026-05-04

---

## Milestones

- [x] v1.0 MVP - Phases 1-5 (shipped 2026-05-02)
- [x] v1.1 Aprovacao Athos - Phase 6 (shipped 2026-05-03)
- [x] v1.2 Mensagens e UX do Cliente - Phases 7-8 (shipped 2026-05-03)
- [x] v1.3 Estabilidade de Migrations no Docker Compose - Phases 9-10 (shipped 2026-05-03)
- [ ] v1.4 Pagamento EFI/Athos + desconto na NFS-e - Phases 11-14

---

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-05-02</summary>

Full details: .planning/milestones/v1.0-ROADMAP.md

- [x] Phase 1: Seguranca e Autenticacao
- [x] Phase 2: Confiabilidade de Integracoes
- [x] Phase 3: Correcoes de Fluxo e Qualidade de Dados
- [x] Phase 4: Testes e CI
- [x] Phase 5: UX do Painel e Area do Cliente

</details>

<details>
<summary>v1.1 Aprovacao Athos (Phase 6) - SHIPPED 2026-05-03</summary>

Full details: .planning/milestones/v1.1-ROADMAP.md

- [x] Phase 6: Aprovacao de Orcamento pelo Cliente com Associacao Athos (4 planos)

</details>

<details>
<summary>v1.2 Mensagens e UX do Cliente (Phases 7-8) - SHIPPED 2026-05-03</summary>

Full details: .planning/milestones/v1.2-ROADMAP.md

- [x] Phase 7: Mensagens Automaticas ao Cliente via Chatwoot (2 planos)
- [x] Phase 8: UX das Paginas Publicas do Cliente (2 planos)

</details>

<details>
<summary>v1.3 Estabilidade de Migrations no Docker Compose (Phases 9-10) - SHIPPED 2026-05-03</summary>

Full details: .planning/milestones/v1.3-ROADMAP.md

- [x] Phase 9: Fluxo de Migration Idempotente (2 planos)
- [x] Phase 10: Operacao Segura de Update (2 planos)

</details>

## v1.4 Planned (Phases 11-14)

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 11 | Webhook EFI sem assinatura obrigatoria | Receber notificacoes EFI sem bloqueio por HMAC mantendo resiliencia e auditoria | EFIW-01, EFIW-02, EFIW-03 | 4 |
| 12 | Conciliacao Athos no backend | Implementar consulta real de pagamento no Athos e sincronizar status no dominio | ATHP-01, ATHP-02, ATHP-03 | 4 |
| 13 | Gatilhos de checagem e observabilidade | Executar checagem no abrir/enviar orcamento e expor diagnostico confiavel | PCHK-01, PCHK-02, PCHK-03, OBSV-01, OBSV-02 | 5 |
| 14 | Desconto controlado na emissao de NFS-e | Permitir desconto por percentual/valor com flag de ativacao e base no total pago | NFSD-01, NFSD-02, NFSD-03, NFSD-04, NFSD-05 | 5 |

### Phase Details

**Phase 11: Webhook EFI sem assinatura obrigatoria**
Goal: Permitir recebimento de webhook EFI mesmo sem assinatura, sem reintroduzir fragilidade operacional.
Requirements: EFIW-01, EFIW-02, EFIW-03
Success criteria:
1. Endpoints de webhook EFI aceitam payload sem `x-signature`/`x-gn-signature`.
2. Fluxo de idempotencia evita duplicidade de processamento por `eventId`/`txid`.
3. Persistencia em `PaymentTransaction` mantem rastreabilidade de cada evento recebido.
4. Testes de webhook cobrem cenarios com e sem assinatura.

**Phase 12: Conciliacao Athos no backend**
Goal: Trocar stub de pagamento por consulta real ao Athos e refletir confirmacao no estado do orcamento.
Requirements: ATHP-01, ATHP-02, ATHP-03
Success criteria:
1. `AthosService.verificarPagamentoPorOrcamento` consulta tabelas reais e retorna `paid`, `valor` e `idVenda`.
2. Resultado usa `vendaId` quando informado e fallback por `orcamentoId` quando necessario.
3. Fluxo de sincronizacao atualiza status para APROVADO quando pagamento confirmado e transicao permitida.
4. Falhas de conexao/consulta Athos retornam diagnostico controlado sem quebrar endpoint.

**Phase 13: Gatilhos de checagem e observabilidade**
Goal: Garantir que consulta de pagamento rode nos pontos de uso do orcamento e com visibilidade operacional.
Requirements: PCHK-01, PCHK-02, PCHK-03, OBSV-01, OBSV-02
Success criteria:
1. `GET /quotes/:id` dispara checagem de pagamento com protecao contra chamadas excessivas.
2. `POST /quotes/:id/enviar` dispara checagem antes/apos envio sem bloquear operacao em caso de erro Athos.
3. `GET /quotes/:id/payment-status` retorna conciliacao completa com `statusSync` coerente.
4. Logs estruturados registram tentativa, resultado e motivo de falha da conciliacao.
5. Testes cobrem cenarios pago, nao pago e erro de consulta Athos.

**Phase 14: Desconto controlado na emissao de NFS-e**
Goal: Emitir NFS-e com desconto opcional, seguro e auditavel, usando total pago como base quando informado.
Requirements: NFSD-01, NFSD-02, NFSD-03, NFSD-04, NFSD-05
Success criteria:
1. Endpoint de emissao NFS-e aceita `aplicarDesconto` e tipo de desconto (`PERCENTUAL` ou `VALOR`).
2. Quando tipo for percentual, sistema calcula desconto com base no `totalPagoInformado`.
3. Quando tipo for valor, sistema aplica valor fixo respeitando limite da base.
4. Validacoes impedem valores invalidos e retornam erro explicito para o usuario.
5. XML final preenche desconto coerente e mantem 0.00 quando flag de desconto estiver desligada.

## Backlog (Future)

- Relatorios e exportacao CSV de orcamentos
- Notificacoes em tempo real (WebSocket) para mudanca de status
- Refactor gradual de quotes.service.ts
- Migrar PDF de Puppeteer para Gotenberg
- Redis para cache do token EFI
- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- Templates de mensagem configuraveis pelo painel
- Historico de mensagens enviados ao cliente

---
Roadmap v1.4 - 2026-05-04
