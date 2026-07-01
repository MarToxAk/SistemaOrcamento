# Phase 37: Motor de Defaults (Descoberta por Moda) — Mapa de Padrões

**Mapeado:** 2026-06-26
**Arquivos analisados:** 4 (2 novos de produção + 2 de teste)
**Análogos encontrados:** 4 / 4

---

## Classificação de Arquivos

| Arquivo novo/modificado | Papel | Fluxo de dados | Análogo mais próximo | Qualidade |
|-------------------------|-------|----------------|----------------------|-----------|
| `athos-defaults.util.ts` | utility | transform (puro) | `athos-conta-pagar.util.ts` | role-match |
| `athos-defaults.util.test.ts` | test | — | `athos-produto.service.test.ts` (estrutura Jest) | role-match |
| `athos-defaults.service.ts` | service | request-response (read-only, pg Pool + cache) | `athos-produto.service.ts` | exact |
| `athos-defaults.service.test.ts` | test | — | `athos-produto.service.test.ts` | exact |
| `athos.module.ts` *(modificar)* | config/module | — | `athos.module.ts` (existente) | exact |

---

## Atribuições de Padrão por Arquivo

---

### `athos-defaults.util.ts` (utility, transform puro)

**Análogo:** `apps/backend/src/modules/integrations/athos/athos-conta-pagar.util.ts`

**Padrão de importações** — o util não importa nada de NestJS; apenas tipos TypeScript locais. Copiar o estilo de constantes nomeadas no topo do arquivo:

```typescript
// athos-conta-pagar.util.ts — linhas 1-3 (sem imports externos)
type Row = Record<string, unknown>;
type ContaPagarFieldKind = "int" | "number" | "string" | "boolean" | "date" | "datetime";
```

Para o novo util, adaptar para:

```typescript
// athos-defaults.util.ts — bloco de tipos e constantes (sem imports externos)
type RawValue = string | number | boolean | null;
type RawRow = Record<string, RawValue>;
```

**Padrão de constantes nomeadas** (D-09, D-03 — nunca magic numbers inline):

```typescript
// Constantes nomeadas exportadas — serviço importa daqui
export const DEFAULTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const DEFAULTS_MIN_SAMPLE = 5;

// Allowlists de campos (D-05) — fonte de verdade única
export const FISCAL_FIELDS = [
  "icms", "icmsnfe", "tributacao", "tributacaonfe",
  "codigocsosn", "codigocsosnnfe", "origem", "origemnfe",
  "tipoitem", "piscst", "cofinscst", "idcfopsaida", "ncm",
] as const;

export const STOCK_FIELDS = ["controlaestoque", "baixarestoque"] as const;
```

**Padrão de função pura exportada** (copiar estrutura de função de `athos-conta-pagar.util.ts` — pura, sem I/O, sem efeitos colaterais):

```typescript
// Função pura: recebe linhas brutas, retorna moda ou null
export function computeModeFromRows(
  rows: RawRow[],
  field: string,
  minSample: number,
): RawValue {
  const freq = new Map<string, { value: RawValue; count: number }>();
  for (const row of rows) {
    const raw = row[field];
    if (raw === null || raw === undefined || raw === "") continue; // D-02: null e string vazia excluídos
    const key = String(raw);
    const entry = freq.get(key);
    if (entry) entry.count++;
    else freq.set(key, { value: raw, count: 1 });
  }
  const totalValid = [...freq.values()].reduce((s, e) => s + e.count, 0);
  if (totalValid < minSample) return null; // D-09: amostra insuficiente
  return [...freq.values()]
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : String(a.value) < String(b.value) ? -1 : 1, // D-11: menor valor em empate
    )[0].value;
}

export function computeDefaults(rows: RawRow[]): ProductDefaults {
  const result: Record<string, RawValue> = {};
  for (const field of FISCAL_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    if (mode !== null) result[field] = mode; // D-08: campo fiscal sem moda → omitido
  }
  for (const field of STOCK_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    result[field] = mode !== null ? mode : false; // D-07: campo de estoque sem moda → false
  }
  return result as ProductDefaults;
}
```

**Tipo de retorno `ProductDefaults`** (declarar no util ou em arquivo de tipos):

```typescript
export interface ProductDefaults {
  // Campos fiscais: opcionais — omitidos quando sem moda (D-08)
  icms?: string;
  icmsnfe?: string;
  tributacao?: string;
  tributacaonfe?: string;
  codigocsosn?: string;
  codigocsosnnfe?: string;
  origem?: number;
  origemnfe?: number;
  tipoitem?: string;
  piscst?: string;
  cofinscst?: string;
  idcfopsaida?: string;
  ncm?: string;
  // Campos de estoque: sempre presentes — fallback false (D-07)
  controlaestoque: boolean;
  baixarestoque: boolean;
}
```

---

### `athos-defaults.util.test.ts` (test, função pura — sem mock de banco)

**Análogo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` (estrutura geral de `describe`/`it`, `expect`)

**Padrão de estrutura Jest** — testes de função pura não precisam de `Test.createTestingModule`, sem `jest.mock("pg")`:

```typescript
// Copiar apenas a estrutura describe/it — sem setup de módulo NestJS nem mock de pg
import { computeModeFromRows, computeDefaults } from "./athos-defaults.util";

