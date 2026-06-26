# Phase 37: Motor de Defaults (Descoberta por Moda) - Research

**Researched:** 2026-06-26
**Domain:** NestJS singleton service — leitura PostgreSQL, cálculo de moda, cache em memória
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Produtos ativos = `statusproduto = true AND vendeproduto = true`
- **D-02:** Sem janela temporal — usa todo o catálogo ativo
- **D-03:** Cache em memória (estrutura tipo `Map`), TTL de 24h, carregado na primeira chamada (lazy), recalculado ao expirar
- **D-04:** Sem invalidação por escrita — backend é instância única, TTL longo basta
- **D-05:** Campos cobertos pela moda: **fiscais** (`icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`, `ncm`) + **estoque** (`controlaestoque`, `baixarestoque`)
- **D-06:** `statusproduto` e `vendeproduto` **não são campos de moda** — default fixo `true` (competência da Fase 38)
- **D-07:** Campos de estoque sem amostra suficiente → fallback hardcoded `false`; nunca lança exceção
- **D-08:** Campos fiscais sem moda calculável → campo **omitido** do mapa de retorno (não chutar valor fiscal errado)
- **D-09:** Amostra mínima de 5 produtos com o campo preenchido para a moda ser confiável
- **D-10:** Sem limiar de dominância (qualquer moda é válida)
- **D-11:** Empate de frequência resolvido pelo **menor valor** (determinístico, testável)

### Claude's Discretion

- Forma exata da query SQL (uma query com `GROUP BY/ORDER BY count` por campo vs. uma varredura única computada em Node) — respeitando o padrão `pg` Pool cru existente
- Nomes exatos de métodos/classe do serviço e formato da estrutura de retorno
- Constante de configuração para TTL (24h) e amostra mínima (5) — manter como constantes nomeadas

### Deferred Ideas (OUT OF SCOPE)

- Valor de fallback de `controlaestoque`/`baixarestoque` revisável pelo operador
- Endpoint de preview/dry-run dos defaults (DEFV-01)
- UI de revisão de defaults (DEFV-02)
- Defaults configuráveis por env var

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Descrição | Suporte desta pesquisa |
|----|-----------|------------------------|
| DEFD-01 | Calcular a moda (valor mais comum) de cada campo configurável a partir dos produtos ativos | Seção "Estratégia SQL" — query única de leitura + função pura `computeModeFromRows` |
| DEFD-02 | Ignorar valores nulos/vazios no cálculo — apenas produtos com o campo preenchido participam | Seção "Tratamento de NULL e string vazia" — filtro aplicado na função pura em Node.js |
| DEFD-03 | Reaproveitar o resultado da moda (cache) entre criações | Seção "Padrão de Cache em Memória" — Map com TTL de 24h e promise-lock anti-concorrência |
| DEFD-04 | Quando não há amostra suficiente, usar fallback seguro e nunca quebrar o cadastro | Seção "Fallback Seguro" — campos fiscais omitidos, campos de estoque recebem `false` |

</phase_requirements>

---

## Summary

A Fase 37 cria um único serviço NestJS (`AthosDefaultsService`) que lê a tabela `produto` do Athos via `pg` Pool (mesmo padrão de `AthosProdutoService`), calcula a moda de 15 campos configuráveis e armazena o resultado em cache com TTL de 24h. O serviço não escreve nada — é estritamente read-only.

A decisão de implementação mais importante é a **estratégia de cálculo**: a pesquisa confirma que a abordagem de **uma única query SQL + computação da moda em Node.js (função pura)** é superior às 15 queries separadas por campo, porque (a) reduz round trips ao banco de 15 para 1, (b) permite isolar toda a lógica de moda numa função pura facilmente testável sem mock de banco, e (c) o custo da query maior ocorre no máximo uma vez a cada 24h graças ao cache.

O cache deve usar um **promise-lock** (não apenas uma flag booleana) para evitar race conditions quando múltiplas chamadas chegam antes do primeiro cálculo completar. Esse padrão é idiomático em serviços NestJS singleton com carregamento lazy e não requer dependências externas.

