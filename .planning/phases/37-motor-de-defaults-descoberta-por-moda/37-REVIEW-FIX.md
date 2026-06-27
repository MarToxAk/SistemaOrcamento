---
phase: 37-motor-de-defaults-descoberta-por-moda
fixed_at: 2026-06-27T00:00:00Z
review_path: .planning/phases/37-motor-de-defaults-descoberta-por-moda/37-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Fase 37: Relatório de Correção de Code Review

**Corrigido em:** 2026-06-27
**Review de origem:** `.planning/phases/37-motor-de-defaults-descoberta-por-moda/37-REVIEW.md`
**Iteração:** 1

**Resumo:**
- Findings em escopo (critical + warning): 3
- Corrigidos: 3
- Ignorados: 0

**Suite de testes:** 33/33 passando após os 3 fixes.

---

## Issues Corrigidas

### WR-01: `client.release()` chamado sem argumento de erro no bloco finally

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts`
**Commit:** `0c563b8`
**Fix aplicado:** Adicionada variável `let queryError: Error | undefined` antes do bloco `try`. Adicionado bloco `catch (err)` que captura o erro e re-lança. O `finally` agora chama `client.release(queryError)`, sinalizando ao pool `pg` que a conexão pode estar corrompida quando ocorreu um erro de query — em vez de devolvê-la como saudável.

---

### WR-02: Cache expõe referência mutável — corrupção silenciosa possível

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts`
**Commit:** `6363b40`
**Fix aplicado:** Ao armazenar o objeto no cache, substituído `{ defaults, expiresAt }` por `{ defaults: Object.freeze(defaults) as ProductDefaults, expiresAt }`. `Object.freeze()` congela o objeto in-place (mesma referência), de modo que qualquer tentativa de mutação pelos chamadores lança `TypeError` em strict mode. A mesma referência congelada é retornada tanto em cache hits quanto via promise-lock, mantendo compatibilidade com as asserções `toBe()` dos testes existentes.

---

### WR-03: `(mode as boolean)` — asserção de tipo sem coerção de runtime

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts`
**Commit:** `5b674bf`
**Fix aplicado:** Substituído `(mode as boolean)` por `Boolean(mode)` na atribuição dos campos de estoque em `computeDefaults()`. `Boolean()` produz coerção real em runtime (`Boolean(true)` → `true`, `Boolean(false)` → `false`, `Boolean("true")` → `true`), eliminando a dependência exclusiva na asserção TypeScript que não tem efeito no JavaScript gerado.

---

_Corrigido em: 2026-06-27_
_Executor: Claude (gsd-code-fixer)_
_Iteração: 1_
