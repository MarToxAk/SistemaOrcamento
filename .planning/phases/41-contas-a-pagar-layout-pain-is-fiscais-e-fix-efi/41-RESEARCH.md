# Phase 41: Contas a Pagar: Layout, Painéis Fiscais e Fix EFI - Research

**Researched:** 2026-09-04
**Domain:** NestJS scheduled jobs (EFI Cobranças reconciliation) + Next.js dashboard redesign (Contas a Receber)
**Confidence:** MEDIUM (backend/cron: HIGH on codebase facts, MEDIUM on EFI external rate-limit docs; frontend: HIGH — pure extension of existing, fully-read code)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layout do Dashboard (Área 1)**
- **D-01:** Lista de clientes organizável por nome, valor vencido, pago e outros critérios (ordenação, não apenas filtro de status como hoje)
- **D-02:** Cards de resumo no topo: total em aberto, total vencido, total recebido no mês, taxa de inadimplência

**Monitoramento Automático de Pagamento EFI (Área 2)**
- **D-03:** Reconciliação automática via job agendado (cron), não apenas webhook — cobre o caso do webhook falhar silenciosamente (já documentado no código: bug histórico de `notification_url` undefined corrigido, mas webhook ainda pode falhar por outros motivos)
- **D-04:** Reaproveitar `CobrancaService.verificarPagamentoBoleto()` (já existe, chama `GET /v1/charge/{id}` na EFI) — rodar em loop sobre todos os boletos com status pendente, não escrever um novo cliente EFI
- **D-05:** Requer novo pacote `@nestjs/schedule` (não está no projeto ainda) para `@Cron` — avaliar no research/plan a frequência (proposta inicial: 15-30 min) — **Reversibility:** reversible — é um job adicional, remover não quebra nada existente
- **Research flag:** NEEDS RESEARCH — confirmar na documentação oficial da EFI Cobranças se há rate-limit relevante para chamadas `GET /v1/charge/{id}` em lote (evitar polling agressivo de todos os boletos pendentes de uma vez) — **RESOLVED below, see Pitfall 1 / Standard Stack.**

**Painel de Boletos a Receber (Área 3)**
- **D-06:** Seção dinâmica no **topo** do dashboard (não uma aba/rota separada) — lista consolidada de todos os boletos emitidos entre clientes, com status e vencimento, não filtrada por cliente individual

