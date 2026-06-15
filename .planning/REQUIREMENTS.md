# Requirements: Sistema de Orcamento BomCusto — Milestone v2.2

**Defined:** 2026-06-15
**Milestone:** v2.2 — Gestão de Produtos do Athos (CRUD)
**Core Value:** Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## v1 Requirements

Requisitos do milestone v2.2. Cada um mapeia para uma fase do roadmap.

### Busca de Produtos (BPROD)

- [ ] **BPROD-01**: Operador pode buscar produtos por descrição (descricaoproduto/descricaocurta), parcial e sem diferenciar maiúsculas
- [ ] **BPROD-02**: Operador pode buscar produtos por código de barras (codigobarra1/codigobarra2)
- [ ] **BPROD-03**: Operador pode filtrar produtos por departamento, grupo e marca
- [ ] **BPROD-04**: Busca retorna a linha completa do produto (todos os campos) com paginação
- [ ] **BPROD-05**: Operador pode consultar um produto específico por idproduto

### Cadastro de Produto (CPROD)

- [ ] **CPROD-01**: Operador pode criar um novo produto informando os campos de cadastro
- [ ] **CPROD-02**: idproduto é gerado pelo Athos (serial/next id); datacadastro e idusuariocadastro preenchidos automaticamente
- [ ] **CPROD-03**: Criação dispara/respeita o trigger tg_alterarproduto e as rules atualizardatahora* (sem desabilitá-los)
- [ ] **CPROD-04**: Criação valida constraints (ex.: descontomaximo 0–100, FKs de departamento/grupo/marca) e retorna erro claro quando inválido

### Edição de Produto (EPROD)

- [ ] **EPROD-01**: Operador pode editar preços de venda (valorvenda1..6, promoção, atacado)
- [ ] **EPROD-02**: Operador pode editar informações de cadastro (descrição, NCM, unidade, referência, etc.)
- [ ] **EPROD-03**: dataultimaalteracao/idusuarioalteracao atualizados a cada edição
- [ ] **EPROD-04**: Edição persiste exclusivamente na tabela produto (nenhuma outra tabela do Athos é gravada)

### Desativação de Produto (DPROD)

- [ ] **DPROD-01**: Operador pode desativar um produto (statusproduto/vendeproduto = false) — sem DELETE físico
- [ ] **DPROD-02**: Operador pode reativar um produto desativado
- [ ] **DPROD-03**: Sistema nunca executa DELETE físico na tabela produto

### Integridade e Segurança (SPROD)

- [ ] **SPROD-01**: Escrita no Athos é permitida exclusivamente na tabela produto; demais tabelas permanecem read-only
- [ ] **SPROD-02**: Endpoints de produto exigem autenticação interna (x-internal-api-key), igual ao restante da API
- [ ] **SPROD-03**: Operações de escrita registradas em log estruturado (quem, quando, o quê)
- [ ] **SPROD-04**: Endpoints documentados no Swagger

### Frontend de Gestão (UPROD)

- [ ] **UPROD-01**: Tela de busca de produtos com filtros (descrição / código de barras / departamento-grupo-marca)
- [ ] **UPROD-02**: Formulário para criar produto
- [ ] **UPROD-03**: Tela para editar preço e cadastro de produto
- [ ] **UPROD-04**: Ação para desativar/reativar produto

## v2 Requirements

Reconhecidos, porém deferidos — não entram no roadmap atual.

### Produto Avançado

- **PADV-01**: Gestão de grade de produto (usagrade/utilizagrade)
- **PADV-02**: Gestão de produto composto e controle de série
- **PADV-03**: Importação/edição em massa de produtos

## Out of Scope

Exclusões explícitas para evitar scope creep.

| Feature | Reason |
|---------|--------|
| DELETE físico de produto | Decisão B (revisada): nunca apagar — preserva integridade referencial (venda_item etc.) e histórico |
| Escrita em qualquer outra tabela do Athos | Exceção controlada cobre apenas a tabela produto; resto permanece read-only |
| Gestão de grade/composição/série | Complexidade alta, não essencial para o CRUD básico de produto |
| Importação em massa de produtos | Fora do foco desta etapa; risco operacional alto |
| Sincronização reversa para o banco próprio (Prisma) | Produto vive no Athos; sem espelho local nesta etapa |

## Traceability

Quais fases cobrem quais requisitos. Preenchido durante a criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BPROD-01 | Phase 32 | Pending |
| BPROD-02 | Phase 32 | Pending |
| BPROD-03 | Phase 32 | Pending |
| BPROD-04 | Phase 32 | Pending |
| BPROD-05 | Phase 32 | Pending |
| CPROD-01 | Phase 33 | Pending |
| CPROD-02 | Phase 33 | Pending |
| CPROD-03 | Phase 33 | Pending |
| CPROD-04 | Phase 33 | Pending |
| EPROD-01 | Phase 33 | Pending |
| EPROD-02 | Phase 33 | Pending |
| EPROD-03 | Phase 33 | Pending |
| EPROD-04 | Phase 33 | Pending |
| DPROD-01 | Phase 33 | Pending |
| DPROD-02 | Phase 33 | Pending |
| DPROD-03 | Phase 33 | Pending |
| SPROD-01 | Phase 33 | Pending |
| SPROD-02 | Phase 32 | Pending |
| SPROD-03 | Phase 33 | Pending |
| SPROD-04 | Phase 33 | Pending |
| UPROD-01 | Phase 34 | Pending |
| UPROD-02 | Phase 34 | Pending |
| UPROD-03 | Phase 34 | Pending |
| UPROD-04 | Phase 34 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24 (Phase 32: 6, Phase 33: 14, Phase 34: 4)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-15 — traceability filled after roadmap v2.2 creation*
