# Requirements: Sistema de Orcamento BomCusto — Milestone v2.5 (API de Produtos Compostos / Kits)

**Defined:** 2026-06-29
**Core Value:** Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## v1 Requirements

Requisitos do milestone v2.5. API REST de composicao de produtos (`produto_composto`) no Athos, backend-only, no padrao das APIs de produto (v2.2/v2.4).

### Composicao de Produtos (COMP)

- [ ] **COMP-01**: Operador pode listar os componentes de um kit por `idprodutomaster` (GET), com a resposta enriquecida com `descricaoproduto`/`statusproduto` do produto detail via JOIN
- [ ] **COMP-02**: Operador pode adicionar um componente a um kit (POST), com validacao manual de que `idprodutomaster` E `idprodutodetail` existem em `produto`; rejeita auto-referencia (`master == detail`), par duplicado, e componente cujo produto detail esteja inativo (`statusproduto = false`)
- [ ] **COMP-03**: Operador pode editar a `quantidade` de um componente existente (PATCH), com checagem de existencia (404 se o par master/detail nao existir)
- [ ] **COMP-04**: Operador pode remover um componente de um kit (DELETE fisico), com checagem de existencia; DELETE fisico e correto aqui — `produto_composto` e tabela de composicao, distinta da regra de soft-delete do `produto`
- [ ] **COMP-05**: O flag `usaprodutocomposto` do produto master e auto-gerenciado: ligado (`true`) ao adicionar o primeiro componente e desligado (`false`) ao remover o ultimo, sempre na MESMA transacao da escrita em `produto_composto`
- [ ] **COMP-06**: A criacao usa PK serial via `INSERT ... RETURNING idprodutocomposto` (nunca MAX+1), e os erros do Postgres sao mapeados para HTTP: `42501`→500 acionavel (GRANT de escrita ausente), `23503`→422, `23505`→409, `23514`→422
- [ ] **COMP-07**: Spikes de introspecao na DB de referencia read-only (192.168.3.198) realizados antes de escrever DTO/INSERT: tipo-base + CHECK do dominio `quantidade`, presenca de constraint UNIQUE em `(idprodutomaster, idprodutodetail)`, e inventario de triggers/rules em `produto_composto`
- [ ] **COMP-08**: `validarFkExiste` extraido para `athos-fk.util.ts` reutilizavel (refactor sem mudanca de comportamento; cobertura preservada pelos testes existentes do produto)

## v2 Requirements

Reconhecidos, mas deferidos — fora do roadmap atual.

### Composicao Avancada (COMP)

- **COMP-09**: Adicao em lote de multiplos componentes em uma chamada
- **COMP-10**: Endpoint de explosao recursiva de BOM (multi-nivel)
- **COMP-11**: Deteccao de ciclos na composicao

## Out of Scope

| Feature | Reason |
|---------|--------|
| Deteccao de ciclos na composicao | Sem caso pratico reportado; o Athos resolve a explosao no momento da venda (PDV) |
| Adicao em lote / explosao recursiva de BOM | Nao e table-stakes; adicionar quando a operacao exigir |
| Frontend / tela de gestao de kits | v2.5 e API-only, como v2.2/v2.4 |
| Escrita em tabelas do Athos alem de `produto` e `produto_composto` | Excecao de escrita controlada permanece limitada |
| Allocacao de PK via MAX+1 | `idprodutocomposto` e `serial`; usar `RETURNING` (evita o bug de duplicidade ja visto em `conta_pagar`) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | Phase 39 | Pending |
| COMP-02 | Phase 40 | Pending |
| COMP-03 | Phase 40 | Pending |
| COMP-04 | Phase 40 | Pending |
| COMP-05 | Phase 40 | Pending |
| COMP-06 | Phase 40 | Pending |
| COMP-07 | Phase 39 | Pending |
| COMP-08 | Phase 39 | Pending |

**Coverage:**
- v1 requirements: 8 total
- Mapped to phases: 8 (100%)
- Unmapped: 0

| Phase | Requirements | Count |
|-------|-------------|-------|
| Phase 39: Scaffold, Leitura e Spikes de Introspecao | COMP-07, COMP-08, COMP-01 | 3 |
| Phase 40: Write CRUD | COMP-02, COMP-03, COMP-04, COMP-05, COMP-06 | 5 |

---
*Requirements defined: 2026-06-29*
*Last updated: 2026-06-29 — traceability preenchida pelo roadmapper (milestone v2.5, fases 39-40)*
