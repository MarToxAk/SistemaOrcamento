# Milestones - Sistema de Orcamento BomCusto

## v2.3 White-Label Multi-Empresa (Shipped: 2026-06-23)

**Phases completed:** 3 phases (35, 36, 999.1), 12 plans

**Delivered:** Sistema totalmente white-label (configurável por empresa via env vars) + gerenciamento de layout do PDF de orçamento pela própria interface, com upload/preview/ativação em runtime e render seguro.

**Key accomplishments:**

- **Fase 35 (Backend White-Label):** NFS-e dehardcoded (EMPRESA_MUNICIPIO_IBGE), template PDF extraído para `quote-default.hbs`, `renderHtml` com cadeia de fallback + variáveis de empresa, `.env.example` com todas as `EMPRESA_*`.
- **Fase 36 (Frontend White-Label):** 8 arquivos dehardcoded (nome, logo, CNPJ, endereço, email lidos de env vars), CSS theming via custom property, renderização condicional de campos opcionais; páginas internas e públicas. UAT 6/6 aprovado.
- **Fase 999.1 — Storage + render seguro:** modelo Prisma `PdfTemplate` + migration + seed idempotente dos 3 presets; `renderHtml` async resolvendo template ativo do banco; hardening Handlebars (`knownHelpersOnly`) + bloqueio total de rede no Puppeteer (anti-SSRF); variáveis de contato de empresa (D-07).
- **Fase 999.1 — 3 presets:** colorido, minimalista P&B e clássico, com fontes/ícones 100% inline (sobrevivem ao bloqueio de rede) e contato dehardcoded.
- **Fase 999.1 — Módulo backend:** `PdfTemplatesService` (validação que REJEITA HTML perigoso via `sanitize-html`, swap atômico do ativo via transação) + 5 endpoints `@AdminOnly()` (listar/upload/ativar/excluir/preview) + `renderPreviewPdf` server-side; `AdminAuthGuard` com `timingSafeEqual`.
- **Fase 999.1 — Frontend:** tela `/configuracoes/templates` (galeria + upload + preview) consumindo os endpoints via rotas proxy que injetam `x-admin-api-key` só server-side + gate de senha com rate-limit — trocar o layout do PDF em runtime pela interface, sem editar código nem reiniciar o servidor.

**Verificação:** 999.1-VERIFICATION.md PASSED (8/8). Segurança: 999.1-SECURITY.md `threats_open: 0` (risco T-SANDBOX aceito p/ deploy interno; ⚠ ação pré-deploy CR-01 — definir env vars do painel admin).

**Known deferred items at close:** UAT/verificação humana das Fases 32/33 (ciclo v2.2) — ver STATE.md → Deferred Items.

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

---

## v2.1 - Cobrança e Fiscal do Cliente

Shipped: 2026-06-08
Phases: 28-31 | Plans: 12 | Tasks: 12

Delivered: Página de detalhe do cliente com títulos em aberto, geração de boleto consolidado via EFI Bank, emissão de NFS-e a partir de títulos selecionados, e histórico de NFS-e emitidas + consulta de NF-e do Athos — fechando o ciclo de cobrança e fiscal a partir da área do cliente.

Key Accomplishments:

1. Página de detalhe (Fase 28) — /contas-receber/[idcliente] com dados cadastrais PF/PJ, tabela de títulos AVC/VEN com checkboxes e barra de ações sticky; 4 modelos Prisma para boleto/NFS-e
2. Boleto consolidado EFI (Fase 29) — CobrancaModule com /v1/charge/one-step, modal React de 4 estados, linha digitável copiável, persistência CobrancaBoleto/CobrancaBoletoTitulo e webhook de pagamento (UAT 14/14)
3. Emissão de NFS-e de títulos (Fase 30) — modal com tipo de serviço, dedução de produto físico em venda mista, valor read-only e persistência NfseEmitida com idvenda
4. Histórico NFS-e + NF Athos (Fase 31) — seções lazy na página de detalhe: NFS-e emitidas (banco próprio) e busca de NF-e do Athos por número exato (checkpoint humano 31-04 aprovado)

Known deferred items at close: 16 quick_tasks (todos concluídos — falso-positivo de ferramenta; ver STATE.md Deferred Items). Tech debt: testes de integração com API live IIBR (Fase 30).

Audit: passed (.planning/milestones/v2.1-MILESTONE-AUDIT.md)
Archive: .planning/milestones/v2.1-ROADMAP.md
