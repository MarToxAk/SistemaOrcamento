---
phase: 37-motor-de-defaults-descoberta-por-moda
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/backend/src/modules/integrations/athos/athos-defaults.util.ts
  - apps/backend/src/modules/integrations/athos/athos-defaults.util.test.ts
  - apps/backend/src/modules/integrations/athos/athos-defaults.service.ts
  - apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts
  - apps/backend/src/modules/integrations/athos/athos.module.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Fase 37: Relatório de Code Review

**Revisado em:** 2026-06-26
**Profundidade:** standard
**Arquivos revisados:** 5
**Status:** issues_found

## Resumo

Motor de defaults stateless (`computeModeFromRows` / `computeDefaults`) e serviço com cache TTL 24h + promise-lock. A lógica central de cálculo de moda está correta: trata `null`, `undefined` e string vazia explicitamente com comparações estritas (não cai no clássico pitfall de `!raw` que excluiria `false` e `0`), a contagem de amostra mínima está correta, e o desempate lexicográfico ASC produz o resultado esperado nos testes. A SQL é 100% hardcoded sem interpolação de input de usuário. O módulo NestJS registra e exporta `AthosDefaultsService` corretamente.

Três problemas de qualidade foram encontrados: um no tratamento de erros do pool pg, um na exposição de referência mutável do cache, e um de rigor de tipos para campos booleanos. Nenhum é blocker de segurança ou corretude crítica dado o contexto read-only, mas os dois primeiros podem causar comportamento inesperado em produção.

---

## Avisos (Warnings)

### WR-01: `client.release()` chamado sem argumento de erro no bloco finally

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts:118-121`

**Problema:** No bloco `finally`, `client.release()` é sempre chamado sem argumento. A API do `pg` aceita `client.release(err?)`: quando um erro é passado, o pool **destrói** a conexão em vez de devolvê-la para reuso. Sem o erro, uma conexão que falhou em `client.query()` (ex: erro de rede ou protocolo) é devolvida ao pool como se estivesse saudável, podendo envenenar requisições subsequentes com uma conexão corrompida.

Para um `SELECT` puro sem transação explícita, o PostgreSQL faz rollback automático em caso de erro de protocolo, portanto o risco prático é baixo — mas viola a convenção documentada do driver e dificulta a depuração de falhas intermitentes de pool.

**Fix:**
```typescript
// athos-defaults.service.ts — _fetchAndCompute()
private async _fetchAndCompute(): Promise<ProductDefaults> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  let queryError: Error | undefined;
  try {
    const result = await client.query<RawRow>(SQL_ACTIVE_PRODUCTS);
    const defaults = computeDefaults(result.rows);
    this._cache = { defaults, expiresAt: Date.now() + DEFAULTS_CACHE_TTL_MS };
    // ... log ...
    return defaults;
  } catch (err) {
    queryError = err as Error;
    throw err;
  } finally {
    // Sinaliza ao pool que a conexão pode estar corrompida quando houve erro
    client.release(queryError);
  }
}
```

---

### WR-02: Cache expõe referência mutável — corrupção silenciosa possível

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts:83-85`

**Problema:** `getDefaults()` retorna `this._cache.defaults` diretamente (referência ao objeto em cache). Como `AthosDefaultsService` é singleton no NestJS, qualquer chamador que mute os campos do objeto retornado corrompe o cache compartilhado para **todas** as requisições subsequentes durante as 24h de TTL.

Exemplo de corrupção:
```typescript
// Controlador hipotético — buggy caller
const defaults = await this.defaultsService.getDefaults();
defaults.icms = req.body.icms ?? defaults.icms; // mutação acidental
// Agora o cache global tem icms = req.body.icms para todos os usuários
```

**Fix:** Retornar cópia rasa (suficiente pois todos os valores são primitivos):
```typescript
async getDefaults(): Promise<ProductDefaults> {
  if (this._cache && Date.now() < this._cache.expiresAt) {
    return { ...this._cache.defaults }; // cópia defensiva
  }
  // ...
}
```

Alternativa mais performática: `Object.freeze()` o objeto antes de armazenar no cache, causando erro imediato e visível se algum chamador tentar mutá-lo em modo strict:
```typescript
this._cache = {
  defaults: Object.freeze(defaults) as ProductDefaults,
  expiresAt: Date.now() + DEFAULTS_CACHE_TTL_MS,
};
```

---

### WR-03: `(mode as boolean)` — asserção de tipo sem coerção de runtime

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts:131`

**Problema:** A expressão `(mode as boolean)` é exclusivamente uma asserção TypeScript em tempo de compilação — não produz nenhuma coerção em runtime. O tipo de `mode` em runtime é `RawValue` (`string | number | boolean | null`). Se o driver `pg` retornar a string `"true"` ou `"false"` para uma coluna booleana (ex: versão antiga do driver, tipo `text` no schema Athos), o valor armazenado em `result[field]` seria a string `"true"`, mas o TypeScript pensaria ser `boolean`. O chamador faria `if (defaults.controlaestoque)` e obteria `true` (pois `"true"` é truthy) — coincidência —, mas operações de identidade estritas (`=== false`) falhariam silenciosamente.

O driver `pg` moderno mapeia colunas `boolean` do PostgreSQL para `true`/`false` JavaScript corretamente, então o risco prático é baixo. Mesmo assim, a asserção mascara a falta de validação.

**Fix:**
```typescript
// Em vez de: result[field] = mode !== null ? (mode as boolean) : false;
// Adicionar coerção explícita:
result[field] = mode !== null ? Boolean(mode) : false;
```

`Boolean(true)` → `true`, `Boolean(false)` → `false`, `Boolean("true")` → `true`, `Boolean("false")` → `true` (atenção: string não-vazia é truthy — mas esse seria o comportamento correto se o valor já foi filtrado pela lista de campos).

---

## Informacionais (Info)

### IN-01: Comparador de sort não-reflexivo — retorna `1` para valores iguais

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts:99`

