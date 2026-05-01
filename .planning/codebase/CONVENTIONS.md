# Coding Conventions

**Analysis Date:** 2026-05-01

## Naming Patterns

**Files:**
- Service files: `<feature>.service.ts` (e.g., `quotes.service.ts`, `chatwoot.service.ts`)
- Controller files: `<feature>.controller.ts`
- Module files: `<feature>.module.ts`
- DTO files: `<action>-<noun>.dto.ts` (e.g., `create-quote.dto.ts`, `update-status.dto.ts`)
- Test files: `<service>.test.ts` (e.g., `quotes.service.chatwoot.test.ts`)
- Frontend pages: `page.tsx` inside route directory (Next.js App Router)

**Classes:**
- PascalCase for all class names: `QuotesService`, `CreateQuoteDto`, `PrismaService`
- DTOs follow `<Action><Subject>Dto` pattern: `CreateQuoteDto`, `UpdateStatusDto`, `MergeDuplicatesDto`
- Nested DTO helpers declared as non-exported classes in the same file: `QuoteProductDto`, `CreateQuoteItemDto`, `CreateCustomerDto`

**Functions / Methods:**
- camelCase: `create`, `list`, `getById`, `changeStatus`, `validateChatwootContext`
- Frontend utility functions: camelCase prefixed with verb: `parseMaybeNumber`, `normalizePhone`, `descricaoTemCorValida`

**Variables:**
- camelCase throughout: `parsedTake`, `validConversationId`, `mockPrismaService`
- Environment variable keys: SCREAMING_SNAKE_CASE: `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`

**Domain Fields:**
- Legacy domain fields from external system use Portuguese snake_case to preserve compatibility: `idorcamento`, `idvenda`, `descricaoproduto`, `quantidadeitem`, `valoritem`, `dataorcamento`
- New system fields use camelCase: `conversationId`, `chatwootContactId`, `vendedorNome`, `prazoEntrega`
- Both naming styles coexist in `CreateQuoteDto` — do NOT normalize one to the other

## Code Style

**Formatting:**
- No `.prettierrc` or `.eslintrc` files present in the repository
- String literals use double quotes in TypeScript: `"use client"`, `import … from "…"`
- Semicolons used at end of statements
- Trailing commas in multi-line objects/arrays

**TypeScript:**
- `strict: true` in `apps/backend/tsconfig.json`
- `target: es2021`, `module: Node16`, `moduleResolution: node16`
- Definite assignment assertion `!` used for required DTO properties: `nome!: string`
- Optional fields use `?`: `telefone?: string`
- `allowSyntheticDefaultImports: true`, `esModuleInterop: true`
- `skipLibCheck: true`
- Node.js built-ins imported with `node:` prefix: `import path from "node:path"`

**Linting:**
- No ESLint config file; only inline suppression comment found: `// eslint-disable-next-line no-console`

## DTO Patterns

**Structure:**
- All DTOs validated with `class-validator` decorators
- Nested objects validated with `@ValidateNested()` + `@Type(() => NestedDto)` from `class-transformer`
- Arrays validated with `@IsArray()` + `@ValidateNested({ each: true })` + `@Type(…)`
- Optional fields always paired with `@IsOptional()` decorator before type decorators
- Numeric minimums enforced with `@Min()`: quantity min 0.01, prices min 0
- `@IsIn([…])` used for enum-style string validation: `"oldest" | "newest"`

**Example Pattern (required field):**
```typescript
@IsString()
nome!: string;
```

**Example Pattern (optional field):**
```typescript
@IsOptional()
@IsEmail()
email?: string;
```

**Example Pattern (nested with type):**
```typescript
@ValidateNested()
@Type(() => QuoteProductDto)
produto!: QuoteProductDto;
```

**Global Pipe (registered in `apps/backend/src/main.ts`):**
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }),
);
```
- `whitelist: true` — strips undeclared properties silently
- `forbidNonWhitelisted: true` — throws 400 for unknown properties
- `transform: true` — transforms plain objects to DTO class instances

## Module Structure

**NestJS Module Pattern** (one directory per feature under `apps/backend/src/modules/`):
```
<feature>/
  <feature>.module.ts      # Module decorator, imports/exports
  <feature>.controller.ts  # Route handlers, no business logic
  <feature>.service.ts     # Business logic, Prisma operations
  dto/                     # Request validation DTOs
    create-<noun>.dto.ts
    update-<noun>.dto.ts
```

**Module Registration:**
- `forwardRef(() => Module)` used to resolve circular dependencies (e.g., `QuotesModule` ↔ `ChatwootModule`, `AthosModule`, `EfiModule`)
- `ConfigModule.forRoot({ isGlobal: true })` registered once in `AppModule` — inject `ConfigService` directly in any service without re-importing

**Service Dependencies:**
- Inject `ConfigService` for all environment variable access — never use `process.env` directly inside services
- `PrismaService` extends `PrismaClient` and implements `OnModuleInit`/`OnModuleDestroy`

## Import Organization

**Order (observed in backend files):**
1. NestJS core imports (`@nestjs/common`, `@nestjs/config`)
2. Third-party packages (`axios`, `class-validator`, `class-transformer`)
3. Internal module imports (relative paths `./`, `../`)
4. DTO imports last within a module

**Path Aliases:** None configured — all internal imports use relative paths.

## Error Handling

**Patterns:**
- Throw NestJS HTTP exceptions directly from service methods: `throw new BadRequestException("message")`, `throw new NotFoundException()`
- Integration services (Chatwoot, EFI, PDV) return `{ enabled: false, message: "..." }` when env vars are missing — **never throw** when configuration is absent
- Controller methods return service results directly — no try/catch wrappers at controller layer
- Async/await throughout; no callback or Promise chain patterns

**Fail-Safe Integration Pattern** (all external integration services):
```typescript
const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
if (!baseUrl || !accountId || !token) {
  return { enabled: false, message: "Configure ... no .env" };
}
// proceed with HTTP call
```

## Frontend Conventions

**File Structure (`apps/frontend/src/app/`):**
- Next.js App Router: each route is a `page.tsx` inside a named directory
- Dynamic routes use `[id]` bracket syntax

**Component Directives:**
- `"use client"` at top of any file using browser APIs, React state, or `useEffect`
- No `"use server"` directive observed

**Utility Functions:**
- Defined as plain functions (not classes) at the top of the file before the component
- Parse helpers follow `parse<Type>Maybe` naming: `parseMaybeNumber`, `parseObjectMaybe`
- Normalization helpers follow `normalize<Field>` naming: `normalizePhone`

## Comments

**When to Comment:**
- Inline suppression comments for linter rules: `// eslint-disable-next-line no-console`
- Test files use Portuguese for `describe`/`it` descriptions: `"deve aceitar payload sem Chatwoot IDs"`
- Business logic comments rare — code is generally self-documenting through DTO field names

---

*Convention analysis: 2026-05-01*
