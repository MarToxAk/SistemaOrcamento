# Phase 30: Emissão de NFS-e a partir de Títulos - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar o modal de emissão de NFS-e acionado pelo botão "Emitir NFS-e" na página `/contas-receber/[idcliente]`, com verificação de tipo de produto (`tipoproduto`), prevenção de duplicidade via `idvenda`, salvamento no banco próprio (`NfseEmitida`), e vinculação à página de orçamento para evitar duplicação entre os dois fluxos de emissão.

</domain>

<decisions>
## Implementation Decisions

### Verificação de tipoproduto (tabela produto via venda_item)

- **D-01:** Antes de abrir o modal de NFS-e, verificar todos os produtos da venda via `venda_item JOIN produto`. Campo: `tipoproduto boolean` na tabela `produto`. Tabela de itens: `venda_item` (não `item_venda`).
- **D-02:** Regra:
  - `todos_servico = BOOL_AND(NOT p.tipoproduto) = true` → todos serviços → pode emitir NFS-e normalmente
  - `tem_produto_fisico = BOOL_OR(p.tipoproduto) = true` → tem produto físico → exibir aviso amarelo: "⚠ Este título contém produtos físicos que precisam de NF-e de produto. A NFS-e cobrirá apenas os itens de serviço."
  - Título sem itens em `venda_item` (raro) → permitir emissão sem aviso
- **D-03:** O aviso NÃO bloqueia a emissão — é informativo. O operador pode emitir mesmo com produtos físicos (ele é responsável por emitir a NF-e de produto separadamente).
- **D-04:** Query SQL para verificação:
  ```sql
  SELECT
    BOOL_OR(p.tipoproduto) as tem_produto_fisico,
    BOOL_AND(NOT COALESCE(p.tipoproduto, false)) as todos_servico
  FROM venda_item vi
  JOIN produto p ON p.idproduto = vi.idproduto
  WHERE vi.idvenda = $1 AND COALESCE(vi.cancelada, false) = false
  ```
- **D-05:** Novo método `AthosService.verificarTipoProdutoVenda(idvenda)` — retorna `{ temProdutoFisico: boolean, todosServico: boolean }`.
- **D-06:** Novo endpoint `GET /athos/venda/:idvenda/tipo-produto` no `AthosController`.

### Prevenção de Duplicidade de NFS-e via idvenda

- **D-07:** Adicionar campo `idvenda Int?` na tabela `NfseEmitida` (Prisma migration) — armazena o `idvenda` do `conta_receber` que gerou a NFS-e.
- **D-08:** Antes de emitir NFS-e, verificar se já existe `NfseEmitida` com mesmo `idvenda` no banco:
  ```typescript
  const existente = await prisma.nfseEmitida.findFirst({ where: { idvenda: titulo.idvenda } });
  if (existente) → erro 400: "NFS-e já emitida para esta venda (Nº ${existente.numeroNfse})"
  ```
- **D-09:** A verificação é por `idvenda`, não por `idcontareceber` — evita duplicidade mesmo se o operador acessar pelo fluxo de orçamento OU pelo fluxo de contas a receber.
- **D-10:** Se `conta_receber.idvenda` for NULL (raro), pular verificação de duplicidade e permitir emissão.

### Salvar Informações da Nota Fiscal no Banco

- **D-11:** `NfseEmitida` armazena: `id, numeroNfse, numeroRps, idclienteAthos, valorServico, dataEmissao, idvenda, idcontareceber[] (via NfseEmitidaTitulo), criadoEm`
- **D-12:** Após emissão bem-sucedida via `NfseService.emitirNfse()`, salvar em `NfseEmitida` com `idvenda` preenchido (obtido de `conta_receber.idvenda`).
- **D-13:** `NfseEmitidaTitulo` mantém os `idcontareceber` vinculados para rastreabilidade por título.

### Modal de Emissão

- **D-14:** Modal 3 etapas:
  1. **Confirmação** — valor pré-preenchido (soma dos títulos), editável; aviso de produto físico se aplicável; aviso de duplicidade se idvenda já tem NFS-e
  2. **Loading** — "Emitindo NFS-e..."
  3. **Sucesso** — número da NFS-e emitida, RPS, valor
- **D-15:** Valor do modal = soma dos valores dos títulos selecionados, ajustável pelo operador (igual ao boleto).
- **D-16:** Dados do tomador resolvidos via `buscarClientePorId(idclienteAthos)` — reutilizar fluxo já validado no módulo de orçamentos.

### Vinculação à Página de Orçamento