**Problema:**
```typescript
return String(a.value) < String(b.value) ? -1 : 1;
```
Quando `String(a.value) === String(b.value)`, o comparador retorna `1` (e `comparefn(b, a)` também retorna `1`), violando a propriedade de antissimetria exigida pela especificação ECMAScript para comparadores de sort. Em prática, isso nunca ocorre porque o Map usa chaves string distintas, tornando dois entries com a mesma representação string impossíveis. Mas é tecnicamente incorreto e pode confundir leitores.

**Fix:**
```typescript
return String(a.value) < String(b.value) ? -1
     : String(a.value) > String(b.value) ? 1
     : 0;
```

---

### IN-02: Double cast `as unknown as ProductDefaults` contorna verificação estrutural

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts:134`

**Problema:** `return result as unknown as ProductDefaults` usa duplo cast para contornar a verificação estrutural do TypeScript. Se `result` não tiver os campos obrigatórios (`controlaestoque`, `baixarestoque`), o compilador não detectaria a omissão. A lógica garante que esses campos são sempre preenchidos pelo loop `STOCK_FIELDS`, mas a asserção mascara qualquer refatoração futura que quebre essa invariante.

**Fix alternativo:** Construir o objeto com tipo correto desde o início, ou usar `satisfies`:
```typescript
// Opção 1: construir tipado diretamente
const result: Partial<ProductDefaults> & Pick<ProductDefaults, 'controlaestoque' | 'baixarestoque'> = {
  controlaestoque: false,
  baixarestoque: false,
};
// ... preencher campos fiscais opcionais ...
return result as ProductDefaults;

// Opção 2: manter atual mas adicionar asserção de runtime nos campos obrigatórios
const r = result as unknown as ProductDefaults;
if (r.controlaestoque === undefined || r.baixarestoque === undefined) {
  throw new Error('Invariante quebrada: campos de estoque ausentes');
}
return r;
```

---

### IN-03: Boilerplate do mock `Pool` repetido em todos os casos de teste do serviço

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts:62,81,97,107,125,141,157,172`

**Problema:** O seguinte trecho é repetido em todos os 9 casos de teste:
```typescript
const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
const client = { query: jest.fn(), release: jest.fn() };
pool.connect = jest.fn().mockResolvedValue(client);
```

Além da repetição, `pgMock.Pool.mock.results[0]?.value` acessa o primeiro pool já criado nos testes anteriores; após `jest.clearAllMocks()` esse valor é `undefined`, fazendo o fallback criar um novo pool via `new (pgMock.Pool)()`. O comportamento é correto (o mock singleton garante ser o mesmo `mPool`), mas a lógica é opaca e frágil.

**Fix:** Extrair para helper em `beforeEach`:
```typescript
let client: { query: jest.Mock; release: jest.Mock };

beforeEach(async () => {
  jest.clearAllMocks();
  client = { query: jest.fn(), release: jest.fn() };
  // O mock Pool sempre retorna o mesmo mPool — basta sobrescrever connect aqui
  const pool = new (pgMock.Pool)(); // mPool singleton
  pool.connect = jest.fn().mockResolvedValue(client);
  // ... criar module e service ...
});
```

---

### IN-04: Lacuna de cobertura — retry após falha não é testado end-to-end

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts`

**Problema:** O teste "client.release() chamado sempre — mesmo em erro de query" verifica que a exceção é propagada e o release é chamado, mas não verifica que `_loading` é corretamente limpo após a falha e que uma **chamada subsequente** pode disparar nova query com sucesso. Se o `finally(() => { this._loading = null })` fosse incorretamente omitido, o promise-lock ficaria travado permanentemente após o primeiro erro, e esse caso não seria detectado pelos testes atuais.

**Fix:** Adicionar caso de teste:
```typescript
it("apos falha, chamada seguinte reexecuta query e retorna com sucesso (retry path)", async () => {
  // Primeira chamada: falha
  client.query.mockRejectedValueOnce(new Error("timeout"));
  await expect(service.getDefaults()).rejects.toThrow("timeout");

  // Segunda chamada: deve funcionar (nova query)
  client.query.mockResolvedValueOnce({ rows: Array(5).fill(SAMPLE_ROW) });
  const result = await service.getDefaults();
  expect(result.icms).toBe("12");
  expect(client.query).toHaveBeenCalledTimes(2); // 2 queries, nao 1
});
```

---

_Revisado em: 2026-06-26_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
