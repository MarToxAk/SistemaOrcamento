---
quick_id: 260524-qaa
slug: nfse-save-link-titulos
date: "2026-05-24"
status: in_progress
---

# Quick Task 260524-qaa: NFS-e save link, titulos, idvenda

## Goal
When a NFS-e is emitted via contas a receber:
1. Save the download link (linkNfse) from IIBR response to NfseEmitida table
2. Return the link in the API response
3. Show download link in the success modal state

## Tasks

- [ ] Add `linkNfse String?` to NfseEmitida Prisma model
- [ ] Create migration: `ALTER TABLE "NfseEmitida" ADD COLUMN IF NOT EXISTS "linkNfse" TEXT`
- [ ] CobrancaService.emitirNfse(): save linkNfse, return in response
- [ ] Frontend: add linkNfse to nfseResult type, show download button in success state

## Must-Haves
- linkNfse saved to DB after successful emission
- API returns linkNfse in response body
- Success modal shows download button (only when linkNfse is present)
- TSC 0 errors
