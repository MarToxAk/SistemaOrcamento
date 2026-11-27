---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 19
retroactive: true
requirements-completed: [P55-PDF]
key-files:
  created:
    - apps/frontend/src/app/configuracoes/propostas/page.tsx
    - apps/frontend/src/app/configuracoes/propostas/dados-bancarios-form.tsx
    - apps/backend/src/modules/propostas/propostas.config.test.ts
  modified:
    - apps/backend/src/modules/propostas/dto/propostas.dto.ts
    - apps/backend/src/modules/propostas/propostas.service.ts
    - apps/backend/src/modules/propostas/propostas.controller.ts
    - apps/frontend/src/lib/propostas-rotas.ts
    - apps/frontend/scripts/checar-propostas-rotas.mjs
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
    - apps/backend/prisma/migrations/20261128130000_add_proposta_comercial/migration.sql
---

# Plano 55-19 (retroativo): dados bancarios fora do repositorio e pagina de configuracao

Executado pelo orquestrador fora do fluxo executor/verificador (registrado a pedido do usuario, 2026-11-28) e
revisado depois por gsd-code-reviewer (`55-19-REVIEW.md`).

## O que mudou
- Repositorio GitHub e PUBLICO: o seed de `PropostaConfig` cria agencia e conta vazias; documentos usam
  `<AGENCIA>`/`<CONTA>`; o historico ainda nao publicado foi reescrito antes do push (zero ocorrencias em
  qualquer ref remota). Backup local `backup/fase-53-55-antes-limpeza` guarda o historico original (nunca enviado).
- `GET`/`PATCH /api/propostas/config` (AdminOnly, throttle sensivel no PATCH), `SalvarConfigBancariaDto`
  (espacos aparados, agencia `^\d{3,6}(-?[0-9X])?$`, conta `^\d{3,13}(-?[0-9X])?$`, X maiusculo, CPF/CNPJ com
  digitos verificadores) e `obterConfigBancaria`/`salvarConfigBancaria` (upsert do id default).
- Pagina **Configuracoes > Dados bancarios (propostas)** (`/configuracoes/propostas`) com aviso de incompleto;
  proxy libera so GET e PATCH em `config`; roteiro troca o UPDATE manual pela tela.

## Verificacao
- `src/modules/propostas`: 264 testes passando (5 skipped por env), incluindo 21 casos de config.
- Suite completa do backend: so a falha conhecida da Fase 52 (`pesquisa-revogacao.service.test.ts`, data).
- `tsc` backend e frontend limpos; `checar-propostas-rotas.mjs` com os casos de config.
- Migration revalidada em Postgres descartavel (Proposta 30 colunas).

## Disposicao da revisao (55-19-REVIEW.md)
- CR-01 (historico local com o numero): **nao afeta o publicado** - os 4 commits existem so no branch local de
  backup; `git log --remotes -S<conta>` = 0. Acao: apagar o backup quando o usuario quiser.
- WR-01 / WR-02 (validacao fraca de documento, agencia e conta): **corrigido** (digitos verificadores de CPF/CNPJ,
  sem separador solto no fim, X normalizado), com testes.
- WR-03 (troca de conta sem trilha de auditoria): **adiado** - registrado como todo.
- IN-01..IN-03: aceitos (mensagens da tela, trim redundante, lacunas de teste de frontend).
- IN-04 (comentario alterado na migration muda o checksum): sem efeito - a migration nao foi aplicada em
  nenhum banco persistente (so no descartavel).

## Self-Check: PASSED
