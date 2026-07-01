---
phase: 37-motor-de-defaults-descoberta-por-moda
plan: "01"
subsystem: backend/integrations/athos
status: complete
tags: [defaults, moda, cache, pg-pool, nestjs, tdd]
dependency_graph:
  requires:
    - athos-produto.service.ts (padrao getPool/getDbConfig copiado)
  provides:
    - AthosDefaultsService.getDefaults() (consumido pela Fase 38)
    - ProductDefaults (interface TypeScript exportada)
  affects:
    - apps/backend/src/modules/integrations/athos/athos.module.ts
tech_stack:
  added: []
  patterns:
    - funcao pura de calculo de moda em arquivo .util.ts separado
    - cache em memoria com TTL 24h e promise-lock anti-stampede
    - query unica SQL + computacao em Node.js (1 round trip vs 15)
key_files:
  created:
    - apps/backend/src/modules/integrations/athos/athos-defaults.util.ts
    - apps/backend/src/modules/integrations/athos/athos-defaults.util.test.ts
    - apps/backend/src/modules/integrations/athos/athos-defaults.service.ts
    - apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.module.ts
decisions:
  - "Calculo de moda em Node.js via funcao pura (nao 15 queries GROUP BY) — 1 round trip, testabilidade maxima"
  - "Promise-lock (_loading) para cache lazy — previne stampede sem dependencias externas"
  - "RawValue e RawRow exportados do util para uso no service (acoplamento minimo)"
  - "Tipos exportados: ProductDefaults interface com campos fiscais opcionais e estoque obrigatorio"
metrics:
  duration: "~6 minutos"
  completed_date: "2026-06-26"
  tasks_completed: 3
  files_created: 4
  files_modified: 1
  tests_added: 33
---

# Phase 37 Plan 01: Motor de Defaults — Funcao Pura, Servico Singleton e Registro no Modulo

**One-liner:** Motor de descoberta de defaults por moda com `computeModeFromRows` pura (TTL 24h, promise-lock, fallback seguro D-07/D-08) registrado no `AthosModule`.

---

## O Que Foi Construido

Motor estatistico de defaults de produto implementado em duas camadas:

1. **`athos-defaults.util.ts`** — funcao pura sem I/O nem imports NestJS:
   - `computeModeFromRows(rows, field, minSample)`: calcula moda excluindo null/string-vazia (DEFD-02), respeita minSample=5 (D-09), desempata pelo menor valor lexicografico (D-11)
   - `computeDefaults(rows)`: itera sobre `FISCAL_FIELDS` (13 campos) e `STOCK_FIELDS` (2 campos); campos fiscais sem moda sao omitidos (D-08); campos de estoque recebem fallback `false` (D-07)
   - `ProductDefaults` interface: fiscais opcionais, estoque obrigatorio
   - Constantes nomeadas exportadas: `DEFAULTS_CACHE_TTL_MS` (24h), `DEFAULTS_MIN_SAMPLE` (5)

2. **`athos-defaults.service.ts`** — singleton NestJS com `@Injectable()`:
   - `getDefaults()`: cache hit retorna sem query; cache miss usa promise-lock `_loading` (evita stampede); popula `_cache` com `expiresAt = Date.now() + DEFAULTS_CACHE_TTL_MS`
   - `_fetchAndCompute()`: `pool.connect()` + `client.query(SQL_ACTIVE_PRODUCTS)` + `computeDefaults(rows)` em try/finally com `client.release()`
   - `SQL_ACTIVE_PRODUCTS` hardcoded: filtra `statusproduto = true AND vendeproduto = true`; sem filtro de data (D-02)
   - Log apenas com contadores `sampleSize` e `campos_fiscais` — sem valores individuais (T-37-03)
   - `getPool()`/`getDbConfig()` copiados integralmente de `AthosProdutoService` (Padrao 1)

3. **`athos.module.ts`** — `AthosDefaultsService` adicionado em `providers` e `exports`.

---

## Verificacao dos Criterios

