# Testing Patterns

**Analysis Date:** 2026-05-01

## Test Framework

**Runner:**
- Configured: `node --test` (Node.js built-in test runner, v18+)
- **Critical mismatch:** The sole test file (`quotes.service.chatwoot.test.ts`) uses Jest API (`jest.fn()`, `jest.clearAllMocks()`, `expect(…).rejects.toThrow()`) — **not** Node.js built-in test API
- **Jest is not listed in `devDependencies`** of `apps/backend/package.json` or the root `package.json`
- Tests cannot be executed with the current `npm run test` command as configured

**Assertion Library:**
- Jest expect API (used in test files, but Jest not installed)

**Run Commands:**
```bash
npm run test                                      # Root: delegates to backend test
npm --workspace @bomcusto/backend run test        # Runs: node --test dist/**/*.test.js
```

**Compile step required before running:**
```bash
# Backend build excludes test files (tsconfig.build.json excludes **/*.test.ts)
# Must use base tsconfig to compile tests:
npx tsc -p apps/backend/tsconfig.json
node --test apps/backend/dist/**/*.test.js
```

> **Note:** Even with compilation, the Node.js built-in test runner does not support Jest globals (`jest.fn`, `jest.clearAllMocks`). Tests require Jest or a Jest-compatible shim to run.

## Test File Organization

**Location:**
- Co-located with source files in the same module directory
- `apps/backend/src/modules/quotes/quotes.service.chatwoot.test.ts` (co-located with `quotes.service.ts`)

**Naming:**
- Pattern: `<module>.<subject>.test.ts`
- Example: `quotes.service.chatwoot.test.ts` — scoped test for Chatwoot-specific behavior of `QuotesService`
- No `*.spec.ts` files exist in the project

**Total test files found:** 1 (`quotes.service.chatwoot.test.ts`)

## Test Structure

**Suite Organization:**
```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { QuotesService } from "./quotes.service";

describe("QuotesService - Chatwoot Validation", () => {
  let service: QuotesService;

  const mockPrismaService = { ... };  // inline mock object

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: mockPrismaService },
        ...
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("<method group>", () => {
    it("deve <expected behavior>", async () => { ... });
  });
});
```

**Patterns:**
- Module setup via `Test.createTestingModule()` in `beforeEach`
- `jest.clearAllMocks()` in `afterEach` to prevent state leakage
- Nested `describe` blocks group behavior by method or context
- Test descriptions in **Portuguese**: `"deve aceitar payload sem Chatwoot IDs"`
- Async tests use `await expect(…).resolves/rejects`

## Mocking

**Framework:** `jest.fn()` (Jest mock API)

**Patterns:**
```typescript
// Inline mock objects above beforeEach
const mockPrismaService = {
  $transaction: jest.fn(),
  quote: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  customer: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

// Transaction mock with callback execution
mockPrismaService.$transaction.mockImplementation(async (callback) => {
  const mockTx = {
    quote: { create: jest.fn().mockResolvedValue({ id: "1" }) },
    quoteItem: { create: jest.fn() },
    customer: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: "cus1" }) },
  };
  return callback(mockTx);
});
```

**What to Mock:**
- All `PrismaService` methods (database operations)
- External integration services: `AthosService`, `QuotesPdfStorageService`
- `$transaction` must simulate callback pattern (pass `mockTx` to callback and return result)

**What NOT to Mock:**
- The service under test (`QuotesService`)
- NestJS `@nestjs/testing` module infrastructure

## Fixtures and Factories

**Test Data:**
```typescript
// Inline payloads as typed objects inside each test case
const payload: CreateQuoteDto = {
  cliente: { nome: "João" },
  itens: [
    {
      produto: { descricaoproduto: "Produto" },
      quantidadeitem: 1,
      valoritem: 100,
    },
  ],
  conversationId: 12345,
};
```

**Location:**
- No shared fixture files or factory helpers — each test defines its own inline payload
- Minimal payloads: only the fields required for the specific scenario under test

## Coverage

**Requirements:** Not enforced — no coverage configuration found

**View Coverage:**
```bash
# No coverage script configured
# Would require: npx jest --coverage (if Jest were installed)
```

## Test Types

**Unit Tests:**
- Service-level unit tests using `@nestjs/testing` module
- Tests isolate a single service with all dependencies mocked
- No HTTP-layer (controller) or end-to-end tests exist

**Integration Tests:**
- Not present

**E2E Tests:**
- Not present

## Common Patterns

**Async Testing (success):**
```typescript
it("deve aceitar payload sem Chatwoot IDs", async () => {
  mockPrismaService.$transaction.mockImplementation(async (callback) => {
    const mockTx = { ... };
    return callback(mockTx);
  });

  await expect(service.create(payload)).resolves.toBeDefined();
});
```

**Error Testing (exception):**
```typescript
it("deve rejeitar conversationId inválido (0)", async () => {
  const payload: CreateQuoteDto = { ..., conversationId: 0 };

  await expect(service.create(payload)).rejects.toThrow(BadRequestException);
  await expect(service.create(payload)).rejects.toThrow("conversationId invalido");
});
```

## Known Issues

**Test runner / test API mismatch:**
- `apps/backend/package.json` `test` script: `node --test dist/**/*.test.js`
- Test file uses Jest API: `jest.fn()`, `jest.clearAllMocks()`, `expect().rejects.toThrow()`
- `tsconfig.build.json` explicitly excludes `**/*.test.ts` from compilation output
- Jest is absent from all `package.json` dependency lists
- **Result:** `npm run test` will fail — tests cannot compile or execute with the current setup

**Recommended fix to make tests runnable:**
```json
// apps/backend/package.json devDependencies
"@nestjs/testing": "^10.x",
"@types/jest": "^29.x",
"jest": "^29.x",
"ts-jest": "^29.x"
```
```bash
# apps/backend/jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testRegex: ".*\\.test\\.ts$",
};
```
```json
// apps/backend/package.json scripts
"test": "jest"
```

---

*Testing analysis: 2026-05-01*
