---
phase: 38-aplica-o-de-defaults-na-cria-o-de-produto
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.service.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Fase 38: Relatório de Revisão de Código

**Revisado:** 2026-06-27
**Profundidade:** standard
**Arquivos revisados:** 3
**Status:** issues_found

## Resumo

Revisão da aplicação de defaults na criação de produto (Fase 38), que integra o motor de moda da Fase 37 ao `criarProduto`. Os três arquivos principais foram lidos, além dos dependentes diretos (`athos-defaults.service.ts`, `athos-defaults.util.ts`, `update-produto.dto.ts`) para cross-referência.

**Pontos positivos verificados:**

- A lógica de detecção de omissão usa `== null` (duplo-igual), que captura corretamente `undefined` e `null` mas preserva todos os valores falsy-but-valid do operador: `false`, `0`, `""` — sem bug de override. O caso `statusproduto: false` é testado explicitamente (OVRD-01/03).
- O loop do INSERT itera sobre `merged` (não `dto`), garantindo que campos preenchidos por default entrem no SQL.
- `editarProduto` não chama `getDefaults()` em nenhum caminho — confirmado por inspeção e coberto pelo teste OVRD-02/D-11.
- O allowlist `optionalFields` cobre todos os 12 `FISCAL_FIELDS` + 5 campos operacionais. Não há campo default que fique de fora do INSERT.
- A serialização de `estoqueloja` como `"10"` (string) é correta — `produto.types.ts` (linha 67) define a coluna como `string | null`.
- Ausência de interpolação de input do operador em nomes de coluna — a SQL injection por identificador está mitigada.

**Problemas encontrados:** dois warnings e três informacionais. Nenhum bloqueador de dados ou falha de segurança.

---

## Warnings

### WR-01: `ATHOS_SISTEMA_USUARIO_ID` não validado antecipadamente — `NaN` propagado ao SQL

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:66` (idem linhas 230 e 329)

**Problema:** Os três métodos públicos do serviço convertem a variável de ambiente com `Number(process.env.ATHOS_SISTEMA_USUARIO_ID)` sem nenhuma guarda. Se a variável estiver ausente, `Number(undefined)` produz `NaN`. O `NaN` é então serializado pela biblioteca `pg` como a string `"NaN"` e enviado como parâmetro `$2` para colunas do tipo integer no Athos. O PostgreSQL rejeita com "invalid input syntax for type integer: 'NaN'", o que cai no `catch` genérico e retorna `InternalServerErrorException("Erro ao criar produto no Athos")` — mensagem que não indica a causa raiz. O `getDbConfig()` já valida `HOST`, `DB`, `USER` e `PASS` explicitamente; `ATHOS_SISTEMA_USUARIO_ID` recebe tratamento inconsistente.

O teste define `process.env.ATHOS_SISTEMA_USUARIO_ID = "1"` no `beforeAll`, então os testes passam, mas o cenário de variável ausente fica descoberto.

**Correção:**

```typescript
// Em getDbConfig() ou em um método dedicado, adicionar:
private getSistemaUsuarioId(): number {
  const raw = process.env.ATHOS_SISTEMA_USUARIO_ID;
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new InternalServerErrorException(
      "ATHOS_SISTEMA_USUARIO_ID ausente ou invalido. Defina um inteiro positivo.",
    );
  }
  return id;
}
```

Substituir as três chamadas `Number(process.env.ATHOS_SISTEMA_USUARIO_ID)` por `this.getSistemaUsuarioId()`.

---

### WR-02: `editarProduto` descarta silenciosamente campos da Fase 38 presentes em `UpdateProdutoDto`

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:264-270`

**Problema:** `UpdateProdutoDto = PartialType(CreateProdutoDto)` herda todos os campos adicionados pela Fase 38: `statusproduto`, `vendeproduto`, `baixarestoque`, `estoqueloja` (operacionais) e todos os 12 campos fiscais (`icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`). O `ALLOWED_UPDATE_FIELDS` em `editarProduto` não inclui nenhum deles. Resultado: um operador que envia `{ "icms": "NORMAL" }` ou `{ "baixarestoque": false }` via endpoint de edição recebe `200 OK` mas a alteração é silenciosamente descartada. O contrato de API (Swagger) mostra esses campos como editáveis quando não são.

