# Phase 28: Página de Detalhe do Cliente + Schema Prisma - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar a rota `/contas-receber/[idcliente]` com dados cadastrais do cliente (via Athos), tabela de títulos em aberto com seleção por checkbox e barra de ações, e as migrations Prisma com as tabelas `CobrancaBoleto` e `NfseEmitida` (com junction tables) que as Fases 29 e 30 precisam para operar.

A página é puramente frontend + schema — nenhuma lógica de negócio de boleto ou NFS-e é implementada aqui.

</domain>

<decisions>
## Implementation Decisions

### Navegação e UX de /contas-receber

- **D-01:** O card de cliente em `/contas-receber` **remove o botão "Títulos" e o accordion inline**. O clique no nome do cliente (ou num botão "Ver Detalhe") navega para `/contas-receber/[idcliente]`.
- **D-02:** Implementar o botão "Ver Detalhe" no rodapé do card (onde ficava o botão "Títulos"). O accordion inline é removido junto com o estado `titulosMap`, `expandedId` e `handleToggleCliente` da página `/contas-receber`.
- **D-03:** A página `/contas-receber` fica mais limpa — card com Top Cards + grid; toda ação detalhada fica na rota de detalhe.

### Rota e Estrutura Frontend

- **D-04:** Nova rota Next.js: `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` (Client Component, `'use client'`).
- **D-05:** API route proxy: `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` — retorna dados cadastrais do cliente (nome, telefone, email, limitecredito, bloqueaprazo) via Athos. Os títulos já existem em `/api/athos/contas-receber/cliente/[idcliente]/titulos` (reaproveitado).
- **D-06:** Novo método `AthosService.buscarDadosClienteContasReceber(idcliente)` — query ao Athos para dados cadastrais: JOIN `cliente` + `cliente_fisico`/`cliente_juridico` para nome. Padrão idêntico ao `buscarClientePorId()` existente (linha ~882).
- **D-07:** Breadcrumb no topo da página de detalhe: "← Contas a Receber" com link para `/contas-receber`.

### Tabela de Títulos e Seleção

- **D-08:** A tabela de títulos reutiliza a query já existente `GET /api/athos/contas-receber/cliente/[idcliente]/titulos` (AVC + VEN, sem paginação).
- **D-09:** Colunas da tabela: checkbox | Título | Vencimento | Valor | Status (badge AVC/VEN).
- **D-10:** Estado de seleção gerenciado no React: `selectedIds: Set<number>` (idcontareceber).
- **D-11:** Checkbox "Selecionar todos" no `<thead>` — marcado quando todos selecionados, indeterminado quando parcial.
- **D-12:** Rodapé da tabela (ou barra flutuante) exibe: "N título(s) selecionado(s) — Total: R$ X.XXX,XX".

### Barra de Ações

- **D-13:** Barra de ações aparece somente com `selectedIds.size > 0`. Quando vazia, a barra fica oculta (não desabilitada — é removida do DOM).
- **D-14:** Botões na barra: "Gerar Boleto" (`btn-warning`) e "Emitir NFS-e" (`btn-primary`).
- **D-15:** Em Phase 28, os botões existem mas **não fazem nada** (onClick vazio com TODO comment) — implementados em Phases 29 e 30. Isso é intencional: o planner das phases seguintes saberá onde conectar.

### Prisma Schema — Nomenclatura e Estrutura

- **D-16:** Modelos em **português** direto (sem `@@map`) — `CobrancaBoleto`, `CobrancaBoletoTitulo`, `NfseEmitida`, `NfseEmitidaTitulo`. Nomes de tabela no banco gerados automaticamente pelo Prisma (snake_case: `cobranca_boleto`, `cobranca_boleto_titulo`, etc.).
- **D-17:** Estrutura `CobrancaBoleto`:
  ```
  id              Int      @id @default(autoincrement())
  txidEfi         String?  // preenchido após geração EFI (Phase 29)
  idclienteAthos  Int
  valor           Decimal  @db.Decimal(12,2)
  status          String   @default("pendente") // pendente | pago | cancelado
  linkBoleto      String?
  pixPayload      String?
  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt
  titulos         CobrancaBoletoTitulo[]
  ```
- **D-18:** Estrutura `CobrancaBoletoTitulo` (junction):
  ```
  id                Int          @id @default(autoincrement())
  cobrancaBoletoId  Int
  idcontareceber    Int          // ID do título no Athos
  valor             Decimal      @db.Decimal(12,2)
  cobrancaBoleto    CobrancaBoleto @relation(fields: [cobrancaBoletoId], references: [id])
  @@index([cobrancaBoletoId])
  @@index([idcontareceber])
  ```
- **D-19:** Estrutura `NfseEmitida`:
  ```
  id              Int      @id @default(autoincrement())
  numeroNfse      String?  // preenchido após emissão iiBrasil (Phase 30)
  numeroRps       Int
  idclienteAthos  Int
  valorServico    Decimal  @db.Decimal(12,2)
  dataEmissao     DateTime @default(now())
  criadoEm        DateTime @default(now())
  titulos         NfseEmitidaTitulo[]
  ```
