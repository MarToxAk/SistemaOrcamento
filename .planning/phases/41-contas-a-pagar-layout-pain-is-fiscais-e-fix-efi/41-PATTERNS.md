# Phase 41: Contas a Receber — Dashboard Redesign, Painéis Fiscais e Reconciliação EFI - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 8 (5 new, 3 modified/extended)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts` (NEW) | service (cron job) | batch/event-driven (polling) | `apps/backend/src/modules/integrations/athos/athos-listener.service.ts` (background service lifecycle) + NestJS official `@Cron` pattern (no existing `@Cron` in repo) | role-match (closest existing precedent for "background, non-HTTP-triggered work") |
| `apps/backend/src/modules/cobranca/cobranca.service.ts` (MODIFIED — add `buscarBoletosDashboard`) | service | CRUD (read aggregation) | `apps/backend/src/modules/cobranca/cobranca.service.ts` → `buscarBoletosCliente()` (same file, same class) | exact |
| `apps/backend/src/modules/cobranca/cobranca.controller.ts` (MODIFIED — add `GET boleto/dashboard`) | controller | request-response | `apps/backend/src/modules/cobranca/cobranca.controller.ts` → `boletosCliente()` handler | exact |
| `apps/backend/src/modules/cobranca/cobranca.module.ts` (MODIFIED — register job as provider) | config/module wiring | — | same file (existing `providers: [CobrancaService, EmailEnvioService]`) | exact |
| `apps/backend/src/modules/app.module.ts` (MODIFIED — add `ScheduleModule.forRoot()`) | config | — | same file (existing `imports: [...]` array with `ThrottlerModule.forRoot(...)` as precedent for a `.forRoot()`-style global module) | exact |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` (MODIFIED — extend `buscarDashboardContasReceber` SQL for aging buckets + a-vencer totals) | service | CRUD (read aggregation, raw SQL) | same method, same file (extend existing query, don't duplicate) | exact |
| `apps/backend/src/modules/integrations/athos/athos.controller.ts` (MODIFIED — no new route needed; existing `dashboardContasReceber` handler just returns the extended shape) | controller | request-response | same file, `dashboardContasReceber()` handler | exact |
| `apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts` (NEW) | route (Next.js proxy) | request-response | `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` | exact |
| `apps/frontend/src/app/contas-receber/page.tsx` (MODIFIED — redesign: sort state, boletos panel, summary/aging/vencimento cards, badges) | component | request-response + client-side transform | same file (extend existing `ContasReceberDashboard` component) | exact |
| `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts` (NEW) | test | — | `apps/backend/src/modules/cobranca/cobranca.service.unit.test.ts` | exact (test-structure pattern) |

## Pattern Assignments

### `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.ts` (NEW — service/cron)

**Analog:** No exact analog exists in-repo (first `@Cron` job in this codebase). Two sources combine:
1. `apps/backend/src/modules/integrations/athos/athos-listener.service.ts` — closest existing precedent for "long-lived background work independent of HTTP requests," for DI/constructor and logging conventions.
2. RESEARCH.md's `Pattern 1` (official NestJS `@Cron` usage, already adapted to this codebase's shape by gsd-phase-researcher) — use this as the primary template since it directly matches this repo's DI style (`PrismaService`, `Logger`).

**DI / constructor pattern** (from `cobranca.service.ts` lines 31-41, and `athos-listener.service.ts` lines 12-26):
```typescript
@Injectable()
export class CobrancaReconciliationJob {
  private readonly logger = new Logger(CobrancaReconciliationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cobrancaService: CobrancaService,
  ) {}
}
```

**Overlap-guard pattern** — no direct precedent for a boolean "running" flag in this repo, but `athos-listener.service.ts` (lines 16-19) shows the established style of private mutable state fields (`keepAliveTimer`, `reconnectAttempt`, `reconnectTimer`, `enabled`) tracked as class properties for lifecycle control — same idiom applies to a `private running = false;` guard:
```typescript
// apps/backend/src/modules/integrations/athos/athos-listener.service.ts:15-19 (idiom reference)
private client: Client | null = null;
private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
private reconnectAttempt = 0;
private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
private enabled = false;
```

**Core loop pattern** — reuse `verificarPagamentoBoleto()` as-is (D-04 locked), per-item try/catch matching this codebase's error-isolation style (`cobranca.service.ts:772-775`):
```typescript
// apps/backend/src/modules/cobranca/cobranca.service.ts:772-775 (error-handling idiom to mirror per-boleto)
} catch (err) {
  this.logger.error(`Erro ao verificar pagamento do boleto ${cobrancaId} na EFI: ${err instanceof Error ? err.message : String(err)}`);
  throw new InternalServerErrorException(`Erro ao verificar pagamento na EFI: ${err instanceof Error ? err.message : String(err)}`);
}
```
In the job, catch per-boleto (do not let one throw abort the batch — this differs from `verificarPagamentoBoleto`'s own re-throw, which is fine because the job's loop wraps each call in its own try/catch, matching RESEARCH.md Pattern 1 verbatim).

**Query for pending boletos** — mirrors `buscarBoletosCliente()`'s Prisma `findMany` shape (`cobranca.service.ts:794-798`):
```typescript
// apps/backend/src/modules/cobranca/cobranca.service.ts:794-798 (Prisma findMany idiom)
const boletos = await this.prisma.cobrancaBoleto.findMany({
  where: { idclienteAthos },
  orderBy: { criadoEm: "desc" },
  include: { titulos: { select: { idcontareceber: true, valor: true } } },
});
```
For the job: `this.prisma.cobrancaBoleto.findMany({ where: { status: "pendente" }, select: { id: true } })`.

---

### `apps/backend/src/modules/cobranca/cobranca.service.ts` — new method `buscarBoletosDashboard()` (D-06)

**Analog:** `buscarBoletosCliente()` — same file, lines 789-805.

**Imports already present** (lines 1-19) — no new imports needed beyond what's already imported (`PrismaService`, `AthosService` already injected in constructor).

**Core CRUD pattern to copy and adapt** (lines 789-805):
```typescript
/** Busca boletos de um cliente com seus títulos vinculados */
async buscarBoletosCliente(idclienteAthos: number): Promise<Array<{
  id: number; status: string; valor: number; expireAt: string | null;
  linkBoleto: string | null; nomeArquivo: string | null; txidEfi: string | null;
  criadoEm: Date; titulos: Array<{ idcontareceber: number; valor: number }>;
}>> {
  const boletos = await this.prisma.cobrancaBoleto.findMany({
    where: { idclienteAthos },
    orderBy: { criadoEm: "desc" },
    include: { titulos: { select: { idcontareceber: true, valor: true } } },
  });
  return boletos.map((b) => ({
    id: b.id, status: b.status, valor: Number(b.valor),
    expireAt: b.expireAt, linkBoleto: b.linkBoleto, nomeArquivo: b.nomeArquivo,
    txidEfi: b.txidEfi, criadoEm: b.criadoEm,
    titulos: b.titulos.map((t) => ({ idcontareceber: t.idcontareceber, valor: Number(t.valor) })),
  }));
}
```
**Adaptation for D-06 (cross-client, not scoped to one `idclienteAthos`):** drop the `where: { idclienteAthos }` filter (use `where: { status: { not: "cancelado" } }` or similar per plan discretion), then batch-resolve client names via a single Athos lookup keyed by the distinct `idclienteAthos` values present in the result set (per RESEARCH.md Open Question 3 — avoid N+1 against the Athos read-only Pool). Reuse `buscarNfseEmitidaParaTitulos()` (lines 808+, same file) for the NFS-e badge enrichment (D-08), exactly as already composed in the per-client boleto flow.

---

### `apps/backend/src/modules/cobranca/cobranca.controller.ts` — new route `GET boleto/dashboard` (D-06)

**Analog:** `boletosCliente()` handler, lines 170-174.

**Imports pattern** (lines 1-11) — already imports `Get`, `Param`, `ParseIntPipe` from `@nestjs/common`; no new imports needed for a parameterless `GET`.

**Core request-response pattern to copy** (lines 170-174):
```typescript
/** Lista boletos de um cliente com títulos vinculados */
@Get("boleto/cliente/:idcliente")
async boletosCliente(@Param("idcliente", ParseIntPipe) idcliente: number) {
  return this.cobrancaService.buscarBoletosCliente(idcliente);
}
```
**Adapted for the new route** (no param, add near this handler, e.g. right after line 174):
```typescript
@Get("boleto/dashboard")
async boletosDashboard() {
  return this.cobrancaService.buscarBoletosDashboard();
}
```
**Auth note:** do **not** add `@Public()` — every other non-webhook route in this controller (all except `email/:token/pixel.gif`, `email/:token/confirmar`, and `boleto/notificacao`, each explicitly `@Public()`-decorated at lines 48, 60, 213) relies on the global `InternalAuthGuard` (`x-internal-api-key`) applied via `APP_GUARD` in `app.module.ts`. The new dashboard route must have no `@Public()` decorator, matching `boletosCliente` and all sibling authenticated routes.

---

### `apps/backend/src/modules/cobranca/cobranca.module.ts` (MODIFIED — register job)

**Analog:** same file, current state (full file, 16 lines):
```typescript
import { Module } from "@nestjs/common";

