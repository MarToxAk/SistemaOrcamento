# Fase 38: Aplicação de Defaults na Criação de Produto — Mapa de Padrões

**Mapeado:** 2026-06-27
**Arquivos analisados:** 3 (modificações) + 1 (testes)
**Análogos encontrados:** 4 / 4

---

## Classificação de Arquivos

| Arquivo (novo/modificado) | Papel | Fluxo de dados | Análogo mais próximo | Qualidade |
|---|---|---|---|---|
| `dto/create-produto.dto.ts` | dto | request-response | próprio arquivo (extensão) | exato |
| `athos-produto.service.ts` | service | CRUD | próprio arquivo — métodos `criarProduto`/`editarProduto` | exato |
| `athos-produto.service.test.ts` | test | — | próprio arquivo (extensão de suite) | exato |

---

## Atribuições de Padrão

### `dto/create-produto.dto.ts` (dto, request-response)

**Análogo:** o próprio arquivo — extensão de campos existentes.

**Padrão de imports** (linhas 1-13):
```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
```

**Padrão de campo boolean opcional** (linhas 149-157 — copiar para `statusproduto`, `vendeproduto`, `baixarestoque`):
```typescript
@ApiPropertyOptional({ example: false, description: "Tipo de produto: false = produto fisico, true = servico" })
@IsOptional()
@IsBoolean()
tipoproduto?: boolean;
```

**Padrão de campo boolean opcional com exemplo `true`** (linhas 154-157 — copiar para `controlaestoque`, já existe; usar mesmo estilo para `baixarestoque`):
```typescript
@ApiPropertyOptional({ example: true, description: "Indica se o produto controla estoque" })
@IsOptional()
@IsBoolean()
controlaestoque?: boolean;
```

**Padrão de campo string opcional** (linhas 44-45 — copiar para os 11 campos fiscais string: `icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`; `ncm` já existe):
```typescript
@ApiPropertyOptional({ example: "48026190", description: "Codigo NCM do produto" })
@IsOptional()
@IsString()
ncm?: string;
```

**Padrão de campo number opcional com `@Type`** (linhas 57-62 — copiar para `origem` e `origemnfe`, que são `number | null` em `produto.types.ts` linha 43):
```typescript
@ApiPropertyOptional({ example: 2, description: "ID da unidade de medida no Athos" })
@IsOptional()
@Type(() => Number)
@IsInt()
idunidade?: number;
```

**Campo `estoqueloja`** — tipo `string | null` no banco (`produto.types.ts` linha 67). Deve ser declarado como `string` opcional no DTO (o service serializa `10` como `"10"` na hora de gravar):
```typescript
@ApiPropertyOptional({ example: "10", description: "Estoque inicial na loja" })
@IsOptional()
@IsString()
estoqueloja?: string;
```

**Campos a adicionar (resumo D-09):**
- Booleanos opcionais (novo padrão como `tipoproduto`): `statusproduto`, `vendeproduto`, `baixarestoque`
- Strings opcionais (novo padrão como `ncm`): `icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`, `estoqueloja`
- Inteiros opcionais com `@Type(() => Number)`: `origem`, `origemnfe`

---

### `athos-produto.service.ts` — método `criarProduto` (service, CRUD)

**Análogo:** próprio arquivo, linhas 61-158.

#### Ponto de injeção dos defaults

O merge de defaults deve ocorrer **entre** a pré-validação de FK e a montagem do INSERT dinâmico (após linha 75, antes da linha 79 onde `columns` é inicializado). Lógica a inserir:

```typescript
// 1. Buscar defaults fiscais do motor da Fase 37
const fiscalDefaults = await this.defaultsService.getDefaults();

// 2. Defaults operacionais fixos (D-03..D-07)
const OPERATIONAL_DEFAULTS: Partial<CreateProdutoDto> = {
  statusproduto: true,
  vendeproduto: true,
  controlaestoque: true,
  baixarestoque: true,
  estoqueloja: "10",
};

// 3. Merge: operador prevalece (D-01/D-02) — undefined OU null dispara o default
const merged: CreateProdutoDto = { ...dto };
const appliedDefaults: Record<string, unknown> = {};

for (const [field, defaultVal] of Object.entries(OPERATIONAL_DEFAULTS)) {
  if ((merged as any)[field] == null) {  // undefined ou null
    (merged as any)[field] = defaultVal;
    appliedDefaults[field] = defaultVal;
  }
}
for (const field of FISCAL_FIELDS) {
  const defaultVal = (fiscalDefaults as any)[field];
  if (defaultVal !== undefined && (merged as any)[field] == null) {
    (merged as any)[field] = defaultVal;
    appliedDefaults[field] = defaultVal;
  }
}
```

#### Padrão de allowlist do INSERT dinâmico (linhas 85-118 — ESTENDER)

```typescript
// Campos opcionais do DTO
const optionalFields: (keyof CreateProdutoDto)[] = [
  "descricaocurta",
  "codigobarra1",
  // ... campos existentes ...
  "ncm",
  "controlaestoque",
  // NOVOS campos a adicionar (D-09 + D-10):
  "statusproduto",
  "vendeproduto",
  "baixarestoque",
  "estoqueloja",
  "icms",
  "icmsnfe",
  "tributacao",
  "tributacaonfe",
  "codigocsosn",
  "codigocsosnnfe",
  "origem",
  "origemnfe",
  "tipoitem",
  "piscst",
  "cofinscst",
  "idcfopsaida",
];

for (const field of optionalFields) {
  if (dto[field] !== undefined) {   // <-- usar merged[field] apos o merge acima
    columns.push(field);
    valuePlaceholders.push(`$${paramIndex++}`);
    params.push(dto[field]);
  }
}
```

> **Atenção:** após o merge, o loop deve iterar sobre `merged` (não `dto` original) para incluir os campos preenchidos com default.

#### Padrão de log existente (linhas 124-127) — estender com D-12

```typescript
// Padrão atual:
this.logger.log(
  `criarProduto descricao="${dto.descricaoproduto}" idproduto=${idproduto} idusuario=${sistemaUsuarioId}`,
);

// Novo padrão com D-12 (adicionar após o log existente ou substituir):
const appliedStr = Object.keys(appliedDefaults).length > 0
  ? Object.entries(appliedDefaults).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")
  : "nenhum default necessario";
this.logger.log(
  `criarProduto idproduto=${idproduto} defaults aplicados: ${appliedStr}`,
);
```

#### Padrão de injeção de dependência no construtor

`AthosDefaultsService` deve ser injetado via construtor NestJS. Padrão de como o `AthosDefaultsService` injeta o pool (linhas 1-11 de `athos-defaults.service.ts`):

```typescript
import { AthosDefaultsService } from "./athos-defaults.service";
import { FISCAL_FIELDS } from "./athos-defaults.util";

@Injectable()
export class AthosProdutoService {
  constructor(private readonly defaultsService: AthosDefaultsService) {}
  // ...
}
```

#### `editarProduto` — garantia D-11

Não modificar `editarProduto` (linhas 160-254). O método **não** chama `getDefaults()` e não aplica nenhum merge de defaults. Verificar que nenhuma lógica de defaults compartilhada alcança esse caminho.

---

### `athos-produto.service.test.ts` (test)

**Análogo:** próprio arquivo — extensão da suite `describe("criarProduto")`.

#### Padrão de mock do Pool pg (linhas 1-16):
```typescript
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

const pgMock = require("pg");
```

#### Padrão de setup do módulo (linhas 33-39) — estender com `AthosDefaultsService` mockado:
```typescript
// Padrão existente:
const module: TestingModule = await Test.createTestingModule({
  providers: [AthosProdutoService],
}).compile();

// Novo padrão com AthosDefaultsService mockado:
const mockDefaultsService = {
  getDefaults: jest.fn().mockResolvedValue({}),
};

const module: TestingModule = await Test.createTestingModule({
  providers: [
    AthosProdutoService,
    { provide: AthosDefaultsService, useValue: mockDefaultsService },
  ],
}).compile();
```

