---
phase: 33-api-de-escrita-de-produto
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - .env.example
  - apps/backend/src/modules/app.module.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.controller.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts
  - apps/backend/src/modules/integrations/athos/athos-produto.service.ts
  - apps/backend/src/modules/integrations/athos/athos.module.ts
  - apps/backend/src/modules/integrations/athos/dto/alterar-status-produto.dto.ts
  - apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts
  - apps/backend/src/modules/integrations/athos/dto/update-produto.dto.ts
  - deploy/stack.env.example
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-06-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Esta fase implementa a API de escrita de produto no banco Athos: criação (`POST /athos/produtos`), edição parcial (`PATCH /athos/produtos/:id`) e alteração de status (`PATCH /athos/produtos/:id/status`). O código é funcional e segue boas práticas em geral (parametrized queries, whitelist DTO, `finally { client.release() }`), mas foram encontrados três bloqueadores críticos: uma credencial de token NFS-e em texto plano no arquivo de exemplo de deploy, um bypass de autorização que permite ao caller forçar o campo `statusproduto`/`vendeproduto` direto pelo DTO de criação/edição, e uma SQL dinâmica construída com interpolação direta de chaves não sanitizadas de `Object.entries(dto)`.

---

## Critical Issues

### CR-01: Token NFS-e real em texto plano no arquivo de exemplo de deploy

**File:** `deploy/stack.env.example:75`
**Issue:** O arquivo de exemplo de stack de produção contém o token `NFSE_TOKEN=FT8HZYW6T6HQDCFRP+/2LLUOIPWAHYDUF5TCYUNRELW=`. Arquivos `.example` são versionados no git e acessíveis a qualquer pessoa com acesso ao repositório. Se esse token for válido em produção representa exposição de credencial de serviço externo (NFS-e / iiBrasil Prefeitura de Ilhabela).

**Fix:**
```diff
-NFSE_TOKEN=FT8HZYW6T6HQDCFRP+/2LLUOIPWAHYDUF5TCYUNRELW=
+NFSE_TOKEN=SEU_TOKEN_NFSE
```
Revogar/rotacionar o token no painel da iiBrasil caso ele já tenha sido commitado em histórico público ou semi-público.

---

### CR-02: SQL dinâmica construída com chave de objeto não sanitizada (injeção via prototype pollution ou campo inesperado)

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:196-199`
**Issue:** O método `editarProduto` itera com `Object.entries(dto)` e usa a chave diretamente dentro de aspas duplas na string SQL:
```ts
setClauses.push(`"${key}" = $${paramIndex++}`);
```
O `ValidationPipe` com `whitelist: true` e `forbidNonWhitelisted: true` elimina campos não declarados no DTO em condições normais — mas essa proteção falha se: (a) o NestJS for contornado em testes de integração ou ao chamar o service diretamente; (b) uma futura alteração remover ou relaxar o pipe; (c) `UpdateProdutoDto` estender `CreateProdutoDto` via `PartialType` e receber um campo cujo nome contenha caracteres especiais (improvável mas possível se o DTO mudar). Mesmo que o risco de injeção SQL clássico seja baixo com o whitelist atual, a construção é estruturalmente insegura: identifiers devem ser validados com `isSafeIdentifier()` (já presente em `athos.service.ts`) antes de interpolação.

**Fix:**
```ts
// Importar ou duplicar a função isSafeIdentifier do athos.service.ts
const ALLOWED_UPDATE_FIELDS = new Set<string>([
  "descricaoproduto", "descricaocurta", "codigobarra1", "codigobarra2",
  "referencia", "ncm", "informacaoadicional", "observacao",
  "idunidade", "iddepartamento", "idgrupo", "idmarca", "idfornecedor",
  "valorvenda1", "valorvenda2", "valorvenda3", "valorvenda4", "valorvenda5",
  "valorvenda6", "valorvendapromocao", "valorvendaatacado1", "valorcustounitario",
  "descontomaximo", "tipoproduto", "controlaestoque", "vendeproduto", "statusproduto",
]);

