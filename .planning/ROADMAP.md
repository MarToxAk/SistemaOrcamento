# Roadmap — Sistema de Orçamento BomCusto

## Milestones

- ✅ **v1.0 MVP** — Segurança, Confiabilidade e UX — Fases 1-5 (shipped 2026-05-02)
- ✅ **v1.1 Aprovação Athos** — Fase 6 (shipped 2026-05-02)
- ✅ **v1.2 Chatwoot + UX Público** — Fases 7-8 (shipped)
- ✅ **v1.3 Migration/Update** — Fases 9-10 (shipped)
- ✅ **v1.4 Conciliação Athos + NFS-e** — Fases 11-14 (shipped)
- ✅ **v1.5 Encoding NFS-e + UI desconto** — Fases 15-16 (shipped)
- ✅ **v1.6 Cálculo de desconto** — Fase 17 (shipped)
- ✅ **v1.7 RPS e Tomador** — Fase 18 (shipped 2026-05-04)
- ✅ **v1.8 Busca de Cliente Athos** — Fases 19-21 (shipped 2026-05-05)
- ✅ **v2.0 Gestão Financeira, Caixa e Dashboards** — Fases 23-27 (shipped 2026-05-22)
- ✅ **v2.1 Cobrança e Fiscal do Cliente** — Fases 28-31 (shipped 2026-06-08)
- 🔄 **v2.2 Gestão de Produtos do Athos (CRUD)** — Fases 32-34 (em andamento)

---

## v2.2 — Gestão de Produtos do Athos (CRUD)

### Phases

- [ ] **Phase 32: API de Busca de Produto** - Endpoint read com filtros, paginação e autenticação
- [ ] **Phase 33: API de Escrita de Produto** - Create, edit e soft-delete na tabela produto com trigger/constraint/log
- [ ] **Phase 34: Frontend de Gestão de Produtos** - Tela de busca, formulários de criação/edição e ação de desativar/reativar

### Phase Details

#### Phase 32: API de Busca de Produto
**Goal**: Operador pode buscar e consultar produtos do Athos via API REST autenticada
**Depends on**: Phase 31 (Athos read-path estabelecido)
**Requirements**: BPROD-01, BPROD-02, BPROD-03, BPROD-04, BPROD-05, SPROD-02
**Success Criteria** (what must be TRUE):
  1. Operador pode buscar produtos por descrição parcial (case-insensitive) e obter resultados paginados com a linha completa
  2. Operador pode buscar produtos por código de barras (codigobarra1/codigobarra2) e obter resultados paginados
  3. Operador pode filtrar produtos combinando departamento, grupo e/ou marca
  4. Operador pode consultar um produto específico por idproduto e receber todos os campos
  5. Qualquer requisição sem x-internal-api-key válida retorna 401 — o mesmo guard do restante da API
**Plans**: TBD

#### Phase 33: API de Escrita de Produto
**Goal**: Operador pode criar, editar e desativar produtos no Athos de forma segura, com escrita restrita à tabela produto, trigger respeitado e todas as operações registradas em log
**Depends on**: Phase 32
**Requirements**: CPROD-01, CPROD-02, CPROD-03, CPROD-04, EPROD-01, EPROD-02, EPROD-03, EPROD-04, DPROD-01, DPROD-02, DPROD-03, SPROD-01, SPROD-03, SPROD-04
**Success Criteria** (what must be TRUE):
  1. Operador cria um produto: idproduto gerado pelo serial do Athos, datacadastro e idusuariocadastro preenchidos automaticamente, trigger tg_alterarproduto e rules atualizardatahora* disparados sem desabilitá-los
  2. Ao informar campo inválido (descontomaximo fora de 0–100, FK de departamento/grupo/marca inexistente), a API retorna erro 422 com mensagem clara — nenhum dado é gravado
  3. Operador edita preços (valorvenda1..6, promoção, atacado) e informações de cadastro; dataultimaalteracao e idusuarioalteracao são atualizados automaticamente pela trigger/rule
  4. Operador desativa um produto (statusproduto/vendeproduto = false) e pode reativá-lo; nenhum endpoint executa DELETE físico na tabela produto
  5. Toda operação de escrita (create/edit/deactivate/reactivate) gera entrada de log estruturado com quem, quando e o quê foi alterado
  6. Nenhuma outra tabela do Athos além de produto recebe INSERT ou UPDATE em qualquer fluxo do sistema
  7. Todos os endpoints de produto estão documentados no Swagger com payloads de request e response
**Plans**: TBD

#### Phase 34: Frontend de Gestão de Produtos
**Goal**: Operador pode buscar, criar, editar e desativar/reativar produtos diretamente pela interface do Sistema de Orçamento, sem abrir o Athos
**Depends on**: Phase 33
**Requirements**: UPROD-01, UPROD-02, UPROD-03, UPROD-04
**Success Criteria** (what must be TRUE):
  1. Operador acessa a tela de produtos, digita uma descrição (ou código de barras, ou seleciona departamento/grupo/marca) e vê a lista paginada com os campos do produto
  2. Operador clica em "Novo produto", preenche o formulário e salva — o produto aparece na busca com os dados informados
  3. Operador seleciona um produto, edita preço ou informações de cadastro e confirma — as alterações são refletidas imediatamente na tela de detalhe
  4. Operador desativa um produto ativo e pode reativá-lo pela mesma interface; produto desativado fica visualmente diferenciado na listagem
**Plans**: TBD
**UI hint**: yes

### Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. API de Busca de Produto | 0/? | Not started | - |
| 33. API de Escrita de Produto | 0/? | Not started | - |
| 34. Frontend de Gestão de Produtos | 0/? | Not started | - |

---

## Estado atual

**Milestone v2.2 em planejamento.** Roadmap definido em 2026-06-15.

Próximo passo: `/gsd-plan-phase 32`

## Histórico arquivado

Cada milestone tem roadmap e requisitos completos em `.planning/milestones/`:
- `v{X.Y}-ROADMAP.md` — fases, planos e critérios de sucesso
- `v{X.Y}-REQUIREMENTS.md` — requisitos com rastreabilidade
- `v2.1-MILESTONE-AUDIT.md` — auditoria de fechamento (status: passed)
