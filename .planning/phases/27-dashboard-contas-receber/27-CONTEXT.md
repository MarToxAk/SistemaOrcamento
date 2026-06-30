# Phase 27: Dashboard de Contas a Receber — Read-Only - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar interface analítica read-only (`/contas-receber`) para monitoramento operacional de inadimplência. O operador vê quem deve, quanto, há quantos dias e o contato direto do cliente. A tela é puramente de consulta — nenhuma ação de cobrança ou baixa é executada aqui.

</domain>

<decisions>
## Implementation Decisions

### Rota e Navegação Frontend
- **D-01:** Nova rota dedicada `/contas-receber` — não é tab de página existente.
- **D-02:** Item de menu próprio no header do sistema (junto com os links existentes de Orçamentos e Status).
- **D-03:** Rota protegida — acesso apenas autenticado (mesma guarda das demais rotas internas).

### Atualização de Dados
- **D-04:** Sem real-time nesta fase — botão "Atualizar" (refresh manual) na tela.
- **D-05:** Nenhuma alteração no banco Athos (sem trigger AFTER, sem DDL em produção).
- **D-06:** Real-time via SSE (`CONTA_RECEBER_MUTATION`) fica como ideia adiada — implementar em fase futura se necessário.

### Escopo do Resultado (Backend)
- **D-07:** Endpoint retorna no máximo **top 100 clientes** por `total_atrasado DESC, total_devido DESC`.
- **D-08:** `LIMIT 100` aplicado na query SQL agregada — não há paginação no frontend para este MVP.
- **D-09:** Filtrar apenas `statusconta = 'ABE'` (em aberto). Títulos `LIQ` (liquidados) são excluídos.

### Query SQL — JOINs de Nome
- **D-10:** A query principal usa `LEFT JOIN cliente_fisico cf` e `LEFT JOIN cliente_juridico cj` para resolver o nome.
- **D-11:** Nome exibido: `COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente)` — fallback para ID quando sem cadastro PF/PJ.
- **D-12:** Mesmo padrão de resolução de nome já validado em `AthosService.buscarClientes()`.

### Backend — Endpoint e Autenticação
- **D-13:** `GET /api/athos/contas-receber/dashboard` — prefixo `/athos/` consistente com os demais endpoints Athos.
- **D-14:** Autenticação via `x-internal-api-key` + `ApiKeyGuard` — padrão obrigatório de todos os endpoints Athos.
- **D-15:** Resposta inclui: `summary` (totais globais para os Top Cards) + `clientes` (array com dados agregados por cliente).
- **D-16:** Cada item de `clientes` inclui: `idcliente`, `nome_cliente`, `telefone_completo`, `emailcliente`, `emailcobrancacliente`, `limitecredito`, `bloqueaprazo`, `total_devido`, `total_atrasado`, `titulos_pendentes`, `maior_atraso_dias`.

### Frontend — Layout e Componentes
- **D-17:** Layout 3 seções conforme especificado no documento de fase:
  1. **Top Cards** — Total a Receber, Inadimplência Ativa, Clientes Devedores (contagem)
  2. **Grid de Cards** — um card por cliente devedor com barra de progresso de limite de crédito e badge de criticidade
  3. **Drawer/Accordion** — títulos individuais do cliente expandido, com vínculo à venda (`numeroordem`) e botão WhatsApp
- **D-18:** Badge de criticidade baseada em `maior_atraso_dias`: verde (0 dias, só deve mas não venceu), amarelo (1-30 dias), laranja (31-90 dias), vermelho (> 90 dias).
- **D-19:** Barra de progresso de limite de crédito: `total_devido / limitecredito * 100`. Quando `limitecredito = 0`, ocultar barra (não dividir por zero).
- **D-20:** Botão WhatsApp abre `https://wa.me/55{ddd}{telefone}` em nova aba — usar `dddtelefoneempresa + telefoneempresa` da tabela `cliente`.
- **D-21:** Design system BomCusto — reutilizar padrão visual das páginas `/status` e `/orcamento` (Bootstrap + classes do projeto).

### Títulos Individuais (Drawer)
- **D-22:** A query de detalhes dos títulos individuais é lazy — carregada apenas quando o card do cliente é expandido.
- **D-23:** Endpoint separado para títulos: `GET /api/athos/contas-receber/cliente/:idcliente/titulos` — retorna array de `conta_receber` com `numerotitulo`, `datavencimento`, `valor`, `observacao`, `idvenda`, `numeroordem` (JOIN venda).
- **D-24:** `numeroordem` da venda é exibido como link/referência para rastreamento no balcão.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Especificação da Fase
- `.planning/Discussão de Fase - Contas a Receber.md` — Especificação original com SQL de agregação, layout das seções, tasks e DDL de `conta_receber`, `venda` e `cliente`

### Schema do Banco Athos (PostgreSQL)
- `.planning/DATABASE_SCHEMA.md` — DDL das tabelas `cliente`, `cliente_fisico`, `cliente_juridico`, `venda`, `relacao_orcamento_venda`, `conta_pagar` e demais tabelas do Athos
- DDL de `conta_receber` está no documento de fase (não no DATABASE_SCHEMA.md)

