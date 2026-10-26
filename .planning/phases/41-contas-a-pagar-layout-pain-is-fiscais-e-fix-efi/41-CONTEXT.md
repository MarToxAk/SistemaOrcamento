# Phase 41: Contas a Pagar: Layout, Painéis Fiscais e Fix EFI - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Melhorias no dashboard de **Contas a Receber** (`/contas-receber`) — não "contas a pagar": termo do usuário esclarecido durante a discussão como referindo-se à rota já existente `https://orcamento.bomcustoilhabela.com.br/contas-receber`. Escopo: (1) reorganizar o layout do dashboard com mais organização/filtros e cards de resumo fiscal; (2) automatizar a reconciliação de pagamento EFI (hoje depende de webhook que já teve bug de URL, ou de clique manual em "verificar pagamento"); (3) um painel/seção consolidada de boletos ainda a receber; (4) indicadores fiscais de organização (aging de inadimplência, NFS-e emitida vs pendente, próximos vencimentos).

**In scope:**
- Redesign de `apps/frontend/src/app/contas-receber/page.tsx` (dashboard) — não a página de detalhe do cliente (`[idcliente]/page.tsx`), que fica como está
- Job agendado no backend para verificar automaticamente o status de boletos EFI pendentes (reaproveitando `verificarPagamentoBoleto()` já existente)
- Nova seção/painel de boletos consolidados (todos os clientes, não só por cliente) no topo do dashboard
- Indicadores fiscais: aging de inadimplência, NFS-e emitida vs pendente por título, total a vencer em 7/15/30 dias

**Out of scope:**
- Qualquer tela nova de "contas a pagar" (API já existe via `POST /athos/contas-pagar`, sem frontend — não faz parte deste pedido, o usuário confirmou que o termo era sobre contas-receber)
- Mudanças na página de detalhe do cliente (`[idcliente]/page.tsx`)
- Novos métodos de cobrança além de boleto/PIX já existentes

</domain>

<decisions>
## Implementation Decisions

### Layout do Dashboard (Área 1)
- **D-01:** Lista de clientes organizável por nome, valor vencido, pago e outros critérios (ordenação, não apenas filtro de status como hoje)
- **D-02:** Cards de resumo no topo: total em aberto, total vencido, total recebido no mês, taxa de inadimplência

### Monitoramento Automático de Pagamento EFI (Área 2)
- **D-03:** Reconciliação automática via job agendado (cron), não apenas webhook — cobre o caso do webhook falhar silenciosamente (já documentado no código: bug histórico de `notification_url` undefined corrigido, mas webhook ainda pode falhar por outros motivos)
- **D-04:** Reaproveitar `CobrancaService.verificarPagamentoBoleto()` (já existe, chama `GET /v1/charge/{id}` na EFI) — rodar em loop sobre todos os boletos com status pendente, não escrever um novo cliente EFI
- **D-05:** Requer novo pacote `@nestjs/schedule` (não está no projeto ainda) para `@Cron` — avaliar no research/plan a frequência (proposta inicial: 15-30 min) — **Reversibility:** reversible — é um job adicional, remover não quebra nada existente
- **Research flag:** NEEDS RESEARCH — confirmar na documentação oficial da EFI Cobranças se há rate-limit relevante para chamadas `GET /v1/charge/{id}` em lote (evitar polling agressivo de todos os boletos pendentes de uma vez)

### Painel de Boletos a Receber (Área 3)
- **D-06:** Seção dinâmica no **topo** do dashboard (não uma aba/rota separada) — lista consolidada de todos os boletos emitidos entre clientes, com status e vencimento, não filtrada por cliente individual

