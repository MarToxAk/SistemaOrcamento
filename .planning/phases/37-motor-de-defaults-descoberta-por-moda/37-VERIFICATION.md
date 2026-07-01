---
phase: 37-motor-de-defaults-descoberta-por-moda
verified: 2026-06-27T00:00:00Z
status: passed
score: 6/6 must-haves verificados
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Fase 37: Motor de Defaults (Descoberta por Moda) — Relatório de Verificação

**Goal da Fase:** Um serviço dedicado calcula a moda de cada campo configurável do produto a partir dos produtos ativos do Athos, armazena o resultado em cache e fornece fallback seguro quando não há amostra suficiente.
**Verificado em:** 2026-06-27
**Status:** passed
**Re-verificação:** Não — verificação inicial

---

## Verificação do Goal

### Verdades Observáveis

| #  | Verdade | Status | Evidência |
|----|---------|--------|-----------|
| 1  | `getDefaults()` retorna a moda de cada campo fiscal e de estoque dos produtos ativos (DEFD-01) | ✓ VERIFICADO | `computeModeFromRows` conta frequências num Map, retorna o valor mais frequente; `computeDefaults` itera `FISCAL_FIELDS` (13) e `STOCK_FIELDS` (2); teste "dispara query e retorna defaults com moda correta" passa com 5 linhas idênticas |
| 2  | Valores null e string vazia são ignorados na contagem da moda (DEFD-02) | ✓ VERIFICADO | `athos-defaults.util.ts` linha 80: `if (raw === null \|\| raw === undefined \|\| raw === "") continue;`; testes "ignora null e string vazia" e "ignora undefined" passam |
| 3  | A segunda chamada a `getDefaults()` reutiliza o cache e não dispara nova query (DEFD-03) | ✓ VERIFICADO | Cache hit em `_cache.expiresAt > Date.now()` (linhas 83-85); teste "segunda chamada usa cache" confirma `first === second` e `client.query` chamado exatamente 1 vez; teste de promise-lock com `Promise.all([×3])` confirma 1 query para 3 chamadas paralelas |
| 4  | Campo fiscal sem amostra suficiente (< 5) é omitido do mapa retornado, sem lançar exceção (DEFD-04) | ✓ VERIFICADO | `computeDefaults`: campo fiscal com `computeModeFromRows → null` não é adicionado ao resultado; testes "campos fiscais sem amostra são omitidos" e "amostra vazia — fiscais omitidos" passam; `expect(result).not.toHaveProperty("icms")` com 3 ou 0 linhas |
| 5  | Campo de estoque sem amostra suficiente recebe fallback `false`, sem lançar exceção (DEFD-04) | ✓ VERIFICADO | `computeDefaults` linha 133: `result[field] = mode !== null ? Boolean(mode) : false;`; testes "campos de estoque sem amostra recebem fallback false" e "amostra insuficiente (< 5) não lança exceção" passam |
| 6  | Empate de frequência é resolvido pelo menor valor lexicográfico de forma determinística (D-11) | ✓ VERIFICADO | `sorted.sort()`: desempata com `String(a.value) < String(b.value) ? -1 : 1`; testes "em empate de frequência retorna o menor valor lexicográfico" ('12' vence '7') e "em empate estrito — S vs T" ('S' vence 'T') passam |

**Placar:** 6/6 verdades verificadas (0 presentes sem cobertura comportamental)

---

### Artefatos Obrigatórios

| Artefato | Existe | Substancial | Conectado | Status |
|----------|--------|-------------|-----------|--------|
| `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts` | Sim | Sim — exports: `computeModeFromRows`, `computeDefaults`, `ProductDefaults`, `FISCAL_FIELDS`, `STOCK_FIELDS`, `DEFAULTS_CACHE_TTL_MS`, `DEFAULTS_MIN_SAMPLE` | Importado por `athos-defaults.service.ts` | ✓ VERIFICADO |
| `apps/backend/src/modules/integrations/athos/athos-defaults.util.test.ts` | Sim | Sim — 25 testes cobrindo DEFD-01, DEFD-02, D-07, D-08, D-09, D-11, D-06 | Executado por Jest | ✓ VERIFICADO |
| `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts` | Sim | Sim — `getDefaults()`, `_fetchAndCompute()`, `getPool()`, `getDbConfig()`, `SQL_ACTIVE_PRODUCTS`, cache com TTL | Importado por `athos.module.ts` | ✓ VERIFICADO |
| `apps/backend/src/modules/integrations/athos/athos-defaults.service.test.ts` | Sim | Sim — 8 testes cobrindo DEFD-01, DEFD-03, DEFD-04, D-01, D-04 | Executado por Jest | ✓ VERIFICADO |

---

### Verificação de Links Chave (Wiring)

