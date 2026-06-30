# SUMMARY.md — Phase 15: Corrigir encoding NFS-e e proxy API

**Milestone:** v1.5
**Phase:** 15
**Status:** Complete
**Date:** 2026-05-04

## Entregue
- Corrigido o mojibake em apps/backend/src/modules/integrations/nfse/nfse.service.ts, incluindo descricoes de servico, logs, comentarios e mensagens de erro ligadas ao fluxo de NFS-e.
- Corrigido o proxy Next.js em apps/frontend/src/app/api/quotes/[id]/nfse/route.ts para ler o body do POST e repassa-lo ao backend com Content-Type application/json.

## Validacao
- Sem erros de editor nos arquivos tocados.
- Checagem textual confirmou remocao das sequencias corrompidas tratadas no fluxo de emissao.

## Requisitos atendidos
- NFSFIX-01
- NFSFIX-02

## Proximo passo
- Planejar e executar a fase 16 para expor a UI de desconto no modal de emissao NFS-e.
