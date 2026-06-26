# Requirements: Sistema de Orcamento BomCusto — v2.4

**Defined:** 2026-06-25
**Core Value:** Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.
**Milestone:** v2.4 — Defaults Inteligentes no Cadastro de Produto

## v1 Requirements (Milestone v2.4)

Backend/API apenas (sem frontend). Continuacao do v2.2 — escrita liberada APENAS na tabela `produto`.

### Descoberta de Defaults (moda)

- [ ] **DEFD-01**: O sistema calcula a moda (valor mais comum) de cada campo configuravel a partir dos produtos ativos ja existentes no Athos
- [ ] **DEFD-02**: O calculo da moda ignora valores nulos/vazios, considerando apenas produtos que tem o campo preenchido
- [ ] **DEFD-03**: O resultado da moda e reaproveitado (cache) entre criacoes para nao recalcular a cada insert
- [ ] **DEFD-04**: Quando nao ha amostra suficiente para um campo, o sistema usa fallback seguro e nunca quebra o cadastro

### Defaults Operacionais

- [ ] **DOPR-01**: Produto criado nasce ativo e vendavel por padrao (`statusproduto` e `vendeproduto`) quando o operador nao informa
- [ ] **DOPR-02**: `controlaestoque` e `baixarestoque` recebem default sensato quando nao informados

### Defaults Fiscais (ICMS / NF-e)

- [ ] **DFIS-01**: Campos de ICMS (`icms`, `icmsnfe`) sao preenchidos com a moda quando nao informados
- [ ] **DFIS-02**: Campos de tributacao/CSOSN/origem (`tributacao`/`tributacaonfe`, `codigocsosn`/`codigocsosnnfe`, `origem`/`origemnfe`) sao preenchidos com a moda quando nao informados
- [ ] **DFIS-03**: Campos PIS/COFINS (`piscst`/`cofinscst`), `tipoitem`, `idcfopsaida` e `ncm` sao preenchidos com a moda quando aplicavel e nao informados

### Override e Seguranca

- [ ] **OVRD-01**: Qualquer valor enviado no DTO de criacao sempre prevalece sobre o default
- [ ] **OVRD-02**: Defaults sao aplicados apenas na criacao; a edicao de produto nunca forca defaults sobre campos ja existentes
- [ ] **OVRD-03**: A escrita permanece restrita a tabela `produto`; nenhum outro comportamento do Athos e alterado (trigger/rules/FKs respeitados)

### Observabilidade

- [ ] **OBSV-01**: O sistema registra em log quais campos receberam default e qual valor foi aplicado em cada cadastro

## v2 Requirements (Deferidos)

### Visibilidade dos Defaults

- **DEFV-01**: Endpoint de "preview" que retorna os defaults que seriam aplicados sem criar o produto (dry-run)
- **DEFV-02**: Tela/UI para revisar e ajustar os defaults calculados

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend/tela de cadastro de produto | v2.4 e API-only, mesma decisao do v2.2 (API-only foi suficiente) |
| Escrita em tabelas do Athos alem de `produto` | Restricao de seguranca herdada do v2.2 |
| Defaults configuraveis por env var | Decisao do usuario: defaults vem da moda do banco (1a), nao de env vars |
| Recalculo/atualizacao retroativa de produtos ja cadastrados | Milestone foca na criacao, nao em corrigir o legado |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEFD-01 | Phase 37 | Pending |
| DEFD-02 | Phase 37 | Pending |
| DEFD-03 | Phase 37 | Pending |
| DEFD-04 | Phase 37 | Pending |
| DOPR-01 | Phase 38 | Pending |
| DOPR-02 | Phase 38 | Pending |
| DFIS-01 | Phase 38 | Pending |
| DFIS-02 | Phase 38 | Pending |
| DFIS-03 | Phase 38 | Pending |
| OVRD-01 | Phase 38 | Pending |
| OVRD-02 | Phase 38 | Pending |
| OVRD-03 | Phase 38 | Pending |
| OBSV-01 | Phase 38 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-26 — traceability preenchida (roadmap v2.4 criado)*
