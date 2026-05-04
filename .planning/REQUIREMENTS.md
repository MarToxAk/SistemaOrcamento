# Requirements: Sistema de Orcamento BomCusto

Defined: 2026-05-04
Core Value: Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## v1.8 Requirements

### Athos Client Search

- [ ] ATHCL-01: API interna deve permitir buscar clientes Athos por nome parcial, CPF/CNPJ ou idcliente.
- [ ] ATHCL-02: Resultado da busca deve normalizar tipo de pessoa (PF/PJ), documento principal e nome exibicao.
- [ ] ATHCL-03: Busca deve limitar pagina/tamanho e proteger consulta com validacoes para evitar varredura excessiva.

### Tomador Resolution

- [ ] TOMAD-01: Emissao NFS-e deve aceitar referencia explicita de cliente Athos selecionado.
- [ ] TOMAD-02: Backend deve resolver tomador com join read-only entre cliente, cliente_fisico, cliente_juridico e cliente_endereco.
- [ ] TOMAD-03: Regra de prioridade de endereco deve ser deterministica e documentada (principal, cobranca, fallback).
- [ ] TOMAD-04: Quando faltar CPF/CNPJ ou endereco minimo, backend deve retornar erro claro com causa de bloqueio.

### Frontend NFS-e Flow

- [ ] NFUI-01: Tela de emissao NFS-e deve permitir pesquisar e selecionar cliente Athos antes do envio.
- [ ] NFUI-02: Selecionar cliente deve preencher preview do tomador e documento que sera usado na emissao.
- [ ] NFUI-03: Requisicao de emissao deve enviar clienteAthosId (ou campo equivalente definido no backend).

### Quality and Observability

- [ ] QUAL-01: Logs estruturados devem registrar criterio de busca, cliente selecionado e motivo de fallback.
- [ ] QUAL-02: Testes de integracao/unidade devem cobrir PF, PJ, sem endereco, sem documento e cliente nao encontrado.
- [ ] QUAL-03: Endpoint de busca deve manter compatibilidade com guard x-internal-api-key e rate limiting vigente.

## v2 Requirements

### Evolution

- ATHCL-04: Busca fuzzy com score e ordenacao por relevancia historica de uso
- NFUI-04: Auto-complete de cliente no modal com debounce e cache local de consultas recentes
- TOMAD-05: Perfil de preferencia de endereco por cliente para reduzir ajustes manuais

## Out of Scope

| Feature | Reason |
|---------|--------|
| Escrita no banco Athos | Integracao Athos do projeto e read-only por seguranca e governanca |
| Cadastro/edicao de cliente Athos pelo frontend BomCusto | Escopo desta milestone e somente busca e selecao para NFS-e |
| Reprojeto completo do fluxo NFS-e | Milestone focada em busca de cliente e resolucao de tomador |
| Sincronizacao em massa Athos -> banco principal | Alto custo e risco de drift; nao necessario para o objetivo atual |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ATHCL-01 | Phase 19 | Pending |
| ATHCL-02 | Phase 19 | Pending |
| ATHCL-03 | Phase 19 | Pending |
| TOMAD-01 | Phase 20 | Pending |
| TOMAD-02 | Phase 20 | Pending |
| TOMAD-03 | Phase 20 | Pending |
| TOMAD-04 | Phase 20 | Pending |
| NFUI-01 | Phase 21 | Pending |
| NFUI-02 | Phase 21 | Pending |
| NFUI-03 | Phase 21 | Pending |
| QUAL-01 | Phase 21 | Pending |
| QUAL-02 | Phase 21 | Pending |
| QUAL-03 | Phase 21 | Pending |

Coverage:
- v1.8 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
Requirements defined: 2026-05-04
Last updated: 2026-05-04 after new milestone v1.8 definition
