# Phase 37: Motor de Defaults (Descoberta por Moda) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 37-Motor de Defaults (Descoberta por Moda)
**Areas discussed:** Definição de produto ativo, Estratégia de cache, Fallback sem amostra, Limiar e desempate

---

## Definição de "produto ativo" (amostra da moda)

| Option | Description | Selected |
|--------|-------------|----------|
| `statusproduto = true` apenas | Considera ativo só pelo status | |
| `statusproduto = true AND vendeproduto = true` | Ambos verdadeiros — noção de ativo do sistema | ✓ |
| Filtrar por recência (últimos N meses) | Amostra só de produtos recentes | |

**User's choice:** `statusproduto = true AND vendeproduto = true`, todo o catálogo ativo (sem janela temporal).
**Notes:** `alterarStatusProduto` liga/desliga os dois campos juntos; catálogo estável da papelaria favorece amostra completa.

---

## Estratégia de cache (DEFD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Cache em memória com TTL | `Map` no serviço, recalcula ao expirar | ✓ |
| Por processo até reiniciar | Sem expiração | |
| Invalidar a cada escrita | Recalcula quando produto é criado | |

**User's choice:** Cache em memória, TTL de 24h, sem invalidação por escrita.
**Notes:** 1 produto novo quase não move a moda; TTL longo minimiza carga no Athos; backend instância única.

---

## Fallback quando não há amostra (DEFD-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded por campo (todos) | Valor seguro fixo para todo campo | |
| Omitir o campo (todos) | Não retorna default | |
| Dividido: operacional fixo / fiscal omite | Estoque com fallback fixo; fiscal omite | ✓ |

**User's choice:** Operacionais (estoque) com fallback hardcoded; fiscais omitem o campo quando não há moda.
**Notes:** Nunca quebra o cadastro; evita gravar valor fiscal errado em catálogo vazio. `statusproduto`/`vendeproduto` são default fixo `true` (não moda).

---

## Limiar e desempate

| Option | Description | Selected |
|--------|-------------|----------|
| Amostra mínima | Ignora moda se < N produtos preenchem o campo | ✓ (N=5) |
| Limiar de dominância | Só usa moda se ≥ X% | ✗ (rejeitado) |
| Desempate determinístico | Menor valor em caso de empate | ✓ |

**User's choice:** Amostra mínima de 5; sem limiar de dominância; empate → menor valor (determinístico).
**Notes:** Piso de 5 evita viés de amostra minúscula; dominância adicionaria complexidade sem ganho; empates raros.

---

## Claude's Discretion

- Forma da query SQL (GROUP BY por campo vs varredura única em Node).
- Nomes de métodos/classe e formato do retorno dos defaults.
- Constantes nomeadas para TTL (24h) e amostra mínima (5).

## Deferred Ideas

- Valor de fallback de `controlaestoque`/`baixarestoque` (fixado `false`, revisável pelo operador).
- Endpoint de preview/dry-run (DEFV-01) e UI de revisão (DEFV-02) — v2 deferido.
- Defaults configuráveis por env var — fora de escopo.
