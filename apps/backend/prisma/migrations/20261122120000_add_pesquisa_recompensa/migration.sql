-- Fase 52 (D-03): CSAT com recompensa e convite do Google.
-- Migracao ADITIVA e IDEMPOTENTE: so cria o enum CupomStatus e as tabelas PesquisaConfig,
-- PesquisaSatisfacao, CupomRecompensa e PesquisaSupressao. Banco do Sistema apenas; nenhuma
-- alteracao no Athos e nenhuma tabela existente e alterada ou apagada.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CupomStatus') THEN
    CREATE TYPE "CupomStatus" AS ENUM ('EMITIDO', 'USADO', 'EXPIRADO', 'CANCELADO');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PesquisaConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "percentualDesconto" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "tetoDesconto" DECIMAL(12,2) NOT NULL DEFAULT 5,
    "compraMinima" DECIMAL(12,2) NOT NULL DEFAULT 30,
    "validadeCupomDias" INTEGER NOT NULL DEFAULT 30,
    "validadeLinkDias" INTEGER NOT NULL DEFAULT 7,
    "intervaloDias" INTEGER NOT NULL DEFAULT 90,
    "tetoMensal" DECIMAL(12,2) NOT NULL DEFAULT 300,
    "prefixoCupom" TEXT NOT NULL DEFAULT 'BC',
    "linkGoogle" TEXT,
    "varianteVisual" TEXT NOT NULL DEFAULT 'AB',
    "textoFechamento" TEXT NOT NULL,
    "textoSemRecompensa" TEXT NOT NULL,
    "textoPosResposta" TEXT NOT NULL,
    "textoConviteGoogle" TEXT NOT NULL,
    "paginaTitulo" TEXT NOT NULL,
    "paginaSubtitulo" TEXT NOT NULL,
    "paginaObrigadoSemRecompensa" TEXT NOT NULL,
    "paginaGoogleTitulo" TEXT NOT NULL,
    "paginaGoogleCorpo" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT,

    CONSTRAINT "PesquisaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PesquisaSatisfacao" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "conversationId" BIGINT,
    "conversationUuid" TEXT,
    "contactId" BIGINT,
    "telefone" TEXT,
    "customerId" TEXT,
    "variante" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CRIADA',
    "chatwootCsat" TEXT NOT NULL DEFAULT 'AGUARDANDO_MENSAGEM',
    "nota" INTEGER,
    "comentario" VARCHAR(500),
    "envioConviteStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
    "envioConviteReservadoEm" TIMESTAMP(3),
    "tentativasEnvio" INTEGER NOT NULL DEFAULT 0,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadaEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "respondidaEm" TIMESTAMP(3),
    "anonimizadaEm" TIMESTAMP(3),
    "revogadaEm" TIMESTAMP(3),

    CONSTRAINT "PesquisaSatisfacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CupomRecompensa" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "pesquisaId" TEXT NOT NULL,
    "telefone" TEXT,
    "percentual" DECIMAL(5,2) NOT NULL,
    "teto" DECIMAL(12,2) NOT NULL,
    "compraMinima" DECIMAL(12,2) NOT NULL,
    "status" "CupomStatus" NOT NULL DEFAULT 'EMITIDO',
    "validadeAte" TIMESTAMP(3) NOT NULL,
    "envioCupomStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
    "envioCupomReservadoEm" TIMESTAMP(3),
    "valorCompra" DECIMAL(12,2),
    "descontoAplicado" DECIMAL(12,2),
    "usadoEm" TIMESTAMP(3),
    "usadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CupomRecompensa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PesquisaSupressao" (
    "telefone" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'SAIR',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesquisaSupressao_pkey" PRIMARY KEY ("telefone")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PesquisaSatisfacao_token_key" ON "PesquisaSatisfacao"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PesquisaSatisfacao_conversationId_idx" ON "PesquisaSatisfacao"("conversationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PesquisaSatisfacao_telefone_criadaEm_idx" ON "PesquisaSatisfacao"("telefone", "criadaEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PesquisaSatisfacao_respondidaEm_idx" ON "PesquisaSatisfacao"("respondidaEm");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CupomRecompensa_codigo_key" ON "CupomRecompensa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CupomRecompensa_pesquisaId_key" ON "CupomRecompensa"("pesquisaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CupomRecompensa_telefone_criadoEm_idx" ON "CupomRecompensa"("telefone", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CupomRecompensa_status_usadoEm_idx" ON "CupomRecompensa"("status", "usadoEm");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CupomRecompensa_pesquisaId_fkey') THEN
    ALTER TABLE "CupomRecompensa" ADD CONSTRAINT "CupomRecompensa_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "PesquisaSatisfacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
