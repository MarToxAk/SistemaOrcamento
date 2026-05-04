# Roadmap - Sistema de Orcamento BomCusto

Version: 1.4
Date: 2026-05-04

---

## Milestones

- [x] v1.0 MVP - Phases 1-5 (shipped 2026-05-02)
- [x] v1.1 Aprovacao Athos - Phase 6 (shipped 2026-05-03)
- [x] v1.2 Mensagens e UX do Cliente - Phases 7-8 (shipped 2026-05-03)
- [x] v1.3 Estabilidade de Migrations no Docker Compose - Phases 9-10 (shipped 2026-05-03)
- [x] v1.4 Pagamento EFI/Athos + desconto na NFS-e - Phases 11-14 (shipped 2026-05-04)
- [x] v1.4 Pagamento EFI/Athos + desconto na NFS-e - Phases 11-14 (shipped 2026-05-04)
- [ ] v1.5 Correcao NFS-e — Encoding + UI de desconto - Phases 15-16

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

## v1.4 Pagamento EFI/Athos + Desconto NFS-e (Phases 11-14) - SHIPPED 2026-05-04
## v1.5 Correcao NFS-e — Encoding + UI de Desconto (Phases 15-16) - IN PROGRESS

- [ ] Phase 15: Corrigir encoding NFS-e e proxy API (NFSFIX-01, NFSFIX-02)
- [ ] Phase 16: UI de desconto no modal de emissão NFS-e (NFSFIX-03)

### Phase Details

**Phase 15: Corrigir encoding NFS-e e proxy API**
Goal: Corrigir os dois bugs técnicos que silenciosamente corrompem dados na emissão de NFS-e — mojibake nas descrições de serviço e perda de body no proxy Next.js.
Requirements: NFSFIX-01, NFSFIX-02
Success criteria:
1. Descrições de serviço em `nfse.service.ts` exibem caracteres corretos (ç, ã, á, etc.)
2. POST `/api/quotes/[id]/nfse` repassa o body completo ao backend
3. Arquivo `nfse.service.ts` salvo como UTF-8

**Phase 16: UI de desconto no modal NFS-e**
Goal: Adicionar switch e três campos bidirecionais de desconto ao modal de emissão NFS-e, conectando ao backend que já suporta os campos.
Requirements: NFSFIX-03
Success criteria:
1. Modal tem switch "Aplicar desconto" que habilita seção de desconto
2. Três campos (% desconto, R$ desconto, Valor total) atualizam-se mutuamente ao digitar
3. `handleEmitirNfse` envia `descontoAtivo`, `descontoPorcentagem`, `descontoValor` ao backend
4. Desconto aparece corretamente no XML enviado à prefeitura (via backend existente)


Full details: .planning/milestones/v1.4-ROADMAP.md

- [x] Phase 11: Webhook EFI sem assinatura obrigatoria (3 reqs)
- [x] Phase 12: Conciliacao Athos no backend (3 reqs)
- [x] Phase 13: Gatilhos de checagem e sincronizacao de status (5 reqs)
- [x] Phase 14: Desconto controlado na emissao de NFS-e (5 reqs)

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
