# Milestones - Sistema de Orcamento BomCusto

---

## v1.0 - MVP: Seguranca, Confiabilidade e UX

Shipped: 2026-05-02
Phases: 1-5 | Plans: 8

Delivered: Sistema seguro, com integracoes confiaveis, UX polida e fluxo de aprovacao do cliente.

Archive: .planning/milestones/v1.0-ROADMAP.md

---

## v1.1 - Aprovacao de Orcamento com Associacao Athos

Shipped: 2026-05-03
Phases: 6 | Plans: 4

Delivered: Fluxo completo de aprovacao de orcamento via link publico integrado ao Athos.

Archive: .planning/milestones/v1.1-ROADMAP.md

---

## v1.2 - Mensagens e UX do Cliente

Shipped: 2026-05-03
Phases: 7-8 | Plans: 4

Delivered: Mensagens automaticas Chatwoot por eventos de orcamento e redesign das paginas publicas de aprovacao/status.

Archive: .planning/milestones/v1.2-ROADMAP.md

---

## v1.3 - Estabilidade de Migrations no Docker Compose

Shipped: 2026-05-03
Phases: 9-10 | Plans: 4

Delivered: Eliminado race condition de migration no Docker Compose com readiness check, bootstrap deterministico e runbook operacional de update com script de verificacao pos-deploy.

Key accomplishments:
- wait-for-db.js garante que o banco aceita conexoes antes de qualquer step de migration
- bootstrap-runtime.sh padroniza sequencia de startup do backend em producao
- Healthcheck pg_isready no compose com gate service_healthy para o backend
- UPDATE_RUNBOOK.md com fluxo reproduzivel de update/rollback para VPS
- verify-deploy-health.ps1 verifica status, logs criticos e health endpoint pos-deploy

Archive: .planning/milestones/v1.3-ROADMAP.md

---

## v1.4 - Pagamento EFI/Athos + Desconto na NFS-e

Shipped: 2026-05-04
Phases: 11-14 | Plans: 8

Delivered: Webhook EFI sem HMAC obrigatorio, conciliacao real do Athos, checagem de pagamento nos endpoints criticos e desconto controlado (percentual/valor) na emissao de NFS-e.

Archive: .planning/milestones/v1.4-ROADMAP.md

---

## v1.5 - Correcao NFS-e: Encoding + UI de Desconto

Shipped: 2026-05-04
Phases: 15-16 | Plans: 2

Delivered: Encoding UTF-8 restaurado nas strings de servico NFS-e, proxy Next.js repassando body do POST ao backend, e UI de desconto bidirecional no modal de emissao NFS-e.

Archive: .planning/milestones/v1.5-ROADMAP.md

---

## v1.6 - Correcao NFS-e: Calculo de Desconto e Valor Final

Shipped: 2026-05-04
Phases: 17 | Plans: 1
Git range: 44fbc2f..895e91e (10 commits) | 11 files, +1226/-32 lines

Delivered: Corrigidos dois bugs criticos no modal NFS-e — path de leitura do total do orcamento (`quote?.body?.totais?.valor`) e tipagem correta do POST body (`boolean` + `Number()`), garantindo que calculos de desconto e envio ao SOAP iiBrasil sejam corretos.

Key accomplishments:
- Corrigidas 6 ocorrencias do path `quote?.totais?.valor` → `quote?.body?.totais?.valor` (base zero → valor real)
- Tipo do body alterado para `Record<string, string | number | boolean>` — suporta boolean e number
- `descontoAtivo = true` (boolean) — satisfaz igualdade estrita `=== true` no backend
- `Number(nfseDescontoPercent)` e `Number(nfseDescontoValor)` — valores numericos no POST
- Verificacao 5/5 must-haves; checkpoint humano aprovado

Archive: .planning/milestones/v1.6-ROADMAP.md
