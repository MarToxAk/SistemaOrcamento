---
phase: 38-aplica-o-de-defaults-na-cria-o-de-produto
fixed_at: 2026-06-27T11:15:00Z
review_path: .planning/phases/38-aplica-o-de-defaults-na-cria-o-de-produto/38-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Fase 38: Relatório de Fix de Code Review

**Fixed at:** 2026-06-27
**Revisão fonte:** `.planning/phases/38-aplica-o-de-defaults-na-cria-o-de-produto/38-REVIEW.md`
**Iteração:** 1

**Resumo:**
- Achados no escopo: 3 (WR-01, WR-02, IN-03 — conforme solicitação explícita do usuário)
- Corrigidos: 3
- Ignorados: 0

**Verificação pós-fix:**
- Suite `npx jest athos-produto --no-coverage`: **46 testes passando** (41 originais + 5 novos)
- `npx tsc --noEmit -p tsconfig.json`: **sem erros**

---

## Issues Corrigidos

### WR-01: `ATHOS_SISTEMA_USUARIO_ID` não validado antecipadamente — `NaN` propagado ao SQL

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos-produto.service.ts`
**Commit:** `f2d388a`
**Fix aplicado:** Adicionado método privado `getSistemaUsuarioId()` que valida a variável de ambiente antes de usá-la — lança `InternalServerErrorException` descritiva quando a variável está ausente, vazia, não-inteira ou `<= 0`. As três chamadas brutas `Number(process.env.ATHOS_SISTEMA_USUARIO_ID)` em `criarProduto`, `editarProduto` e `alterarStatusProduto` foram substituídas por `this.getSistemaUsuarioId()`.

---

### WR-02: `editarProduto` descarta silenciosamente campos da Fase 38 presentes em `UpdateProdutoDto`

**Arquivos modificados:**
- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts`
- `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts`

**Commit:** `ea89edc`
**Fix aplicado (Opção B — expandir allowlist):** Adicionados ao `ALLOWED_UPDATE_FIELDS` de `editarProduto`:
- Campos operacionais sem endpoint dedicado: `baixarestoque`, `estoqueloja`
- 12 campos fiscais: `icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`

`statusproduto` e `vendeproduto` foram mantidos fora do allowlist — gerenciados exclusivamente pelo endpoint `alterarStatusProduto`.

`editarProduto` **nunca** chama `getDefaults()` em nenhum caminho (decisão D-11 / OVRD-02 preservada).

Testes adicionados:
- `WR-02/EDIT-FISCAL`: confirma que o campo `icms` é gravado no UPDATE quando enviado pelo operador; confirma `getDefaults` não é chamado (`toHaveBeenCalledTimes(0)`)
- `WR-02/EDIT-ESTOQUE`: confirma que `baixarestoque=false` e `estoqueloja="5"` são gravados no UPDATE; confirma `getDefaults` não é chamado

---

### IN-03: Testes de override cobrem apenas `statusproduto: false` — demais valores falsy omitidos

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts`
**Commit:** `d98bcc5`
**Fix aplicado:** Adicionados três testes `OVRD-falsy` ao describe `criarProduto`:
- `controlaestoque=false` preservado no INSERT (não sobrescrito pelo default `true`)
- `baixarestoque=false` preservado no INSERT (não sobrescrito pelo default `true`)
- `estoqueloja="0"` preservado no INSERT (não sobrescrito pelo default `"10"`)

Esses testes garantem que uma refatoração acidental que trocasse `== null` por `=== undefined` quebraria explicitamente a suíte.

---

## Issues Ignorados

Nenhum — todos os achados no escopo foram corrigidos.

*(IN-01 e IN-02 foram excluídos do escopo conforme solicitação explícita do usuário: apenas WR-01, WR-02 e IN-03 foram trabalhados.)*

---

_Corrigido: 2026-06-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteração: 1_