- **D-20:** Estrutura `NfseEmitidaTitulo` (junction):
  ```
  id              Int        @id @default(autoincrement())
  nfseEmitidaId   Int
  idcontareceber  Int
  valor           Decimal    @db.Decimal(12,2)
  nfseEmitida     NfseEmitida @relation(fields: [nfseEmitidaId], references: [id])
  @@index([nfseEmitidaId])
  @@index([idcontareceber])
  ```

### Autenticação e Padrões

- **D-21:** Todos os novos endpoints seguem o padrão `x-internal-api-key` + `INTERNAL_API_KEY` nos Route Handlers (mesmo padrão da Fase 27).
- **D-22:** `params` nos Route Handlers com `await params` (Next.js 15 — lição aprendida na Fase 27).

### Claude's Discretion

- Posicionamento da barra de ações: barra flutuante no rodapé da viewport (sticky bottom) quando há seleção ativa — mais visível que rodapé de tabela.
- Badge de status AVC/VEN na tabela: mesmas cores dos filtros da página principal (info=AVC, danger=VEN).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase — Padrões de Referência
- `apps/frontend/src/app/contas-receber/page.tsx` — página pai que será modificada (remover accordion, adicionar botão "Ver Detalhe")
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/titulos/route.ts` — Route Handler existente para títulos (reutilizar na página de detalhe; lição: `await params` obrigatório)
- `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas ~882-950 — `buscarClientePorId()`: padrão de JOIN com `cliente_fisico`/`cliente_juridico` para nome
- `apps/backend/prisma/schema.prisma` — schema Prisma existente; novos modelos devem seguir padrão de indentação e convenções

### Requisitos
- `.planning/REQUIREMENTS.md` — CLI-01, CLI-02, CLI-03 (fase 28)
- `.planning/ROADMAP.md` — Phase 28 success criteria

### Projeto
- `.planning/PROJECT.md` — constraints (Athos read-only, Prisma permanece, sem segredos em código)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AthosService.buscarClientePorId()` (~linha 882): já faz JOIN com `cliente_fisico`/`cliente_juridico` — base do novo `buscarDadosClienteContasReceber()`
- `GET /api/athos/contas-receber/cliente/[idcliente]/titulos`: Route Handler pronto, reaproveitado diretamente na página de detalhe
- `backendFetch()` em `apps/frontend/src/lib/backend-client.ts`: adiciona `x-internal-api-key` automaticamente — usar nos novos Route Handlers
- Cards e badges de criticidade em `/contas-receber/page.tsx`: reutilizar classes CSS e helpers `getBadgeClass()`/`getBadgeLabel()`

### Established Patterns
- Route Handlers como proxy server-side (não rewrites no `next.config.mjs`)
- `await params` obrigatório em dynamic Route Handlers (Next.js 15)
- `INTERNAL_API_KEY` em vez de `ATHOS_API_TOKEN` nos Route Handlers frontend
- Prisma: `@db.Decimal(12,2)` para valores monetários; `@updatedAt` para timestamps automáticos
- Prisma: `@@index` obrigatório em FKs e campos de busca frequente

### Integration Points
- `page.tsx` de `/contas-receber`: remover `titulosMap`, `expandedId`, `handleToggleCliente`; adicionar link "Ver Detalhe" nos cards
- `AthosController`: nova rota `GET contas-receber/cliente/:idcliente/dados` para dados cadastrais
- `schema.prisma`: adicionar 4 novos modelos ao final do arquivo
- Prisma migration: `npx prisma migrate dev --name add_cobranca_boleto_nfse_emitida`

</code_context>

<specifics>
## Specific Ideas

- Botão "Ver Detalhe" no card substituindo "Títulos": `<a href={/contas-receber/${cliente.idcliente}} className="btn btn-sm btn-outline-primary"><i className="bi bi-person-lines-fill me-1" />Ver Detalhe</a>`
- Barra de ações flutuante: `position: sticky; bottom: 0; background: white; border-top: 1px solid #dee2e6; padding: 12px 16px; z-index: 10` — aparece quando `selectedIds.size > 0`
- Query de dados cadastrais do cliente (novo método AthosService):
  ```sql
  SELECT c.idcliente,
    COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text) AS nome_cliente,
    c.dddtelefoneempresa || c.telefoneempresa AS telefone_completo,
    c.emailcliente, c.emailcobrancacliente, c.limitecredito, c.bloqueaprazo
  FROM cliente c
  LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
  LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
  WHERE c.idcliente = $1
  ```

</specifics>

<deferred>
## Deferred Ideas

- Implementação real dos botões "Gerar Boleto" e "Emitir NFS-e" → Phases 29 e 30
- Histórico de NFS-e emitidas na página do cliente → Phase 31
- Consulta de NF não-serviço Athos → Phase 31
- Paginação da tabela de títulos (caso cliente tenha muitos títulos)
- Filtro por status (AVC/VEN) na tabela de títulos do detalhe

</deferred>

---

*Phase: 28-pagina-detalhe-cliente*
*Context gathered: 2026-05-22*
