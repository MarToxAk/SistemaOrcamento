import "reflect-metadata";

import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { CobrancaNotasController } from "./cobranca-notas.controller";
import { CobrancaNotasService, LIMITE_LISTA_NFSE } from "./cobranca-notas.service";
import { ListarNotasQueryDto } from "./dto/listar-notas.query.dto";

// Colaboradores falsos: nenhuma rede, nenhum Prisma, nenhum Athos (Fase 47, plano 03, D-01/D-09).
function montar() {
  const prisma = {
    nfseEmitida: { findMany: jest.fn() },
    cobrancaBoleto: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cobrancaService = {};
  const athos = {
    buscarNomesClientes: jest.fn().mockResolvedValue([]),
    buscarNfeResumoPorTitulos: jest.fn().mockResolvedValue([]),
  };
  const danfe = {};
  const service = new CobrancaNotasService(prisma as any, cobrancaService as any, athos as any, danfe as any);
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { service, prisma, athos };
}

function linhaNfse(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    numeroNfse: String(200 + id),
    idclienteAthos: 12,
    valorServico: "150.50",
    dataEmissao: new Date("2026-11-03T15:00:00.000Z"),
    linkNfse: null,
    titulos: [{ idcontareceber: 1000 + id }],
    ...extra,
  };
}