**Recomendação principal:** Implementar `AthosDefaultsService` com query única, função pura `computeModeFromRows` em arquivo `.util.ts` separado (padrão já existente no módulo), e promise-lock para o cache lazy.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cálculo da moda | API / Backend (NestJS service) | — | Lógica de negócio pura; não envolve frontend |
| Leitura de produtos ativos | Database / Storage (Athos PostgreSQL via pg Pool) | — | Mesmo padrão de `AthosProdutoService` |
| Cache em memória | API / Backend (singleton service) | — | Backend é instância única; Map em memória basta |
| Fornecimento de defaults para Fase 38 | API / Backend | — | Interface interna entre serviços NestJS (injeção de dependência) |

---

## Standard Stack

### Core (já instalada — sem novos pacotes)

| Biblioteca | Versão | Propósito | Por que padrão |
|-----------|--------|-----------|----------------|
| `pg` | existente no projeto | Conexão PostgreSQL Athos via Pool | Padrão já estabelecido em `AthosProdutoService`; não usar Prisma para o Athos |
| `@nestjs/common` | existente | `@Injectable()`, `Logger` | Padrão NestJS do projeto |

**Nenhum pacote novo é necessário.** A Fase 37 reutiliza exclusivamente dependências já instaladas.

### Alternativas Consideradas

| Em vez de | Poderia Usar | Tradeoff |
|-----------|-------------|----------|
| `Map` plain + promise-lock | `@nestjs/cache-manager` | `@nestjs/cache-manager` adiciona dependência desnecessária para cache em memória de instância única com TTL simples. Map plain é suficiente e idiomático. |
| Computação em Node.js | 15 queries `GROUP BY` separadas | 15 round trips vs 1; Node.js computation é mais testável e igualmente eficiente com cache TTL de 24h. |

---

## Package Legitimacy Audit

> Nenhum pacote externo novo instalado nesta fase. Todos os pacotes são dependências existentes (`pg`, `@nestjs/common`).

| Pacote | Registry | Situação | Disposição |
|--------|----------|----------|------------|
| `pg` | npm | Já instalado no projeto (8+ anos, 50M+/sem) | Aprovado — uso existente |
| `@nestjs/common` | npm | Já instalado no projeto | Aprovado — uso existente |

**Pacotes removidos por veredicto SLOP:** nenhum
**Pacotes sinalizados como suspeitos (SUS):** nenhum

---

## Architecture Patterns

### System Architecture Diagram

```
Fase 38 (criarProduto)
        │
        │ injeta AthosDefaultsService
        ▼
┌─────────────────────────────────┐
│     AthosDefaultsService        │
│  @Injectable() singleton        │
│                                 │
│  getDefaults()                  │
│    │                            │
│    ├── [cache hit]──────────────┼──► DefaultsMap (sem query)
│    │                            │
│    └── [cache miss / expirado]  │
│          │                      │
│          ├── [_loading existe]──┼──► aguarda promise existente
│          │                      │
│          └── [_loading nulo]    │
│                │                │
│                ▼                │
│         _fetchAndCompute()      │
│                │                │
│                ▼                │
│         pg Pool.connect()       │
│                │                │
│                ▼                │
│    SELECT 15 campos FROM        │
│    produto WHERE statusproduto  │
│    = true AND vendeproduto = true
│                │                │
│                ▼                │
│    computeDefaults(rows)        │◄── função pura de athos-defaults.util.ts
│                │                │
│                ▼                │
│    _cache = { defaults,         │
│               expiresAt: +24h } │
│                │                │
└────────────────┼────────────────┘
                 │
                 ▼
           DefaultsMap
           (campo → valor)
```

### Estrutura de Arquivos Recomendada

```
apps/backend/src/modules/integrations/athos/
├── athos-defaults.service.ts          # Singleton: cache + pg Pool
├── athos-defaults.service.test.ts     # Jest com mock pg
├── athos-defaults.util.ts             # computeModeFromRows() — função pura
└── athos-defaults.util.test.ts        # Jest puro, sem mocks de banco
```

O padrão `.util.ts` + `.util.test.ts` já existe no módulo (`athos-conta-pagar.util.ts`, `athos-anexo.util.ts`). [VERIFIED: codebase grep]

### Padrão 1: Conexão Pool (seguir AthosProdutoService exatamente)

**O quê:** Reutilizar `getPool()` / `getDbConfig()` com `ATHOS_PG_*` — não criar nova configuração.

**Quando usar:** Em todo acesso direto ao Athos PostgreSQL.