### Indicadores Fiscais de Organização (Área 4 — sugestão aceita)
- **D-07:** Aging de inadimplência em faixas (30/60/90+ dias)
- **D-08:** Indicador de NFS-e emitida vs pendente por título — reaproveita o módulo NFS-e já existente (Fase 30/31), só precisa expor no painel
- **D-09:** Total a vencer nos próximos 7/15/30 dias
- **D-10:** Destaque visual para clientes com boleto vencido há mais tempo (não especificado o mecanismo visual exato — Claude's Discretion)

### Claude's Discretion
- Mecanismo visual exato de destaque para inadimplência antiga (cor, badge, ordenação forçada no topo)
- Layout exato dos cards de resumo (grid, ordem, ícones) — seguir o design system já usado no dashboard atual
- Frequência exata do cron (entre 15-30 min, ajustável) até resultado do research flag acima
- Nome e estrutura exatos dos novos endpoints backend necessários (ex.: `GET /cobranca/boleto/dashboard` para a lista consolidada)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 41" (Backlog)

### Contexto de fases anteriores no mesmo domínio (NÃO re-perguntar decisões já tomadas)
- `.planning/phases/29-boleto-consolidado-efi/29-CONTEXT.md` — decisões originais de criação de boleto via EFI, webhook `POST /cobranca/boleto/notificacao`, auth OAuth2, padrão de módulo `CobrancaModule`
- `.planning/phases/27-dashboard-contas-receber/27-CONTEXT.md` — decisões do dashboard atual (D-XX de layout/filtros originais)
- `.planning/phases/24-api-contas-pagar-post/24-01-SUMMARY.md` — confirma que "contas a pagar" é API-only, sem frontend (não confundir com este pedido)

### Código a estender / padrão a seguir
- `apps/frontend/src/app/contas-receber/page.tsx` — dashboard atual a redesenhar (324 linhas: summary + lista + filtro de status AVC/VEN/REC/CAN + busca)
- `apps/backend/src/modules/cobranca/cobranca.service.ts` — `verificarPagamentoBoleto()` (linha ~748, chama `GET /v1/charge/{id}` na EFI), `processarNotificacaoEFI()` (webhook, linha ~544), lógica de `notificationUrl`/`APP_BASE_URL` (linhas 178-191, já com comentário sobre bug histórico corrigido)
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` — rotas existentes: `GET boleto/cliente/:idcliente`, `POST boleto/:id/verificar-pagamento` (checagem manual, modelo para o job automático)
- `apps/backend/src/modules/integrations/efi/efi.service.ts` — cliente EFI (auth OAuth2, padrão de chamadas)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CobrancaService.verificarPagamentoBoleto(cobrancaId)` — já implementa a consulta de status de um boleto na EFI; o job automático (D-03/D-04) deve chamar este método em loop, não duplicar a lógica
- Módulo `CobrancaModule` já registrado em `AppModule`, com `PrismaModule`/`EFIModule`/`AthosModule` importados — job agendado entra no mesmo módulo
- Módulo NFS-e (Fase 30/31) já expõe status de emissão por título — reusar para o indicador D-08

### Established Patterns
- Guard `x-internal-api-key` para rotas internas do backend; webhook público sem guard (EFI não manda a key)
- Route Handler Next.js com `backendFetch()` + `INTERNAL_API_KEY` como padrão de proxy frontend → backend
- `PasswordGate` component protegendo a página `/contas-receber` (dado financeiro sensível) — manter no redesign

### Integration Points
- Novo endpoint agregador (ex.: `GET /cobranca/boleto/dashboard` ou reaproveitar `GET /athos/contas-receber/dashboard` já usado pelo `page.tsx` atual — **verificar no plano qual dos dois já retorna os dados certos antes de criar um terceiro**)
- Job de cron entra em `CobrancaModule`, precisa de `ScheduleModule.forRoot()` no `AppModule` (novo, via `@nestjs/schedule`)

</code_context>

<specifics>
## Specific Ideas

- Usuário quer poder "organizar por nome, vencido e pagos e outros itens importantes" — ordenação multi-critério na lista de clientes, não apenas os filtros de status que já existem
- Painel de boletos: "nova aba ou uma parte dinâmica no topo" — decidido: parte dinâmica no topo (D-06), para não fragmentar a navegação
- Para a Área 4 (fiscal), o usuário pediu sugestão direta ("o que seria importante para me organizar") — os 4 indicadores em D-07..D-10 foram propostos por Claude e aceitos sem alteração

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 41-Contas a Pagar: Layout, Painéis Fiscais e Fix EFI*
*Context gathered: 2026-09-04*