| Requisito | Comportamento | Status |
|-----------|--------------|--------|
| DEFD-01 | Retorna moda dos campos dos produtos ativos | Coberto — `computeModeFromRows` + 5 testes |
| DEFD-02 | Ignora null e string vazia | Coberto — filtro `raw === null \|\| raw === undefined \|\| raw === ""` |
| DEFD-03 | Segunda chamada nao dispara nova query | Coberto — teste `promise-lock` e `segunda chamada usa cache` |
| DEFD-04 | Fallback seguro sem excecao (fiscal omitido / estoque false) | Coberto — 4 testes de amostra vazia/insuficiente |

**Prohibitions verificadas:**
- `SQL_ACTIVE_PRODUCTS` nao contem `datacadastro` nem filtro de data (D-02): grep vazio
- Service nao contem metodo de invalidacao nem INSERT/UPDATE/DELETE (D-04): grep vazio
- `computeModeFromRows` nao aplica limiar de dominancia (D-10): basta ter moda, qualquer percentual

---

## Desvios do Plano

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tipo `RawValue`/`RawRow` nao exportados do util**
- **Encontrado durante:** Task 2 ao importar no service
- **Problema:** O plan especificava que o service importa os tipos do util, mas os tipos eram locais (sem `export`)
- **Correcao:** Adicionou `export` em `type RawValue` e `type RawRow` no util
- **Arquivos modificados:** `athos-defaults.util.ts`
- **Commit:** `7988de8`

**2. [Rule 1 - Bug] Cast TypeScript insuficiente no retorno de `computeDefaults`**
- **Encontrado durante:** Task 1 rodando os testes (RED)
- **Problema:** `Record<string, RawValue> as ProductDefaults` rejeitado pelo compilador (missing `controlaestoque`/`baixarestoque`)
- **Correcao:** Alterado para `as unknown as ProductDefaults` (cast duplo idiomatico TypeScript)
- **Arquivos modificados:** `athos-defaults.util.ts`
- **Commit:** `5741e54`

**3. [Rule 1 - Bug] Teste de amostra insuficiente com `expect(async () => {}).not.toThrow()`**
- **Encontrado durante:** Task 2 rodando os testes (GREEN)
- **Problema:** O padrao `expect(async () => { result = await ... }).not.toThrow()` nao propaga o resultado de volta para a variavel local no escopo externo
- **Correcao:** Substituido por `const result = await service.getDefaults()` direto (sem o wrapper)
- **Arquivos modificados:** `athos-defaults.service.test.ts`
- **Commit:** `7988de8`

---

## Resultados de Testes

```
Test Suites: 25 passed, 25 total
Tests:       310 passed, 310 total  (33 novos nesta fase)
TypeScript:  0 erros (tsc --noEmit)
```

Suite especifica dos defaults:
- `athos-defaults.util.test.ts`: 25 testes verdes
- `athos-defaults.service.test.ts`: 8 testes verdes

---

## Known Stubs

Nenhum stub identificado. Todos os campos sao calculados a partir de dados reais (produtos ativos do Athos) ou recebem fallback semanticamente correto (false para estoque sem amostra, omissao para fiscal sem amostra).

---

## Threat Flags

Nenhum novo surface de segurança introduzido alem do documentado no threat_model do plano:
- `SQL_ACTIVE_PRODUCTS` 100% hardcoded (T-37-01 mitigado)
- Cache populado apenas pela propria query Athos (T-37-02 aceito)
- Log sem valores fiscais individuais (T-37-03 mitigado)

---

## Self-Check: PASSED

Arquivos criados:
- `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts`: FOUND
- `apps/backend/src/modules/integrations/athos/athos-defaults.util.test.ts`: FOUND
- `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts`: FOUND
- `apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts`: FOUND

Commits:
- `5741e54`: feat(37-01): funcao pura de calculo da moda com testes
- `7988de8`: feat(37-01): servico singleton com cache promise-lock e pg Pool
- `9b1e056`: feat(37-01): registrar AthosDefaultsService em providers e exports do AthosModule
