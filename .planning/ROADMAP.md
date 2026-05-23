# Roadmap - Sistema de Orcamento BomCusto

Version: 1.9
Date: 2026-05-05

---

## Milestones

- [x] v1.0 MVP - Phases 1-5 (shipped 2026-05-02)
- [x] v1.1 Aprovacao Athos - Phase 6 (shipped 2026-05-03)
- [x] v1.2 Mensagens e UX do Cliente - Phases 7-8 (shipped 2026-05-03)
- [x] v1.3 Estabilidade de Migrations no Docker Compose - Phases 9-10 (shipped 2026-05-03)
- [x] v1.4 Pagamento EFI/Athos + desconto na NFS-e - Phases 11-14 (shipped 2026-05-04)
- [x] v1.5 Correcao NFS-e — Encoding + UI de desconto - Phases 15-16 (shipped 2026-05-04)
- [x] v1.6 Correcao NFS-e — Calculo de Desconto e Valor Final - Phase 17 (shipped 2026-05-04) — [details](.planning/milestones/v1.6-ROADMAP.md)
- [x] v1.7 Correcoes NFS-e — Tomador e Numeracao RPS - Phase 18 (shipped 2026-05-04) — [details](.planning/milestones/v1.7-ROADMAP.md)
- [x] v1.8 Busca de Cliente Athos para NFS-e - Phases 19-21 (shipped 2026-05-05) - [details](.planning/milestones/v1.8-ROADMAP.md)
- [x] v1.9 Webhook EFI PIX e Robustez de URLs - Phase 22 (shipped 2026-05-15)
- [x] v2.0 Gestão Integrada Financeira, Caixa e Dashboards - Phases 23-27 (shipped 2026-05-22)
- [ ] v2.1 Cobrança e Fiscal do Cliente - Phases 28-31 (active)

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

## v1.5 Correcao NFS-e — Encoding + UI de Desconto (Phases 15-16) - SHIPPED 2026-05-04

Full details: .planning/milestones/v1.5-ROADMAP.md

- [x] Phase 15: Corrigir encoding NFS-e e proxy API (NFSFIX-01, NFSFIX-02)
- [x] Phase 16: UI de desconto no modal de emissao NFS-e (NFSFIX-03)

## v1.6 Correcao NFS-e — Calculo de Desconto e Valor Final (Phase 17) - SHIPPED 2026-05-04

Full details: .planning/milestones/v1.6-ROADMAP.md

- [x] Phase 17: Correcao do calculo de desconto no modal NFS-e (NFSC-01..05)

## v1.7 Correcoes NFS-e — Tomador e Numeracao RPS (Phase 18) - SHIPPED 2026-05-04

Full details: .planning/milestones/v1.7-ROADMAP.md

- [x] Phase 18: Correcoes NFS-e RPS e Tomador (RPS-01, RPS-02, TOM-01, TOM-02, TOM-03, REG-01, REG-02)

## v1.8 Busca de Cliente Athos para NFS-e (Phases 19-21) - SHIPPED 2026-05-05

Full details: .planning/milestones/v1.8-ROADMAP.md

- [x] Phase 19: API de busca de cliente Athos (ATHCL-01, ATHCL-02, ATHCL-03)
- [x] Phase 20: Resolucao de tomador por cliente selecionado (TOMAD-01, TOMAD-02, TOMAD-03, TOMAD-04)
- [x] Phase 21: UI NFS-e, observabilidade e testes (NFUI-01, NFUI-02, NFUI-03, QUAL-01, QUAL-02, QUAL-03)

## v1.9 Webhook EFI PIX e Robustez de URLs (Phase 22) - SHIPPED 2026-05-15

### Phase 22: Correcao webhook EFI /pix e fallback NfseService

**Goal:** Garantir que webhooks EFI PIX cheguem ao endpoint correto (/webhook/payment/pix) e que NfseService nao quebre quando NFSE_SOAP_URL esta definida como string vazia.

**Requirements:** EFIWH-01, EFIWH-02, EFIWH-03

**Plans:** 2/2 complete

Plans:
- [x] 22-01-PLAN.md — Corrigir getWebhookUrl() e fallback NfseService (wave 1) — complete
- [x] 22-02-PLAN.md — Testes unitarios de getWebhookUrl() (wave 2) — complete

**Success criteria:**
1. getWebhookUrl() retorna URL terminada em /webhook/payment/pix.
2. Com NFSE_SOAP_URL= vazio, NfseService usa endpoint padrao sem erro ENOENT.
3. Spec de efi.service inclui teste cobrindo a URL com /pix.
4. Build backend sem erros apos as correcoes.

<details>
<summary>v2.0 Gestão Integrada Financeira, Caixa e Dashboards (Phases 23-27) - SHIPPED 2026-05-22</summary>

