# Phase 38: Aplicação de Defaults na Criação de Produto - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 38-Aplicação de Defaults na Criação de Produto
**Areas discussed:** Detecção de omissão/override, status/vende no DTO, defaults de estoque, log de defaults aplicados, allowlist

---

## Detecção de "omitido" vs. override (OVRD)

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| (a) `null` = omissão | `null` e `undefined` aplicam default; só valor real é preservado | ✓ |
| (b) `null` = intenção de vazio | `null` explícito não aplica default | |

**User's choice:** (a) — "com omissão declara default" + "1a".
**Notes:** `undefined`/campo-ausente já estava implícito como omissão; o `null` foi alinhado para também contar como omissão (regra simples).

---

## `statusproduto` / `vendeproduto` na criação

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Manter default `true` | Produto nasce ativo/vendável; operador pode enviar `false` | ✓ |
| Default `false` | Produto nasce inativo/não-vendável por padrão | |
| Outra interpretação | — | |

**User's choice:** Manter default `true` (operador pode sobrescrever para `false`).
**Notes:** ⚠ Conflito surfado: o usuário inicialmente pediu default `false`, o que contradizia a Fase 37 D-06, o critério de sucesso 1 do roadmap e o PROJECT.md. Após o flag, o usuário escolheu manter `true`. Nenhuma mudança no roadmap necessária.

---

## Defaults de estoque (DOPR)

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Estoque por moda (Fase 37) | `controlaestoque`/`baixarestoque` vindos do motor (fallback false) | |
| Estoque fixo operacional | `controlaestoque=true`, `baixarestoque=true`, `estoqueloja=10` fixos | ✓ |

**User's choice:** Estoque fixo operacional — `controlaestoque=true`, `baixarestoque=true` (padrão proposto mantido), `estoqueloja=10`; operador pode sobrescrever.
**Notes:** Introduz `estoqueloja` (campo novo, não estava na Fase 37). Decisão muda a origem de `controlaestoque`/`baixarestoque` vs. Fase 37 (que era por moda) → registrado como dívida técnica (remover `STOCK_FIELDS` do motor depois).

---

## Log de defaults aplicados (OBSV-01)

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Linha estruturada com valores | Loga campo→valor aplicado + caso "nenhum default necessário" | ✓ |
| Só nomes dos campos | Loga quais campos receberam default, sem os valores | |

**User's choice:** Linha estruturada incluindo os valores aplicados ("3 ok").
**Notes:** Aceitável expor valores aqui (produto único sendo criado), diferente da regra da Fase 37 sobre não logar a moda do catálogo inteiro.

---

## Allowlist de campos

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Reusar `FISCAL_FIELDS` da Fase 37 | Fonte única dirige DTO fiscal + aplicação de defaults fiscais | ✓ |
| Segunda lista própria na Fase 38 | Duplicar a lista de campos fiscais | |

**User's choice:** Reusar `FISCAL_FIELDS` da Fase 37 para os fiscais; defaults operacionais fixos num mapa próprio da Fase 38.

---

## Claude's Discretion

- Estrutura do merge "DTO + defaults" (helper vs. inline).
- Formato exato da string de log.
- Serialização de `estoqueloja=10` para a coluna `string|null`.
- Ordem de aplicação operacional vs. fiscal (respeitado o override do operador).

## Deferred Ideas

- Simplificar a Fase 37 removendo `STOCK_FIELDS` (estoque virou fixo operacional). Dívida técnica — não alterar a Fase 37 nesta fase.
- Demais campos de estoque (`estoquedeposito`, `estoqueentregar`, `estoquemaximo`, `estoqueminimo`) fora de escopo.
- Preview/dry-run de defaults (DEFV-01) e UI de revisão (DEFV-02) — já deferidos no v2.4.