for (const [key, value] of Object.entries(dto)) {
  if (value !== undefined) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) {
      throw new BadRequestException(`Campo nao permitido: ${key}`);
    }
    setClauses.push(`"${key}" = $${paramIndex++}`);
    params.push(value);
  }
}
```

---

### CR-03: `CreateProdutoDto` expõe `statusproduto` e `vendeproduto` — caller pode criar produto já desativado, contornando o fluxo de negócio de inativação

**File:** `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts:160-167`
**Issue:** Os campos `statusproduto` e `vendeproduto` estão presentes em `CreateProdutoDto` como opcionais e são inseridos diretamente no INSERT via o loop `optionalFields`. Um caller pode enviar `{ descricaoproduto: "X", statusproduto: false, vendeproduto: false }` criando um produto já inativo no Athos. O endpoint `PATCH :id/status` foi criado justamente para separar o controle de status, mas essa separação é fictícia porque o POST permite forçar os mesmos campos na criação. Além disso, `UpdateProdutoDto extends PartialType(CreateProdutoDto)` herda esses campos, significando que `editarProduto` também aceita `{ statusproduto: false }` no corpo, duplicando (e sobrepondo) a responsabilidade do endpoint de status. Isso cria dois caminhos para inativação sem auditoria uniforme (o endpoint de status loga "deactivate"; o PATCH direto não).

**Fix:**
Remover `statusproduto` e `vendeproduto` de `CreateProdutoDto` e garantir que `UpdateProdutoDto` não os herde. Esses campos devem ser alterados **somente** via `PATCH :id/status`:
```ts
// Em create-produto.dto.ts — remover os dois campos abaixo:
// tipoproduto pode ficar (é tipo de produto, não status de ativação)
// REMOVER:
// statusproduto?: boolean;
// vendeproduto?: boolean;
```
Se houver necessidade de criar produto já com `vendeproduto: false` (p.ex. produto de prateleira sem venda online), criar um campo específico com semântica explícita e registrar no log o valor inicial.

---

## Warnings

### WR-01: `sistemaUsuarioId` calculado com `Number()` sem validação — NaN silencioso se env estiver vazia

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:62, 163, 254`
**Issue:** Em todos os três métodos públicos do serviço, `sistemaUsuarioId` é obtido com:
```ts
const sistemaUsuarioId = Number(process.env.ATHOS_SISTEMA_USUARIO_ID);
```
Se a variável de ambiente estiver vazia ou com valor não-numérico, `Number("")` retorna `0` e `Number("abc")` retorna `NaN`. Ambos são valores inválidos que serão enviados como parâmetro SQL sem disparo de erro imediato. O `app.module.ts` valida que `ATHOS_SISTEMA_USUARIO_ID` não está vazio na inicialização, mas essa validação não garante que o valor é um inteiro positivo. O problema se manifesta como uma FK inválida que chega até o banco (FK 23503) ou como inserção com `idusuariocadastro = 0` se o banco aceitar `0` como valor.

**Fix:**
```ts
private getSistemaUsuarioId(): number {
  const raw = process.env.ATHOS_SISTEMA_USUARIO_ID;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new InternalServerErrorException(
      "ATHOS_SISTEMA_USUARIO_ID deve ser um inteiro positivo",
    );
  }
  return id;
}
```
Substituir as três ocorrências de `Number(process.env.ATHOS_SISTEMA_USUARIO_ID)` pela chamada a este método.

---

### WR-02: `criarProduto` não verifica `result.rows[0]` antes de acessar `.idproduto`

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:124`
**Issue:** Após o `client.query` do INSERT com `RETURNING idproduto`, o código acessa `result.rows[0].idproduto` diretamente sem checar se `result.rows[0]` existe. Se o banco retornar 0 linhas (situação anômala mas possível em triggers que fazem BEFORE INSERT RETURN NULL, ou em versões antigas do pg driver), isso lança `TypeError: Cannot read properties of undefined` em vez de um erro tratado.

**Fix:**
```ts
const row = result.rows[0];
if (!row) {
  throw new InternalServerErrorException("INSERT nao retornou idproduto");
}
const idproduto = row.idproduto;
```

---

### WR-03: Inconsistência: `editarProduto` com DTO vazio executa UPDATE desnecessário com apenas `idusuarioalteracao`

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts:203-214`
**Issue:** Quando o DTO passado para `editarProduto` está vazio (`{}`), o serviço loga "nenhum campo alterado" mas ainda emite o UPDATE com `SET idusuarioalteracao = $1 WHERE idproduto = $2`. Isso é um write desnecessário no banco Athos (que é externo e operacional), que polui o `dataultimaalteracao` implícito nos triggers do Athos sem alteração real de dados. O comentário no código reconhece isso ("Apenas idusuarioalteracao — nada a atualizar além da alteração registrada"), mas a escolha de escrever mesmo assim é discutível: um caller malicioso pode enfileirar milhares de PATCHes com body `{}` para causar contenção de lock na tabela sem ser filtrado.

**Fix:**
Retornar cedo (`return { idproduto }`) quando `setClauses.length === 1` (apenas `idusuarioalteracao`), evitando o UPDATE desnecessário:
```ts
if (setClauses.length === 1) {
  this.logger.log(`editarProduto idproduto=${idproduto} campos=[] — nenhum campo alterado, UPDATE omitido`);
  return { idproduto };
}
```

---

### WR-04: `ATHOS_API_TOKEN` presente no `.env.example` mas sem uso no código revisado — variável fantasma

**File:** `.env.example:32`
**Issue:** A variável `ATHOS_API_TOKEN` é documentada no `.env.example` com o comentário "Token para autenticação em endpoints Athos (deixe vazio para desativar)", mas não está referenciada em nenhum dos arquivos revisados, não está na lista `REQUIRED_ENV_VARS` do `app.module.ts`, e o módulo Athos usa `InternalAuthGuard` (chave interna `INTERNAL_API_KEY`) para proteção. A variável parece ser um artefato legado ou de uma implementação futura planejada. Se existir um endpoint Athos público autenticado por esse token, a lógica de verificação não está presente — se não existir, a variável causa confusão operacional.