describe("computeModeFromRows", () => {
  it("retorna o valor mais frequente", () => { ... });
  it("ignora null e string vazia (DEFD-02)", () => { ... });
  it("retorna null quando amostra < minSample (D-09)", () => { ... });
  it("em empate retorna o menor valor (D-11)", () => { ... });
});

describe("computeDefaults", () => {
  it("campos fiscais sem amostra são omitidos (D-08)", () => { ... });
  it("campos de estoque sem amostra recebem false (D-07)", () => { ... });
});
```

---

### `athos-defaults.service.ts` (service, read-only, pg Pool + cache em memória)

**Análogo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` — correspondência exata

**Padrão de importações** (linhas 1-12 do análogo — copiar exatamente, ajustando exceções usadas):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.ts — linhas 1-9
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { computeDefaults, DEFAULTS_CACHE_TTL_MS } from "./athos-defaults.util";
import type { ProductDefaults } from "./athos-defaults.util";
```

**Padrão de decorador e Logger** (linhas 13-16):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.ts — linhas 13-16
@Injectable()
export class AthosDefaultsService {
  private readonly logger = new Logger(AthosDefaultsService.name);
  private _pool: Pool | null = null;
```

**Padrão `getPool()` / `getDbConfig()`** (linhas 18-41 do análogo — copiar integralmente, alterar apenas a mensagem de log):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.ts — linhas 18-41
private getPool(): Pool {
  if (!this._pool) {
    const cfg = this.getDbConfig();
    this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
    this._pool.on("error", (err: Error) => this.logger.error(`Athos defaults pool error: ${err.message}`));
  }
  return this._pool;
}

private getDbConfig() {
  const host = process.env.ATHOS_PG_HOST;
  const database = process.env.ATHOS_PG_DB;
  const user = process.env.ATHOS_PG_USER;
  const password = process.env.ATHOS_PG_PASS;
  const port = Number(process.env.ATHOS_PG_PORT ?? "5432");
  if (!host || !database || !user || !password) {
    throw new InternalServerErrorException(
      "Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.",
    );
  }
  return { host, database, user, password, port };
}
```

**Padrão de cache com promise-lock** (padrão idiomático NestJS singleton — novidade desta fase):

```typescript
// Campos privados de cache — adicionar após _pool
private _cache: { defaults: ProductDefaults; expiresAt: number } | null = null;
private _loading: Promise<ProductDefaults> | null = null;

async getDefaults(): Promise<ProductDefaults> {
  if (this._cache && Date.now() < this._cache.expiresAt) {
    return this._cache.defaults; // cache hit
  }
  if (!this._loading) {
    // promise-lock: evita race condition (D-03)
    this._loading = this._fetchAndCompute().finally(() => {
      this._loading = null;
    });
  }
  return this._loading;
}
```

**Padrão `pool.connect()` / `client.release()` / try-finally** (linhas 63-65 + 155-157 do análogo):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.ts — linhas 63-65, 155-157
const pool = this.getPool();
const client: PoolClient = await pool.connect();
try {
  const result = await client.query<RawRow>(SQL_ACTIVE_PRODUCTS);
  const defaults = computeDefaults(result.rows);
  this._cache = { defaults, expiresAt: Date.now() + DEFAULTS_CACHE_TTL_MS };
  this.logger.log(
    `defaults calculados sampleSize=${result.rows.length}`,
  );
  return defaults;
} finally {
  client.release(); // SEMPRE liberar, mesmo em erro
}
```

**Padrão de log** (linhas 124-127 do análogo — copiar estilo `logger.log` com campos estruturados):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.ts — linha 124
this.logger.log(
  `criarProduto descricao="${dto.descricaoproduto}" idproduto=${idproduto} idusuario=${sistemaUsuarioId}`,
);
// Adaptar para defaults:
this.logger.log(
  `defaults calculados sampleSize=${result.rows.length} campos_fiscais=${fiscalCount}`,
);
```

**SQL da query única** (constante nomeada no topo do arquivo de serviço ou util):

```typescript
// Constante fora da classe — SQL hardcoded, sem interpolação de input de usuário
const SQL_ACTIVE_PRODUCTS = `
  SELECT icms, icmsnfe, tributacao, tributacaonfe,
         codigocsosn, codigocsosnnfe, origem, origemnfe,
         tipoitem, piscst, cofinscst, idcfopsaida, ncm,
         controlaestoque, baixarestoque
  FROM produto
  WHERE statusproduto = true AND vendeproduto = true
`;
```

---

### `athos-defaults.service.test.ts` (test, serviço com mock pg Pool)

**Análogo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` — correspondência exata