| De | Para | Via | Status | Detalhe |
|----|------|-----|--------|---------|
| `athos-defaults.service.ts` | `athos-defaults.util.ts` | `import { computeDefaults, DEFAULTS_CACHE_TTL_MS, FISCAL_FIELDS }` e `import type { ProductDefaults, RawRow }` | ✓ WIRED | Linhas 8-12 do service; todos os símbolos declarados no key_link estão importados e usados |
| `athos.module.ts` | `AthosDefaultsService` | `providers: [..., AthosDefaultsService]` e `exports: [..., AthosDefaultsService]` | ✓ WIRED | Linha 15 e 17 de `athos.module.ts`; serviço disponível para injeção pela Fase 38 |
| `AthosDefaultsService` | `ATHOS_PG_*` env vars | `getPool()` / `getDbConfig()` copiados de `AthosProdutoService` | ✓ WIRED | `getDbConfig()` lê `ATHOS_PG_HOST`, `ATHOS_PG_DB`, `ATHOS_PG_USER`, `ATHOS_PG_PASS`, `ATHOS_PG_PORT`; Pool com `max:5/idleTimeoutMillis:30000/connectionTimeoutMillis:5000` |

---

### Verificação das Proibições

| Proibição | Verificação | Status |
|-----------|-------------|--------|
| D-02: `SQL_ACTIVE_PRODUCTS` sem filtro de data (`datacadastro`, etc.) | Grep em `athos-defaults.service.ts` para `datacadastro\|datamodificacao\|created_at\|WHERE.*data` retornou **zero ocorrências**. SQL filtra apenas `statusproduto = true AND vendeproduto = true`. Teste "SQL_ACTIVE_PRODUCTS filtra..." confirma `expect(sql).not.toMatch(/DATACADASTRO/)`. | ✓ PROIBIÇÃO RESPEITADA |
| D-04: Cache sem invalidação por escrita; sem `INSERT`/`UPDATE`/`DELETE` | Grep para `invalidat\|clearCache\|reset\|flush\|INSERT\|UPDATE\|DELETE` retornou **zero ocorrências** no service. Único método público é `getDefaults()`. Teste "SQL não contém INSERT, UPDATE ou DELETE" passa. | ✓ PROIBIÇÃO RESPEITADA |
| D-10: Moda sem limiar de dominância — `computeModeFromRows` não descarta moda por baixo percentual | Grep para `dominan\|percentual\|threshold\|minPercent` em `athos-defaults.util.ts` retornou **zero ocorrências**. Teste com '12' aparecendo 2 de 5 vezes (40% de dominância) aceita a moda sem rejeição. | ✓ PROIBIÇÃO RESPEITADA |

---

### Cobertura de Requisitos

| Requisito | Declarado no PLAN | Descrição em REQUIREMENTS.md | Implementação | Status |
|-----------|-------------------|------------------------------|---------------|--------|
| DEFD-01 | Sim | O sistema calcula a moda de cada campo configurável a partir dos produtos ativos | `computeModeFromRows` + `computeDefaults` + `getDefaults()` + `SQL_ACTIVE_PRODUCTS` | ✓ SATISFEITO |
| DEFD-02 | Sim | O cálculo da moda ignora valores nulos/vazios | Filtro `raw === null \|\| raw === undefined \|\| raw === ""` em `computeModeFromRows` linha 80 | ✓ SATISFEITO |
| DEFD-03 | Sim | O resultado da moda é reaproveitado (cache) entre criações | Cache `_cache` com `expiresAt = Date.now() + DEFAULTS_CACHE_TTL_MS`; promise-lock `_loading` | ✓ SATISFEITO |
| DEFD-04 | Sim | Quando não há amostra suficiente, fallback seguro sem quebrar o cadastro | Fiscal omitido quando `computeModeFromRows → null`; estoque recebe `false`; `nunca lança exceção` validado em testes | ✓ SATISFEITO |

Nenhum requisito órfão: todos os IDs declarados no PLAN estão rastreados em REQUIREMENTS.md e têm implementação verificável.

---

### Anti-Padrões Verificados

| Arquivo | Padrão | Resultado |
|---------|--------|-----------|
| `athos-defaults.util.ts` | TBD/FIXME/XXX não referenciados | Nenhum encontrado |
| `athos-defaults.service.ts` | TBD/FIXME/XXX não referenciados | Nenhum encontrado (o comentário `D-02: sem filtro de data` é documentação, não marcador de dívida) |
| `athos-defaults.util.ts` | Stubs (`return null`, `return {}`, função vazia) | Nenhum — implementação completa |
| `athos-defaults.service.ts` | Stubs ou retornos vazios hardcoded | Nenhum — dados vêm do banco via `computeDefaults` |

---

### Spot-Checks Comportamentais

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| 33 testes do motor de defaults passam | `cd apps/backend && npx jest athos-defaults --no-coverage` | `Test Suites: 2 passed, 2 total / Tests: 33 passed, 33 total` | ✓ PASS |
| Commits da fase existem no histórico git | `git log --oneline \| grep 5741e54\|7988de8\|9b1e056` | `9b1e056`, `7988de8`, `5741e54` encontrados | ✓ PASS |

---

### Verificação Humana Necessária

Nenhum item identificado. Todos os comportamentos são cobertos pelos 33 testes automatizados. Não há UI, endpoint HTTP exposto, serviço externo real, ou comportamento dependente de latência de rede nesta fase (read-only, sem rota HTTP).

---

## Resumo dos Gaps

Nenhum gap encontrado. Todos os 6 must-haves verificados. Todas as proibições respeitadas. Todos os 4 requisitos satisfeitos.

---

_Verificado em: 2026-06-27_
_Verificador: Claude (gsd-verifier)_