### Padrões do Codebase
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — `buscarClientes()` (linha ~982): padrão de LEFT JOIN com `cliente_fisico`/`cliente_juridico` para resolução de nome; `verificarPagamentoPorOrcamento()`: padrão de query agregada Athos
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` — padrão de controller Athos: `@UseGuards(ApiKeyGuard)`, `@Get()`, DTOs de resposta
- `apps/backend/src/modules/events/events.service.ts` — padrão SSE com RxJS Subject (referência para fase futura de real-time)

### Frontend — Componentes de Referência
- `apps/frontend/src/app/status/page.tsx` — cards de orçamentos por status, SSE consumer, layout Kanban — referência visual mais próxima para o dashboard
- `apps/frontend/src/app/orcamento/page.tsx` — listagem com badges e indicadores de pagamento

### Projeto
- `.planning/PROJECT.md` — constraints do projeto (Athos read-only, auth padrão, monorepo)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AthosService.buscarClientes()`: já faz LEFT JOIN com `cliente_fisico`/`cliente_juridico` — copiar padrão de JOIN e resolução de nome diretamente
- `ApiKeyGuard`: guard de autenticação a aplicar no novo controller
- `pg.Pool` via `this.getPool()` no AthosService: pool de conexão já configurado para queries Athos
- Cards com badges coloridas em `/status/page.tsx`: reutilizar estrutura visual e classes CSS

### Established Patterns
- Novos endpoints Athos são adicionados em `athos.controller.ts` + lógica em `athos.service.ts` — não criar módulo separado
- Queries com múltiplos JOINs usam `client.query()` direto (não Prisma) — Athos é banco externo
- Tipos de resposta definidos como interfaces TypeScript inline ou DTOs com `class-validator` no mesmo arquivo do controller
- `pickString()` helper já existe para resolver campos opcionais — usar na resolução de nomes

### Integration Points
- Novo endpoint: `AthosController` recebe a rota, delega para `AthosService`
- Frontend: nova página `apps/frontend/src/app/contas-receber/page.tsx` com client component (`'use client'`)
- Menu/header: adicionar link em `apps/frontend/src/app/layout.tsx` (ou componente de header existente)
- Proxy Next.js: verificar `next.config.js` — pode precisar adicionar rewrite para `/api/athos/contas-receber/*`

</code_context>

<specifics>
## Specific Ideas

- SQL de agregação principal (do documento de fase — adaptar com os JOINs de nome):
```sql
SELECT 
    c.idcliente,
    COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text) AS nome_cliente,
    c.dddtelefoneempresa || c.telefoneempresa AS telefone_completo,
    c.emailcliente,
    c.emailcobrancacliente,
    c.limitecredito,
    c.bloqueaprazo,
    SUM(cr.valor) FILTER (WHERE cr.statusconta = 'ABE') AS total_devido,
    SUM(cr.valor) FILTER (WHERE cr.statusconta = 'ABE' AND cr.datavencimento < CURRENT_DATE) AS total_atrasado,
    COUNT(cr.idcontareceber) FILTER (WHERE cr.statusconta = 'ABE') AS titulos_pendentes,
    MAX(CURRENT_DATE - cr.datavencimento::date) FILTER (WHERE cr.statusconta = 'ABE' AND cr.datavencimento < CURRENT_DATE) AS maior_atraso_dias
FROM cliente c
INNER JOIN conta_receber cr ON c.idcliente = cr.idcliente
LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
WHERE cr.statusconta = 'ABE'
GROUP BY c.idcliente, cf.nome, cj.nomefantasia, cj.razaosocial,
         c.dddtelefoneempresa, c.telefoneempresa, c.emailcliente,
         c.emailcobrancacliente, c.limitecredito, c.bloqueaprazo
ORDER BY total_atrasado DESC NULLS LAST, total_devido DESC
LIMIT 100;
```

- Threshold de criticidade (D-18): 0 dias = `text-success`, 1-30 = `text-warning`, 31-90 = `text-orange` (ou `badge-warning` escuro), > 90 = `text-danger`
- Botão WhatsApp: `https://wa.me/55${ddd}${telefone}` com `target="_blank"` — só exibir se `telefone_completo` não for nulo

</specifics>

<deferred>
## Deferred Ideas

- **Real-time via SSE (`CONTA_RECEBER_MUTATION`):** Implementar em fase futura. Requer: (1) trigger AFTER em `conta_receber` chamando `notify_n8n()`, (2) extensão do `AthosListenerService` para emitir evento de conta_receber, (3) novo Subject/Observable no `EventsService`, (4) EventSource no frontend. Adiado porque exige DDL em produção Athos.
- **Filtros de período/valor:** Filtrar por data de vencimento ou valor mínimo de dívida — adiado para v2.
- **Exportação CSV da inadimplência:** Adiado para milestone de Relatórios.
- **Ação de cobrança:** Registrar contato/tentativa de cobrança — fora do escopo read-only desta fase.

</deferred>

---

*Phase: 27-dashboard-contas-receber*
*Context gathered: 2026-05-21*
