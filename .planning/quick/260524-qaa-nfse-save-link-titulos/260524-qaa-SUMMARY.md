---
quick_id: 260524-qaa
slug: nfse-save-link-titulos
date: "2026-05-24"
status: complete
commit: 3e9022c
---

# Quick Task 260524-qaa: NFS-e save link, titulos, idvenda

## What was done

1. **Schema** — `linkNfse String?` adicionado ao model `NfseEmitida` no `schema.prisma`
2. **Migration** — `20260524000000_add_nfse_emitida_link/migration.sql` criada com `ALTER TABLE "NfseEmitida" ADD COLUMN IF NOT EXISTS "linkNfse" TEXT`
3. **Backend** — `CobrancaService.emitirNfse()` salva `linkNfse` via `$executeRaw` após o `create()` (workaround: DLL Prisma estava bloqueada por processo ativo) e retorna `linkNfse` na resposta
4. **Frontend** — `nfseResult` type atualizado com `linkNfse?: string | null`; estado success do modal mostra botão "Baixar NFS-e PDF" quando `linkNfse` está disponível

## TSC
- Backend: 0 erros
- Frontend: 0 erros

## Note
`prisma generate` precisa ser rodado quando o processo que bloqueia o DLL for liberado.
O `$executeRaw` garante que o link é salvo mesmo sem regenerar o client.