```typescript
// Source: apps/backend/src/modules/integrations/athos/athos-produto.service.ts
@Injectable()
export class AthosDefaultsService {
  private readonly logger = new Logger(AthosDefaultsService.name);
  private _pool: Pool | null = null;

  private getPool(): Pool {
    if (!this._pool) {
      const cfg = this.getDbConfig();
      this._pool = new Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
      this._pool.on('error', (err: Error) => this.logger.error(`Athos defaults pool error: ${err.message}`));
    }
    return this._pool;
  }

  private getDbConfig() {
    const host = process.env.ATHOS_PG_HOST;
    const database = process.env.ATHOS_PG_DB;
    const user = process.env.ATHOS_PG_USER;
    const password = process.env.ATHOS_PG_PASS;
    const port = Number(process.env.ATHOS_PG_PORT ?? '5432');
    if (!host || !database || !user || !password) {
      throw new InternalServerErrorException(
        'Configuracao Athos ausente. Defina ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER e ATHOS_PG_PASS.',
      );
    }
    return { host, database, user, password, port };
  }
}
```

### Padrão 2: Query SQL única para todos os campos

**O quê:** Uma única `SELECT` dos 15 campos dos produtos ativos. Computação da moda em Node.js.

**Por que não 15 queries separadas com GROUP BY:**
- 15 round trips ao banco vs. 1
- Mais difícil de testar: cada query precisaria de mock separado
- Com cache TTL de 24h, o custo da query única ocorre raramente
- Catálogo Bom Custo é estável e pequeno (centenas de produtos, não milhões)

```typescript
// Constantes nomeadas (D-09, D-03 — nunca inline magic numbers)
export const DEFAULTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const DEFAULTS_MIN_SAMPLE = 5;

// Allowlist de campos cobertos pela moda (D-05)
export const FISCAL_FIELDS = [
  'icms', 'icmsnfe', 'tributacao', 'tributacaonfe',
  'codigocsosn', 'codigocsosnnfe', 'origem', 'origemnfe',
  'tipoitem', 'piscst', 'cofinscst', 'idcfopsaida', 'ncm',
] as const;

export const STOCK_FIELDS = ['controlaestoque', 'baixarestoque'] as const;

// Query: seleciona apenas as colunas necessárias dos produtos ativos
const SQL_ACTIVE_PRODUCTS = `
  SELECT icms, icmsnfe, tributacao, tributacaonfe,
         codigocsosn, codigocsosnnfe, origem, origemnfe,
         tipoitem, piscst, cofinscst, idcfopsaida, ncm,
         controlaestoque, baixarestoque
  FROM produto
  WHERE statusproduto = true AND vendeproduto = true
`;
```

### Padrão 3: Função pura de cálculo da moda (arquivo .util.ts)

**O quê:** Separar toda lógica de cálculo em função pura — sem I/O, sem efeitos colaterais.

**Quando usar:** A função recebe as linhas brutas do banco e retorna o `DefaultsMap`.

```typescript
// Source: athos-defaults.util.ts (a criar na Fase 37)
type RawValue = string | number | boolean | null;
type RawRow = Record<string, RawValue>;

/**
 * Calcula a moda de um campo entre as linhas fornecidas.
 * - Ignora null e string vazia (DEFD-02)
 * - Requer ao menos MIN_SAMPLE valores preenchidos (D-09)
 * - Em empate, retorna o menor valor (D-11)
 * @returns valor da moda ou null se amostra insuficiente
 */
export function computeModeFromRows(
  rows: RawRow[],
  field: string,
  minSample: number,
): RawValue {
  const freq = new Map<string, { value: RawValue; count: number }>();

  for (const row of rows) {
    const raw = row[field];
    // Excluir null e string vazia (DEFD-02)
    if (raw === null || raw === undefined || raw === '') continue;
    const key = String(raw);
    const entry = freq.get(key);
    if (entry) {
      entry.count++;
    } else {
      freq.set(key, { value: raw, count: 1 });
    }
  }

  // Amostra insuficiente (D-09)
  const totalValid = [...freq.values()].reduce((s, e) => s + e.count, 0);
  if (totalValid < minSample) return null;

  // Ordenar por frequência DESC; em empate, menor valor ASC (D-11)
  const sorted = [...freq.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.value) < String(b.value) ? -1 : 1;
  });

  return sorted[0].value;
}

/**
 * Computa o DefaultsMap completo a partir das linhas brutas do banco.
 * - Campos fiscais sem moda: omitidos (D-08)
 * - Campos de estoque sem moda: fallback false (D-07)
 */
export function computeDefaults(rows: RawRow[]): ProductDefaults {
  const result: Partial<ProductDefaults> = {};

  for (const field of FISCAL_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    if (mode !== null) {
      (result as Record<string, RawValue>)[field] = mode;
    }
    // Se null → campo omitido (D-08)
  }

  for (const field of STOCK_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    // Fallback false se sem moda (D-07)
    (result as Record<string, RawValue>)[field] = mode !== null ? (mode as boolean) : false;
  }

  return result as ProductDefaults;
}
```

