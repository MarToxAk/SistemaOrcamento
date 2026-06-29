# Phase 39: Scaffold, Leitura e Spikes de Introspecção - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 39-Scaffold, Leitura e Spikes de Introspecção
**Areas discussed:** Logística dos spikes, Shape do GET, Rota, Detail inativo na listagem

---

## Logística dos spikes de introspecção (192.168.3.198)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Usuário passa credenciais/acesso e Claude roda as queries daqui | |
| (b) | Claude entrega o SQL pronto; usuário roda no 192.168.3.198 e cola os resultados | ✓ |
| (c) | 192.168.3.198 é o mesmo Athos do ATHOS_PG_* e o acesso já está configurado | |

**User's choice:** (b) — implícito via "aceita todos"; Claude travou (b) por ser o default seguro (executor em CI/cloud não alcança a rede), com convite explícito para corrigir.
**Notes:** Os resultados dos 3 spikes devem ser documentados no PLAN/SUMMARY antes de DTO/INSERT da Fase 40.

---

## Shape da resposta do GET

| Option | Description | Selected |
|--------|-------------|----------|
| Recomendado | Lista plana: idprodutocomposto, idprodutodetail, descricaoproduto, statusproduto (detail), quantidade; sem repetir master | ✓ |

**User's choice:** Aceito ("aceita todos").
**Notes:** JOIN único em produto, sem N+1.

---

## Rota do endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| Recomendado | Sub-recurso aninhado: GET /athos/produtos/:idprodutomaster/composicao | ✓ |
| Alternativa | /athos/produtos-compostos?idprodutomaster= | |

**User's choice:** Aceito ("aceita todos").
**Notes:** 404 se master inexistente; array vazio se sem componentes.

---

## Componente com produto detail inativo na listagem

| Option | Description | Selected |
|--------|-------------|----------|
| Recomendado | Lista todos, expõe statusproduto, não filtra | ✓ |
| Alternativa | Filtra inativos | |

**User's choice:** Aceito ("aceita todos").
**Notes:** Distinto da Fase 40, onde adicionar detail inativo é rejeitado com 422.

---

## Claude's Discretion

- Assinatura/estrutura de `athos-fk.util.ts` e import em `AthosProdutoService`.
- LEFT vs INNER JOIN no GET (decidir no plano após spike de integridade).
- SQL exato das 3 queries de introspecção.
- Nomes dos arquivos novos (`athos-produto-composto.*`).

## Deferred Ideas

- Detecção de ciclos, add em lote, explosão recursiva de BOM — fora do v2.5.
- Escrita (POST/PATCH/DELETE) + flag usaprodutocomposto → Fase 40.
- Write GRANT no Athos → pré-requisito externo da Fase 40.
