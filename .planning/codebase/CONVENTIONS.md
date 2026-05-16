# CONVENTIONS.md
_Last updated: 2026-05-15 | Focus: quality_

## Summary

The project follows NestJS and Next.js idiomatic conventions with TypeScript throughout. Portuguese names appear in domain types and Athos/Athos-legacy field names; everything else is English. No enforced linter config exists — conventions are maintained by code review and GSD phase standards.

---

## Naming Conventions

### Files

| Type | Pattern | Example |
|------|---------|---------|
| NestJS module | `<domain>.module.ts` | `quotes.module.ts` |
| NestJS service | `<domain>.service.ts` | `quotes.service.ts` |
| NestJS controller | `<domain>.controller.ts` | `athos.controller.ts` |
| DTO | `<action>-<domain>.dto.ts` | `create-quote.dto.ts` |
| Test | `<source>.test.ts` | `efi.webhook.test.ts` |
| Utility | `<domain>-<purpose>.util.ts` | `athos-anexo.util.ts` |
| Next.js page | `page.tsx` (inside route folder) | `app/orcamento/page.tsx` |
| Next.js API route | `route.ts` (inside api/route folder) | `app/api/quotes/route.ts` |

### Classes & Variables

- Classes: `PascalCase` — `QuotesService`, `EfiWebhookGuard`
- Functions/methods: `camelCase` — `processWebhook`, `enviarParaCliente`
- Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for env-derived values, `camelCase` for local consts
- **Dual-naming rule**: Athos ERP legacy field names use Portuguese snake_case (e.g., `codigo_produto`, `valor_unitario`); all new application fields use camelCase English

---

## Code Style

No `.eslintrc` or `.prettierrc` present — conventions are informal:

- **Quotes**: double quotes in TypeScript source
- **Semicolons**: always
- **Trailing commas**: on multi-line objects and arrays
- **Indentation**: 2 spaces
- **TypeScript strict**: `strict: true` in tsconfig; `noImplicitAny` enforced
- **No `any`**: avoided; use `unknown` + type guards when truly dynamic
- **Decorators**: NestJS decorator pattern — `@Injectable()`, `@Controller()`, `@Get()`, etc.

---

## Import/Export Patterns

Imports follow a 5-group ordering (blank line between groups):

1. Node built-ins (`node:fs`, `node:crypto`)
2. NestJS core (`@nestjs/common`, `@nestjs/config`)
3. Third-party packages (`axios`, `prisma`)
4. Internal shared (`packages/shared`)
5. Local relative (`./quotes.service`, `../dto/create-quote.dto`)

No path aliases configured — all imports use relative paths.

**Exports**: services and controllers are exported from their module class only; DTOs are exported directly from their file (no barrel).

---

## Error Handling

**Backend (NestJS):**
- Throw NestJS exceptions directly from services: `throw new NotFoundException('...')`
- Integration failures use a fail-safe pattern: return `{ enabled: false, message: '...' }` rather than throw, so the app stays functional when ERP/bank is down
- Unknown errors: wrap in `new InternalServerErrorException(err.message)`

**Frontend:**
- API proxy routes use try/catch and return `{ error: message }` with appropriate HTTP status
- React components catch errors locally; no global error boundary in place

---

## Logging

- Use NestJS `Logger` class: `private readonly logger = new Logger(ClassName.name)`
- Log levels: `log` for info, `warn` for recoverable issues, `error` for failures
- `LoggingInterceptor` logs all incoming requests and response times automatically
- Exception: `console.error` is used only in fire-and-forget async paths (e.g., `enviarParaCliente`) — this is a known inconsistency flagged in CONCERNS.md

---

## Git Commit Conventions

Format: `type(scope): description` — scope is optional

**Types observed:**
`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`

**Scopes observed:**
`quotes`, `efi`, `athos`, `nfse`, `chatwoot`, `frontend`, `backend`, `db`, `auth`, `ci`, `deploy`

**Language rule**: commit body may be Portuguese; subject line is English. GSD phase commits use GSD-generated messages.

---

## API Response Shapes

| Pattern | Shape | Used for |
|---------|-------|---------|
| Paginated list | `{ total: number, data: T[] }` | Quote list, Athos item list |
| Integration status | `{ enabled: boolean, message?: string }` | EFI, Athos, NFS-e health checks |
| Quote detail | `QuoteRow` (from `packages/shared`) | Single quote fetch |
| SSE event | `data: { type, payload }\n\n` | Real-time status updates |
| Error | `{ statusCode, message, error }` | NestJS default exception format |