### Padrão 4: Cache em Memória com Promise-Lock

**O quê:** Usar um promise-lock para evitar race conditions quando múltiplas chamadas chegam antes do primeiro cálculo completar.

**Por que importante:** Sem o lock, N chamadas simultâneas disparariam N queries ao banco antes de qualquer uma cachear o resultado.

```typescript
// Source: padrão idiomático NestJS singleton com lazy cache [ASSUMED]
private _cache: { defaults: ProductDefaults; expiresAt: number } | null = null;
private _loading: Promise<ProductDefaults> | null = null;

async getDefaults(): Promise<ProductDefaults> {
  if (this._cache && Date.now() < this._cache.expiresAt) {
    return this._cache.defaults;
  }
  if (!this._loading) {
    this._loading = this._fetchAndCompute().finally(() => {
      this._loading = null;
    });
  }
  return this._loading;
}

private async _fetchAndCompute(): Promise<ProductDefaults> {
  const pool = this.getPool();
  const client = await pool.connect();
  try {
    const result = await client.query<RawRow>(SQL_ACTIVE_PRODUCTS);
    const defaults = computeDefaults(result.rows);
    this._cache = { defaults, expiresAt: Date.now() + DEFAULTS_CACHE_TTL_MS };
    this.logger.log(
      `defaults calculados sampleSize=${result.rows.length} campos_fiscais=${Object.keys(defaults).filter(k => FISCAL_FIELDS.includes(k as any)).length}`,
    );
    return defaults;
  } finally {
    client.release();
  }
}
```

### Padrão 5: Tipo de Retorno `ProductDefaults`

**O quê:** Interface TypeScript que reflete exatamente as decisões D-07 e D-08.

```typescript
// Source: athos-defaults.service.ts ou athos-defaults.util.ts
export interface ProductDefaults {
  // Campos fiscais — opcionais (omitidos quando sem moda, D-08)
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
  // Campos de estoque — sempre presentes (fallback false, D-07)
  controlaestoque: boolean;
  baixarestoque: boolean;
}
```

### Padrão 6: Registro no AthosModule

**O quê:** O serviço é provider e export do AthosModule (sem controller próprio na Fase 37).

```typescript
// apps/backend/src/modules/integrations/athos/athos.module.ts (a atualizar)
@Module({
  imports: [DatabaseModule, EventsModule, forwardRef(() => QuotesModule)],
  providers: [AthosService, AthosListenerService, AthosProdutoService, AthosDefaultsService],
  controllers: [AthosController, ProdutoController],
  exports: [AthosService, AthosProdutoService, AthosDefaultsService],
})
export class AthosModule {}
```

### Padrão 7: Mock do pg Pool em Testes (seguir padrão existente)

**O quê:** `jest.mock("pg", ...)` no topo do arquivo de teste — padrão já estabelecido em `athos-produto.service.test.ts`.

```typescript
// Source: apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts [VERIFIED: codebase]
jest.mock('pg', () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

// Teste do cache: verificar que segunda chamada não dispara query ao banco
it('segunda chamada usa cache — não dispara nova query', async () => {
  const client = setupMockClient([{ rows: [/* linhas brutas */], rowCount: 1 }]);
  
  await service.getDefaults(); // primeira chamada — popula cache
  await service.getDefaults(); // segunda chamada — deve usar cache
  
  // query ao banco chamada apenas 1 vez no total
  expect(client.query).toHaveBeenCalledTimes(1);
});
```

### Anti-Patterns a Evitar

