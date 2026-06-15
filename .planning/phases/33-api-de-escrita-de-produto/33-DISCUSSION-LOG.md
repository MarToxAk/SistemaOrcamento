# Phase 33: API de Escrita de Produto - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 33-api-de-escrita-de-produto
**Areas discussed:** Usuário de escrita, Organização do service, Campos do DTO de criação, Log de auditoria

---

## Área 1: Usuário de escrita (idusuariocadastro / idusuarioalteracao)

| Option | Description | Selected |
|--------|-------------|----------|
| Env var `ATHOS_SISTEMA_USUARIO_ID` | Configurável — aponta para o usuário do Athos que representa o sistema | ✓ |
| Hardcoded `1` | ID fixo, sem configuração | |
| `null` | Envia null; funciona se a coluna aceita null | |

**User's choice:** Env var `ATHOS_SISTEMA_USUARIO_ID`
**Notes:** Variável obrigatória — fail-fast na inicialização se não configurada.

---

## Área 2: Organização do service

| Option | Description | Selected |
|--------|-------------|----------|
| Manter no `AthosService` | Sem novo arquivo; AthosService fica com ~2000+ linhas | |
| Novo `AthosProdutoService` | Separação de concerns; escrita isolada | ✓ |

**User's choice:** Aceita recomendado — novo `AthosProdutoService`
**Notes:** Métodos de leitura da Fase 32 permanecem no `AthosService` sem migração.

---

## Área 3: Campos do DTO de criação

| Option | Description | Selected |
|--------|-------------|----------|
| Mínimo viável (só `descricaoproduto`) | Um campo obrigatório, todo o resto via PATCH | |
| Conjunto curado para BomCusto | Campos relevantes para papelaria/gráfica; sem grade/restaurante | ✓ |
| DTO completo (162 campos) | Impraticável; campos incompatíveis com o negócio | |

**User's choice:** Aceita recomendado — conjunto curado
**Notes:** Excluídos: grade, composição, série, cardápio, NBS, tributação avançada IBS/CBS. Preenchidos pelo sistema: `idproduto` (serial), `datacadastro` (NOW()), `idusuariocadastro` (env var).

---

## Área 4: Log de auditoria (SPROD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Logger NestJS estruturado | `this.logger.log(...)` com operação/idproduto/campos/usuario; sem tabela | ✓ |
| Tabela de auditoria (Prisma) | `produto_audit` — persistente, consultável; nova infraestrutura | |

**User's choice:** Aceita recomendado — Logger NestJS estruturado
**Notes:** Consistente com padrão do projeto; `LoggingInterceptor` cobre o nível de controller automaticamente.

---

## Claude's Discretion

- Nomenclatura dos endpoints: `POST /athos/produtos`, `PATCH /athos/produtos/:idproduto`, `PATCH /athos/produtos/:idproduto/status`
- Alocação de `idproduto`: via sequence do PostgreSQL ou `RETURNING` — researcher verifica o nome da sequence na instância BomCusto
- Pre-validação de FK via reutilização dos métodos de lookup existentes (D-08)
- Transação explícita no INSERT se necessário para atomicidade

## Deferred Ideas

- Filtro por `statusproduto` na busca → Fase 34
- Tabela de auditoria persistente → backlog
- Importação em massa → Out of Scope (REQUIREMENTS.md)
- Gestão de grade/composição/série → v2 requirements (PADV-01..03)
