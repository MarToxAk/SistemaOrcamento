-- Migration: adicionar campos de aprovação pelo cliente ao modelo Quote

ALTER TABLE "Quote" ADD COLUMN "approvalToken" TEXT;
ALTER TABLE "Quote" ADD COLUMN "approvalRequestedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "approvalExpiresAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quote" ADD COLUMN "approvedAt" TIMESTAMP(3);