**Indicadores Fiscais de Organização (Área 4 — sugestão aceita)**
- **D-07:** Aging de inadimplência em faixas (30/60/90+ dias)
- **D-08:** Indicador de NFS-e emitida vs pendente por título — reaproveita o módulo NFS-e já existente (Fase 30/31), só precisa expor no painel
- **D-09:** Total a vencer nos próximos 7/15/30 dias
- **D-10:** Destaque visual para clientes com boleto vencido há mais tempo (mecanismo visual — Claude's Discretion)

### Claude's Discretion
- Mecanismo visual exato de destaque para inadimplência antiga (cor, badge, ordenação forçada no topo)
- Layout exato dos cards de resumo (grid, ordem, ícones) — seguir o design system já usado no dashboard atual
- Frequência exata do cron (entre 15-30 min, ajustável) até resultado do research flag acima
- Nome e estrutura exatos dos novos endpoints backend necessários (ex.: `GET /cobranca/boleto/dashboard` para a lista consolidada)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope (see `41-CONTEXT.md` `<deferred>`).

### Out of Scope (phase boundary, not "deferred" but equally binding)
- Qualquer tela nova de "contas a pagar" (API já existe via `POST /athos/contas-pagar`, sem frontend — não faz parte deste pedido)
- Mudanças na página de detalhe do cliente (`[idcliente]/page.tsx`)
- Novos métodos de cobrança além de boleto/PIX já existentes
</user_constraints>

<phase_requirements>
## Phase Requirements

This phase has **no REQ-IDs** assigned in `.planning/REQUIREMENTS.md` — that file documents only Milestone v2.5 (Composição de Produtos / Kits, phases 39-40) and has no traceability rows for Phase 41. Phase 41 was inserted directly into `.planning/ROADMAP.md` as a backlog item (see `STATE.md` → "Roadmap Evolution" → "Phase 41 added (2026-09-04)"). The authoritative scope source for this phase is `41-CONTEXT.md`'s Decisions (D-01..D-10), not a REQ-ID table.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Ordenação multi-critério da lista de clientes (nome/vencido/pago) | Frontend-only client-side sort on existing `clientes` array — no new backend field needed (all sort keys already returned: `nome_cliente`, `total_atrasado`, `total_devido`) — see Architecture Patterns |
| D-02 | Cards de resumo: total em aberto, vencido, recebido no mês, taxa de inadimplência | `total_a_receber`/`total_atrasado` already in `DashboardSummary`; "recebido no mês" and "taxa de inadimplência" are NEW aggregates — need new SQL in `buscarDashboardContasReceber` or a second query |
| D-03/D-04/D-05 | Cron reconciliação automática via `verificarPagamentoBoleto()` + `@nestjs/schedule` | See Standard Stack, Pitfall 1, Code Examples |
| D-06 | Painel consolidado de boletos no topo | New Prisma query over `CobrancaBoleto` (not Athos `conta_receber`) — see Architectural Responsibility Map |
| D-07 | Aging 30/60/90+ | Extend `buscarDashboardContasReceber` SQL (has `maior_atraso_dias` already; needs bucketing) |
| D-08 | NFS-e emitida vs pendente por título | Reuse `AthosService.verificarNFTitulos()` + `CobrancaService.buscarNfseEmitidaParaTitulos()` — both already exist |
| D-09 | Total a vencer 7/15/30 dias | New SQL aggregate on `conta_receber.datavencimento` (Athos, read-only) |
| D-10 | Destaque visual vencidos antigos | Frontend-only — reuse `getBadgeClass()` pattern already in `page.tsx` |
</phase_requirements>

## Summary

This phase extends four already-implemented, well-understood subsystems rather than introducing new technology: the Contas a Receber dashboard (`apps/frontend/src/app/contas-receber/page.tsx`), the Athos read-only aggregation query (`AthosService.buscarDashboardContasReceber`), the EFI Cobranças boleto service (`CobrancaService`), and the NFS-e-per-título lookup already built for the e-mail feature (phase ~2026-08-27). The only new runtime dependency is `@nestjs/schedule` (D-05), needed for the automatic EFI reconciliation cron job (D-03/D-04).

The EFI rate-limit research flag is now resolved: EFI's official docs (`dev.efipay.com.br/docs/api-cobrancas/limites-de-consumo`) document a **daily quota of 15,000 requests for `GET /v1/charge/:id`** (reset every 24h, warning at 80% consumption), not a per-minute/per-second throttle. At the proposed 15-30 min interval, even a generous pending-boleto count (low hundreds) stays comfortably under this budget — see Pitfall 1 for the exact math and the one open item (actual current pending-boleto count, not measurable from this session — no live DB access).

The dashboard's current backend endpoint (`GET /athos/contas-receber/dashboard`) returns **per-client** aggregates from the Athos `conta_receber` table and does **not** know about `CobrancaBoleto` (our own Prisma table) — the new "painel de boletos consolidado" (D-06) requires a **new** endpoint querying Prisma, not an extension of the existing Athos-backed one. Conversely, the aging/vencimento buckets (D-07/D-09) extend the *existing* Athos SQL, since that data already lives in `conta_receber`.

**Primary recommendation:** Add `@nestjs/schedule` (`ScheduleModule.forRoot()` in `AppModule`, one `@Cron` service in `CobrancaModule`) to loop `verificarPagamentoBoleto()` over all `status: "pendente"` `CobrancaBoleto` rows every 15-30 min; add a **new** Prisma-backed endpoint (e.g. `GET /cobranca/boleto/dashboard`) for the consolidated boleto panel; extend `buscarDashboardContasReceber`'s existing SQL for aging buckets and upcoming-due-date totals; reuse `verificarNFTitulos` + `buscarNfseEmitidaParaTitulos` for the NFS-e indicator; keep all sorting/visual-highlight logic client-side in `page.tsx`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ordenação/filtro de clientes (D-01) | Browser / Client | — | Todos os campos de ordenação já vêm no payload existente; `Array.prototype.sort` no `page.tsx` evita round-trip |
| Cards de resumo fiscal (D-02, D-07, D-09) | API / Backend (Athos read-only via `pg` Pool) | Browser / Client (render) | Agregação SQL sobre `conta_receber` já é o padrão estabelecido (`buscarDashboardContasReceber`); calcular no Node.js via loop violaria o padrão `STATE.md` ("summary calculado via Array.reduce" já documentado para o caso atual, mas os NOVOS agregados de aging/vencimento devem ser SQL, pois exigem `GROUP BY` em faixas de data sobre potencialmente milhares de títulos) |
| Job de reconciliação EFI (D-03/D-04/D-05) | API / Backend (NestJS `@Cron`) | External Service (EFI Cobranças) | Lógica de negócio (autenticação OAuth2, chamada `GET /v1/charge/:id`, atualização de status) pertence ao backend; nunca ao frontend |
| Painel de boletos consolidado (D-06) | API / Backend (Prisma / `CobrancaBoleto`) | Database / Storage (Postgres via Prisma) | Dado é 100% nosso (não do Athos) — não existe hoje um endpoint que junte `CobrancaBoleto` com nome do cliente; precisa nova query Prisma + enriquecimento de nome via Athos |
| Indicador NFS-e emitida/pendente (D-08) | API / Backend (dois serviços já existentes) | Database / Storage (`NfseEmitidaTitulo` local + Athos `venda.idnota`/`lotenfse`) | Reuso direto — nenhuma tier nova |
| Destaque visual de vencidos (D-10) | Browser / Client | — | Puramente CSS/JSX — já existe `getBadgeClass()` como precedente exato |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/schedule` | `^12.0.1` [VERIFIED: npm registry — `npm view @nestjs/schedule version` → `12.0.1`, published 2026-08-27] | Fornece `ScheduleModule.forRoot()` + decorator `@Cron()` para o job de reconciliação (D-05) | Pacote oficial do time NestJS (`github.com/nestjs/schedule`, mesmos mantenedores de `@nestjs/core`/`@nestjs/common` já usados no projeto); é o mecanismo idiomático para cron jobs em NestJS — não existe alternativa "mais padrão" no ecossistema |

**Peer dependency compatibility (verified):** `@nestjs/schedule@12.0.1` declares `peerDependencies: { "@nestjs/core": "^11.0.0 || ^12.0.0", "@nestjs/common": "^11.0.0 || ^12.0.0" }` [VERIFIED: npm registry — `npm view @nestjs/schedule peerDependencies`]. This project pins `@nestjs/common`/`@nestjs/core` at `^11.1.19` — fully compatible, no upgrade of existing NestJS packages needed.

**Transitive dependency:** `@nestjs/schedule@12.0.1` depends on `cron@4.4.0` [VERIFIED: npm registry — `npm view @nestjs/schedule dependencies`] — no `postinstall` script detected [VERIFIED: npm registry — `npm view @nestjs/schedule scripts.postinstall` returned empty].

### Supporting
None — no other new dependency is required. `axios` (already a dependency, used throughout `cobranca.service.ts`) remains the HTTP client for EFI calls inside the cron job, since `verificarPagamentoBoleto()` is reused as-is per D-04 (no new EFI client).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@nestjs/schedule` `@Cron` | Native `setInterval`/`setTimeout` (the exact pattern already used by `AthosListenerService` — `OnApplicationBootstrap`/`OnApplicationShutdown` lifecycle hooks, `unref()` on the timer, manual reconnect backoff) [VERIFIED: apps/backend/src/modules/integrations/athos/athos-listener.service.ts:16-18,70-76 — `private keepAliveTimer: ReturnType<typeof setInterval> \| null = null;` and `this.keepAliveTimer = setInterval(() => {...}, KEEP_ALIVE_MS); this.keepAliveTimer.unref?.();`] | D-05 explicitly locks in `@nestjs/schedule` as the chosen approach ("Requer novo pacote `@nestjs/schedule`") — this is a **locked decision**, not open for the planner to swap. Noted here only because it proves the codebase already has a working, zero-dependency precedent for periodic background work, which is useful context for reviewing whether the new dependency is justified (it is: `@Cron`'s declarative syntax + `SchedulerRegistry` introspection is more maintainable for a fixed-interval polling job than hand-rolled `setInterval` reconnect logic, which exists in `AthosListenerService` specifically because that service manages a *stateful LISTEN/NOTIFY connection*, not a stateless periodic poll) |
| Looping `verificarPagamentoBoleto()` per boleto (`GET /v1/charge/{id}` × N) | `GET /v1/charges` (plural) — a list endpoint documented with filters `charge_type`, `begin_date`, `end_date` (required) plus optional `customer_document`, `status`, `custom_id`, `value`, `date_of`, and pagination (`limit`, `page`, `offset`) [CITED: dev.efipay.com.br/docs/api-cobrancas/boleto] | Would collapse N calls into 1 per poll cycle, dramatically reducing rate-limit consumption — **but D-04 explicitly forbids writing a new EFI client** ("não escrever um novo cliente EFI"), and `GET /v1/charges` would require new request/response handling not present in `verificarPagamentoBoleto()`. Documented here as a **future optimization** if the pending-boleto count ever approaches the daily quota (see Pitfall 1) — out of scope for this phase per the locked decision |

**Installation:**
```bash
npm install @nestjs/schedule --workspace=apps/backend
```
(or `cd apps/backend && npm install @nestjs/schedule`, matching whichever install pattern this monorepo already uses for backend-only deps — check `apps/backend/package.json` is where prior single-app deps like `@nestjs/throttler` were added directly, not the root.)

**Version verification:** `@nestjs/schedule@12.0.1`, published 2026-08-27, confirmed via `npm view @nestjs/schedule version` [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age (latest ver.) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@nestjs/schedule` | npm | 12.0.1 published 2026-08-27 (≈1 week before this research) | 4,654,495/week | `github.com/nestjs/schedule` | **SUS** (`reasons: ["too-new"]`) | **Flagged — planner must add `checkpoint:human-verify` before `npm install`** |

**Context for the flag (do not skip the checkpoint, but do not treat this as a real risk signal either):** the `package-legitimacy` seam flags `@nestjs/schedule@12.0.1` as "too-new" purely because its latest published version is recent — the same v12.0.1 release also bumped `@nestjs/schedule`'s peer range to include NestJS v12, released in lockstep with the rest of the official `@nestjs/*` scope (mirrors `12.0.0`, published 20 minutes earlier the same day). This is the **official first-party NestJS scheduling package** (same maintainer account, `nestjscore`/`kamilmysliwiec`, as `@nestjs/common`/`@nestjs/core` already in `package.json`), with 4.65M weekly downloads and no `postinstall` script. There is no realistic slopsquatting concern here — the "too-new" heuristic is a false positive triggered by NestJS's own major-version release cadence, not by package age (the `@nestjs/schedule` package itself dates back to v1.1.0). The planner should still insert the `checkpoint:human-verify` task per protocol (cheap confirmation), but should not block on it or seek an older pinned version — `^12.0.1` is correct and is the version that explicitly declares `@nestjs/common`/`@nestjs/core` `^11.0.0` peer compatibility.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@nestjs/schedule` (see above — recommend approving after the checkpoint, not substituting).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser — /contas-receber (page.tsx, redesigned)                     │
│  ┌──────────────┐  ┌───────────────────┐  ┌────────────────────┐    │
│  │ Cards resumo │  │ Painel boletos     │  │ Lista clientes      │   │
│  │ (D-02/07/09) │  │ consolidado (D-06) │  │ ordenável (D-01/10) │   │
│  └──────┬───────┘  └─────────┬──────────┘  └──────────┬──────────┘  │
└─────────┼────────────────────┼────────────────────────┼─────────────┘
          │ GET /api/athos/    │ GET /api/cobranca/      │ (same call
          │ contas-receber/    │ boleto/dashboard (NEW)  │  as cards —
          │ dashboard (ext.)   │                         │  client sorts
          ▼                    ▼                         │  in-memory)
┌─────────────────────┐  ┌──────────────────────┐
│ Next.js Route Handler│  │ Next.js Route Handler │  (both proxy via
│ (backendFetch +      │  │ (backendFetch +       │   INTERNAL_API_KEY,
│  INTERNAL_API_KEY)   │  │  INTERNAL_API_KEY)    │   existing pattern)
└──────────┬───────────┘  └──────────┬────────────┘
           ▼                         ▼
┌────────────────────────┐  ┌─────────────────────────┐
│ AthosController         │  │ CobrancaController       │
│ GET contas-receber/     │  │ GET boleto/dashboard(NEW)│
│ dashboard (ext. SQL for │  │ → CobrancaService.       │
│ aging + a-vencer)       │  │   buscarBoletosDashboard │
└──────────┬──────────────┘  │   (NEW method, Prisma)   │
           ▼                  └──────────┬────────────────┘
┌────────────────────────┐              ▼
│ Athos Postgres (9.0.5)  │   ┌─────────────────────────┐
│ conta_receber, cliente  │   │ App Postgres (Prisma)    │
│ read-only pg.Pool       │   │ CobrancaBoleto,          │
└────────────────────────┘   │ NfseEmitidaTitulo         │
                              └─────────────────────────┘

                  ── background, independent of HTTP requests ──
┌───────────────────────────────────────────────────────────────┐
│ CobrancaModule (NestJS)                                         │
│  ┌───────────────────────────────────────────────────────────┐│
│  │ CobrancaReconciliationJob (NEW)                             ││
│  │  @Cron('*/15 * * * *')  // or */30, per plan decision       ││
│  │  1. SELECT id FROM CobrancaBoleto WHERE status='pendente'   ││
│  │  2. for each: await verificarPagamentoBoleto(id)  (existing)││
│  │     → POST /v1/authorize (EFI OAuth2)                       ││
│  │     → GET  /v1/charge/:id (EFI) — 15,000/day quota          ││
│  │  3. update CobrancaBoleto.status if changed                 ││
│  └───────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
                              │ (unchanged, still active)
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ POST /cobranca/boleto/notificacao (@Public webhook, unchanged)  │
│  — only handles status === "paid"; cron job is the only path    │
│    that also catches "canceled" on EFI's side                   │
└───────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
apps/backend/src/modules/cobranca/
├── cobranca.module.ts              # add ScheduleModule import if scoped here, or just add provider
├── cobranca.service.ts             # unchanged verificarPagamentoBoleto() reused as-is (D-04)
├── cobranca-reconciliation.job.ts  # NEW — @Injectable @Cron class, loops pending boletos
├── cobranca.controller.ts          # add GET boleto/dashboard (D-06)
└── cobranca.service.unit.test.ts   # existing pattern: Object.create(Prototype) + manual mocks

apps/backend/src/modules/app.module.ts
└── add ScheduleModule.forRoot() to imports[] (global, once)

apps/frontend/src/app/contas-receber/
└── page.tsx                        # redesign: add sort state, boletos panel, aging/vencimento cards
```

### Pattern 1: `@nestjs/schedule` wiring in an existing multi-module NestJS 11 app
**What:** `ScheduleModule.forRoot()` goes in the **root** `AppModule` (imported once, globally) — it registers the `SchedulerRegistry` provider that all `@Cron`/`@Interval`/`@Timeout` decorators in any module depend on. Individual `@Cron` jobs then live as normal `@Injectable()` providers inside whichever feature module owns them (here, `CobrancaModule`), with **no per-module `ScheduleModule` import needed**.
**When to use:** Exactly this phase's case — a periodic poll with no external trigger, needing NestJS DI (for `PrismaService`, `ConfigService`, and `CobrancaService.verificarPagamentoBoleto`).
**Example:**
```typescript
// Source: https://docs.nestjs.com/techniques/task-scheduling (official NestJS docs pattern)
// apps/backend/src/modules/app.module.ts
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    // ...existing imports unchanged...
    ScheduleModule.forRoot(),
    CobrancaModule,
  ],
  // ...
})
export class AppModule {}
```

```typescript
// apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts (NEW FILE)
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../database/prisma.service";
import { CobrancaService } from "./cobranca.service";

