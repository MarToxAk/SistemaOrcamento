import zlib from "node:zlib";

import { NfseNacionalDistribuicaoService } from "./nfse-nacional-distribuicao.service";

jest.mock(
  "nfse-node/cliente",
  () => ({ criarClienteSefin: jest.fn(), descompactarGZipBase64: jest.fn() }),
  { virtual: true },
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { criarClienteSefin } = require("nfse-node/cliente") as { criarClienteSefin: jest.Mock };

function nfseXml(n: string, cnpj: string): string {
  return `<NFSe versao="1.01"><infNFSe Id="NFS${n}"><nNFSe>${n}</nNFSe><emit><CNPJ>${cnpj}</CNPJ></emit></infNFSe></NFSe>`;
}

function makeService() {
  const prisma = {
    nfseDfeSync: { findUnique: jest.fn(), upsert: jest.fn() },
    nfseEmitida: { updateMany: jest.fn() },
  };
  const service = Object.create(NfseNacionalDistribuicaoService.prototype) as NfseNacionalDistribuicaoService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn() };
  (service as any).config = {
    get: (k: string) =>
      ({
        NFSE_NACIONAL_CERT_PEM: "CERT",
        NFSE_NACIONAL_KEY_PEM: "KEY",
        NFSE_NACIONAL_AMBIENTE: "producao",
        NFSE_NACIONAL_CNPJ_PRESTADOR: "62391927000157",
      } as Record<string, string>)[k],
  };
  (service as any).prisma = prisma;
  return { service, prisma };
}

describe("NfseNacionalDistribuicaoService.sincronizar", () => {
  let clienteFake: { baixarDfe: jest.Mock; consultarNfse: jest.Mock };

  beforeEach(() => {
    clienteFake = { baixarDfe: jest.fn(), consultarNfse: jest.fn() };
    criarClienteSefin.mockReset();
    criarClienteSefin.mockReturnValue(clienteFake);
  });

  it("1. backfill feliz + para em E2220; ignora doc de tomador e EVENTO", async () => {
    const { service, prisma } = makeService();
    prisma.nfseDfeSync.findUnique.mockResolvedValue(null);
    clienteFake.baixarDfe
      .mockResolvedValueOnce({
        statusProcessamento: "DOCUMENTOS_LOCALIZADOS",
        documentos: [
          { nsu: 1, chaveAcesso: "CHV239", tipoDocumento: "NFSE", xml: nfseXml("239", "62391927000157") },
          { nsu: 2, chaveAcesso: "CHV_T", tipoDocumento: "NFSE", xml: nfseXml("500", "56096886000173") },
          { nsu: 3, chaveAcesso: "EV", tipoDocumento: "EVENTO", xml: "<evt/>" },
        ],
      })
      .mockRejectedValueOnce(Object.assign(new Error("sefin"), { status: 404, erros: [{ codigo: "E2220" }] }));
    prisma.nfseEmitida.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });

    const resumo = await service.sincronizar();

    expect(resumo.atualizadas).toBe(1);
    expect(resumo.numerosAtualizados).toEqual(["239"]);
    expect(resumo.nfseDocs).toBe(2);
    expect(resumo.parouPor).toBe("E2220");
    expect(resumo.lotesProcessados).toBe(1);

    expect(prisma.nfseEmitida.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.nfseEmitida.updateMany.mock.calls[0][0];
    expect(call.where.numeroNfse).toBe("239");
    expect(call.where.OR).toEqual(expect.arrayContaining([{ chaveAcesso: null }, { xmlNacional: null }]));
    expect(call.data.chaveAcesso).toBe("NFS239");
    expect(call.data.xmlNacional).toBe(nfseXml("239", "62391927000157"));

    expect(prisma.nfseDfeSync.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ ultimoNsu: 3 }) }),
    );
  });

  it("2. para em NENHUM_DOCUMENTO_LOCALIZADO; retoma do ultimoNsu + 1", async () => {
    const { service, prisma } = makeService();
    prisma.nfseDfeSync.findUnique.mockResolvedValue({ id: 1, ultimoNsu: 10 });
    clienteFake.baixarDfe.mockResolvedValueOnce({ statusProcessamento: "NENHUM_DOCUMENTO_LOCALIZADO", documentos: [] });

    const resumo = await service.sincronizar();

    expect(resumo.parouPor).toBe("NENHUM_DOCUMENTO_LOCALIZADO");
    expect(resumo.atualizadas).toBe(0);
    expect(clienteFake.baixarDfe).toHaveBeenCalledTimes(1);
    expect(clienteFake.baixarDfe.mock.calls[0][0]).toBe(11);
  });

  it("3. idempotente: doc ja backfillado (updateMany.count=0) nao conta como atualizado", async () => {
    const { service, prisma } = makeService();
    prisma.nfseDfeSync.findUnique.mockResolvedValue(null);
    clienteFake.baixarDfe
      .mockResolvedValueOnce({
        statusProcessamento: "DOCUMENTOS_LOCALIZADOS",
        documentos: [{ nsu: 1, chaveAcesso: "CHV239", tipoDocumento: "NFSE", xml: nfseXml("239", "62391927000157") }],
      })
      .mockRejectedValueOnce(Object.assign(new Error("sefin"), { status: 404, erros: [{ codigo: "E2220" }] }));
    prisma.nfseEmitida.updateMany.mockResolvedValue({ count: 0 });

    const resumo = await service.sincronizar();

    expect(resumo.atualizadas).toBe(0);
    expect(resumo.numerosAtualizados).toEqual([]);
    expect(resumo.ignorados).toBeGreaterThan(0);
  });

  it("4. erro nao-E2220 propaga", async () => {
    const { service, prisma } = makeService();
    prisma.nfseDfeSync.findUnique.mockResolvedValue(null);
    clienteFake.baixarDfe.mockRejectedValueOnce(Object.assign(new Error("500"), { status: 500 }));

    await expect(service.sincronizar()).rejects.toThrow(/500/);
  });

  it("5. consultarXmlPorChave descompacta o gzip base64; rejeita se faltar nfseXmlGZipB64", async () => {
    const { service } = makeService();
    const b64 = zlib.gzipSync(Buffer.from("<NFSe>x</NFSe>")).toString("base64");
    clienteFake.consultarNfse.mockResolvedValueOnce({ status: 200, corpo: { nfseXmlGZipB64: b64 } });

    const xml = await service.consultarXmlPorChave("CHV239");
    expect(xml).toBe("<NFSe>x</NFSe>");

    clienteFake.consultarNfse.mockResolvedValueOnce({ status: 200, corpo: {} });
    await expect(service.consultarXmlPorChave("CHV239")).rejects.toThrow(/nfseXmlGZipB64/);
  });
});