- **Cache com flag booleana sem promise-lock:** `if (!this._loaded) { this._loaded = true; await this._fetch(); }` — cria race condition onde N calls simultâneas passam pelo check antes de qualquer uma completar a query.
- **15 queries separadas GROUP BY:** Aumenta round trips e impossibilita isolar lógica de moda em função pura.
- **Lançar exceção quando fallback é necessário:** O serviço nunca deve lançar exceção na falta de amostra; deve retornar o DefaultsMap com omissão ou fallback conforme D-07/D-08.
- **Incluir `statusproduto` e `vendeproduto` na query de moda:** D-06 os exclui explicitamente — default fixo `true` é responsabilidade da Fase 38.

---

## Don't Hand-Roll

| Problema | Não construir | Usar em vez disso | Por quê |
|----------|--------------|-------------------|---------|
| Conexão PostgreSQL | pool customizado | `pg` Pool com `ATHOS_PG_*` (existente) | Pool gerencia reconexão, idle timeout, max connections |
| Cache distribuído | Redis/Memcached | Map em memória + promise-lock | Backend é instância única; complexidade injustificada |
| Lock de concorrência | Mutex de terceiro | Promise compartilhada no campo `_loading` | Promise é nativa; funciona corretamente em event loop Node.js single-thread |
| Cálculo de moda SQL | Janela analítica complexa | Função pura Node.js sobre resultado da query | Mais testável, zero acoplamento ao DB dialect |

**Insight chave:** O backend single-instance Node.js torna o promise-lock uma solução completa para o problema de concorrência — não há múltiplos processos para coordenar.

---

## Common Pitfalls

### Pitfall 1: String vazia não é NULL no PostgreSQL

**O que dá errado:** Filtrar apenas `IS NOT NULL` deixa passar strings vazias `''` que corrompem a moda (campo "preenchido" com valor inválido).

**Por que acontece:** O Athos pode gravar string vazia em campos fiscais quando o operador não preencheu o campo. `''` não é `NULL` no banco.

**Como evitar:** Na função `computeModeFromRows`, o check deve excluir AMBOS:
```typescript
if (raw === null || raw === undefined || raw === '') continue;
```

**Sinal de alerta:** Moda fiscal retornando string vazia `''` — indica que o filtro está incompleto.

### Pitfall 2: Race condition no cache lazy

**O que dá errado:** Sem promise-lock, duas chamadas simultâneas chegando com cache vazio disparam duas queries idênticas ao banco. O resultado do primeiro sobrescreve o do segundo sem utilidade.

**Por que acontece:** O check `if (this._cache)` pode retornar `false` para ambas as chamadas antes de qualquer uma completar o `_fetchAndCompute()`.

**Como evitar:** Armazenar a Promise em andamento em `this._loading` e retorná-la para chamadores subsequentes enquanto a primeira ainda está em curso.

**Sinal de alerta:** Em logs, múltiplas linhas `"defaults calculados sampleSize=..."` aparecendo quase simultaneamente na inicialização.

### Pitfall 3: Tipos de retorno do pg para campos numéricos

**O que dá errado:** Campos `number` no TypeScript (`origem: number | null`, `origemnfe: number | null`) podem retornar como `string` do driver `pg` dependendo da configuração do pool.

**Por que acontece:** O `pg` por padrão converte `integer` para `number`, mas `numeric`/`decimal` retorna como `string`. O tipo `origem` é `integer` no Athos, então deve retornar `number` corretamente. Verificar no primeiro deploy.

**Como evitar:** A função `computeModeFromRows` usa `String(raw)` como chave no Map, portanto funciona independente de `1` ou `"1"`. O tipo do valor retornado será o que o pg enviou — testar o tipo real no teste de integração.

**Sinal de alerta:** `typeof defaults.origem === 'string'` quando se esperava `number`.

### Pitfall 4: Campos booleanos com desempate pelo menor valor

**O que dá errado:** Para `controlaestoque` e `baixarestoque`, em empate de frequência entre `true` e `false`, o desempate lexicográfico `"false" < "true"` retorna `false`. Isso pode ser surpreendente mas é correto per D-11 e D-07.

**Por que acontece:** D-11 define "menor valor" como critério de desempate sem distinção de tipo.

**Como evitar:** Documentar explicitamente no código que para booleanos o desempate favorece `false` (que coincide com o fallback de D-07). Não é bug.

**Sinal de alerta:** Nenhum — comportamento esperado por design.

### Pitfall 5: `statusproduto`/`vendeproduto` na query ou no mapa de defaults

