---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Cobrança e Fiscal do Cliente
current_phase: 30
status: executing
last_updated: "2026-05-27T15:53:00.228Z"
last_activity: 2026-05-23 -- Phase 30 execution started
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 75
---

# STATE.md - Sistema de Orcamento BomCusto

Last updated: 2026-05-22 — Phase 29 Plan 02 completo (modal boleto frontend + Route Handler)
Current phase: 30
Milestone: v2.1 — Cobranca e Fiscal do Cliente

---

## Current Position

Phase: 30 (emissao-nfse-titulos) — EXECUTING
Plan: 1 of 4
Status: Executing Phase 30
Last activity: 2026-05-23 -- Phase 30 execution started

Progress: [####------] 40% (Phase 28 completa + Phase 29 Plans 01+02 completos)

---

## Project Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Seguranca e Autenticacao | complete (v1.0) |
| 2 | Confiabilidade de Integracoes | complete (v1.0) |
| 3 | Correcoes de Fluxo e Qualidade de Dados | complete (v1.0) |
| 4 | Testes e CI | complete (v1.0) |
| 5 | UX do Painel e Area do Cliente | complete (v1.0) |
| 6 | Aprovacao de Orcamento pelo Cliente com Associacao Athos | complete (v1.1) |
| 7 | Mensagens Automaticas ao Cliente via Chatwoot | complete (v1.2) |
| 8 | UX das Paginas Publicas do Cliente | complete (v1.2) |
| 9 | Fluxo de Migration Idempotente | complete (v1.3) |
| 10 | Operacao Segura de Update | complete (v1.3) |
| 11 | Webhook EFI sem assinatura obrigatoria | complete (v1.4) |
| 12 | Conciliacao Athos no backend | complete (v1.4) |
| 13 | Gatilhos de checagem e sincronizacao de status | complete (v1.4) |
| 14 | Desconto controlado na emissao de NFS-e | complete (v1.4) |
| 15 | Corrigir encoding NFS-e e proxy API | complete (v1.5) |
| 16 | UI de desconto no modal NFS-e | complete (v1.5) |
| 17 | Correcao do calculo de desconto no modal NFS-e | complete (v1.6) |
| 18 | Correcoes NFS-e - RPS e Tomador | complete (v1.7) |
| 19 | API de busca de cliente Athos | complete (v1.8) |
| 20 | Resolucao de tomador por cliente selecionado | complete (v1.8) |
| 21 | UI NFS-e, observabilidade e testes | complete (v1.8) |
| 22 | Correcao webhook EFI /pix e fallback NfseService | complete (v1.9) |
| 23 | Notificacao de Caixa Interna — Hardening AthosListenerService | complete (v2.0) |
| 24 | API Contas a Pagar — Endpoint POST e autenticacao obrigatoria | complete (v2.0) |
| 25 | Upload de Anexos — Gravacao SMB e registro tabela anexo | complete (v2.0) |
| 26 | Status Pagina Producao — Layout Kanban 3 colunas | complete (v2.0) |
| 27 | Dashboard de Contas a Receber — Read-Only | complete (v2.0) |
| 28 | Pagina de Detalhe do Cliente + Schema Prisma | complete (v2.1) |
| 29 | Boleto Consolidado via EFI Bank | in-progress (v2.1) — Plans 01+02 completos, checkpoint pendente |
| 30 | Emissao de NFS-e a partir de Titulos | pending (v2.1) |
| 31 | Historico NFS-e + Consulta NF Athos | pending (v2.1) |

## Milestones Archived

- v1.0 — phases 1-5 (.planning/milestones/v1.0-ROADMAP.md)
- v1.1 — phase 6 (.planning/milestones/v1.1-ROADMAP.md)
- v1.2 — phases 7-8 (.planning/milestones/v1.2-ROADMAP.md)
- v1.3 — phases 9-10 (.planning/milestones/v1.3-ROADMAP.md)
- v1.4 — phases 11-14 (.planning/milestones/v1.4-ROADMAP.md)
- v1.5 — phases 15-16 (.planning/milestones/v1.5-ROADMAP.md)
- v1.6 — phase 17 (.planning/milestones/v1.6-ROADMAP.md)
- v1.7 — phase 18 (.planning/milestones/v1.7-ROADMAP.md)
- v1.8 — phases 19-21 (.planning/milestones/v1.8-ROADMAP.md)
- v1.9 — phase 22
- v2.0 — phases 23-27 (.planning/milestones/v2.0-ROADMAP.md)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-22)
Core value: Orcamentos criados, aprovados e cobrados sem intervencao manual
Current focus: v2.1 - Cobranca e Fiscal do Cliente (phases 28-31)

