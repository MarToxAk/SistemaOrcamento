---
phase: 38-aplica-o-de-defaults-na-cria-o-de-produto
plan: "01"
subsystem: athos-produto
tags: [defaults, produto, fiscal, tdd, athos]
dependency_graph:
  requires:
    - 37-01 (AthosDefaultsService, FISCAL_FIELDS — consumidos via injeção de dependência)
  provides:
    - criarProduto com preenchimento automático de campos operacionais e fiscais
    - log por cadastro dos defaults aplicados (D-12/OBSV-01)
  affects:
    - apps/backend/src/modules/integrations/athos/athos-produto.service.ts
    - apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts
tech_stack:
  added: []
  patterns:
    - Injeção de AthosDefaultsService no construtor de AthosProdutoService
    - Merge de defaults com detecção == null (D-01) e override do operador (D-02)
    - Allowlist hardcoded de colunas do INSERT (anti-injection T-38-01)
    - Log estruturado por criação com campo→valor (D-12/OBSV-01)
key_files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts
decisions:
  - "OPERATIONAL_DEFAULTS definido inline em criarProduto (não como helper compartilhado) — D-11: editarProduto nunca pode alcançar a lógica de defaults"
  - "Loop do INSERT itera sobre merged (não dto original) para incluir campos com default aplicado"
  - "Cast via as any para operações dinâmicas sobre CreateProdutoDto — TypeScript strict não permite Record<string,unknown> sem index signature"
  - "Ordem de execução das tasks: Task2(DTO) → Task1(RED) → Task3(GREEN) — TypeScript strict exige campos no tipo antes de usá-los nos testes"
metrics:
  duration: "7 minutos"
  completed: 2026-06-27
  tasks_completed: 3
  files_modified: 3
status: complete
---

# Phase 38 Plan 01: Aplicação de Defaults na Criação de Produto - Summary

**Uma linha:** Motor de defaults da Fase 37 ligado ao `criarProduto` via injeção de `AthosDefaultsService`, preenchendo campos operacionais fixos (status/vende/estoque) e fiscais (moda do catálogo) apenas quando omitidos, com override total do operador e log campo→valor por cadastro.

---

## Tasks Executadas

| Task | Nome | Commit | Arquivos |
|------|------|--------|----------|
| 2 | Estender CreateProdutoDto com campos de default opcionais (D-09) | 57ec28a | dto/create-produto.dto.ts |
| 1 | Testes RED para defaults de produto (DOPR/DFIS/OVRD/OBSV) | ecb2a8f | athos-produto.service.test.ts |
| 3 | Aplicar defaults operacionais e fiscais em criarProduto (GREEN) | 1d9474e | athos-produto.service.ts |

> Nota de ordem de execução: Task 2 (DTO) foi executada antes de Task 1 (RED) porque o TypeScript strict mode requer que os campos existam no tipo antes de usá-los em chamadas de função nos testes. A sequência conceitual RED→GREEN é mantida: os testes foram escritos antes da lógica de serviço.

---

## O Que Foi Construído

### `CreateProdutoDto` — 16 novos campos opcionais (D-09)

**Booleanos (3):** `statusproduto`, `vendeproduto`, `baixarestoque`
— decorators `@ApiPropertyOptional` + `@IsOptional` + `@IsBoolean`

**Strings (11):** `icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`, `estoqueloja`
— decorators `@ApiPropertyOptional` + `@IsOptional` + `@IsString`

**Inteiros (2):** `origem`, `origemnfe`
— decorators `@ApiPropertyOptional` + `@IsOptional` + `@Type(() => Number)` + `@IsInt`

`ncm` e `controlaestoque` não duplicados (já existentes).

### `AthosProdutoService` — defaults em `criarProduto`

**Construtor:** `constructor(private readonly defaultsService: AthosDefaultsService)`

**`OPERATIONAL_DEFAULTS`** (constante local em `criarProduto`):
```
{ statusproduto: true, vendeproduto: true, controlaestoque: true,
  baixarestoque: true, estoqueloja: "10" }
```

**Lógica de merge:**
1. `fiscalDefaults = await this.defaultsService.getDefaults()` — dentro do try existente
2. `merged = { ...dto }` — cópia do DTO do operador
3. Para cada campo de `OPERATIONAL_DEFAULTS`: se `merged[field] == null` → aplica default
4. Para cada `field` de `FISCAL_FIELDS` (D-10, fonte única): se motor retornou valor E `merged[field] == null` → aplica default
5. Loop do INSERT itera sobre `merged` (não `dto`) para incluir campos com default aplicado
6. Log D-12: `criarProduto idproduto=N defaults aplicados: campo=valor, ...` ou "nenhum default necessario"

**`editarProduto` e `alterarStatusProduto` permanecem inalterados** (D-11/OVRD-02).