import { AthosModule } from "../integrations/athos/athos.module";
import { EfiModule } from "../integrations/efi/efi.module";
import { NfseModule } from "../integrations/nfse/nfse.module";
import { CobrancaController } from "./cobranca.controller";
import { CobrancaService } from "./cobranca.service";
import { EmailEnvioService } from "./email-envio.service";

@Module({
  imports: [EfiModule, AthosModule, NfseModule],
  controllers: [CobrancaController],
  providers: [CobrancaService, EmailEnvioService],
})
export class CobrancaModule {}
```
**Adaptation:** add `import { CobrancaReconciliationJob } from "./cobranca-reconciliation.job";` and append it to `providers: [CobrancaService, EmailEnvioService, CobrancaReconciliationJob]`. No new `imports[]` entry needed in this module — `ScheduleModule.forRoot()` is registered once, globally, in the root `AppModule` (see next section), not per-feature-module (per RESEARCH.md Pattern 1).

---

### `apps/backend/src/modules/app.module.ts` (MODIFIED — add `ScheduleModule.forRoot()`)

**Analog:** existing `.forRoot()`-style global module registration precedent in the same `imports[]` array — `ThrottlerModule.forRoot(...)` (imported line 4, used in the `imports:` array starting line 53). `CobrancaModule` is already imported (line 21) and present in `imports[]` (line 78 per grep).

**Pattern to copy:**
```typescript
// apps/backend/src/modules/app.module.ts:1-4 (import block idiom)
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
```
**Adaptation:** add `import { ScheduleModule } from "@nestjs/schedule";` to this block, then add `ScheduleModule.forRoot(),` inside the `imports: [...]` array (line 53 onward) — anywhere before or after `CobrancaModule` is fine since it has no inter-module dependency; RESEARCH.md's Pattern 1 example places it before the feature module for readability.

---

### `apps/backend/src/modules/integrations/athos/athos.service.ts` — extend `buscarDashboardContasReceber()` SQL (D-02/D-07/D-09)

**Analog:** same method, lines 1824-1909 (full method body already read this session).

**Core aggregation SQL pattern to extend** (lines 1848-1871):
```sql
SELECT
    c.idcliente,
    COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial, 'Cliente #' || c.idcliente::text) AS nome_cliente,
    c.dddtelefoneempresa || c.telefoneempresa AS telefone_completo,
    c.emailcliente,
    c.emailcobrancacliente,
    c.limitecredito,
    c.bloqueaprazo,
    SUM(cr.valor) AS total_devido,
    SUM(CASE WHEN TRIM(cr.statusconta) = 'VEN' THEN cr.valor ELSE 0 END) AS total_atrasado,
    COUNT(cr.idcontareceber) AS titulos_pendentes,
    MAX(CASE WHEN TRIM(cr.statusconta) = 'VEN' THEN CURRENT_DATE - cr.datavencimento::date END) AS maior_atraso_dias