Note que o descarte intencional de `statusproduto`/`vendeproduto` é justificado pelo `alterarStatusProduto`. Mas para `baixarestoque`, `estoqueloja` e todos os campos fiscais não existe endpoint alternativo, deixando esses valores sem via de atualização.

**Correção (opção A — separar o DTO):**

```typescript
// Criar UpdateProdutoDto manual com apenas os campos realmente suportados
export class UpdateProdutoDto {
  @IsOptional() @IsString() @IsNotEmpty() descricaoproduto?: string;
  @IsOptional() @IsString() @MaxLength(40) descricaocurta?: string;
  // ... apenas os campos presentes em ALLOWED_UPDATE_FIELDS ...
}
```

**Correção (opção B — expandir o allowlist):**

Adicionar os campos fiscais e operacionais ao `ALLOWED_UPDATE_FIELDS` para que a edição realmente os suporte, e adicionar testes de cobertura correspondentes.

---

## Info

### IN-01: Nomes de coluna sem aspas no INSERT vs. com aspas no UPDATE — inconsistência de hardening

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:180` (INSERT) vs. linha 273 (UPDATE)

**Problema:** O INSERT dinâmico em `criarProduto` empilha nomes de coluna sem aspas duplas:

```typescript
// criarProduto linha 180
const sql = `INSERT INTO produto (${columns.join(", ")}) VALUES (...)`
// produz: INSERT INTO produto (descricaoproduto, statusproduto, ...) VALUES (...)
```

O UPDATE em `editarProduto` cita os nomes com aspas duplas:

```typescript
// editarProduto linha 273
setClauses.push(`"${key}" = $${paramIndex++}`);
```

Para os nomes de coluna atuais (todos vocábulos em português) não há risco — nenhum é palavra reservada do PostgreSQL. Mas se um futuro campo coincidisse com uma reservada (ex.: `"value"`, `"time"`), o INSERT falharia em runtime enquanto o UPDATE funcionaria. A inconsistência aumenta a fragilidade silenciosa da lista de campos.

**Correção:** citar os nomes no INSERT da mesma forma que no UPDATE:

```typescript
columns.push(`"${field}"`);
// e nos campos fixos:
const columns: string[] = ['"descricaoproduto"', '"datacadastro"', '"idusuariocadastro"', '"idusuarioalteracao"'];
```

---

### IN-02: Helper de teste `getInsertColValue` usa asserção `!` sem guarda

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts:59`

**Problema:**

```typescript
const colsContent = parts[0].match(/\(([^)]+)\)/)![1];
```

O `!` não-nulo lança `TypeError: Cannot read properties of null` se o regex não encontrar match. Isso ocorreria caso o formato do SQL de INSERT mudasse (ex.: espaços extras, quebra de linha). O teste falharia com um `TypeError` em vez de uma assertion descritiva, dificultando o diagnóstico.

**Correção:**

```typescript
const matchResult = parts[0].match(/\(([^)]+)\)/);
if (!matchResult) throw new Error(`getInsertColValue: nao encontrou lista de colunas no SQL: ${insertSql}`);
const colsContent = matchResult[1];
```

---

### IN-03: Testes de override cobrem apenas `statusproduto: false` — demais valores falsy omitidos

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts:332`

**Problema:** O teste OVRD-01/03 verifica que `statusproduto: false` no DTO prevalece sobre o default `true`. O mecanismo (`== null`) é uniforme para todos os campos, portanto a lógica está correta também para `controlaestoque: false`, `baixarestoque: false`, `estoqueloja: "0"` e `origem: 0`. Contudo, a ausência de testes para esses casos deixa a garantia implícita — uma refatoração acidental que trocasse `== null` por `=== undefined` passaria nos testes existentes mas quebraria o comportamento de `false`.

**Correção:** Adicionar ao menos dois casos adicionais:

```typescript
it("OVRD-falsy: controlaestoque=false no DTO -> INSERT grava false, nao o default true", async () => {
  // setup pool/client mock...
  await service.criarProduto({ descricaoproduto: "X", controlaestoque: false });
  // assert getInsertColValue(..., "controlaestoque") === false
});

it("OVRD-falsy: estoqueloja='0' no DTO -> INSERT grava '0', nao o default '10'", async () => {
  // setup...
  await service.criarProduto({ descricaoproduto: "X", estoqueloja: "0" });
  // assert getInsertColValue(..., "estoqueloja") === "0"
});
```

---

_Revisado: 2026-06-27_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
