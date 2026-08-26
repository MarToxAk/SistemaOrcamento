-- Emissao automatica de NFS-e (SOAP iiBrasil) descontinuada pela prefeitura.
-- A partir de agora a nota e emitida manualmente fora do sistema e o XML
-- (padrao nacional NBS) e anexado aqui. numeroRps deixa de ser obrigatorio.
ALTER TABLE "NfseEmitida" ALTER COLUMN "numeroRps" DROP NOT NULL;
ALTER TABLE "NfseEmitida" ADD COLUMN "chaveAcesso" TEXT;
ALTER TABLE "NfseEmitida" ADD COLUMN "arquivoPath" TEXT;
ALTER TABLE "NfseEmitida" ADD COLUMN "arquivoNome" TEXT;