Full details: .planning/milestones/v2.0-ROADMAP.md

- [x] Phase 23: Notificação de Caixa Interna — Hardening AthosListenerService (CAIXA-01..04)
- [x] Phase 24: API Contas a Pagar — Endpoint POST e autenticação obrigatória (CPAG-01..04)
- [x] Phase 25: Upload de Anexos — Gravação SMB \\192.168.3.203 e registro tabela `anexo` (ANEX-01..03)
- [x] Phase 26: Status Página Produção — Layout Kanban 3 colunas
- [x] Phase 27: Dashboard de Contas a Receber — Read-Only (CR-01..05)

</details>

---

## v2.1 Cobrança e Fiscal do Cliente (Phases 28-31) - ACTIVE

**Milestone goal:** A partir do dashboard de contas a receber, permitir ao operador acessar o detalhe de um cliente, selecionar títulos em aberto e tomar ações de cobrança (boleto consolidado EFI Bank ou NFS-e com valor ajustável), registrando tudo no banco próprio do sistema.

### Phases

- [x] **Phase 28: Página de Detalhe do Cliente + Schema Prisma** - Rota /contas-receber/[idcliente] com dados Athos, lista de títulos selecionáveis e migrations para cobranca_boleto e nfse_emitida — DONE 2026-05-22
- [~] **Phase 29: Boleto Consolidado via EFI Bank** - Plans 01+02 completos (backend + frontend modal); aguardando checkpoint de verificacao humana — IN PROGRESS
- [ ] **Phase 30: Emissão de NFS-e a partir de Títulos** - Modal pré-preenchido com valor ajustável, emissão via NfseService existente e registro em nfse_emitida
- [ ] **Phase 31: Histórico NFS-e + Consulta NF Athos** - Seção de NFS-e emitidas na página do cliente e consulta de notas fiscais Athos com busca por número

### Phase Details

### Phase 28: Página de Detalhe do Cliente + Schema Prisma
**Goal**: Operador acessa dados completos de um cliente e seus títulos em aberto a partir do dashboard, com a estrutura de banco de dados pronta para cobrança e NFS-e
**Depends on**: Phase 27 (dashboard /contas-receber existente)
**Requirements**: CLI-01, CLI-02, CLI-03
**Plans**: 2 plans

Plans:
- [x] 28-01-PLAN.md — Backend: buscarDadosClienteContasReceber + rota dados cadastrais + Prisma schema 4 modelos + migration (wave 1) — DONE 2026-05-22
- [x] 28-02-PLAN.md — Frontend: modificar /contas-receber + proxy Route Handler + página /contas-receber/[idcliente] (wave 2) — DONE 2026-05-22

**Success Criteria** (what must be TRUE):
  1. Clicar em um cliente em /contas-receber navega para /contas-receber/[idcliente] exibindo nome, telefone, email e limite de crédito do cliente via Athos
  2. A página lista todos os títulos AVC + VEN do cliente em tabela com checkbox individual, numerotitulo, datavencimento, valor e status
  3. Checkbox "Selecionar todos" na thead e contador de valor total selecionado atualizado em tempo real
  4. Barra de ações com "Gerar Boleto" e "Emitir NFS-e" aparece somente quando ao menos um título está selecionado
  5. Migration Prisma cria tabelas cobranca_boleto e nfse_emitida sem conflito com schema existente
**UI hint**: yes

### Phase 29: Boleto Consolidado via EFI Bank
**Goal**: Operador gera um único boleto consolidando múltiplos títulos selecionados, obtém link do boleto (PDF) e linha digitável bancária, e a cobrança fica registrada no banco
**Depends on**: Phase 28 (página de detalhe + tabela cobranca_boleto disponível)
**Requirements**: BOL-01, BOL-02, BOL-03
**Success Criteria** (what must be TRUE):
  1. POST /api/cobranca/boleto com array de idcontareceber cria cobrança EFI com valor igual à soma dos títulos e retorna txid
  2. Modal exibe linkBoleto (botão Abrir Boleto em nova aba) e barcodeLinhaDigitavel copiável
  3. Registro criado em cobranca_boleto com txid EFI, idcliente Athos, lista de idcontareceber, valor e data de geração
  4. Status do registro em cobranca_boleto atualizado para pago via webhook EFI existente quando boleto for liquidado
**Plans**: 2 plans

Plans:
- [x] 29-01-PLAN.md — Backend: CobrancaModule + CobrancaService.criarBoleto() + CobrancaController + registro no AppModule (wave 1) — DONE 2026-05-22
- [x] 29-02-PLAN.md — Frontend: Route Handler /api/cobranca/boleto + modal 4 estados em /contas-receber/[idcliente] (wave 2) — DONE 2026-05-22 (checkpoint pendente)