FROM cliente c
INNER JOIN conta_receber cr ON c.idcliente = cr.idcliente
LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
WHERE TRIM(cr.statusconta) = ANY($1)
GROUP BY c.idcliente, cf.nome, cj.nomefantasia, cj.razaosocial,
         c.dddtelefoneempresa, c.telefoneempresa, c.emailcliente,
         c.emailcobrancacliente, c.limitecredito, c.bloqueaprazo
ORDER BY total_atrasado DESC NULLS LAST, total_devido DESC
LIMIT 100
```
**Adaptation for D-07 (aging 0-30/31-60/61-90/90+) and D-09 (a-vencer 7/15/30 dias):** add a **second, separate, unbounded query** (not constrained by the existing `LIMIT 100` — per RESEARCH.md Anti-Pattern warning) using the same `CASE WHEN ... THEN ... ELSE 0 END` idiom already established for `total_atrasado`, e.g.:
```sql
SUM(CASE WHEN TRIM(cr.statusconta) = 'VEN' AND CURRENT_DATE - cr.datavencimento::date BETWEEN 1 AND 30 THEN cr.valor ELSE 0 END) AS aging_1_30,
SUM(CASE WHEN TRIM(cr.statusconta) = 'AVC' AND cr.datavencimento::date - CURRENT_DATE BETWEEN 0 AND 7 THEN cr.valor ELSE 0 END) AS a_vencer_7d,
```
Always parameterize via `$1`-style placeholders (`client.query(sql, [params])`) — never string-interpolate — matching the existing `WHERE TRIM(cr.statusconta) = ANY($1)` idiom (this is also the ASVS V5/Tampering mitigation RESEARCH.md flags).

**Result-mapping/type-safety pattern** (lines 1873-1897) — mirror the `Number(row["x"] ?? 0)` / null-guard idiom for every new aggregate field added to the return type.

**Connection lifecycle pattern** (lines 1845-1847, 1906-1908) — reuse the same `pool.connect()` / `try { ... } finally { client.release(); }` wrapper; do not open a second pool connection for the new aggregates — fold them into the same query or a second query using the same `client` before release.

---

### `apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts` (NEW — Next.js Route Handler proxy)

**Analog:** `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` (full file, 31 lines).

**Full pattern to copy verbatim (adjusting the backend path and removing the `status` query param, which doesn't apply to D-06):**
```typescript
import { type NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { requireAdminSession } from "@/lib/admin-session";

export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken
    ? { "x-api-token": athosToken }
    : {};

  try {
    const res = await backendFetch(`/cobranca/boleto/dashboard`, {
      method: "GET",
      headers: extraHeaders,
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```
Note: the header name used by this proxy is `x-api-token` (matching `AthosController.validateAthosToken`'s accepted headers) — but the **new** `CobrancaController` route relies on the global `InternalAuthGuard`, which per its own convention (see `cobranca.controller.ts` guard note above) expects `x-internal-api-key`. **Verify during planning** which header `InternalAuthGuard` actually checks vs. what `backendFetch`/`extraHeaders` sends by default (check `apps/frontend/src/lib/backend-client.ts` — likely already injects the correct default internal key header without needing `extraHeaders` at all, since most other `CobrancaController`-backed route handlers in this app don't set `x-api-token`). Do not assume the Athos-specific header name applies to the new Cobranca route without checking `backend-client.ts`.

---

### `apps/frontend/src/app/contas-receber/page.tsx` (MODIFIED — dashboard redesign)

**Analog:** same file, current state (lines 1-115 read this session; full file is 324 lines per RESEARCH.md).

**Imports pattern** (lines 1-6) — no new imports needed for sort state (`useState` already imported); add a second `useEffect`/fetch pair for the new boletos-panel endpoint, following the exact shape of `fetchDashboard()` (lines 72-89).

**PasswordGate wrapper — MUST be preserved unchanged** (lines 55-61):
```typescript
export default function ContasReceberPage() {
  return (
    <PasswordGate title="Contas a Receber" description="Esta area exibe dados financeiros de clientes. Digite a senha de configuracoes para continuar.">
      <ContasReceberDashboard />
    </PasswordGate>
  );
}
```

**Fetch pattern to copy for the new boletos-panel data source** (lines 72-89):
```typescript
async function fetchDashboard(status: StatusFiltro = statusFiltro) {
  setLoading(true);
  setErro("");
  try {
    const qs = status ? `?status=${status}` : "";
    const res = await fetch(`/api/athos/contas-receber/dashboard${qs}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Erro ao carregar dashboard de contas a receber.");
    }
    const data = (await res.json()) as { summary: DashboardSummary; clientes: ClienteDevedor[] };
    setSummary(data.summary);
    setClientes(data.clientes);
  } catch {
    setErro("Erro ao carregar dashboard de contas a receber.");
  } finally {
    setLoading(false);
  }
}
```
Adapt to a separate `fetchBoletosDashboard()` hitting `/api/cobranca/boleto/dashboard`, with its **own** independent `loading`/`erro` state (per UI-SPEC.md: "a failure of the new panel's endpoint must NOT block or blank the rest of the dashboard") — do not share `loading`/`erro` state with the client-list fetch.

**Client-side filter/sort pattern to extend for D-01** (lines 96-103):
```typescript
const buscaNormalizada = busca.trim().toLowerCase();
const clientesFiltrados = buscaNormalizada
  ? clientes.filter(
      (c) =>
        c.nome_cliente.toLowerCase().includes(buscaNormalizada) ||
        String(c.idcliente).includes(buscaNormalizada),
    )
  : clientes;
```
Add a `.sort()` step chained after this filter, driven by new `sortBy`/`sortDir` state, per UI-SPEC.md Copywriting Contract ("Ordenar por" → Nome / Valor em Aberto / Valor Vencido + direction toggle icon button).

**Badge pattern to extend for D-07/D-10 (aging tiers)** (lines 33-38):
```typescript
function getBadgeClass(maior_atraso_dias: number | null): string {
  if (maior_atraso_dias === null || maior_atraso_dias === 0) return "badge bg-success";
  if (maior_atraso_dias <= 30) return "badge bg-warning text-dark";
  if (maior_atraso_dias <= 90) return "badge bg-orange text-white";
  return "badge bg-danger";
}
```
Per UI-SPEC.md, this exact 4-tier function is **kept as-is** for per-client badges (do not redesign it); the **new** 5-tier aging-bucket palette (0/1-30/31-60/61-90/90+) for the summary cards is a **separate** function/component, not a replacement of this one (UI-SPEC.md Open Question 2 resolution: two independent visual systems, don't conflate).

**Status filter buttons — kept unchanged, sort coexists alongside** (lines 45-53):
```typescript
type StatusFiltro = "AVC" | "VEN" | "REC" | "CAN" | "";

const STATUS_OPTIONS: { value: StatusFiltro; label: string; cls: string }[] = [
  { value: "",    label: "Todos (abertos)", cls: "btn-outline-secondary" },
  { value: "AVC", label: "A Vencer",        cls: "btn-outline-info"      },
  { value: "VEN", label: "Vencidos",        cls: "btn-outline-danger"    },
  { value: "REC", label: "Recebidos",       cls: "btn-outline-success"   },
  { value: "CAN", label: "Cancelados",      cls: "btn-outline-dark"      },
];
```
Per RESEARCH.md Pitfall 4: do not add a "pago" sort key — this existing filter already covers that axis; new sort controls (nome/valor aberto/valor vencido) apply **within** whichever status filter is active.

---

### `apps/backend/src/modules/cobranca/cobranca-reconciliation.job.unit.test.ts` (NEW — test)

**Analog:** `apps/backend/src/modules/cobranca/cobranca.service.unit.test.ts` (lines 1-17 read this session).

**Manual-mock instantiation pattern to copy (do NOT use `@nestjs/testing`'s `Test.createTestingModule()`):**
```typescript
import { CobrancaService } from "./cobranca.service";

describe("montarItensEfiPorVendaItem", () => {
  let service: CobrancaService;

  beforeEach(() => {
    service = Object.create(CobrancaService.prototype);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).prisma = {
      nfseEmitidaTitulo: { findMany: jest.fn() },
    };
    (service as any).athosService = {
      buscarTodasNfesParaTitulos: jest.fn(),
      buscarItensVenda: jest.fn(),
    };
  });
  // ...
});
```
**Adaptation for `CobrancaReconciliationJob`:**
```typescript
import { CobrancaReconciliationJob } from "./cobranca-reconciliation.job";

describe("CobrancaReconciliationJob", () => {
  let job: CobrancaReconciliationJob;

  beforeEach(() => {
    job = Object.create(CobrancaReconciliationJob.prototype);
    (job as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (job as any).prisma = { cobrancaBoleto: { findMany: jest.fn() } };
    (job as any).cobrancaService = { verificarPagamentoBoleto: jest.fn() };
  });

  it("continua o loop mesmo se um boleto falhar (isolamento de erro por item)", async () => {
    // arrange: findMany resolves 2 pending boletos, one verificarPagamentoBoleto call rejects
    // act: await job.reconciliarBoletosPendentes()
    // assert: both boletos were attempted; logger.error called once; no throw propagated
  });

  it("nao inicia uma segunda execucao enquanto a anterior esta em andamento (guard 'running')", async () => {
    // arrange: make the mocked verificarPagamentoBoleto never resolve (pending promise)
    // act: call reconciliarBoletosPendentes() twice without awaiting the first
    // assert: findMany called only once (second call short-circuited by the running guard)
  });
});
```

## Shared Patterns

### Internal API auth guard (backend)
**Source:** `apps/backend/src/modules/cobranca/cobranca.controller.ts` (`@Public()` decorator usage at lines 48, 60, 213 — every other route relies on the implicit global `InternalAuthGuard`)
**Apply to:** New `GET boleto/dashboard` route — must NOT be `@Public()`.

### Prisma `findMany` + result-shaping idiom
**Source:** `apps/backend/src/modules/cobranca/cobranca.service.ts:794-805` (`buscarBoletosCliente`)
**Apply to:** New `buscarBoletosDashboard()` service method and the reconciliation job's pending-boleto query — both should follow the same `Number(...)`/null-guard mapping style already used throughout this service.

### Next.js Route Handler proxy (backendFetch + INTERNAL_API_KEY)
**Source:** `apps/frontend/src/app/api/athos/contas-receber/dashboard/route.ts` (full file)
**Apply to:** New `apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts`.

### Raw-SQL parameterized aggregation (Athos read-only pool)
**Source:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1848-1871` (`buscarDashboardContasReceber`)
**Apply to:** Aging-bucket and a-vencer SQL extensions (D-07/D-09) — never string-interpolate; always `$1`-style placeholders via `pg.Pool`/`PoolClient`.

### Per-item error isolation in batch operations
**Source:** `apps/backend/src/modules/cobranca/cobranca.service.ts:772-775` (single-item try/catch idiom, generalized to a loop per RESEARCH.md Pattern 1)
**Apply to:** `CobrancaReconciliationJob`'s per-boleto loop — one EFI failure must not abort the batch.

### Test structure: manual `Object.create(Prototype)` mocking, no `@nestjs/testing`
**Source:** `apps/backend/src/modules/cobranca/cobranca.service.unit.test.ts:1-17`
**Apply to:** New `cobranca-reconciliation.job.unit.test.ts`.

## No Analog Found

None — every file in scope has a strong (exact or role-match) analog already in the codebase. The only genuinely new pattern is `@nestjs/schedule`'s `@Cron` wiring itself, for which RESEARCH.md's `Pattern 1` (sourced from official NestJS docs, already adapted to this repo's DI conventions) serves as the template in place of an in-repo precedent.

## Metadata

**Analog search scope:** `apps/backend/src/modules/cobranca/`, `apps/backend/src/modules/integrations/athos/`, `apps/backend/src/modules/app.module.ts`, `apps/frontend/src/app/contas-receber/`, `apps/frontend/src/app/api/athos/contas-receber/`
**Files scanned:** 10 (all confirmed git-tracked via `git ls-files`)
**Pattern extraction date:** 2026-09-04
