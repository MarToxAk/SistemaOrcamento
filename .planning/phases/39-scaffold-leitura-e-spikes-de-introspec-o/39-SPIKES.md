# 39-SPIKES.md — Introspection Spike Queries (COMP-07)

> **INSTRUCAO IMPORTANTE — como usar este arquivo**
>
> O executor (CI/cloud) **NAO alcanca a rede 192.168.3.198**. As queries abaixo sao
> exatas e prontas para copiar e colar, mas precisam ser rodadas **pelo usuario** em
> um cliente `psql` (ou equivalente) conectado ao banco de referencia read-only em
> `192.168.3.198`.
>
> **Passos:**
> 1. Conectar ao banco em `192.168.3.198` via psql (DB de referencia — NAO o Athos de
>    producao `ATHOS_PG_*`).
> 2. Rodar cada query abaixo no banco.
> 3. Colar a saida completa no bloco de resultado correspondente (substituir o
>    placeholder `[AGUARDANDO RESULTADO DO USUARIO]`).
> 4. Salvar o arquivo.
>
> **Por que estes resultados importam:**
> - Eles **nao bloqueiam** o endpoint GET da Fase 39 (reads nao usam `quantidade`
>   em filtros SQL).
> - Eles **gatilham** os decorators do DTO de `quantidade` e a lista de colunas
>   do INSERT da **Fase 40** (POST/PATCH). Nenhum DTO de escrita pode ser
>   finalizado antes de os resultados dos spikes serem colados aqui.
>
> Zero linhas em qualquer resultado e um resultado valido — registrar
> explicitamente "sem UNIQUE", "nenhum trigger", etc.

---

## SPIKE (a) — Dominio `quantidade`: tipo-base + clausula CHECK

**O que o resultado decide:**
- `base_type` = `integer` → DTO usa `@IsInt()`, `@Min(1)` (ou o floor da clausula CHECK)
- `base_type` = `numeric` ou `decimal` → DTO usa `@IsNumber()`, `@Min(0.001)` (ou o floor do CHECK)
- Valor de `check_clause` (ex.: `CHECK (VALUE > 0)`) → define o valor exato de `@Min()` e se zero e permitido
- Se `check_clause` for NULL → o DOMAIN nao tem CHECK; usar `@IsNumber()`, `@Min(0.001)` como default seguro

```sql
-- SPIKE (a): tipo-base + CHECK clause do domínio "quantidade"
SELECT
  t.typname                                                     AS domain_name,
  t2.typname                                                    AS base_type,
  pg_catalog.format_type(t.typbasetype, t.typtypmod)           AS base_type_full,
  pg_catalog.pg_get_constraintdef(c.oid)                       AS check_clause
FROM pg_type t
JOIN pg_type t2
  ON t2.oid = t.typbasetype
LEFT JOIN pg_constraint c
  ON c.contypid = t.oid
  AND c.contype = 'c'
WHERE t.typname = 'quantidade'
  AND t.typtype  = 'd';
```

**RESULTADO — colar saida do 192.168.3.198 aqui:**
```
-- RESULTADO SPIKE (a):
[AGUARDANDO RESULTADO DO USUARIO]
```

---

## SPIKE (b) — Constraints UNIQUE e PRIMARY KEY na tabela `produto_composto`

**O que o resultado decide:**
- Se existir constraint `UNIQUE` em `(idprodutomaster, idprodutodetail)` → o POST da Fase 40 pode capturar o erro pg `23505` como guarda secundario (ainda adicionar pre-verificacao em nivel de aplicacao de qualquer forma)
- Se NAO existir UNIQUE → a pre-verificacao de duplicata em nivel de aplicacao na Fase 40 e a UNICA protecao contra pares duplicados; documentar para que a pre-verificacao nunca seja removida
- A constraint PRIMARY KEY confirma que `idprodutocomposto` e o PK e seu nome de coluna (usado na clausula RETURNING)

```sql
-- SPIKE (b): constraints UNIQUE e PRIMARY KEY na tabela produto_composto
SELECT
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints  tc
JOIN information_schema.key_column_usage   kcu
  ON  kcu.constraint_name = tc.constraint_name
  AND kcu.table_name      = tc.table_name
  AND kcu.table_schema    = tc.table_schema
WHERE tc.table_name    = 'produto_composto'
  AND tc.table_schema  = 'public'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
GROUP BY tc.constraint_name, tc.constraint_type
ORDER BY tc.constraint_type, tc.constraint_name;
```

**RESULTADO — colar saida do 192.168.3.198 aqui:**
```
-- RESULTADO SPIKE (b):
[AGUARDANDO RESULTADO DO USUARIO]
```

---

## SPIKE (c) — Triggers e Rules na tabela `produto_composto`

**O que o resultado decide:**
- Se existirem triggers que exijam colunas adicionais (ex.: `idusuarioalteracao`, timestamp, log de auditoria) → o INSERT da Fase 40 deve incluir essas colunas na lista de colunas
- Se existir uma rule `ON INSERT DO INSTEAD` → o comportamento do INSERT e redirecionado; o executor deve ler o corpo da rule antes de escrever qualquer INSERT
- Se o resultado for vazio (zero linhas) → INSERT com apenas `(idprodutomaster, idprodutodetail, quantidade)` e seguro
- Qualquer trigger que carimbe `dataultimaalteracao` ou similar automaticamente e OK — a API nao precisa incluir essas colunas

### SPIKE (c-1) — Triggers

```sql
-- SPIKE (c-1): triggers na tabela produto_composto
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table  = 'produto_composto'
  AND event_object_schema = 'public'
ORDER BY trigger_name, event_manipulation;
```

**RESULTADO — colar saida do 192.168.3.198 aqui:**
```
-- RESULTADO SPIKE (c-1) triggers:
[AGUARDANDO RESULTADO DO USUARIO]
```

### SPIKE (c-2) — Rules

```sql
-- SPIKE (c-2): rules na tabela produto_composto
SELECT
  rulename,
  ev_type,         -- 1=SELECT  2=UPDATE  3=INSERT  4=DELETE
  is_instead,
  pg_get_ruledef(oid) AS definition
FROM pg_rules
WHERE tablename  = 'produto_composto'
  AND schemaname = 'public'
ORDER BY rulename;
```

**RESULTADO — colar saida do 192.168.3.198 aqui:**
```
-- RESULTADO SPIKE (c-2) rules:
[AGUARDANDO RESULTADO DO USUARIO]
```

---

*Queries copiadas de 39-RESEARCH.md §"COMP-07 — Introspection Spike Queries". Nenhum resultado foi inventado ou preenchido pelo executor.*