describe("CobrancaNotasService.listarNotas - NFS-e (D-01, D-09, D-04)", () => {
  it("L1. situacao do XML (salvo/link/indisponivel), sem carregar o texto do XML", async () => {
    const { service, prisma, athos } = montar();
    prisma.nfseEmitida.findMany
      .mockResolvedValueOnce([
        linhaNfse(74),
        linhaNfse(75, { linkNfse: "https://exemplo/75" }),
        linhaNfse(76),
      ])
      .mockResolvedValueOnce([{ id: 74 }]);
    athos.buscarNomesClientes.mockResolvedValue([{ idcliente: 12, nome_cliente: "Cliente Teste" }]);

    const r = await service.listarNotas({});

    expect(r.nfse.map((n) => n.xml)).toEqual(["salvo", "link", "indisponivel"]);
    expect(r.nfse[0]).toEqual({
      tipo: "NFS-e",
      id: 74,
      numero: "274",
      idclienteAthos: 12,
      nomeCliente: "Cliente Teste",
      valor: 150.5,
      dataEmissao: "2026-11-03T15:00:00.000Z",
      titulos: [1074],
      xml: "salvo",
    });

    const primeira = prisma.nfseEmitida.findMany.mock.calls[0][0];
    expect(primeira.select).toBeDefined();
    expect(Object.keys(primeira.select)).not.toContain("xmlNacional");
    expect(primeira.orderBy).toEqual({ dataEmissao: "desc" });
    expect(primeira.take).toBe(LIMITE_LISTA_NFSE + 1);
    expect(primeira.take).toBe(501);

    const segunda = prisma.nfseEmitida.findMany.mock.calls[1][0];
    expect(segunda.where).toEqual({ id: { in: [74, 75, 76] }, xmlNacional: { not: null } });
    expect(segunda.select).toEqual({ id: true });
  });

  it("L2. filtros de cliente e periodo viram meia-noite de Sao Paulo", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findMany.mockResolvedValue([]);

    await service.listarNotas({ idclienteAthos: 12, de: "2026-11-01", ate: "2026-11-13" });

    const where = prisma.nfseEmitida.findMany.mock.calls[0][0].where;
    expect(where.idclienteAthos).toBe(12);
    expect(where.dataEmissao.gte).toEqual(new Date("2026-11-01T03:00:00.000Z"));
    expect(where.dataEmissao.lt).toEqual(new Date("2026-11-14T03:00:00.000Z"));
  });

  it("L2b. sem filtros: where vazio; so 'de' ou so 'ate' montam um lado do intervalo", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findMany.mockResolvedValue([]);

    await service.listarNotas({});
    await service.listarNotas({ de: "2026-11-01" });
    await service.listarNotas({ ate: "2026-12-31" });

    expect(prisma.nfseEmitida.findMany.mock.calls[0][0].where).toEqual({});
    expect(prisma.nfseEmitida.findMany.mock.calls[1][0].where.dataEmissao).toEqual({
      gte: new Date("2026-11-01T03:00:00.000Z"),
    });
    // Virada de ano: 31/12 -> lt 01/01 03:00Z.
    expect(prisma.nfseEmitida.findMany.mock.calls[2][0].where.dataEmissao).toEqual({
      lt: new Date("2027-01-01T03:00:00.000Z"),
    });
  });

  it("L2c. data inexistente (2026-13-45) vira BadRequestException", async () => {
    const { service } = montar();
    await expect(service.listarNotas({ de: "2026-13-45" })).rejects.toThrow("Data inválida");
  });

  it("L3. 501 linhas: devolve 500 e truncado true; a 2a consulta usa so os 500", async () => {
    const { service, prisma } = montar();
    const linhas = Array.from({ length: 501 }, (_, i) => linhaNfse(i + 1));
    prisma.nfseEmitida.findMany.mockResolvedValueOnce(linhas).mockResolvedValueOnce([]);

    const r = await service.listarNotas({});

    expect(r.nfse).toHaveLength(500);
    expect(r.truncado).toBe(true);
    expect(prisma.nfseEmitida.findMany.mock.calls[1][0].where.id.in).toHaveLength(500);
  });

  it("L3b. ate 500 linhas: truncado false", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findMany
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => linhaNfse(i + 1)))
      .mockResolvedValueOnce([]);

    const r = await service.listarNotas({});

    expect(r.nfse).toHaveLength(500);
    expect(r.truncado).toBe(false);
  });

  it("L4. buscarNomesClientes rejeita: nome 'Cliente #12', sem lancar", async () => {
    const { service, prisma, athos } = montar();
    prisma.nfseEmitida.findMany.mockResolvedValueOnce([linhaNfse(74)]).mockResolvedValueOnce([]);
    athos.buscarNomesClientes.mockRejectedValue(new Error("athos fora"));

    const r = await service.listarNotas({});

    expect(r.nfse[0].nomeCliente).toBe("Cliente #12");
  });

  it("L5. lista vazia: nao faz a 2a consulta de NFS-e; nfe [] e avisoNfe null", async () => {
    const { service, prisma } = montar();
    prisma.nfseEmitida.findMany.mockResolvedValueOnce([]);

    const r = await service.listarNotas({});

    expect(r).toEqual({ nfse: [], nfe: [], truncado: false, avisoNfe: null });
    expect(prisma.nfseEmitida.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("CobrancaNotasController.listar (C3)", () => {
  it("C3. rota GET 'notas' delega para listarNotas com a query", async () => {
    expect(Reflect.getMetadata(PATH_METADATA, CobrancaNotasController.prototype.listar)).toBe("notas");
    expect(Reflect.getMetadata(METHOD_METADATA, CobrancaNotasController.prototype.listar)).toBe(
      RequestMethod.GET,
    );
    const notas = { listarNotas: jest.fn().mockResolvedValue({ nfse: [] }) };
    const controller = new CobrancaNotasController(notas as any);
    const query = { idclienteAthos: 12 } as ListarNotasQueryDto;

    await controller.listar(query);

    expect(notas.listarNotas).toHaveBeenCalledWith(query);
  });

  describe("ValidationPipe (opcoes do main.ts) sobre ListarNotasQueryDto", () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const meta = { type: "query" as const, metatype: ListarNotasQueryDto };

    it("converte idclienteAthos '12' em 12 e aceita datas AAAA-MM-DD", async () => {
      const r = (await pipe.transform({ idclienteAthos: "12", de: "2026-11-01", ate: "2026-11-13" }, meta)) as any;
      expect(r.idclienteAthos).toBe(12);
      expect(r.de).toBe("2026-11-01");
      expect(r.ate).toBe("2026-11-13");
    });

    it("aceita query vazia", async () => {
      await expect(pipe.transform({}, meta)).resolves.toBeDefined();
    });

    it("rejeita idclienteAthos 'abc'", async () => {
      await expect(pipe.transform({ idclienteAthos: "abc" }, meta)).rejects.toThrow();
    });

    it("rejeita idclienteAthos 0 e acima do maximo", async () => {
      await expect(pipe.transform({ idclienteAthos: "0" }, meta)).rejects.toThrow();
      await expect(pipe.transform({ idclienteAthos: "2147483648" }, meta)).rejects.toThrow();
    });

    it("rejeita data no formato DD/MM/AAAA", async () => {
      await expect(pipe.transform({ de: "13/11/2026" }, meta)).rejects.toThrow();
    });

    it("rejeita parametro desconhecido", async () => {
      await expect(pipe.transform({ outro: "x" }, meta)).rejects.toThrow();
    });
  });
});
