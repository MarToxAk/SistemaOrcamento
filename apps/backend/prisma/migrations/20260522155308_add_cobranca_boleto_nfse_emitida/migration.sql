-- CreateTable
CREATE TABLE "CobrancaBoleto" (
    "id" SERIAL NOT NULL,
    "txidEfi" TEXT,
    "idclienteAthos" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "linkBoleto" TEXT,
    "pixPayload" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CobrancaBoleto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CobrancaBoletoTitulo" (
    "id" SERIAL NOT NULL,
    "cobrancaBoletoId" INTEGER NOT NULL,
    "idcontareceber" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "CobrancaBoletoTitulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseEmitida" (
    "id" SERIAL NOT NULL,
    "numeroNfse" TEXT,
    "numeroRps" INTEGER NOT NULL,
    "idclienteAthos" INTEGER NOT NULL,
    "valorServico" DECIMAL(12,2) NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NfseEmitida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseEmitidaTitulo" (
    "id" SERIAL NOT NULL,
    "nfseEmitidaId" INTEGER NOT NULL,
    "idcontareceber" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "NfseEmitidaTitulo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CobrancaBoletoTitulo_cobrancaBoletoId_idx" ON "CobrancaBoletoTitulo"("cobrancaBoletoId");

-- CreateIndex
CREATE INDEX "CobrancaBoletoTitulo_idcontareceber_idx" ON "CobrancaBoletoTitulo"("idcontareceber");

-- CreateIndex
CREATE INDEX "NfseEmitidaTitulo_nfseEmitidaId_idx" ON "NfseEmitidaTitulo"("nfseEmitidaId");

-- CreateIndex
CREATE INDEX "NfseEmitidaTitulo_idcontareceber_idx" ON "NfseEmitidaTitulo"("idcontareceber");

-- AddForeignKey
ALTER TABLE "CobrancaBoletoTitulo" ADD CONSTRAINT "CobrancaBoletoTitulo_cobrancaBoletoId_fkey" FOREIGN KEY ("cobrancaBoletoId") REFERENCES "CobrancaBoleto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseEmitidaTitulo" ADD CONSTRAINT "NfseEmitidaTitulo_nfseEmitidaId_fkey" FOREIGN KEY ("nfseEmitidaId") REFERENCES "NfseEmitida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