**Allowlist `optionalFields` ampliada** com 16 novos campos; nomes de coluna hardcoded (T-38-01, anti-injection).

### Suite de Testes — 9 novos casos

| Caso | Categoria | Resultado RED→GREEN |
|------|-----------|---------------------|
| DOPR-01: statusproduto/vendeproduto default | DOPR | FAIL → PASS |
| DOPR-02: controlaestoque/baixarestoque/estoqueloja | DOPR | FAIL → PASS |
| DFIS-aplicado: moda fiscal no INSERT | DFIS | FAIL → PASS |
| DFIS-omitido: campo fiscal ausente sem moda | DFIS | PASS (invariante) → PASS |
| D-13: robustez com motor vazio | DFIS | PASS (invariante) → PASS |
| OVRD-01/03: operador prevalece (statusproduto=false) | OVRD | FAIL → PASS |
| OVRD-02/D-11: editarProduto nunca chama getDefaults | OVRD | PASS (invariante) → PASS |
| OBSV-01a: log contém campos aplicados | OBSV | FAIL → PASS |
| OBSV-01b: log "nenhum default necessario" | OBSV | FAIL → PASS |

---

## Verificação

- Suite `athos-produto`: **41/41 testes verdes** (pre-existentes + 9 novos)
- Suite completa backend: **319/319 testes verdes** (25 suites)
- `tsc --noEmit`: sem erros de tipo

---

## Deviations from Plan

### Ajuste de Ordem de Execução (Rule 3 — evitar erro de compilação)

**Encontrado durante:** Task 1 (RED)
**Problema:** TypeScript strict mode (`"strict": true` em tsconfig.json) exige que os campos `statusproduto`, `baixarestoque` etc. existam em `CreateProdutoDto` antes de serem usados em chamadas de serviço nos testes. Task 1 (testes) referencia esses campos; Task 2 (DTO) os cria.
**Fix:** Executar Task 2 antes de Task 1 na ordem de implementação. O efeito TDD (RED→GREEN) é preservado: os testes foram escritos antes da lógica de serviço (Task 3).

### Cast `as any` em vez de `as Record<string, unknown>` (Rule 1 — fix de compilação)

**Encontrado durante:** Task 3 (GREEN)
**Problema:** TypeScript rejeita conversão de `CreateProdutoDto` para `Record<string, unknown>` sem passar por `unknown` primeiro, pois `CreateProdutoDto` não tem index signature.
**Fix:** Usar `const merged: any = { ...dto }` e `const fiscalDefaultsMap = fiscalDefaults as any` para permitir acesso dinâmico a campos por nome. Comportamento em runtime idêntico ao especificado no PATTERNS.md.
**Arquivos:** `athos-produto.service.ts`

---

## Requisitos Atendidos

| Requisito | Status |
|-----------|--------|
| DOPR-01 (statusproduto/vendeproduto=true na criação) | Satisfeito |
| DOPR-02 (controlaestoque/baixarestoque/estoqueloja padrão) | Satisfeito |
| DFIS-01 (ICMS pela moda) | Satisfeito |
| DFIS-02 (tributação/CSOSN/origem pela moda) | Satisfeito |
| DFIS-03 (PIS/COFINS/tipoitem/idcfopsaida/ncm pela moda) | Satisfeito |
| OVRD-01 (valor do DTO prevalece) | Satisfeito |
| OVRD-02 (editarProduto sem defaults) | Satisfeito |
| OVRD-03 (escrita restrita à tabela produto) | Satisfeito |
| OBSV-01 (log campo→valor por cadastro) | Satisfeito |

---

## Decisões Tomadas

1. `OPERATIONAL_DEFAULTS` definido como constante local em `criarProduto` — garante que `editarProduto` não pode acessá-la por acidente (D-11)
2. Loop do INSERT itera sobre `merged` (não `dto`) — única forma de incluir valores que foram preenchidos como default
3. `FISCAL_FIELDS` importado de `athos-defaults.util` como fonte única (D-10) — sem segunda lista que poderia divergir
4. Detecção de omissão via `== null` (double-equal) — captura `undefined` e `null` (D-01)
5. Log D-12 usa `JSON.stringify(v)` para serializar valores (strings com aspas, booleanos literais)

---

## Threat Flags

Nenhuma nova superfície de ataque introduzida:
- T-38-01 (Tampering): Allowlist hardcoded mantida; 16 novos campos adicionados estaticamente, nunca por input do usuário.
- T-38-02 (EoP): `editarProduto` sem `getDefaults` confirmado por teste OVRD-02/D-11.
- T-38-SC: Nenhuma dependência npm nova neste plano.

## Self-Check: PASSED

- `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts` — FOUND (commit 57ec28a)
- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` — FOUND (commit 1d9474e)
- `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` — FOUND (commit ecb2a8f)
- Suite 41/41 verde — CONFIRMED
- Suite completa 319/319 verde — CONFIRMED
