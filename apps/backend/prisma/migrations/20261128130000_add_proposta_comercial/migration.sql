-- Fase 55 (D-04, D-06, D-09, D-16..D-21): proposta comercial para orgaos publicos.
-- Migracao ADITIVA e IDEMPOTENTE: so cria o enum PropostaStatus e as tabelas Proposta,
-- PropostaItem e PropostaConfig (com indices, FK e a linha default de PropostaConfig). Nenhuma
-- tabela existente e alterada ou apagada, e nada toca o Athos. Sem FK para o cliente do Athos
-- (banco externo).

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PropostaStatus') THEN
    CREATE TYPE "PropostaStatus" AS ENUM ('RASCUNHO', 'LANCANDO', 'ENVIADA', 'FECHADA', 'CANCELADA');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Proposta" (
    "id" TEXT NOT NULL,
    "status" "PropostaStatus" NOT NULL DEFAULT 'RASCUNHO',
    "idclienteAthos" INTEGER,
    "clienteSnapshot" JSONB,
    "clienteOverride" JSONB,
    "numeroProcesso" TEXT,
    "setorResponsavel" TEXT,
    "contatoEmail" TEXT,
    "contatoTelefone" TEXT,
    "validadeDias" INTEGER NOT NULL DEFAULT 1,
    "prazoEntregaDias" INTEGER NOT NULL DEFAULT 15,
    "observacao" TEXT,
    "assinanteNome" TEXT,
    "assinanteCargo" TEXT,
    "assinanteCpf" TEXT,
    "totalValor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "idorcamentoAthos" INTEGER,
    "senhaBalcao" INTEGER,
    "athosData" TEXT,
    "athosHora" TEXT,
    "lancandoEm" TIMESTAMP(3),
    "enviadaEm" TIMESTAMP(3),
    "fechadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "pdfObjectName" TEXT,
    "pdfGeradoEm" TIMESTAMP(3),
    "pdfSnapshot" JSONB,
    "duplicadaDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PropostaItem" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "idproduto" INTEGER NOT NULL,
    "nomeAthos" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricaoCurta" TEXT,
    "unidade" TEXT,
    "permiteFracionar" BOOLEAN NOT NULL DEFAULT true,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "precoBase" DECIMAL(12,3) NOT NULL,
    "ajusteTipo" TEXT,
    "ajusteValor" DECIMAL(12,3),
    "precoUnitario" DECIMAL(12,2) NOT NULL,
    "totalLinha" DECIMAL(12,2) NOT NULL,
    "custoUnitario" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropostaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PropostaConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bancoNome" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "documentoTitular" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropostaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Proposta_idorcamentoAthos_key" ON "Proposta"("idorcamentoAthos");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Proposta_status_atualizadoEm_idx" ON "Proposta"("status", "atualizadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Proposta_idclienteAthos_idx" ON "Proposta"("idclienteAthos");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PropostaItem_propostaId_sequencia_idx" ON "PropostaItem"("propostaId", "sequencia");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropostaItem_propostaId_fkey') THEN
    ALTER TABLE "PropostaItem" ADD CONSTRAINT "PropostaItem_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Seed (D-18): dados bancarios do Santander, registro unico. Sem segredo (agencia, conta e CNPJ
-- constam no documento enviado ao cliente).
INSERT INTO "PropostaConfig" ("id", "bancoNome", "agencia", "conta", "titular", "documentoTitular", "atualizadoEm")
VALUES ('default', 'Santander', '<AGENCIA>', '<CONTA>', 'Bom Custo Papelaria & Gráfica Rápida Ltda', '62.391.927/0001-57', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