#### Padrão de caso de teste (linhas 44-56) — modelo para novos casos:
```typescript
it("deve retornar idproduto do RETURNING quando DTO valido", async () => {
  const pool = pgMock.Pool.mock.results[0]?.value ?? new (pgMock.Pool)();
  const client = { query: jest.fn(), release: jest.fn() };
  pool.connect = jest.fn().mockResolvedValue(client);

  client.query.mockResolvedValueOnce({ rows: [{ idproduto: 42 }] });

  const result = await service.criarProduto({ descricaoproduto: "Papel A4" });

  expect(result).toEqual({ idproduto: 42 });
  expect(client.release).toHaveBeenCalled();
});
```

**Novos casos de teste a adicionar (derivados de D-01..D-13):**

1. **Default operacional aplicado quando campo omitido** — DTO sem `statusproduto`; verificar que o SQL do INSERT inclui `statusproduto` com valor `true`.
2. **Override do operador preservado** — DTO com `statusproduto: false`; verificar que o INSERT grava `false`, não `true`.
3. **Default fiscal aplicado quando motor retorna moda** — `getDefaults` retorna `{ icms: "NAO", ... }`; DTO sem `icms`; verificar que INSERT inclui `icms`.
4. **Campo fiscal omitido quando motor não retorna moda** — `getDefaults` retorna `{}` (sem `icms`); verificar que INSERT não inclui `icms`.
5. **Criação segue quando motor retorna defaults vazios** (D-13) — `getDefaults` retorna `{}`; `criarProduto` não lança exceção.
6. **`editarProduto` nunca chama `getDefaults`** — chamar `editarProduto`; verificar que `mockDefaultsService.getDefaults` não foi chamado.
7. **Log inclui defaults aplicados** — spy em `logger.log`; verificar string com campos aplicados.
8. **Log diz "nenhum default necessario" quando tudo preenchido** — DTO com todos os campos; verificar string no log.

---

## Padrões Compartilhados

### Logger por serviço
**Fonte:** `athos-produto.service.ts` linha 15
```typescript
private readonly logger = new Logger(AthosProdutoService.name);
```
**Aplicar a:** `athos-produto.service.ts` (já presente — adicionar chamadas D-12).

### Tratamento de exceções (rethrow seletivo)
**Fonte:** `athos-produto.service.ts` linhas 129-154
```typescript
} catch (err) {
  this.logger.error(`Erro ao criar produto: ${err}`);
  if (
    err instanceof BadRequestException ||
    err instanceof UnprocessableEntityException ||
    err instanceof NotFoundException
  ) {
    throw err;
  }
  if ((err as any).code === "23503") { /* ... */ }
  throw new InternalServerErrorException("Erro ao criar produto no Athos");
} finally {
  client.release();
}
```
**Aplicar a:** `criarProduto` — defaults são chamados **antes** do bloco try do pg, portanto erros do `AthosDefaultsService.getDefaults()` caem no catch existente e resultam em 500 (comportamento correto — D-13 garante que o motor nunca lança exceção de lógica).

### Detecção de omissão (D-01)
**Regra:** `valor == null` (double-equal — captura `undefined` e `null`). Não usar `=== undefined` isolado.
```typescript
if ((merged as any)[field] == null) {
  // aplicar default
}
```

### Serialização de `estoqueloja`
**Fonte:** `produto.types.ts` linha 67 — `estoqueloja: string | null`
O default fixo `10` deve ser serializado como string: `estoqueloja: "10"` nos `OPERATIONAL_DEFAULTS` e declarado como `string?` no DTO.

---

## Sem Análogo no Codebase

Nenhum arquivo desta fase está sem análogo — todos os padrões necessários existem no próprio módulo `athos`.

---

## Metadados

**Escopo de busca:** `apps/backend/src/modules/integrations/athos/`
**Arquivos lidos:** `athos-produto.service.ts`, `athos-defaults.service.ts`, `athos-defaults.util.ts`, `dto/create-produto.dto.ts`, `produto.types.ts`, `athos-produto.service.test.ts`
**Data de extração:** 2026-06-27
