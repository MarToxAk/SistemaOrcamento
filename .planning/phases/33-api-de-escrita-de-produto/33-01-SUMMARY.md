---
plan: 33-01
phase: 33
subsystem: athos-write
tags: [nestjs, postgresql, dto, service, testes, athos]
dependency_graph:
  requires: []
  provides: [AthosProdutoService, CreateProdutoDto, UpdateProdutoDto]
  affects: [AthosModule, AppModule]
tech_stack:
  added: []
  patterns: [pool-lazy-init, insert-serial-returning, pre-validacao-fk, partial-update-dinamico, catch-23503-por-constraint]
key_files:
  created:
    - apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts
    - apps/backend/src/modules/integrations/athos/dto/update-produto.dto.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.service.ts
    - apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts
  modified:
    - apps/backend/src/modules/app.module.ts
    - apps/backend/src/modules/integrations/athos/athos.module.ts
decisions:
  - Pool proprio no AthosProdutoService (nao injecao do AthosService) - padrao existente AthosListenerService
  - INSERT sem idproduto (serial DEFAULT) + RETURNING idproduto - sem LOCK TABLE necessario
  - Catch 23503 distingue FK usuario sistema (500) de FK input operador (422) via error.constraint
  - mockRejectedValue (nao Once) para testes de erro que verificam tanto tipo quanto mensagem
metrics:
  duration_minutes: 15
  completed: 2026-06-15T20:32:44Z
  tasks_completed: 3
  files_created: 4
  files_modified: 2
---

# Phase 33 Plan 01: Infraestrutura Base e Endpoint POST (Criar Produto) Summary

## One-liner

AthosProdutoService com pool proprio, DTOs curados de produto (27 campos), INSERT serial+RETURNING, pre-validacao FK e tratamento diferenciado de violacoes FK por constraint name.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 33-01-01 | Criar DTOs e fail-fast da env var | 1e19b05 | create-produto.dto.ts, update-produto.dto.ts, app.module.ts |
| 33-01-02 | Criar AthosProdutoService e registrar no modulo | b55b3ea | athos-produto.service.ts, athos.module.ts |
| 33-01-03 | Testes unitarios de criarProduto | 8c7b69b | athos-produto.service.test.ts |

## What Was Built

### DTOs (Task 33-01-01)

- `CreateProdutoDto` com 27 campos curados para papelaria/grafica:
  - Campo obrigatorio: `descricaoproduto` (`@IsString @IsNotEmpty`)
  - Opcionais string: `descricaocurta` (`@MaxLength(40)`), `codigobarra1/2`, `referencia`, `ncm`, `informacaoadicional`, `observacao`
  - Opcionais inteiro FK: `idunidade`, `iddepartamento`, `idgrupo`, `idmarca`, `idfornecedor`
  - Opcionais numerico monetario: `valorvenda1..6`, `valorvendapromocao`, `valorvendaatacado1`, `valorcustounitario`
  - `descontomaximo` com `@Min(0) @Max(100)` (decisao D-09)
  - Opcionais booleano: `tipoproduto`, `controlaestoque`, `vendeproduto`, `statusproduto`
  - Campos EXCLUIDOS: `idproduto`, `datacadastro`, `idusuariocadastro`, `idusuarioalteracao`, campos de grade/serie/cardapio/NBS/IBS
- `UpdateProdutoDto extends PartialType(CreateProdutoDto)` de `@nestjs/swagger`
- `ATHOS_SISTEMA_USUARIO_ID` adicionado ao `REQUIRED_ENV_VARS` em `app.module.ts` (fail-fast D-02)

### AthosProdutoService (Task 33-01-02)