@Injectable()
export class CobrancaReconciliationJob {
  private readonly logger = new Logger(CobrancaReconciliationJob.name);
  private running = false; // guards against overlapping runs if a batch takes longer than the interval

  constructor(
    private readonly prisma: PrismaService,
    private readonly cobrancaService: CobrancaService,
  ) {}

  // CronExpression.EVERY_15_MINUTES or a raw "*/30 * * * *" string per plan decision
  @Cron(CronExpression.EVERY_15_MINUTES)
  async reconciliarBoletosPendentes(): Promise<void> {
    if (this.running) {
      this.logger.warn("Execução anterior ainda em andamento — pulando este ciclo.");
      return;
    }
    this.running = true;
    try {
      const pendentes = await this.prisma.cobrancaBoleto.findMany({
        where: { status: "pendente" },
        select: { id: true },
      });
      this.logger.log(`Reconciliação EFI: ${pendentes.length} boleto(s) pendente(s).`);
      for (const { id } of pendentes) {
        try {
          const { status, atualizado } = await this.cobrancaService.verificarPagamentoBoleto(id);
          if (atualizado) this.logger.log(`Boleto ${id} atualizado para status=${status}.`);
        } catch (err) {
          // non-fatal: log and continue to the next boleto — one EFI failure must not stop the batch
          this.logger.error(`Falha ao reconciliar boleto ${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
```
```typescript
// apps/backend/src/modules/cobranca/cobranca.module.ts — add the job as a provider
providers: [CobrancaService, EmailEnvioService, CobrancaReconciliationJob],
```

### Pattern 2: Existing OAuth2 token-cache pattern available (not required by D-04, noted for awareness)
**What:** `EfiService` (the PIX module, sibling to `CobrancaService`) already implements in-memory access-token caching, reusing the token until 60s before its 600s TTL expires [VERIFIED: apps/backend/src/modules/integrations/efi/efi.service.ts:16,154-158,182-185 — `private tokenCache: { accessToken: string; expiresAt: number } | null = null;` / `if (this.tokenCache && now < this.tokenCache.expiresAt) { return this.tokenCache.accessToken; }` / `this.tokenCache = { accessToken, expiresAt: now + Math.max((expiresIn - 60) * 1000, 30_000) };`].
**When to use:** `CobrancaService.verificarPagamentoBoleto()` does **not** use this pattern — it calls `POST /v1/authorize` fresh on every single invocation [VERIFIED: apps/backend/src/modules/cobranca/cobranca.service.ts:753-761]. D-04 locks in reusing `verificarPagamentoBoleto()` as-is ("não escrever um novo cliente EFI"), so this phase should **not** refactor it to add token caching — noted only as a "Don't Hand-Roll" cross-reference in case the planner considers it, and as evidence that repeated auth-per-call is a known, already-tolerated pattern in this codebase (not a new risk introduced by the cron job).

### Anti-Patterns to Avoid
- **Looping `GET /v1/charge/{id}` without any overlap guard:** if a batch of N boletos takes longer than the cron interval (e.g., network hiccups make 50 sequential calls take >15 min), a naive `@Cron` without a `running` flag will start a second overlapping run, doubling EFI traffic and risking double-processing. Use the `running` boolean guard shown in Pattern 1 (or `SchedulerRegistry.getCronJob(name).stop()`/`start()` if more control is needed).
- **Building a new endpoint for the boletos panel (D-06) on top of `buscarDashboardContasReceber`:** that method queries the **Athos** `conta_receber` table (external system, per-client aggregation) and has no join to `CobrancaBoleto` (this app's own Prisma table). Extending it would require a cross-database join that doesn't exist — the boletos panel needs an **independent** Prisma query, enriched with client names via a batch call to Athos (`buscarDadosClienteContasReceber` or similar), not a modification of the existing dashboard SQL.
- **Recomputing "taxa de inadimplência" (D-02) client-side from the paginated `clientes` array:** the existing dashboard endpoint caps results at `LIMIT 100` [VERIFIED: apps/backend/src/modules/integrations/athos/athos.service.ts:1870 — `LIMIT 100`], a decision documented in `STATE.md` ("2026-05-21 | LIMIT 100 hardcoded... Decisao D-08: sem paginacao no frontend para este MVP"). A default-rate computed only over the 100 rows currently displayed would silently misreport if there are more than 100 clientes devedores. Compute it in SQL (e.g., `COUNT(DISTINCT client with atraso) / COUNT(DISTINCT total clientes com título aberto)`) unbounded by the `LIMIT`, or document explicitly if approximated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Periodic background job scheduling | Custom `setInterval` + manual drift correction | `@nestjs/schedule`'s `@Cron` decorator (per locked D-05) | Standard, testable via `SchedulerRegistry`, declarative cron syntax, avoids re-deriving the reconnect/backoff logic that `AthosListenerService` needed only because it manages a stateful DB connection (not applicable here) |
| EFI OAuth2 + charge status polling | A second/duplicate EFI HTTP client inside the new cron job | `CobrancaService.verificarPagamentoBoleto(id)` (existing, already handles auth + status mapping + Prisma update) | D-04 explicitly forbids a new EFI client; the existing method already implements the full flow correctly |
| NFS-e emitted/pending check per título | Re-querying Athos SOAP/XML NFS-e state from scratch | `AthosService.verificarNFTitulos()` (checks `venda.idnota`/`lotenfse`) + `CobrancaService.buscarNfseEmitidaParaTitulos()` (checks local `NfseEmitidaTitulo`) | Both already exist and are used by the boleto-creation flow (`criarBoleto`) precisely for this same "does this título have an NF?" question |
| Aging-bucket / due-date-window computation | Client-side `Date` math over the full unbounded títulos list | SQL `CASE WHEN` / date-diff aggregation in the existing `buscarDashboardContasReceber` query (same pattern already used for `maior_atraso_dias`) | Keeps the computation server-side, correct even when títulos exceed what's rendered, and consistent with the existing SQL-aggregation architecture |

**Key insight:** virtually everything this phase needs already exists somewhere in the codebase in a directly reusable form — the work is composition (new endpoint wiring, new cron scheduling, new frontend layout), not new logic. The one genuinely new piece of infrastructure is the `@nestjs/schedule` dependency itself.

## Common Pitfalls

### Pitfall 1: EFI `GET /v1/charge/{id}` daily quota exhaustion from over-aggressive polling
**What goes wrong:** Running the reconciliation loop too frequently over too many pending boletos could exhaust EFI's daily request quota for the charge-inquiry endpoint, causing the cron job (and potentially other EFI charge operations, like manual "verificar pagamento" or `criarBoleto`) to start failing with 429s for the rest of the day.
**Why it happens:** EFI's official docs [CITED: dev.efipay.com.br/docs/api-cobrancas/limites-de-consumo] state a **daily** quota of **15,000 requests for `GET /v1/charge/:id`**, reset every 24 hours, with a warning triggered at 80% consumption and hard blocking at 100%; there is **no documented per-minute/per-second throttle** for this specific endpoint (contrast with the `POST /v1/charge/lote` batch-creation endpoint, which does have a separate, undocumented-in-numbers per-minute limit per a community forum thread [CITED: comunidade.sejaefi.com.br/discussao/rate-limiting-pix-cobranca-lote] — not applicable here since this phase only calls the singular `GET /v1/charge/:id`, not batch creation).
  - Math at proposed frequencies: at a 15-min interval (96 runs/day), the quota supports up to **~156 pending boletos per run** before hitting 15,000/day (96 × 156 ≈ 14,976); at a 30-min interval (48 runs/day), up to **~312 pending boletos per run**. Both leave meaningful headroom below the 80% (12,000/day) warning threshold for a small-business volume (this business's monthly revenue is R$70-80k per `STATE.md` fechamentos — a papelaria/gráfica issuing *consolidated* boletos per client, not per-título, per the 2026-05-22 decision "Boleto consolidado (multiplos titulos) em vez de por titulo" — realistically implies pending-boleto counts in the tens, not hundreds, at any given time) [ASSUMED — see Assumptions Log A1].
  - The `POST /v1/authorize` call inside `verificarPagamentoBoleto()` happens once per boleto per run (not cached — see Pattern 2) — this consumes a *separate* endpoint's quota (undocumented number in the sources checked this session), not the 15,000/day charge-inquiry budget, so it does not compound the risk above, but is still an inefficiency worth flagging for the planner (not required to fix, per D-04).
**How to avoid:** Pick the cron interval based on the *actual* current count of `status: "pendente"` `CobrancaBoleto` rows (run `SELECT COUNT(*) FROM "CobrancaBoleto" WHERE status = 'pendente';` against the app's own Postgres before finalizing frequency — not measurable from this research session, no live DB access). Log the pending count on every run (as shown in Pattern 1's `this.logger.log`) so drift is visible in production logs. If the business ever scales past ~150-300 concurrent pending boletos, migrate to the `GET /v1/charges` list endpoint (see Alternatives Considered) instead of increasing frequency.
**Warning signs:** EFI API responses starting to return non-200/429-like errors from `verificarPagamentoBoleto()` specifically in the evening/late in the day (after quota accumulates); the existing `catch` block in `verificarPagamentoBoleto()` already logs and throws `InternalServerErrorException` on any EFI error [VERIFIED: apps/backend/src/modules/cobranca/cobranca.service.ts:772-775] — the cron job's per-boleto `try/catch` (Pattern 1) prevents one such failure from aborting the whole batch, but repeated failures across the whole batch late in the day would be the quota-exhaustion signature.

### Pitfall 2: Webhook and cron reconciling different EFI statuses — false sense of full coverage
**What goes wrong:** Assuming the new cron job is "just a backup" for the webhook and therefore doesn't need careful status-mapping review.
**Why it happens:** The webhook handler `processarNotificacaoEFI()` **only acts on `status === "paid"`** — any other status (including `"canceled"`) is logged with "sem ação" and the boleto is left untouched [VERIFIED: apps/backend/src/modules/cobranca/cobranca.service.ts:605-619 — `if (status === "paid") { ... } else { this.logger.log(...); }`]. `verificarPagamentoBoleto()` (used by the new cron), by contrast, maps **both** `"paid"` → `"pago"` **and** `"canceled"` → `"cancelado"` [VERIFIED: apps/backend/src/modules/cobranca/cobranca.service.ts:765 — `const novoStatus = efiStatus === "paid" ? "pago" : efiStatus === "canceled" ? "cancelado" : cobranca.status;`].
**How to avoid:** Document this explicitly as a **positive** side-effect of D-03/D-04 in the plan (the cron job actually closes an existing gap — boletos canceled directly on the EFI dashboard/app were never reflected locally before this phase, since the webhook doesn't handle that status and there was previously only the manual "verificar pagamento" button). No code change needed beyond what D-04 already specifies — just don't assume the cron is *strictly* redundant with the webhook; it has broader status coverage.
**Warning signs:** N/A — this is a design clarification, not a bug to detect at runtime.

### Pitfall 3: Historical webhook fragility beyond the already-fixed `notification_url` bug
**What goes wrong:** Treating the webhook as now fully reliable because the `notification_url` bug (undefined URL, boleto never auto-confirmed) was fixed.
**Why it happens:** The current code comment [VERIFIED: apps/backend/src/modules/cobranca/cobranca.service.ts:178-182 — "APP_BASE_URL e a variavel efetivamente injetada... sem elas a notification_url ficava sempre undefined e o boleto nunca era confirmado automaticamente"] documents that *specific* historical bug as fixed, but EFI's own webhook-retry documentation shows several *other* independent failure modes that remain possible regardless of that fix: HTTP 404 (wrong path after a redeploy changes routing), 301/302 redirects (HTTPS/proxy config changes), 500s (app down at the moment of notification), and timeouts [CITED: dev.efipay.com.br/en/docs/api-cobrancas/notificacoes/]. EFI retries on these with exponential backoff (documented intervals: 5, 10, 20, 40, 80, 160, 320, 640, 1280 minutes, then a final long interval) but retries are finite — the exact total retry window is inconsistently stated across the source page's own sections (a 3-day figure appears in one place, an interval table summing to ~36 days appears in another) [CITED: dev.efipay.com.br/en/docs/api-cobrancas/notificacoes/ — exact total window not independently confirmable from this session; if the precise cutoff matters for a design decision, re-check the live page directly rather than relying on this summary].
**How to avoid:** This is precisely why D-03 mandates the cron as an independent path (not dependent on the webhook's health at all) — no additional code is needed to "fix" the webhook itself in this phase; the cron is the mitigation.
**Warning signs:** Boletos stuck in `"pendente"` status in the CobrancaBoleto table long after their real-world payment date, only resolved by the cron's next run or a manual click — expected occasional behavior, not a bug, given the above.

### Pitfall 4: Sorting/filtering fields not actually present in the current payload
**What goes wrong:** Assuming "ordenar por pago" (D-01, "vencido, pagos") requires a new backend field, when the existing dashboard endpoint's default status filter (`AVC`+`VEN` when no `status` query param is passed) [VERIFIED: apps/backend/src/modules/integrations/athos/athos.controller.ts:284-286 — `const filtro = status && ALLOWED.includes(status.toUpperCase()) ? status.toUpperCase() : undefined;`] means **"pagos" (REC) records are never in the default payload the frontend receives** — `page.tsx` only re-fetches with `?status=REC` when the user clicks that filter button, replacing the client list entirely rather than merging it. "Ordenar por pago" as a *sort key* alongside "nome"/"vencido" therefore cannot mean "sort the currently-open clients by whether they're paid" (that's contradictory — open clients aren't paid) — it more likely means the existing status-filter buttons should coexist with the new sort control (sort within whichever filtered set is active), not that "pago" becomes a literal sortable column value.
**How to avoid:** Clarify in the plan (not re-litigate with the user, since D-01 is locked) that "ordenar por... pagos" is satisfied by keeping the existing `STATUS_OPTIONS` filter buttons (AVC/VEN/REC/CAN) working exactly as today, and adding sort controls (nome, valor devido, valor atrasado) that apply *within* whatever filter is currently selected — this matches the discussion log's literal ask ("organizar por nome, vencido e pagos e outros itens importantes") which conflates "filter by paid" (already exists) with "sort by other criteria" (new).
**Warning signs:** A plan task that tries to add a `status`-based sort comparator alongside `nome`/`valor` sort comparators in the same dropdown — a sign the filter/sort conflation from Pitfall 4 wasn't resolved.

## Code Examples

### Existing pattern: client-side "sort within filtered set" precedent (search box)
```typescript
// Source: apps/frontend/src/app/contas-receber/page.tsx:96-103 (existing code, read this session)
const buscaNormalizada = busca.trim().toLowerCase();
const clientesFiltrados = buscaNormalizada
  ? clientes.filter(
      (c) =>
        c.nome_cliente.toLowerCase().includes(buscaNormalizada) ||
        String(c.idcliente).includes(buscaNormalizada),
    )
  : clientes;
```
This is the exact precedent to extend for D-01: add a `sortBy` state (`"nome" | "total_devido" | "total_atrasado"`) and a `.sort()` step applied to `clientesFiltrados` before render, mirroring how `busca` already filters without a new backend call.

### Existing pattern: aging badge (extend, don't replace, for D-10)
```typescript
// Source: apps/frontend/src/app/contas-receber/page.tsx:33-43 (existing code, read this session)
function getBadgeClass(maior_atraso_dias: number | null): string {
  if (maior_atraso_dias === null || maior_atraso_dias === 0) return "badge bg-success";
  if (maior_atraso_dias <= 30) return "badge bg-warning text-dark";
  if (maior_atraso_dias <= 90) return "badge bg-orange text-white";
  return "badge bg-danger";
}
```
D-07's aging buckets (30/60/90+) should reuse these exact thresholds for visual consistency (currently the buckets are implicitly 0 / 1-30 / 31-90 / 90+ — the plan should decide whether D-07's buckets are literally 30/60/90 as stated in CONTEXT.md D-07, which differs slightly from this existing 30/90 split — reconcile explicitly, don't silently pick one).

### `@nestjs/schedule` official usage
See Architecture Patterns → Pattern 1 above for the full worked example (`ScheduleModule.forRoot()` + `@Cron` service), sourced from the official NestJS task-scheduling docs pattern and adapted to this codebase's existing `CobrancaService`/`PrismaService` DI shape.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual "verificar pagamento" click only | Webhook (added 2026-07-23, commit `41b5663`/`707df8b`) + manual click | 2026-07-23 (`260723-h65`) | Reduced but didn't eliminate manual reconciliation; webhook itself has known gaps (Pitfall 2/3) |
| This phase | Webhook + manual click + scheduled cron (D-03) | This phase | Closes the "webhook silently failed" gap and adds `"canceled"` status coverage the webhook never had |

**Deprecated/outdated:** N/A — no library or pattern is being deprecated by this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The number of `CobrancaBoleto` rows with `status: "pendente"` at any given time is in the tens, not hundreds — reasoned from the business's documented monthly revenue (R$70-80k, per `CLAUDE.md`/`STATE.md` fechamentos) and the "boleto consolidado" design (one boleto per multiple títulos, not per título, per the 2026-05-22 STATE.md decision) — **not verified via a live query against the app's own Postgres in this session (no DB access available)** | Pitfall 1 / Summary | If actual pending count is materially higher (e.g., because of accumulated unpaid boletos from months of no reconciliation before this phase), the recommended 15-30 min interval could approach the EFI daily quota faster than estimated. Low risk given the quota headroom calculated (up to ~150-300 boletos/run supported), but the planner/executor should run `SELECT COUNT(*) FROM "CobrancaBoleto" WHERE status='pendente';` against production before finalizing the cron frequency, as a cheap Wave-0-style sanity check |
| A2 | The total retry window EFI uses before giving up on webhook notification delivery is not independently confirmed — the source page's own text was internally inconsistent between a "3 days" statement and a backoff-interval table summing to ~36 days | Pitfall 3 | Low risk — this phase's mitigation (D-03's independent cron) does not depend on knowing the exact webhook retry window; only relevant if a future phase needs to reason precisely about "how long can the webhook path be down before we've lost the notification permanently" |
| A3 | "ordenar por... pagos" (D-01) is satisfied by the existing REC status filter button rather than requiring a new "paid" sort key within the open-clients list | Pitfall 4 | If the user actually meant something else (e.g., a merged view of all statuses with a status column to sort by), the plan under-delivers on D-01. Low-medium risk — recommend a 1-line confirmation with the user during planning rather than an executor-time surprise, since D-01 is locked but its literal interpretation has ambiguity the discussion log doesn't fully resolve |

## Open Questions (RESOLVED)

1. **Exact current count of pending `CobrancaBoleto` rows in production**
   - What we know: architecturally the volume should be low (tens), based on consolidated-boleto design and business revenue scale
   - What's unclear: no live DB access in this research session to run the actual `COUNT(*)` query
   - Recommendation: planner adds this as a pre-flight check (either a Wave 0 manual step, or the cron job itself logs the count on first run and the interval can be tuned after observing real numbers for a few days) — do not block planning on this, the quota headroom is generous enough to proceed with 15-30 min as-is
   - **RESOLVED:** `41-02-PLAN.md` Task 3 (`CobrancaReconciliationJob`) logs the pending count on every run; `41-04-PLAN.md` Task 1's `<human-check>` explicitly asks the operator to record the observed count to validate the 30-min cadence against real production volume.

2. **D-07's aging buckets (30/60/90+) vs. the existing frontend badge thresholds (30/90) — should they be reconciled to the same cutoffs?**
   - What we know: `41-CONTEXT.md` D-07 explicitly says "30/60/90 dias"; the existing `getBadgeClass()` in `page.tsx` uses `<=30` / `<=90` / `>90` (no distinct 60-day tier)
   - What's unclear: whether the new aging-bucket cards (D-02/D-07) should introduce a genuinely new 4-tier bucket (0-30/31-60/61-90/90+) distinct from the existing 3-tier badge coloring, or whether the badge should also be updated to match
   - Recommendation: plan explicitly for the SQL aggregation to use 4 buckets (0-30/31-60/61-90/90+) per the locked D-07 wording, and treat the existing per-client badge as a separate, lower-resolution visual cue that doesn't need to change — avoids scope creep into redesigning an already-working badge
   - **RESOLVED:** `41-03-PLAN.md` Task 1 locks in the 4-tier bucket (0-30/31-60/61-90/90+) distinct from `getBadgeClass()`, which is explicitly left unchanged (protected by acceptance criteria per the plan-checker's coverage review).

3. **New consolidated-boletos endpoint (D-06) naming and exact shape** (explicitly flagged as Claude's Discretion in CONTEXT.md)
   - What we know: needs to join `CobrancaBoleto` + client name (via Athos) + títulos vinculados + días to vencimento
   - What's unclear: exact response shape, and whether it should reuse `buscarBoletosCliente()`'s per-client query pattern (loop over all distinct `idclienteAthos` in `CobrancaBoleto`) or a single cross-client Prisma query with a batch Athos name lookup
   - Recommendation: single Prisma query (`groupBy` or plain `findMany` with `status: "pendente"` or all non-cancelled) + one batched Athos name-resolution call (reuse `buscarDadosClienteContasReceber`-style lookup, batched by distinct `idclienteAthos` to avoid N+1 queries against the Athos read-only Pool) — plan should specify this explicitly to avoid an N+1 implementation
   - **RESOLVED:** `41-01-PLAN.md`'s `<interfaces>` section fully specifies the single-query + batched-Athos-lookup shape, exactly as recommended — no per-client loop.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm registry access | Installing `@nestjs/schedule` | ✓ | confirmed via `npm view` this session | — |
| EFI Cobranças API (external, `cobrancas-h.api.efipay.com.br` or prod equivalent) | Reconciliation job, existing boleto flows | Not verified live in this session (no live credentials probe run — would require making a real authenticated call against production EFI, out of scope for research) | — | The job's per-boleto `try/catch` (Pattern 1) already tolerates transient EFI unavailability without crashing the whole batch |
| App's own Postgres (Prisma) | New boleto-dashboard endpoint, cron's pending-boleto query | ✓ (existing `PrismaService`, `CobrancaBoleto`/`NfseEmitida` tables already in schema and in active use) | Prisma `^5.22.0` client / `^5.19.1` CLI [VERIFIED: apps/backend/package.json] | — |
| Athos Postgres (read-only, 9.0.5 per user's global memory) | Dashboard SQL extensions (aging, a-vencer) | ✓ (existing `AthosService` `pg.Pool`, already queries `conta_receber`/`cliente`) | PostgreSQL 9.0.5 — **no `pg_sequence_last_value`, use `pg_catalog` per user's standing instruction** (relevant only if any new sequence-introspection is needed, which this phase does not require — noted for completeness) | — |

**Missing dependencies with no fallback:** none — `@nestjs/schedule` is the only new dependency and is fully available on the npm registry.
**Missing dependencies with fallback:** none blocking.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `^30.3.0` + `ts-jest ^29.4.9` [VERIFIED: apps/backend/package.json] |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `npx jest cobranca --silent` (backend) |
| Full suite command | `npm test` (backend, runs full `jest`) |

**Existing test pattern for `CobrancaService`** [VERIFIED: apps/backend/src/modules/cobranca/cobranca.service.unit.test.ts:1-17]: manual instantiation via `Object.create(CobrancaService.prototype)` with hand-assigned mock `logger`/`prisma`/`athosService` properties — **not** `@nestjs/testing`'s `Test.createTestingModule()`. New tests for `CobrancaReconciliationJob` and any new dashboard-aggregation logic should follow this same lightweight pattern for consistency, unless the new class's constructor DI surface makes the manual-mock pattern awkward (e.g., if `CobrancaReconciliationJob` only depends on `PrismaService` + `CobrancaService`, the existing pattern applies cleanly).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-04/D-05 | Cron job iterates all pending boletos, calls `verificarPagamentoBoleto` per boleto, tolerates individual failures without aborting the batch | unit | `npx jest cobranca-reconciliation` | ❌ Wave 0 — new file `cobranca-reconciliation.job.test.ts` |
| D-04/D-05 | Overlapping-run guard (`running` flag) prevents a second cron tick from starting mid-batch | unit | `npx jest cobranca-reconciliation` | ❌ Wave 0 — same new file, additional test case |
| D-06 | New boleto-dashboard endpoint returns consolidated data across clients, not scoped to one `idclienteAthos` | unit (service) + manual (endpoint smoke via `curl`/Swagger) | `npx jest cobranca.service` | ❌ Wave 0 — extend existing `cobranca.service.*.test.ts` files or add a new one |
| D-07/D-09 | Aging buckets and a-vencer totals in `buscarDashboardContasReceber` sum correctly against known fixture data | unit | `npx jest athos.service` | Check — existing `athos.service` test files not enumerated this session; verify during planning whether `buscarDashboardContasReceber` already has test coverage to extend |
| D-01/D-02/D-08/D-10 | Frontend sort/filter/badge logic | manual UAT (no frontend test framework detected for `apps/frontend` in this session — verify during planning) | — | Manual-only unless a frontend test runner is confirmed present |

### Sampling Rate
- **Per task commit:** `npx jest cobranca --silent` (backend), manual browser check for frontend changes (no frontend test runner confirmed)
- **Per wave merge:** `npm test` (backend full suite)
- **Phase gate:** Full backend suite green + manual UAT of dashboard redesign before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.test.ts` — covers D-04/D-05 (loop, overlap guard, per-boleto error isolation)
- [ ] Confirm whether `apps/backend/src/modules/integrations/athos/athos.service.*.test.ts` exists and covers `buscarDashboardContasReceber` — extend rather than duplicate if so
- [ ] Framework install: `npm install @nestjs/schedule --save` in `apps/backend` (per Standard Stack) — after the `checkpoint:human-verify` from the Package Legitimacy Audit
- [ ] Confirm presence/absence of a frontend test runner in `apps/frontend/package.json` before committing to "manual-only" for D-01/D-02/D-08/D-10 (not checked in this research session — quick planner-time verification)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (internal tool, no new auth surface) | Existing `x-internal-api-key` (`InternalAuthGuard`, global `APP_GUARD`) already covers the new `GET /cobranca/boleto/dashboard` endpoint automatically — no `@Public()` needed |
| V3 Session Management | No | Existing `PasswordGate` cookie-based gate on `/contas-receber` [VERIFIED: apps/frontend/src/app/contas-receber/page.tsx:56-60 — `<PasswordGate title="Contas a Receber" ...>`] already covers the redesigned dashboard; no change needed |
| V4 Access Control | Yes | New endpoint (D-06) must **not** be marked `@Public()` — it must fall under the same `InternalAuthGuard` as every other `CobrancaController` route (all existing routes in this controller already rely on the guard being applied globally in `AppModule`, except the two explicitly `@Public()`-decorated webhook/pixel/confirm routes) |
| V5 Input Validation | Yes | No new user-supplied input in this phase beyond existing patterns (query params for the dashboard filter, already validated in `AthosController.dashboardContasReceber` via an `ALLOWED` allow-list [VERIFIED: apps/backend/src/modules/integrations/athos/athos.controller.ts:284] ) — extend that same allow-list pattern for any new query params, don't introduce raw string interpolation into SQL |
| V6 Cryptography | No | No new crypto surface — EFI OAuth2 flow is unchanged (reused via `verificarPagamentoBoleto`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection in new aging/vencimento SQL aggregation | Tampering | Continue the existing pattern of parameterized queries via `pg.Pool.query(sql, [params])` — every existing Athos query in `athos.service.ts` (including `buscarDashboardContasReceber`) already uses `$1`-style placeholders, never string interpolation of user input |
| New consolidated-boletos endpoint accidentally exposed as `@Public()` | Elevation of Privilege / Information Disclosure | Explicit code-review check during implementation: confirm the new `@Get("boleto/dashboard")` handler has **no** `@Public()` decorator (unlike the two webhook/pixel routes in the same controller) |
| Cron job silently swallowing all EFI errors, masking a systemic outage | Repudiation (loss of auditability) | Pattern 1's per-boleto `try/catch` logs every failure via `this.logger.error` — ensure these logs are actually retained/monitored (out of scope to build new alerting in this phase, but the plan should not remove or downgrade this logging) |

## Sources

### Primary (HIGH confidence)
- Codebase reads this session (all with path + line citations inline above): `cobranca.service.ts`, `cobranca.controller.ts`, `athos.service.ts` (lines 1824-1909), `athos.controller.ts` (lines 265-345), `athos-listener.service.ts`, `efi.service.ts` (lines 1-194, 729-745), `contas-receber/page.tsx`, `schema.prisma` (lines 225-310), `app.module.ts`, `cobranca.module.ts`, `package.json` (backend), `cobranca.service.unit.test.ts`
- `npm view @nestjs/schedule` (version, peerDependencies, dependencies, scripts.postinstall, time) — npm registry, run this session
- `gsd_run query package-legitimacy check --ecosystem npm @nestjs/schedule` — seam output this session

### Secondary (MEDIUM confidence)
- `dev.efipay.com.br/docs/api-cobrancas/limites-de-consumo` — 15,000/day quota for `GET /v1/charge/:id`, 30,000/day for notification endpoint, daily reset, 80% warning threshold
- `dev.efipay.com.br/docs/api-cobrancas/boleto` — endpoint inventory including `GET /v1/charges` (list) with filters/pagination
- `dev.efipay.com.br/en/docs/api-cobrancas/notificacoes/` — webhook retry backoff schedule and failure-mode examples
- `dev.efipay.com.br/docs/api-cobrancas/credenciais` — OAuth2 token TTL (600s / `expires_in`)
- NestJS official task-scheduling docs pattern (`ScheduleModule.forRoot()` + `@Cron`) — well-established, standard usage, not independently re-fetched this session beyond training knowledge cross-checked against the verified `@nestjs/schedule` package API surface (peer deps, version)

### Tertiary (LOW confidence)
- `comunidade.sejaefi.com.br/discussao/rate-limiting-pix-cobranca-lote` — community forum thread on batch-endpoint rate limiting (200 charges/batch max, unspecified per-minute throttle) — not directly applicable to this phase's use of the singular `GET /v1/charge/:id`, included only as a note in Alternatives Considered

## Metadata

**Confidence breakdown:**
- Standard stack (`@nestjs/schedule`): HIGH — verified via npm registry directly (version, peer deps, no postinstall)
- Architecture / codebase integration: HIGH — every claim about existing code paths (`verificarPagamentoBoleto`, dashboard endpoint, webhook handler, Prisma schema) is backed by a direct `Read` of the source this session with line citations
- EFI rate limits: MEDIUM — sourced from official `dev.efipay.com.br` documentation pages via `WebFetch`, but not independently cross-verified against a second source or a live API probe (no production EFI credentials available in this research session)
- Pending-boleto volume estimate (A1): LOW — reasoned from business context, not measured

**Research date:** 2026-09-04
**Valid until:** ~30 days for the codebase-integration findings (stable, brownfield code); ~90 days for the EFI rate-limit documentation (external vendor docs change infrequently, but re-verify if EFI announces API changes) — recommend re-checking `dev.efipay.com.br/docs/api-cobrancas/limites-de-consumo` if this phase's execution is delayed past 2026-12