### Phase 30: Emissão de NFS-e a partir de Títulos
**Goal**: Operador emite NFS-e com valor ajustável diretamente a partir de títulos selecionados, reutilizando o NfseService existente, e o registro fica persistido no banco próprio
**Depends on**: Phase 28 (tabela nfse_emitida disponível + página de detalhe com ação)
**Requirements**: NFR-01, NFR-02, NFR-03, NFR-04
**Success Criteria** (what must be TRUE):
  1. Modal de NFS-e abre pré-preenchido com soma dos títulos e dados do cliente carregados via buscarClientePorId do Athos
  2. Campo de valor é editável (mínimo R$0,01) e o valor enviado ao backend é o que o operador confirmar, não o calculado
  3. NfseService.emitirNfse() chamado com tomador resolvido por clienteAthosId, RPS gerado sem conflito de numeração com orçamentos existentes
  4. Resposta inclui número da NFS-e emitida e registro criado em nfse_emitida com numeroNfse, numeroRps, idclienteAthos, valorServico e idcontareceber[] vinculados
**Plans**: 4 plans

Plans:
- [ ] 30-01-PLAN.md — Wave 1: Schema Prisma idvenda + migration + NfseService.emitirParaContaReceber() + AthosService.verificarTipoProdutoVenda() + GET /athos/venda/:idvenda/tipo-produto
- [ ] 30-02-PLAN.md — Wave 2: CobrancaService.emitirNfse() + CobrancaController POST /cobranca/nfse + EmitirNfseCobrancaDto + CobrancaModule com NfseModule
- [ ] 30-03-PLAN.md — Wave 3: Route Handlers Next.js + Modal NFS-e 4-estados em /contas-receber/[idcliente] (checkpoint humano)
- [ ] 30-04-PLAN.md — Wave 2 paralelo: NfseService.emitir() salva idvenda + aviso duplicidade em /orcamento/[id]
**UI hint**: yes

### Phase 31: Histórico NFS-e + Consulta NF Athos
**Goal**: Operador consulta NFS-e já emitidas para o cliente (banco próprio) e notas fiscais não-serviço registradas no Athos, com busca por número
**Depends on**: Phase 28 (página de detalhe do cliente) + Phase 30 (dados em nfse_emitida)
**Requirements**: NFR-05, NFAT-01, NFAT-02
**Success Criteria** (what must be TRUE):
  1. Seção "NFS-e Emitidas" na página do cliente lista data, número NFS-e, valor e títulos vinculados lidos do banco próprio (Prisma), exibindo mensagem "Nenhuma NFS-e emitida para este cliente" quando não há registros
  2. Seção "Notas Fiscais Athos" lista notas fiscais (não-serviço) do cliente buscadas no Athos (número, data, valor, tipo), limitada a 50 registros
  3. Campo de busca por número filtra a lista NFAT executando query no Athos, exibindo "Nenhuma nota encontrada com este número" quando sem resultado
**Plans**: TBD
**UI hint**: yes

### Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 28. Página de Detalhe do Cliente + Schema Prisma | 2/2 | Complete | 2026-05-22 |
| 29. Boleto Consolidado via EFI Bank | 1/2 | In Progress | - |
| 30. Emissão de NFS-e a partir de Títulos | 0/? | Not started | - |
| 31. Histórico NFS-e + Consulta NF Athos | 0/? | Not started | - |

### Coverage

All 13 v2.1 requirements mapped:

| REQ-ID | Phase | Category |
|--------|-------|----------|
| CLI-01 | 28 | Detalhe do Cliente |
| CLI-02 | 28 | Detalhe do Cliente |
| CLI-03 | 28 | Detalhe do Cliente |
| BOL-01 | 29 | Boleto EFI |
| BOL-02 | 29 | Boleto EFI |
| BOL-03 | 29 | Boleto EFI |
| NFR-01 | 30 | NFS-e de Títulos |
| NFR-02 | 30 | NFS-e de Títulos |
| NFR-03 | 30 | NFS-e de Títulos |
| NFR-04 | 30 | NFS-e de Títulos |
| NFR-05 | 31 | Histórico + Consulta |
| NFAT-01 | 31 | Histórico + Consulta |
| NFAT-02 | 31 | Histórico + Consulta |

---
## Backlog (Future)

- Relatorios e exportacao CSV de orcamentos
- Notificacoes em tempo real via SSE para dashboard contas a receber (tg_alterarcontareceber AFTER + NOTIFY)
- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- Templates de mensagem configuraveis pelo painel
- Historico de mensagens enviados ao cliente
- Envio automatico de boleto por WhatsApp/Chatwoot ao cliente
- Cancelamento de NFS-e emitida
- Relatorio de NFS-e emitidas por periodo (CSV export)

---
Roadmap v2.1 - 2026-05-22
