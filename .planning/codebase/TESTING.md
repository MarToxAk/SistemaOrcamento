# TESTING.md
_Last updated: 2026-05-15 | Focus: quality_

## Summary

The backend uses Jest 30 with ts-jest for TypeScript transformation. There are 10 test files focused on service-layer unit tests and integration-boundary tests. No frontend tests exist. Coverage is growing but thin — core quote and EFI paths are well-covered; Athos, NFS-e, and the public status page have gaps.

---

## Frameworks & Tooling

| Tool | Version | Role |
|------|---------|------|
| Jest | ^30.3.0 | Test runner |
| ts-jest | ^29.4.9 | TypeScript transformer for Jest |
| @nestjs/testing | ^11.1.19 | NestJS test module builder |
| @types/jest | ^30.0.0 | Type definitions |

Config: `apps/backend/jest.config.js`
- `rootDir: 'src'`
- `testRegex: '.*\\.test\\.ts$'`
- `testEnvironment: 'node'`
- Coverage output: `apps/backend/coverage/`

---

## How to Run Tests

```bash
cd apps/backend

# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## Test File Locations

All test files live co-located with the source they test:

```
apps/backend/src/
  modules/
    quotes/
      quotes.service.test.ts              Quote URL regression + general service
      quotes.service.chatwoot.test.ts     Chatwoot notification dispatch
      quotes.service.unit.test.ts         Unit-level quote logic
    integrations/
      efi/
        efi.service.test.ts               Webhook URL construction
        efi.webhook.test.ts               ~14 processWebhook scenarios
      nfse/
        nfse.discount.test.ts             Discount XML field tests
        nfse.service.test.ts              Tomador resolution + SOAP XML
      athos/
        athos-anexo.util.test.ts          Anexo utility functions
        athos.controller.test.ts          Controller auth and routing
        athos.service.test.ts             Athos service logic
```

---

## Test Types

| Type | Status | Notes |
|------|--------|-------|
| Unit (pure logic) | Present | `quotes.service.unit.test.ts`, utility tests |
| Integration (module wiring) | Present | NestJS TestingModule pattern used in most tests |
| E2E (HTTP) | Absent | No e2e or supertest tests exist |
| Frontend | Absent | No tests in `apps/frontend/` |

---

## Mocking Patterns

Tests use NestJS `TestingModule` with manual provider mocks:

```typescript
const module = await Test.createTestingModule({
  providers: [
    QuotesService,
    { provide: PrismaService, useValue: mockPrisma },
    { provide: EfiService, useValue: mockEfi },
  ],
}).compile();
```

No jest.mock() at module level — mocks are injected via the DI container.

---

## Coverage Assessment

| Module | Coverage | Notes |
|--------|----------|-------|
| `quotes/` | Medium | Core paths covered; PDF and email paths not tested |
| `integrations/efi/` | Good | Webhook scenarios well covered (14 cases) |
| `integrations/nfse/` | Medium | Discount and tomador logic covered; SOAP error paths not |
| `integrations/athos/` | Medium | Controller auth + service logic; schema discovery not tested |
| `integrations/chatwoot/` | Low | Only via quotes.service.chatwoot.test.ts |
| `integrations/pdv/` | None | Stub, no tests |
| `common/`, `events/`, `security/` | None | No tests |
| `apps/frontend/` | None | No tests |

---

## CI Integration

No CI pipeline exists (no `.github/workflows/`, no `Dockerfile` test stage). Tests run manually in development only.

---

## Coverage Gaps (Priority Order)

1. **Webhook guard** — the EFI webhook guard (critical security item) has no test for the missing-secret bypass case.
2. **PDF generation** — `QuotesService` PDF path exercises Puppeteer but is entirely untested.
3. **NFS-e SOAP error paths** — timeout, invalid XML response, and SOAP fault branches are not covered.
4. **Security module** — JWT validation, IP allowlist guard, and the Athos timing-safe comparison have no tests.
5. **Frontend** — zero test coverage; no framework configured.
