---
phase: 31-hist-rico-nfs-e-consulta-nf-athos
fixed_at: 2026-05-27T12:30:00Z
review_path: .planning/phases/31-hist-rico-nfs-e-consulta-nf-athos/31-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 10
skipped: 1
status: partial
---

# Fase 31: Relatório de Correções de Código

**Corrigido em:** 2026-05-27T12:30:00Z
**Revisão de origem:** .planning/phases/31-hist-rico-nfs-e-consulta-nf-athos/31-REVIEW.md
**Iteração:** 1

**Resumo:**
- Findings no escopo (Critical + Warning): 11
- Corrigidos: 10
- Ignorados: 1

---

## Problemas Corrigidos

### CR-01: Aspas duplas em `tableName` e `dateColumn` na query listarContasPagar

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos.service.ts`
**Commit:** 7e49981
**Correção aplicada:** Adicionadas aspas duplas de identificador ao redor de `${table.tableName}` e `${dateColumn}` na query SQL da linha 719, alinhando com o padrão defensivo usado no restante do serviço.

---

### CR-02: XSS — `linkNfse` renderizado como `href` sem validação de protocolo

**Arquivos modificados:** `apps/frontend/src/lib/safe-url.ts` (novo), `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** fede87c
**Correção aplicada:** Criado utilitário `safeHttpUrl()` em `src/lib/safe-url.ts` que valida que a URL usa protocolo `http:` ou `https:`. Substituídas as 4 ocorrências de `href={...linkNfse}` por `href={safeHttpUrl(...) ?? undefined}` nas linhas 767, 837, 954 e 1650. Adicionado import correspondente.

---

### CR-03: Race condition em `cancelarNfseEmitida` sem garantia transacional

**Arquivos modificados:** `apps/backend/src/modules/cobranca/cobranca.service.ts`
**Commit:** 68b5ead
**Correção aplicada:** O loop de deleção de `NfseEmitidaTitulo` e `NfseEmitida` foi envolvido em `this.prisma.$transaction(async (tx) => { ... })`, garantindo atomicidade e prevenindo estado parcialmente deletado em caso de falha intermediária.

---

### CR-04: Raw SQL para `linkNfse` sem verificação de linhas afetadas

**Arquivos modificados:** `apps/backend/src/modules/cobranca/cobranca.service.ts`
**Commit:** 68b5ead
**Correção aplicada:** O retorno de `$executeRaw` agora é capturado em `updated`. Se `updated === 0`, um `this.logger.warn(...)` registra que o `linkNfse` não foi persistido (coluna inexistente ou migração pendente).

---

### WR-01: `verificarPagamentoBoleto` sem tratamento de falha de autenticação EFI

**Arquivos modificados:** `apps/backend/src/modules/cobranca/cobranca.service.ts`
**Commit:** ebca002
**Correção aplicada:** Todas as chamadas EFI (autenticação + consulta de status) foram envolvidas em bloco `try/catch` com `this.logger.error(...)` contextualizado e relançamento como `InternalServerErrorException`. Adicionada verificação explícita de token vazio.

---

### WR-03: `handleToggleAll` usa `titulos.length` em vez de `titulosLivres`

**Arquivos modificados:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** d2d19b8
**Correção aplicada:** `handleToggleAll` agora usa `titulosLivres.every(...)` para verificar se todos estão selecionados e `titulosLivres.map(...)` para selecionar todos, operando apenas sobre os títulos sem boleto que possuem checkbox na UI.

---

### WR-04: `someSelected` usa `titulos.length` — estado `indeterminate` incorreto

**Arquivos modificados:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** d2d19b8
**Correção aplicada:** `allSelected` e `someSelected` foram reescritos usando `titulosLivres.every(...)`. As declarações foram movidas para após a definição de `titulosLivres` para evitar referência antes da declaração.

---

### WR-05: Seção NFS-e Emitidas não recarrega após cancelamento

**Arquivos modificados:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
**Commit:** d2d19b8
**Correção aplicada:** Após o `setRefetchKey((k) => k + 1)` bem-sucedido no handler de remoção de NFS-e, adicionado `setNfseCarregada(false)` para forçar o reload da seção inferior via IntersectionObserver.

---

### WR-06: Verificação de duplicidade por `idvenda` usa apenas o primeiro título

**Arquivos modificados:** `apps/backend/src/modules/cobranca/cobranca.service.ts`
**Commit:** ebca002
**Correção aplicada:** Substituída a verificação do `titulosFiltrados[0]?.idvenda` por coleta de todos os `idvenda` únicos com `[...new Set(...)]`, iterando sobre todos com verificação individual no banco.

---

### WR-07: `valorNota` sempre `0` — tipo de retorno enganoso

**Arquivos modificados:** `apps/backend/src/modules/integrations/athos/athos.service.ts`
**Commit:** f9cfb7b
**Correção aplicada:** Tipo de retorno alterado de `valorNota: number` para `valorNota: 0` (literal TypeScript). Valor na implementação alterado para `0 as const`. Adicionado comentário `@deprecated` documentando que o campo não carrega valor real.

---

## Findings Ignorados

### WR-02: Duplicação massiva de lógica de autenticação EFI — três cópias idênticas

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:138-162`, `359-377`, `486-495`
**Motivo:** Refatoração de extração de método privado envolvendo 3 blocos de autenticação em locais diferentes do serviço. Dado o contexto de janela limitado e o risco de introduzir regressão silenciosa ao reorganizar chamadas assíncronas interdependentes, esta correção foi deixada para revisão manual. A lógica duplicada foi parcialmente mitigada pelo WR-01 (que padronizou o bloco em `verificarPagamentoBoleto`).
**Issue original:** Três cópias quase idênticas da sequência EFI auth; uma diferença entre cópias pode introduzir bug silencioso.

---

_Corrigido: 2026-05-27T12:30:00Z_
_Corretor: Claude (gsd-code-fixer)_
_Iteração: 1_