**Fix:**
Remover `ATHOS_API_TOKEN` do `.env.example` e do `deploy/stack.env.example` (onde está ausente, consistentemente) se não há implementação correspondente. Se a feature está planejada, adicionar um comentário `# TODO (fase X): autenticação de webhook Athos` para tornar o estado explícito.

---

### WR-05: `AlterarStatusProdutoDto` usa `@IsNotEmpty()` em campo booleano — decorador semanticamente incorreto

**File:** `apps/backend/src/modules/integrations/athos/dto/alterar-status-produto.dto.ts:6-7`
**Issue:** `@IsNotEmpty()` do `class-validator` verifica se o valor não é string vazia, `null`, ou `undefined`. Para um campo booleano já marcado com `@IsBoolean()`, o `@IsNotEmpty()` adiciona: (1) redundância — `@IsBoolean()` já rejeita `null`/`undefined` quando o campo é `required: true` no contexto do NestJS com `whitelist: true`; (2) risco semântico — `@IsNotEmpty()` em booleano `false` é problemático em algumas versões do `class-validator` porque `false` é falsy. Na prática, com `ValidationPipe({ transform: true })`, o valor `false` pode ser interpretado como "vazio" dependendo da versão, causando falha na validação ao tentar desativar (`ativo: false`).

**Fix:**
```ts
// Remover @IsNotEmpty() — @IsBoolean() é suficiente para validação do tipo e presença
@ApiProperty({ example: true, description: "true reativa o produto, false desativa" })
@IsBoolean()
ativo!: boolean;
```

---

## Info

### IN-01: `stack.env.example` tem `BACKEND_URL` duplicado com valores conflitantes

**File:** `deploy/stack.env.example:63, 78`
**Issue:** A variável `BACKEND_URL` aparece duas vezes: linha 63 com `https://seu-dominio.com/api` e linha 78 com `http://ts-webserver2:4000/api`. A segunda sobrescreve a primeira quando o arquivo é carregado por qualquer ferramenta shell padrão. Provavelmente a linha 63 é para o serviço de backend e a linha 78 é para o frontend (proxy), mas estão na mesma seção sem comentário que explique a duplicação.

**Fix:**
```ini
# Backend (URL pública — usada pelo próprio backend para self-reference se necessário)
BACKEND_URL=https://seu-dominio.com/api

# Frontend (URL interna da rede Docker/Tailscale para proxy API)
NEXT_PUBLIC_BACKEND_URL=http://ts-webserver2:4000/api
```

---

### IN-02: Teste do controller não valida erro propagado quando `criarProduto` do service lança exceção

**File:** `apps/backend/src/modules/integrations/athos/athos-produto.controller.test.ts:158-168`
**Issue:** O teste de `criarProduto` no controller apenas verifica o caminho feliz (delegação e retorno). Não existe teste para o caso em que `athosProdutoService.criarProduto` rejeita com `UnprocessableEntityException` (FK inválida) ou `InternalServerErrorException`. O comportamento do controller é apenas repassar a exceção (sem try/catch), então o NestJS cuida do mapeamento HTTP — mas isso não é testado. Mesmo que seja implícito, a ausência de teste de erro no controller deixa lacuna de cobertura para os cenários 422 e 500 que são os mais críticos do ponto de vista de negócio.

**Fix:**
Adicionar casos de erro ao bloco `describe("criarProduto")`:
```ts
it("repassa UnprocessableEntityException do service ao caller", async () => {
  athosProdutoServiceMock.criarProduto.mockRejectedValue(
    new UnprocessableEntityException("FK invalida"),
  );
  await expect(controller.criarProduto({ descricaoproduto: "X" } as any))
    .rejects.toThrow(UnprocessableEntityException);
});
```

---

### IN-03: `validateEnv` em `app.module.ts` valida presença mas não o tipo de `ATHOS_SISTEMA_USUARIO_ID`

**File:** `apps/backend/src/modules/app.module.ts:33-43`
**Issue:** A função `validateEnv` verifica que `ATHOS_SISTEMA_USUARIO_ID` é uma string não-vazia, mas não valida que é um inteiro positivo. Um valor como `"abc"` ou `"0"` passaria na validação e causaria comportamento incorreto em runtime (conforme WR-01). Esta é uma extensão da WR-01 no ponto de entrada da aplicação.

**Fix:**
```ts
const athosUsuarioId = config["ATHOS_SISTEMA_USUARIO_ID"];
if (
  typeof athosUsuarioId !== "string" ||
  !Number.isInteger(Number(athosUsuarioId)) ||
  Number(athosUsuarioId) <= 0
) {
  throw new Error("ATHOS_SISTEMA_USUARIO_ID deve ser um inteiro positivo");
}
```

---

_Reviewed: 2026-06-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