- **D-17:** O fluxo de emissão de NFS-e em `/orcamento/[id]` (já existente) deve salvar `idvenda` em `NfseEmitida` quando a NFS-e for emitida por lá.
- **D-18:** Na página `/orcamento/[id]`, antes de emitir NFS-e, verificar se `NfseEmitida.idvenda` já tem registro — mostrar aviso "NFS-e já emitida para esta venda (#idvenda) pelo módulo de Contas a Receber."
- **D-19:** Não duplicar a funcionalidade de emissão de NFS-e no módulo de orçamentos — apenas adicionar a verificação de duplicidade e salvar `idvenda` quando emitir por lá.

### Módulo Backend

- **D-20:** A lógica de NFS-e de contas a receber fica em `CobrancaService` (mesmo módulo do boleto) — método `emitirNfse(dto)`.
- **D-21:** `CobrancaService.emitirNfse()` injeta `NfseService` para reutilizar o fluxo SOAP iiBrasil.
- **D-22:** Novo endpoint `POST /cobranca/nfse` — body: `{ idclienteAthos, idcontasReceber, valor, descricaoServico?, aliquotaIss? }`.

### Schema Prisma — Adição de idvenda

- **D-23:** Migration adiciona `idvenda Int?` em `NfseEmitida`. Index em `idvenda` para busca de duplicidade eficiente.
- **D-24:** `NfseService` existente (módulo de orçamentos) deve ser atualizado para salvar `idvenda` quando disponível — passar como parâmetro opcional.

### Claude's Discretion

- Badge de status na sub-tabela de títulos para NFS-e emitidas (similar ao boleto) — mostrar "NFS-e #XX" nas ações do título
- `CobrancaModule` já importa `NfseModule` (ou vice-versa) — verificar ciclo de dependência e usar `forwardRef` se necessário

</decisions>

<canonical_refs>
## Canonical References

### Banco Athos — Tabelas relevantes
- Tabela `venda_item`: `idvenda, idproduto, cancelada` — join via `idvenda` de `conta_receber`
- Tabela `produto`: `idproduto, descricaoproduto, tipoproduto boolean` — `true` = produto físico, `false` = serviço
- Validado no banco: `tipoproduto=true` (28.683 produtos físicos) / `tipoproduto=false` (110 serviços)

### Codebase — Padrões
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — `NfseService.emitirNfse()` existente (reutilizar)
- `apps/backend/src/modules/cobranca/cobranca.service.ts` — padrão de módulo a seguir para `emitirNfse()`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — `buscarClientePorId()` para tomador + padrão de query Athos
- `apps/backend/prisma/schema.prisma` — `NfseEmitida` + `NfseEmitidaTitulo` (criados na Fase 28, adicionar `idvenda`)
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — botão "Emitir NFS-e" com onClick vazio (conectar aqui)

### Requisitos
- `.planning/REQUIREMENTS.md` — NFR-01, NFR-02, NFR-03, NFR-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NfseService.emitirNfse()` — fluxo SOAP iiBrasil já validado para orçamentos; parâmetros: tomador, valor, RPS
- `AthosService.buscarClientePorId()` — busca PF/PJ com documento para resolver tomador
- `CobrancaService.criarBoleto()` — padrão idêntico a seguir para `emitirNfse()`

### Integration Points
- `CobrancaController`: adicionar `POST /cobranca/nfse`
- `AthosController`: adicionar `GET /athos/venda/:idvenda/tipo-produto`
- `NfseEmitida` Prisma: adicionar `idvenda Int? @unique` + migration
- `/contas-receber/[idcliente]/page.tsx`: conectar onClick de "Emitir NFS-e" ao modal

</code_context>

<specifics>
## Specific Ideas

- Query de tipoproduto (validada no banco):
  ```sql
  SELECT BOOL_OR(p.tipoproduto) as tem_produto_fisico,
         BOOL_AND(NOT COALESCE(p.tipoproduto,false)) as todos_servico
  FROM venda_item vi JOIN produto p ON p.idproduto = vi.idproduto
  WHERE vi.idvenda = $1 AND COALESCE(vi.cancelada,false) = false
  ```
- Aviso no modal (D-03): `<div class="alert alert-warning">⚠ Este título contém produtos físicos. Emita NF-e de produto separadamente.</div>`
- Verificação duplicidade (D-08): `prisma.nfseEmitida.findFirst({ where: { idvenda: contaReceber.idvenda } })`

</specifics>

<deferred>
## Deferred Ideas

- Exibir histórico de NFS-e emitidas na página do cliente → Phase 31
- Emissão de NF-e de produto (DANFE) → fora do escopo deste sistema
- Cancelamento de NFS-e emitida → fora do escopo desta fase
- Interface de listagem global de NFS-e emitidas → futuro

</deferred>

---

*Phase: 30-emissao-nfse-titulos*
*Context gathered: 2026-05-23*
