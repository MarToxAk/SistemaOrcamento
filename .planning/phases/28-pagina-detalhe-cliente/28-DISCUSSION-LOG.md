# Phase 28: Discussion Log

**Date:** 2026-05-22

---

## Areas Discussed

### 1. Navegação do card em /contas-receber

**Question:** O accordion inline permanece ou o card navega para a página de detalhe?

**Options presented:**
- 1a. Manter accordion + botão "Ver Detalhe" separado
- 1b. Substituir accordion — clicar no nome navega para detalhe
- 1c. Clique em qualquer parte do card navega

**Decision:** 1b — Accordion inline removido. Botão "Ver Detalhe" no rodapé do card substituindo "Títulos".

---

### 2. Nomenclatura dos modelos Prisma

**Question:** Inglês (padrão atual) ou português para os novos modelos?

**Options presented:**
- 2a. Inglês com @@map: `BillingCharge` / `IssuedInvoice`
- 2b. Português direto: `CobrancaBoleto` / `NfseEmitida`

**Decision:** 2b — Português direto, sem @@map.

---

### 3. Armazenamento de idcontareceber[]

**Question:** JSON field ou junction table?

**Options presented:**
- 3a. Campo Json simples
- 3b. Junction tables separadas

**Decision:** 3b — Junction tables: `CobrancaBoletoTitulo` e `NfseEmitidaTitulo`.

---

## Decisions Made by Claude (Discretion)

- Barra de ações: sticky bottom (flutuante) quando seleção ativa
- Badge AVC/VEN na tabela: mesmas cores dos filtros da página principal
- Botões "Gerar Boleto" / "Emitir NFS-e" presentes mas sem onClick em Phase 28 (TODO para Phases 29-30)
- `await params` obrigatório em Route Handlers (lição da Fase 27)
- Query de dados cadastrais reutiliza padrão de `buscarClientePorId()`

## Deferred Ideas

- Implementação real dos botões → Phases 29 e 30
- Histórico NFS-e + NF Athos → Phase 31
- Paginação da tabela de títulos