## Active Context

- Milestone ativo: v2.1 (iniciado 2026-05-22)
- Proximo passo: /gsd:plan-phase 29 (boleto-consolidado)
- Stack: NestJS + Next.js + Prisma + PostgreSQL
- Athos: somente leitura — nunca gravar
- NfseModule existente em apps/backend/src/modules/integrations/nfse/ — reutilizar
- EFI integration existente — reutilizar para boleto consolidado
- Phases 28 e 30 requerem Prisma migrations

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-03 | Iniciar v1.3 focado em migration reliability | Erro de migration no update via compose bloqueia deploy |
| 2026-05-03 | Nao usar pesquisa externa para v1.3 | Escopo interno e tecnico conhecido |
| 2026-05-04 | Nao usar n8n para notificacao de pagamento | Fluxo deve ficar na aplicacao backend principal |
| 2026-05-04 | Checar pagamento no Athos ao abrir e ao enviar orcamento | Sincronizar status com estado real do caixa |
| 2026-05-04 | Incluir desconto opcional na emissao de NFS-e | Necessidade fiscal de deducao por percentual/valor sobre total pago |
| 2026-05-04 | v1.5 foca em dois bugs de NFS-e: mojibake no backend + UI de desconto ausente no frontend | Emissao de NFS-e com valor correto nao era possivel sem esses fixes |
| 2026-05-04 | v1.6 foca no path errado de quote?.totais?.valor no frontend | Base de calculo era sempre 0, quebrando todos os calculos de desconto no modal NFS-e |
| 2026-05-04 | Corrigir quote?.totais?.valor para quote?.body?.totais?.valor em 6 pontos do modal NFS-e | totais existe somente dentro de body no tipo QuoteDetail; acesso direto retornava undefined |
| 2026-05-04 | Usar Record<string, string | number | boolean> no body do POST NFS-e | descontoAtivo precisava ser boolean true para satisfazer igualdade estrita do backend |
| 2026-05-15 | Kanban 3-colunas com PRODUCTION_STATUSES.map substituindo tabela em /status | Estrutura visual base para Plan 02 (cards) e Plan 03 (filtro carimbo) |
| 2026-05-15 | Mobile tabs via activeMobileTab state — nao scroll horizontal nem accordion | Decisao D-03 do CONTEXT: uma coluna visivel por vez com Bootstrap nav-tabs |
| 2026-05-15 | Cards placeholder #numero em Plan 01 — Plan 02 expande para card completo | Separacao de concerns: estrutura primeiro, conteudo depois |
| 2026-05-15 | renderQuoteCard como funcao interna (closure) — captura pdfLoadingId e highlightedId sem prop drilling | Funcao interna permite reuso desktop+mobile sem passar props adicionais |
| 2026-05-15 | Badge PAGO_CAIXA=bg-success, PIX_CONFIRMADO=bg-primary, AGUARDANDO=bg-warning | Mapeamento badge->cor Bootstrap definido em D-05 e interfaces do plan |
| 2026-05-15 | borda superior do card via .status-border-{statusKey} — identidade visual por coluna | Cada card identifica sua coluna kanban pela cor da borda superior (verde/azul/laranja) |
| 2026-05-15 | Contagem nos botoes do filtro usa quotes (total), nao visibleQuotes | Cada botao mostra quantos cards entrariam se selecionado, independente do filtro ativo (D-12) |
| 2026-05-15 | badgeFilter nao persiste — reseta para TODOS a cada carregamento | D-14 exige nao persistir filtro; sem localStorage.setItem para badgeFilter |
| 2026-05-21 | summary de contas a receber calculado via Array.reduce no Node.js (nao subquery SQL) | Evita subquery adicional e mantém query principal simples |
| 2026-05-21 | LIMIT 100 hardcoded na query de dashboard de contas a receber | Decisao D-08: sem paginacao no frontend para este MVP |
| 2026-05-21 | datavencimento/dataemissao convertidos com instanceof Date check antes de toISOString() | Driver pg pode retornar Date ou string dependendo da configuracao pg.types |
| 2026-05-21 | Next.js API Routes como proxy para /api/athos/contas-receber/* (nao rewrites em next.config.mjs) | Padrao existente no codebase; x-api-token adicionado server-side via ATHOS_API_TOKEN |
| 2026-05-21 | Accordion fecha ao clicar no mesmo card (toggle); cache em titulosMap evita refetch ao reabrir | UX esperado: clique no card expandido fecha; dados ja carregados nao sao buscados novamente |
| 2026-05-22 | NFS-e emitidas registradas no banco proprio (nao Athos) — tabela nfse_emitida via Prisma | Athos e read-only; historico proprio evita dependencia de banco externo |
| 2026-05-22 | Boleto consolidado (multiplos titulos) em vez de por titulo | Reduz numero de boletos e simplifica cobranca para o operador |
| 2026-05-22 | Schema Prisma (cobranca_boleto + nfse_emitida) criado na Phase 28 | Ambas as tabelas sao pre-requisito para phases 29 e 30 respectivamente |
| 2026-05-22 | buscarDadosClienteContasReceber usa COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial) para unificar nome PF/PJ | Padrao identico ao buscarClientePorId existente; retorna 'Cliente #N' como fallback |
| 2026-05-22 | Rota GET /dados separada de GET /titulos no AthosController | Responsabilidade unica: dados cadastrais vs titulos em aberto — diferentes consumidores |
| 2026-05-22 | Migration add_cobranca_boleto_nfse_emitida aplicada diretamente via DATABASE_URL do .env | Banco acessivel localmente; sem necessidade de defer para producao |
| 2026-05-22 | React.use(params) em Client Component Next.js 15 — nao await | Client Components nao aceitam async/await em hooks; use() e o mecanismo correto para resolver Promise de params |
| 2026-05-22 | Barra de acoes sticky bottom condicional (removida do DOM quando vazia) | D-13: nao disabled — elemento ausente do DOM garante que nao ocupa espaco nem confunde o operador |
| 2026-05-22 | Set<number> imutavel para selectedIds — novo Set a cada toggle | Imutabilidade necessaria para React detectar mudanca de estado e acionar re-render |
| 2026-05-22 | CobrancaModule importa EfiModule + AthosModule; DatabaseModule @Global() nao precisa ser importado | Padrao estabelecido: modulos globais nao precisam ser re-importados |
| 2026-05-22 | Auth EFI boleto: padrão identico ao createCardPaymentLink() — Basic Auth sem mTLS para obter Bearer token | D-03 exige reutilizacao exata do padrao existente |
| 2026-05-22 | Webhook POST /cobranca/boleto/notificacao retorna HTTP 200 sempre — erros logados internamente | D-18: evitar retentativas EFI por falha HTTP |
| 2026-05-22 | notification_url omitida quando WEBHOOK_BASE_URL/APP_URL contem localhost ou 127.0.0.1 | Mesmo padrao de isPublicUrl de createCardPaymentLink() |
| 2026-05-22 | backendFetch ja injeta x-internal-api-key — Route Handler /api/cobranca/boleto nao duplica header | internalHeaders() em backend-client.ts cobre a injecao server-side automaticamente |
| 2026-05-22 | void navigator.clipboard.writeText() no botao Copiar da linha digitavel | Suprimir aviso de floating Promise no TypeScript strict sem quebrar o comportamento |
| 2026-05-22 | Modal boleto sem Bootstrap Modal JS — React state overlay padrao pdf-modal-backdrop | Consistencia com padrao existente em orcamento/[id]/page.tsx; sem dependencia de Bootstrap JS |

## Notes

- Arquivo de auditoria dedicado do milestone v1.8 nao foi encontrado no fechamento.
- Recomendada auditoria consolidada no inicio do proximo ciclo.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260506-001 | Front-end nao tem nenhuma representacao visual do pagamento nem numero do pedido aparecendo | 2026-05-06 | n/a | [260506-001-frontend-pagamento-pedido-visual](./quick/260506-001-frontend-pagamento-pedido-visual/) |
| 260506-002 | Front-end nao mostra icone de pago no caixa nem numero do pedido (numeroordem) na pagina de detalhe do orcamento | 2026-05-06 | n/a | [260506-002-frontend-pago-no-caixa-numeroordem](./quick/260506-002-frontend-pago-no-caixa-numeroordem/) |
| 260506-003 | Exibir numero do pedido na lista de orcamentos com cor diferente para pagamento confirmado | 2026-05-06 | n/a | [260506-003-lista-orcamento-numero-pedido-pagamento](./quick/260506-003-lista-orcamento-numero-pedido-pagamento/) |
| 260511-swg | Gere a documentacao OpenAPI (Swagger) para os novos endpoints de Contas a Pagar e Anexos | 2026-05-11 | 271b9c9 | [260511-swg-swagger-contas-pagar-anexos](./quick/260511-swg-swagger-contas-pagar-anexos/) |
| 260511-athos | Implementar Schema Completo Athos para GET, POST e PATCH de conta_pagar | 2026-05-11 | 6aabae0, 54597d2 | [260511-athos-schema-completo](./quick/260511-athos-schema-completo/) |
| 260511-kvy | Implementar Fluxo Completo de Pagamento e GED (Patch Athos V2) com liquidacao transacional | 2026-05-11 | ba57544 | [260511-kvy-para-aplicar-este-patch-de-fluxo-complet](./quick/260511-kvy-para-aplicar-este-patch-de-fluxo-complet/) |
| 260514-001 | Correcao link de aprovacao no envio — approval link nunca gerado por guarda isAssociatedCustomer | 2026-05-14 | fabc37e | [260514-001-approval-link-correcao-envio](./quick/260514-001-approval-link-correcao-envio/) |
| 260514-002 | Notificar cliente via Chatwoot ao confirmar pagamento no caixa + simplificar mensagem PIX | 2026-05-14 | 61354fd | [260514-002-notificacao-caixa-pix-chatwoot](./quick/260514-002-notificacao-caixa-pix-chatwoot/) |
| 260514-003 | Status page: SSE tempo real, banner persistente, badge pago no caixa, botao novo orcamento | 2026-05-14 | 2369502 | [260514-003-status-page-realtime-dashboard](./quick/260514-003-status-page-realtime-dashboard/) |
| 260515-001 | Remover controle de edicao de status (Alterar status) da pagina publica | 2026-05-15 | n/a | [260515-001-remover-edicao-status-pagina-publica](./quick/260515-001-remover-edicao-status-pagina-publica/) |
| 260515-004 | Correcoes de seguranca: EFI webhook bypass + Athos timingSafeEqual | 2026-05-15 | 2ca9004, 470f652 | [260515-004-security-webhook-token-fixes](./quick/260515-004-security-webhook-token-fixes/) |
| 260518-001 | Upload de anexo Athos no Docker via pasta Samba montada (Tailscale) | 2026-05-20 | n/a | [260518-001-docker-smb-mount-fix](./quick/260518-001-docker-smb-mount-fix/) |
| 260521-bdu | Corrigir geracao de PDF: dist/ stale usava template inline antigo; recompilado com template v2 | 2026-05-21 | 024ebdf | [260521-bdu-corrigir-gera-o-de-pdf-com-template-novo](./quick/260521-bdu-corrigir-gera-o-de-pdf-com-template-novo/) |
| 260521-bkl | Remover redundancia de geracao de PDF no envio: usar PDF existente no MinIO, regenerar so se ausente | 2026-05-21 | c99af84 | [260521-bkl-remover-redund-ncia-de-gera-o-de-pdf-no-](./quick/260521-bkl-remover-redund-ncia-de-gera-o-de-pdf-no-/) |
| 260521-bqc | Refatorar status/page.tsx como Kanban 3 colunas (Aprovado/Em Producao/Pronto) com design system Bom Custo | 2026-05-21 | b3bd9b8 | [260521-bqc-refatorar-status-page-tsx-como-kanban-3-](./quick/260521-bqc-refatorar-status-page-tsx-como-kanban-3-/) |
| 260524-qaa | NFS-e: salvar linkNfse no banco, retornar no response, exibir botao download no modal | 2026-05-24 | 3e9022c | [260524-qaa-nfse-save-link-titulos](./quick/260524-qaa-nfse-save-link-titulos/) |
| 260524-qab | NFS-e: badge na tabela de titulos + botao cancelar emissao para re-emissao | 2026-05-24 | e4fcbab | [260524-qab-nfse-cancel-badge-titulos](./quick/260524-qab-nfse-cancel-badge-titulos/) |
| 260524-qac | NFS-e: cancelamento SOAP CancelarNfse ABRASF 2.04 + cancela todos com mesmo numero | 2026-05-24 | 5189653 | [260524-qac-nfse-soap-cancelar](./quick/260524-qac-nfse-soap-cancelar/) |
| 260526-kqd | Boleto EFI: itens gerados a partir de venda_item (1 item por produto/servico) seguindo logica NFS-e | 2026-05-26 | 5de96dc | [260526-kqd-arrumar-emissao-boleto-efi-criar-1-item-](./quick/260526-kqd-arrumar-emissao-boleto-efi-criar-1-item-/) |