- Pool lazy-init proprio com `getPool()` e `getDbConfig()` (replicando padrao AthosService L500-528)
- `getPool()`: `max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000`, handler de erro no pool
- `getDbConfig()`: lanca `InternalServerErrorException` se `ATHOS_PG_HOST/DB/USER/PASS` ausentes
- Helper privado `validarFkExiste(client, tabela, coluna, id, nomeEntidade)`: `SELECT 1 FROM "<tabela>" WHERE "<coluna>" = $1 LIMIT 1`; lanca `UnprocessableEntityException` (422) se `rows.length === 0`
- `criarProduto(dto)`: INSERT dinamico com colunas filtradas por `dto[field] !== undefined`; `datacadastro = NOW()` literal; `idusuariocadastro = idusuarioalteracao = sistemaUsuarioId ($2)`; `RETURNING idproduto`
- Catch 23503: distingue via `error.constraint` — FK de usuario sistema (`fk_produto_relations_funciona`/`fk_produto_funcionar_funciona`) -> `InternalServerErrorException` 500; qualquer outra constraint ou constraint ausente -> `UnprocessableEntityException` 422 com nome da constraint na mensagem
- `editarProduto(id, dto)`: verifica existencia, pre-validacao FK, UPDATE dinamico com `idusuarioalteracao` sempre incluido
- `alterarStatusProduto(id, ativo)`: toggle `statusproduto = vendeproduto = ativo` sem DELETE fisico
- `AthosProdutoService` registrado em `providers` e `exports` de `AthosModule`

### Testes Unitarios (Task 33-01-03)

8 casos de teste no `describe("criarProduto")`:
1. INSERT retorna `idproduto` do RETURNING
2. `idproduto` ausente nas colunas INSERT, presente no RETURNING (CPROD-02)
3. FK invalida (pre-query) lanca 422 com mensagem clara (CPROD-04)
4. `idfornecedor` invalido via 23503 -> 422 com constraint na mensagem (CPROD-04/Q3)
5. FK usuario 23503 (`fk_produto_relations_funciona`) -> 500 de configuracao
6. Nenhuma query emite DELETE/DISABLE TRIGGER/LOCK TABLE (CPROD-03/DPROD-03/SPROD-01)
7. Queries de write apenas em `produto`; pre-queries apenas em `produto_departamento/grupo/marca`
8. `pool.connect` falha lanca erro

**Resultado:** 192/192 testes passando (8 novos + 184 existentes sem regressoes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrigido padrao de mock para testes de erro com dupla verificacao**
- **Found during:** Task 33-01-03 (execucao dos testes)
- **Issue:** Testes que faziam dois `await expect(service.criarProduto(...)).rejects.toThrow(...)` usavam `mockRejectedValueOnce` (que so configura 1 rejeicao); a segunda chamada no mesmo `it` nao tinha mock configurado e recebia o resultado undefined do query anterior, lancando erro generico em vez do esperado
- **Fix:** Substituido `mockRejectedValueOnce` por `mockRejectedValue` (rejeicao para todas as chamadas) e refatorado os asserts para capturar o erro uma vez e verificar `instanceof` + `.message` separadamente
- **Files modified:** `athos-produto.service.test.ts`
- **Commit:** 8c7b69b (incluido no commit da tarefa)

## Known Stubs

Nenhum. O service implementado retorna `{ idproduto }` real do RETURNING do banco; sem dados mockados ou hardcoded em paths de producao.

## Threat Flags

Nenhum novo endpoint exposto neste plano. O `AthosProdutoService` e um service interno (sem endpoint HTTP propria) — os endpoints serao adicionados no plano 33-02 quando o `ProdutoController` for estendido com os metodos POST/PATCH. Nenhuma nova superficie de ataque introduzida neste plano alem do que ja estava no threat_model do PLAN.md.

## Self-Check: PASSED

Arquivos criados:
- FOUND: apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts
- FOUND: apps/backend/src/modules/integrations/athos/dto/update-produto.dto.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-produto.service.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts

Commits:
- FOUND: 1e19b05 (feat(33-01): criar DTOs)
- FOUND: b55b3ea (feat(33-01): criar AthosProdutoService)
- FOUND: 8c7b69b (test(33-01): testes unitarios)

Testes: 192/192 passando
TypeScript: sem erros de compilacao