**O que dá errado:** Incluir `statusproduto` ou `vendeproduto` no SELECT ou no DefaultsMap viola D-06 e DOPR-01 — esses campos têm default fixo `true` definido na Fase 38, não pela moda.

**Por que acontece:** Podem parecer campos de produto "configuráveis" mas são campos de ciclo de vida com regra de negócio própria.

**Como evitar:** A `FISCAL_FIELDS` e `STOCK_FIELDS` allowlist deve ser a única fonte de verdade. Verificação: nenhum dos dois deve aparecer em nenhuma das duas constantes.

**Sinal de alerta:** `statusproduto` ou `vendeproduto` aparecendo no objeto `ProductDefaults`.

---

## Code Examples

### Exemplo completo: função pura com todos os campos

```typescript
// Source: a criar em athos-defaults.util.ts
import { FISCAL_FIELDS, STOCK_FIELDS, DEFAULTS_MIN_SAMPLE } from './athos-defaults.service';

type RawValue = string | number | boolean | null;
type RawRow = Record<string, RawValue>;

export function computeModeFromRows(
  rows: RawRow[],
  field: string,
  minSample: number,
): RawValue {
  const freq = new Map<string, { value: RawValue; count: number }>();
  for (const row of rows) {
    const raw = row[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const key = String(raw);
    const entry = freq.get(key);
    if (entry) entry.count++;
    else freq.set(key, { value: raw, count: 1 });
  }
  const totalValid = [...freq.values()].reduce((s, e) => s + e.count, 0);
  if (totalValid < minSample) return null;
  return [...freq.values()]
    .sort((a, b) => b.count !== a.count ? b.count - a.count : String(a.value) < String(b.value) ? -1 : 1)[0]
    .value;
}

export function computeDefaults(rows: RawRow[]): ProductDefaults {
  const result: Record<string, RawValue> = {};
  for (const field of FISCAL_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    if (mode !== null) result[field] = mode; // D-08: omitir se null
  }
  for (const field of STOCK_FIELDS) {
    const mode = computeModeFromRows(rows, field, DEFAULTS_MIN_SAMPLE);
    result[field] = mode !== null ? mode : false; // D-07: fallback false
  }
  return result as ProductDefaults;
}
```

### Exemplo: teste da função pura (sem mock de banco)

```typescript
// Source: a criar em athos-defaults.util.test.ts
import { computeModeFromRows, computeDefaults } from './athos-defaults.util';

describe('computeModeFromRows', () => {
  it('retorna o valor mais frequente', () => {
    const rows = [{ icms: '12' }, { icms: '12' }, { icms: '7' }];
    expect(computeModeFromRows(rows, 'icms', 3)).toBe('12');
  });

  it('ignora null e string vazia (DEFD-02)', () => {
    const rows = [{ icms: null }, { icms: '' }, { icms: '7' }, { icms: '7' }, { icms: '7' }];
    expect(computeModeFromRows(rows, 'icms', 3)).toBe('7');
  });

  it('retorna null quando amostra < minSample (D-09)', () => {
    const rows = [{ icms: '12' }, { icms: '7' }, { icms: '12' }, { icms: '7' }];
    expect(computeModeFromRows(rows, 'icms', 5)).toBeNull();
  });

  it('em empate retorna o menor valor (D-11)', () => {
    const rows = [
      { tributacao: 'S', ncm: 'S' }, { tributacao: 'T', ncm: 'T' },
      { tributacao: 'S', ncm: 'T' }, { tributacao: 'T', ncm: 'S' },
      { tributacao: 'S', ncm: 'S' },
    ];
    expect(computeModeFromRows(rows, 'tributacao', 3)).toBe('S'); // S freq=3 > T freq=2
  });

  it('empate estrito: menor valor lexicográfico vence (D-11)', () => {
    const rows = [
      { icms: '12' }, { icms: '12' }, { icms: '7' }, { icms: '7' }, { icms: '9' },
    ];
    // 12 e 7 empatam em freq=2; menor lexicográfico = '12' (porque '1' < '7')
    expect(computeModeFromRows(rows, 'icms', 5)).toBe('12');
  });
});

describe('computeDefaults', () => {
  it('campos fiscais sem amostra são omitidos (D-08)', () => {
    const rows = Array(5).fill({ icms: null, controlaestoque: true, baixarestoque: true });
    const result = computeDefaults(rows);
    expect(result).not.toHaveProperty('icms');
    expect(result.controlaestoque).toBe(true);
  });

  it('campos de estoque sem amostra recebem false (D-07)', () => {
    const result = computeDefaults([]); // nenhuma linha
    expect(result.controlaestoque).toBe(false);
    expect(result.baixarestoque).toBe(false);
  });
});
```

