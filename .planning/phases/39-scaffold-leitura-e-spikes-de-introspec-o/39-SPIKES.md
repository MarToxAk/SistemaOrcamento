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

**RESULTADO (rodado em 192.168.3.198/athos, usuario_leitura — 2026-06-30):**
```
domain_name | base_type | base_type_full | check_clause
------------+-----------+----------------+-------------
quantidade  | numeric   | numeric(9,3)   | (null)
```
**Decisao Fase 40:** `quantidade` e `numeric(9,3)` SEM clausula CHECK no dominio.
→ DTO usa `@IsNumber()` + `@Min(0.001)` (default seguro; nao ha floor de dominio).
→ Sem CHECK de dominio, NAO esperar pg error 23514 do dominio; valores fora de `numeric(9,3)`
   (ex.: > 999999.999 ou mais de 3 casas) dao erro de overflow/arredondamento numerico (22003), nao 23514.
→ Max representavel: 999999.999.

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

**RESULTADO (via pg_constraint — information_schema retornou 0 no PG 9.0, usado pg_catalog):**
```
conname                         | contype | definition
--------------------------------+---------+--------------------------------------------------------------
fk_produto__produto_p_produto   | f       | FOREIGN KEY (idprodutomaster) REFERENCES produto(idproduto)
                                |         |   ON UPDATE RESTRICT ON DELETE RESTRICT
pk_produto_composto             | p       | PRIMARY KEY (idprodutocomposto)

-- NAO existe constraint UNIQUE em (idprodutomaster, idprodutodetail).
-- idprodutodetail NAO tem FK (so idprodutomaster referencia produto).
-- Indexes: pk_produto_composto + produto_composto_pk (ambos UNIQUE em idprodutocomposto, duplicados);
--          produto_produto_composto_fk (idprodutomaster). Nenhum em (master,detail) nem em idprodutodetail.
```
**Decisao Fase 40:**
→ SEM UNIQUE em `(idprodutomaster, idprodutodetail)` → a pre-verificacao de duplicata DEVE ser
   feita em nivel de aplicacao (SELECT antes do INSERT). NAO confiar em pg error 23505 — ele nao dispara.
→ `idprodutodetail` SEM FK → validacao manual de existencia em `produto` e OBRIGATORIA (validarFkExiste).
→ PK confirmada: `idprodutocomposto` (serial) → usar `INSERT ... RETURNING idprodutocomposto`.

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

**RESULTADO (via pg_trigger — information_schema.triggers nao tem action_timing no PG 9.0):**
```
-- 0 linhas: NENHUM trigger em produto_composto (excluindo internos de constraint).
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

**RESULTADO (via pg_rules — colunas ev_type/is_instead/oid nao existem em pg_rules; usado rulename/definition):**
```
-- 0 linhas: NENHUMA rule em produto_composto.
```

**Decisao Fase 40 (c):** Zero triggers e zero rules → `INSERT INTO produto_composto (idprodutomaster, idprodutodetail, quantidade) VALUES ($1,$2,$3) RETURNING idprodutocomposto` e seguro; nenhuma coluna extra exigida por trigger/rule.

---

## ⚠️ Achado crítico: versão do PostgreSQL

`SELECT version()` → **PostgreSQL 9.0.5 (32-bit, Visual C++ build 1500)**.

Implicações (afetam toda integração Athos, não só esta fase):
- `pg_sequence_last_value()` NAO existe (so PG 10+) — confirma a causa do bug do conta_pagar (PR #44).
- `information_schema.triggers` nao tem `action_timing`; `pg_rules` nao tem `ev_type/is_instead/oid` — usar `pg_catalog` (pg_trigger/pg_constraint) para introspeccao.
- `RETURNING` funciona (desde 8.2) — OK para o serial PK.

---

*Spikes rodados diretamente em 192.168.3.198/athos com o usuario read-only `usuario_leitura` em 2026-06-30 (queries (b)/(c) adaptadas para PG 9.0 via pg_catalog). Resultados reais, nao inventados.*
