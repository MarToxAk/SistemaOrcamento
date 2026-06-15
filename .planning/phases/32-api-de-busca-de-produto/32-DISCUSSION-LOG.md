# Phase 32: API de Busca de Produto - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 32-api-de-busca-de-produto
**Areas discussed:** Controller placement, Response shape, Filtro mínimo, Lookups de dept/grupo/marca

---

## Controller Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Adicionar em `AthosController` | Consistente com demais endpoints; zero overhead de arquivo novo | |
| `ProdutoController` separado (mesmo módulo) | `athos-produto.controller.ts`; AthosModule registra os dois; Fase 33 estende sem tocar AthosController | ✓ |
| Novo `ProdutoModule` separado | Mais isolamento, mas overhead maior para algo que compartilha pool Athos | |

**User's choice:** Recomendado (ProdutoController separado no mesmo módulo)
**Notes:** Usuário pediu para selecionar as opções recomendadas em todas as áreas.

---

## Response Shape

| Option | Description | Selected |
|--------|-------------|----------|
| `SELECT *` como objeto tipado (interface TS) | Linha completa conforme BPROD-04; researcher mapeia campos reais | ✓ |
| DTO com campos selecionados | Contrato mais rígido, mas omite campos que o frontend pode precisar | |
| `Record<string, unknown>` sem tipagem | Flexível mas perde type safety no TypeScript | |

**User's choice:** Recomendado (SELECT * como interface TypeScript tipada)
**Notes:** BPROD-04 exige linha completa — não filtrar campos no backend.

---

## Filtro Mínimo

| Option | Description | Selected |
|--------|-------------|----------|
| Sem filtro obrigatório (lista paginada) | Permite Fase 34 exibir lista inicial; ~28k produtos com paginação é viável | ✓ |
| Filtro obrigatório (mín. 3 chars) | Consistente com buscarClientes; reduz carga no banco | |

**User's choice:** Recomendado (sem filtro obrigatório)
**Notes:** Descrição sem ILIKE mínimo; código de barras sempre exato; filtros combinados via OR/AND.

---

## Lookups de Departamento / Grupo / Marca

| Option | Description | Selected |
|--------|-------------|----------|
| Incluir nesta fase | Fase 33 precisa para validar FK; Fase 34 precisa para dropdowns; queries simples | ✓ |
| Diferir para Fase 34 | Menos escopo na Fase 32, mas retrabalho na Fase 33 | |

**User's choice:** Recomendado (incluir nesta fase)
**Notes:** Endpoints sob `/athos/produtos/lookup/*` retornam `{ id, nome }[]` sem paginação.

---

## Claude's Discretion

- Nomenclatura de query params: snake_case (`descricao`, `codigobarra`, `iddepartamento`, `idgrupo`, `idmarca`)
- Swagger: `@ApiOperation`, `@ApiQuery`, `@ApiOkResponse` em todos os endpoints
- Logger estruturado em todos os métodos do service
- Error mapping: `NotFoundException` (404) para produto não encontrado; `InternalServerErrorException` para falha no pool

## Deferred Ideas

- Busca full-text com pg_trgm/ranking de relevância → backlog
- Cache de lookups (departamento/grupo/marca raramente mudam) → otimização futura
- Filtro por `statusproduto` → Fase 34 decide o comportamento de UX desejado