---

## State of the Art

| Abordagem Antiga | Abordagem Atual | Quando Mudou | Impacto |
|-----------------|-----------------|-------------|---------|
| `@nestjs/cache-manager` (Redis-backed) para cache | Map em memória + TTL | N/A (decisão D-03) | Elimina dependência Redis para caso single-instance |
| N queries GROUP BY (uma por campo) | 1 query + computação Node.js | N/A (decisão desta pesquisa) | Testabilidade e round-trips reduzidos |

**Sem itens deprecados relevantes para esta fase.**

---

## Assumptions Log

| # | Claim | Seção | Risco se errado |
|---|-------|-------|-----------------|
| A1 | Promise-lock (`_loading` field) é idiomático e suficiente em NestJS singleton para prevenir cache stampede | Padrão 4 (Cache) | Baixo — Node.js é single-thread; a única concorrência é entre Promises no mesmo loop |
| A2 | Catálogo Bom Custo tem centenas de produtos ativos (não dezenas de milhares) — query única de todos os campos é leve | Estratégia SQL | Médio — se catálogo for muito grande, talvez queira adicionar LIMIT ou paginar; mas TTL 24h mitiga o impacto |
| A3 | O driver `pg` retorna `true`/`false` (boolean nativo) para colunas `boolean` do PostgreSQL, não `'t'`/`'f'` | Pitfall 3 | Baixo — comportamento padrão do `pg` para boolean; verificar em teste de integração |

---

## Open Questions

1. **Pool compartilhado vs. pool separado para o serviço de defaults**
   - O que sabemos: `AthosProdutoService` já tem seu próprio `_pool` privado
   - O que está incerto: Se faz sentido compartilhar o pool (evitar conexões duplicadas) ou manter pools separados (isolamento)
   - Recomendação: Criar pool separado no `AthosDefaultsService` (mesmo padrão de `AthosProdutoService`) — a fase é read-only e o número de conexões (max:5 cada) é manageable. Pool compartilhado exigiria refatoração do módulo.

2. **Tipo exato retornado pelo `pg` para `origem` e `origemnfe` (integer)**
   - O que sabemos: `produto.types.ts` tipifica como `number | null`; pg converte `integer` para `number` por padrão
   - O que está incerto: Confirmação no ambiente real
   - Recomendação: Cobrir nos testes de integração; se retornar string, a função pura ainda funciona (usa `String(raw)` como chave)

---

## Environment Availability

> Todos os pré-requisitos desta fase são dependências já existentes no projeto.

| Dependência | Requerida por | Disponível | Observação |
|-------------|--------------|-----------|------------|
| `pg` (npm) | AthosDefaultsService | Sim | Já instalado |
| PostgreSQL Athos (`ATHOS_PG_*`) | Query de produtos | Sim (produção) | Vars de ambiente existentes |
| Jest + ts-jest | Testes | Sim | `apps/backend/jest.config.js` existente |

**Dependências ausentes sem fallback:** nenhuma

---

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|-------------|-------|
| Framework | Jest + ts-jest (existente) |
| Config | `apps/backend/jest.config.js` |
| Comando rápido | `cd apps/backend && npx jest athos-defaults --no-coverage` |
| Suite completa | `cd apps/backend && npx jest --no-coverage` |

### Mapeamento Requisitos → Testes

| Req ID | Comportamento | Tipo | Comando | Arquivo Existe? |
|--------|-------------|------|---------|----------------|
| DEFD-01 | Retorna o valor mais frequente de cada campo | Unitário (função pura) | `npx jest athos-defaults.util.test --no-coverage` | Criar Wave 0 |
| DEFD-02 | Ignora null e string vazia na contagem | Unitário (função pura) | `npx jest athos-defaults.util.test --no-coverage` | Criar Wave 0 |
| DEFD-03 | Segunda chamada não dispara nova query ao banco | Unitário (serviço com mock pg) | `npx jest athos-defaults.service.test --no-coverage` | Criar Wave 0 |
| DEFD-04a | Campo fiscal sem amostra: campo omitido do mapa | Unitário (função pura) | `npx jest athos-defaults.util.test --no-coverage` | Criar Wave 0 |
| DEFD-04b | Campo de estoque sem amostra: retorna false | Unitário (função pura) | `npx jest athos-defaults.util.test --no-coverage` | Criar Wave 0 |

