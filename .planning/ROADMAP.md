# Roadmap - Sistema de Orcamento BomCusto

Version: 1.8
Date: 2026-05-04

---

## Milestones

- [x] v1.0 MVP - Phases 1-5 (shipped 2026-05-02)
- [x] v1.1 Aprovacao Athos - Phase 6 (shipped 2026-05-03)
- [x] v1.2 Mensagens e UX do Cliente - Phases 7-8 (shipped 2026-05-03)
- [x] v1.3 Estabilidade de Migrations no Docker Compose - Phases 9-10 (shipped 2026-05-03)
- [x] v1.4 Pagamento EFI/Athos + desconto na NFS-e - Phases 11-14 (shipped 2026-05-04)
- [x] v1.5 Correcao NFS-e â€” Encoding + UI de desconto - Phases 15-16 (shipped 2026-05-04)
- [x] v1.6 Correcao NFS-e â€” Calculo de Desconto e Valor Final - Phase 17 (shipped 2026-05-04) â€” [details](.planning/milestones/v1.6-ROADMAP.md)
- [x] v1.7 Correcoes NFS-e — Tomador e Numeracao RPS - Phase 18 (shipped 2026-05-04) — [details](.planning/milestones/v1.7-ROADMAP.md)
- [ ] v1.8 Busca de Cliente Athos para NFS-e - Phases 19-21 (in progress)

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

## v1.5 Correcao NFS-e â€” Encoding + UI de Desconto (Phases 15-16) - SHIPPED 2026-05-04

Full details: .planning/milestones/v1.5-ROADMAP.md

- [x] Phase 15: Corrigir encoding NFS-e e proxy API (NFSFIX-01, NFSFIX-02)
- [x] Phase 16: UI de desconto no modal de emissao NFS-e (NFSFIX-03)

## v1.6 Correcao NFS-e â€” Calculo de Desconto e Valor Final (Phase 17) - SHIPPED 2026-05-04

Full details: .planning/milestones/v1.6-ROADMAP.md

- [x] Phase 17: Correcao do calculo de desconto no modal NFS-e (NFSC-01..05)

## v1.7 Correcoes NFS-e — Tomador e Numeracao RPS (Phase 18) - SHIPPED 2026-05-04

Full details: .planning/milestones/v1.7-ROADMAP.md

- [x] Phase 18: Correcoes NFS-e RPS e Tomador (RPS-01, RPS-02, TOM-01, TOM-02, TOM-03, REG-01, REG-02)

## v1.8 Busca de Cliente Athos para NFS-e (Phases 19-21) - IN PROGRESS

Scope: implementar busca de cliente no Athos para uso na emissao de NFS-e, com selecao no frontend e resolucao consistente de tomador no backend.

- [x] Phase 19: API de busca de cliente Athos (ATHCL-01, ATHCL-02, ATHCL-03)
- [x] Phase 20: Resolucao de tomador por cliente selecionado (TOMAD-01, TOMAD-02, TOMAD-03, TOMAD-04)
- [ ] Phase 21: UI NFS-e, observabilidade e testes (NFUI-01, NFUI-02, NFUI-03, QUAL-01, QUAL-02, QUAL-03)

### Phase Details

Phase 19: API de busca de cliente Athos
Goal: disponibilizar endpoint interno para pesquisa de cliente no Athos com filtros por nome/documento/id.
Requirements: ATHCL-01, ATHCL-02, ATHCL-03
Success criteria:
1. Endpoint retorna lista paginada com idcliente, nome exibicao, documento e tipo de pessoa.
2. Filtros por nome, CPF/CNPJ e idcliente funcionam de forma combinada e previsivel.
3. Consultas invalidas ou muito amplas retornam erro de validacao claro.

Phase 20: Resolucao de tomador por cliente selecionado
**Plans:** 1 plano
- [ ] 20-01-PLAN.md — clienteAthosId em EmitirNfseInput + resolucao prioritaria + validacoes TOMAD-04
Goal: usar cliente Athos explicitamente selecionado para montar tomador completo no XML NFS-e.
Requirements: TOMAD-01, TOMAD-02, TOMAD-03, TOMAD-04
Success criteria:
1. Emissao aceita clienteAthosId no payload sem quebrar compatibilidade com fluxo atual.
2. Backend resolve CPF/CNPJ e razao/nome a partir de cliente_fisico/cliente_juridico com fallback definido.
3. Endereco e selecionado por regra deterministica e validado antes da emissao.
4. Falta de dados obrigatorios bloqueia emissao com mensagem acionavel.

Phase 21: UI NFS-e, observabilidade e testes
**Plans:** 2 planos
- [ ] 21-01-PLAN.md — Frontend: rota proxy Athos + busca/selecao de cliente no modal NFS-e (NFUI-01, NFUI-02, NFUI-03, QUAL-03)
- [ ] 21-02-PLAN.md — Backend: logs estruturados + teste unitario PF (QUAL-01, QUAL-02)
Goal: permitir selecao de cliente na interface e garantir confiabilidade operacional da feature.
Requirements: NFUI-01, NFUI-02, NFUI-03, QUAL-01, QUAL-02, QUAL-03
Success criteria:
1. Modal/pagina de emissao permite pesquisar cliente e confirmar selecao.
2. Preview do tomador mostra dados usados antes do envio.
3. Logs estruturados permitem rastrear cliente selecionado, fallback e erros de dados.
4. Testes automatizados cobrem cenarios PF/PJ e falhas principais.

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
Roadmap v1.8 - 2026-05-04


