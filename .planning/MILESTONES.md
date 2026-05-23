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

Delivered: Corrigidos bugs criticos no modal NFS-e garantindo base de calculo correta e envio tipado para o backend.

Archive: .planning/milestones/v1.6-ROADMAP.md

---

## v1.7 - Correcoes NFS-e: Tomador e Numeracao RPS

Shipped: 2026-05-04
Phases: 18 | Plans: 1

Delivered: Correcao da numeracao RPS e fortalecimento da resolucao de tomador com logs diagnosticos.

Archive: .planning/milestones/v1.7-ROADMAP.md

---

## v1.8 - Busca de Cliente Athos para NFS-e

Shipped: 2026-05-05
Phases: 19-21 | Plans: 4
Git range: v1.7..HEAD (26 commits) | 37 files, +4619/-122 lines

Delivered: Busca de cliente Athos para NFS-e no backend e frontend, resolucao de tomador por cliente selecionado (clienteAthosId), observabilidade com logs estruturados e cobertura de testes PF/PJ/falhas.

Archive: .planning/milestones/v1.8-ROADMAP.md

---

## v2.0 - Gestão Integrada Financeira, Caixa e Dashboards

Shipped: 2026-05-22
Phases: 23-27 | Plans: 10
Git range: v1.9..HEAD (~159 commits) | 203 files, +25164/-2371 linhas

Delivered: Hardening do AthosListenerService com reconexão e notificação Chatwoot, API completa de Contas a Pagar (POST/GET/PATCH com Swagger), upload de anexos via SMB (Tailscale+Docker), redesign da página de status como Kanban 3 colunas, e dashboard analítico de Contas a Receber com filtros por status AVC/VEN/REC/CAN e accordion lazy de títulos.

Key Accomplishments:
1. AthosListenerService hardened — reconexão automática backoff exponencial, notificação Chatwoot no pagamento
2. API Contas a Pagar — inserção/listagem/liquidação direta no banco Athos com autenticação fail-closed
3. Upload SMB — gravação em \\192.168.3.203 via Docker+Tailscale com validação e registro em tabela anexo
4. Status Kanban — /status redesenhada em 3 colunas com design system BomCusto
5. Dashboard Contas a Receber — /contas-receber com Top Cards, Grid, Accordion lazy e filtros por status

Archive: .planning/milestones/v2.0-ROADMAP.md