**Padrão de mock do módulo `pg`** (linhas 5-16 do análogo — copiar integralmente):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts — linhas 5-16
jest.mock("pg", () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
```

**Padrão de `beforeAll` / `beforeEach` / `afterEach`** (linhas 24-41 do análogo — copiar e ajustar):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts — linhas 24-41
beforeAll(() => {
  process.env.ATHOS_PG_HOST = "localhost";
  process.env.ATHOS_PG_DB = "athos";
  process.env.ATHOS_PG_USER = "user";
  process.env.ATHOS_PG_PASS = "pass";
  process.env.ATHOS_PG_PORT = "5432";
});

beforeEach(async () => {
  jest.clearAllMocks();
  const module: TestingModule = await Test.createTestingModule({
    providers: [AthosDefaultsService],
  }).compile();
  service = module.get<AthosDefaultsService>(AthosDefaultsService);
});

afterEach(() => jest.clearAllMocks());
```

**Padrão de setup do client mock por teste** (linhas 45-48 do análogo — copiar estilo):

```typescript
// apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts — linhas 45-48
const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
const client = { query: jest.fn(), release: jest.fn() };
pool.connect = jest.fn().mockResolvedValue(client);
```

**Padrão de teste do cache** (verificar que segunda chamada não dispara nova query — exclusivo desta fase):

```typescript
// Estrutura de teste para DEFD-03
it("segunda chamada usa cache — não dispara nova query ao banco", async () => {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);

  // Retorna linhas com amostra suficiente
  client.query.mockResolvedValue({ rows: [...Array(10).fill({ icms: "7", controlaestoque: true, baixarestoque: true, /* outros campos */ })] });

  await service.getDefaults(); // primeira chamada — popula cache
  await service.getDefaults(); // segunda chamada — deve usar cache

  expect(client.query).toHaveBeenCalledTimes(1); // query disparada apenas 1 vez
});
```

---

### `athos.module.ts` *(modificar — adicionar AthosDefaultsService)*

**Análogo:** `apps/backend/src/modules/integrations/athos/athos.module.ts` (existente, linhas 1-18)

**Estado atual** (linhas 1-18):

```typescript
// apps/backend/src/modules/integrations/athos/athos.module.ts — linhas 1-18
import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { EventsModule } from "../../events/events.module";
import { QuotesModule } from "../../quotes/quotes.module";
import { AthosController } from "./athos.controller";
import { AthosListenerService } from "./athos-listener.service";
import { AthosService } from "./athos.service";
import { AthosProdutoService } from "./athos-produto.service";
import { ProdutoController } from "./athos-produto.controller";

@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [AthosService, AthosListenerService, AthosProdutoService],
  controllers: [AthosController, ProdutoController],
  exports: [AthosService, AthosProdutoService],
})
export class AthosModule {}
```

**Modificação necessária** — adicionar `AthosDefaultsService` em `providers` e `exports` (sem controller próprio na Fase 37):

```typescript
// Adicionar import:
import { AthosDefaultsService } from "./athos-defaults.service";

// Atualizar @Module:
@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [AthosService, AthosListenerService, AthosProdutoService, AthosDefaultsService],
  controllers: [AthosController, ProdutoController],
  exports: [AthosService, AthosProdutoService, AthosDefaultsService],
})
export class AthosModule {}
```

---

## Padrões Compartilhados (Cross-cutting)

### Conexão ao Banco Athos (pg Pool)
**Fonte:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` linhas 18-41
**Aplicar em:** `athos-defaults.service.ts`

Copiar `getPool()` e `getDbConfig()` integralmente. As variáveis de ambiente `ATHOS_PG_*` e os parâmetros do pool (`max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000`) são idênticos — não criar nova configuração.

### Logger por Serviço
**Fonte:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` linha 15
**Aplicar em:** `athos-defaults.service.ts`

```typescript
private readonly logger = new Logger(AthosDefaultsService.name);
```

Mensagens de log nunca devem incluir valores individuais de campos fiscais (segurança — evitar exfiltração via log). Registrar apenas contadores: `sampleSize`, `campos_fiscais`.

### try/finally com client.release()
**Fonte:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` linhas 64, 155-157
**Aplicar em:** `athos-defaults.service.ts` no método `_fetchAndCompute()`

`client.release()` SEMPRE no bloco `finally` — mesmo em erro de query.

### Mock de pg Pool em Testes
**Fonte:** `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` linhas 5-19
**Aplicar em:** `athos-defaults.service.test.ts`

`jest.mock("pg", ...)` deve ser a primeira declaração do arquivo, antes dos imports do serviço. Usar `const pgMock = require("pg")` para acessar o mock nas asserções.

### Aspas duplas e strict TypeScript
**Fonte:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` (convenção geral do projeto)
**Aplicar em:** todos os arquivos novos

Usar aspas duplas em strings, sem ponto-e-vírgula opcional omitido (TypeScript strict). Seguir as convenções do análogo exatamente.

---

## Arquivos sem Análogo

| Arquivo | Papel | Motivo |
|---------|-------|--------|
| Nenhum | — | Todos os padrões necessários têm análogo direto no módulo athos existente |

---

## Metadados

**Escopo de busca de análogos:** `apps/backend/src/modules/integrations/athos/`
**Arquivos lidos:** 5 (`athos-produto.service.ts`, `athos-produto.service.test.ts`, `athos-conta-pagar.util.ts`, `athos.module.ts`, + CONTEXT.md e RESEARCH.md)
**Data de extração de padrões:** 2026-06-26