### Taxa de Amostragem

- **Por commit:** `cd apps/backend && npx jest athos-defaults --no-coverage`
- **Por merge de wave:** `cd apps/backend && npx jest --no-coverage`
- **Gate da fase:** Suite completa verde antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts` — função pura (criada na implementação)
- [ ] `apps/backend/src/modules/integrations/athos/athos-defaults.util.test.ts` — testes da função pura
- [ ] `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts` — serviço singleton com cache
- [ ] `apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts` — testes com mock pg Pool

---

## Security Domain

### Categorias ASVS Aplicáveis

| Categoria ASVS | Aplica | Controle Padrão |
|---------------|--------|-----------------|
| V2 Authentication | Não | Fase read-only sem endpoint próprio |
| V3 Session Management | Não | Sem estado de sessão |
| V4 Access Control | Não | Serviço interno, sem rota HTTP exposta nesta fase |
| V5 Input Validation | Parcial | A query usa campos hardcoded em allowlist (`FISCAL_FIELDS`, `STOCK_FIELDS`) — sem input de usuário |
| V6 Cryptography | Não | Sem dados sensíveis processados |

### Threat Patterns para esta Stack

| Pattern | STRIDE | Mitigação Padrão |
|---------|--------|-----------------|
| SQL injection via nome de campo | Tampering | Campos do SELECT são hardcoded (allowlist `FISCAL_FIELDS`/`STOCK_FIELDS`) — sem interpolação de input de usuário na query |
| Cache poisoning | Tampering | Cache é populado apenas pela query ao banco próprio (Athos) — sem fonte externa de input |
| Exfiltração de dados fiscais via log | Information Disclosure | Logger registra apenas contadores (`sampleSize`, `campos_fiscais`) — não valores individuais |

**Nota de segurança:** A Fase 37 é estritamente read-only (`SELECT` apenas) e sem endpoint HTTP próprio. A superfície de ataque é mínima. O maior risco é a credencial `ATHOS_PG_*` em env vars — já gerenciado pelas fases anteriores.

---

## Sources

### Primary (HIGH confidence)

- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` [VERIFIED: codebase] — padrão de `getPool()`, `getDbConfig()`, `jest.mock("pg")`, `Logger` a replicar
- `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` [VERIFIED: codebase] — padrão de mock do `pg` Pool a seguir nos novos testes
- `apps/backend/src/modules/integrations/athos/produto.types.ts` [VERIFIED: codebase] — tipos dos 15 campos da allowlist
- `apps/backend/src/modules/integrations/athos/athos.module.ts` [VERIFIED: codebase] — ponto de registro do novo serviço
- `.planning/phases/37-motor-de-defaults-descoberta-por-moda/37-CONTEXT.md` [VERIFIED: codebase] — 11 decisões travadas

### Secondary (MEDIUM confidence)

- `.planning/codebase/ARCHITECTURE.md` [VERIFIED: codebase] — padrão singleton, event loop single-thread, sem Redis
- `.planning/codebase/CONVENTIONS.md` [VERIFIED: codebase] — naming `.util.ts`, Logger, duplas aspas, strict TypeScript

### Tertiary (LOW confidence / ASSUMED)

- Padrão de promise-lock para cache lazy em NestJS singleton [ASSUMED] — idiomático em Node.js mas não verificado em docs externos nesta sessão

---

## Metadata

**Breakdown de confiança:**

| Área | Nível | Razão |
|------|-------|-------|
| Stack padrão | HIGH | Tudo já existente e verificado no codebase |
| Estratégia SQL | HIGH | Decisão fundamentada em trade-offs concretos do projeto |
| Padrão de cache | HIGH | Node.js single-thread — promise-lock é solução correta e simples |
| Função pura / testabilidade | HIGH | Padrão `.util.ts` já existente no módulo |
| Pitfalls | HIGH | Derivados de análise direta do código e tipos existentes |

**Data da pesquisa:** 2026-06-26
**Válido até:** 2026-07-26 (stack estável; só `pg` e NestJS)
