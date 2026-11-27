import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "./athos.service";

const mockPrismaService = {} as unknown as PrismaService;

// Seguranca: pg e mockado por completo; nenhum teste alcanca o Athos.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn(), end: jest.fn().mockResolvedValue(undefined) };
  const mPool = { connect: jest.fn(), on: jest.fn() };
  return { Pool: jest.fn(() => mPool), Client: jest.fn(() => mClient), __mClient: mClient, __mPool: mPool };
});

jest.mock("node:fs/promises", () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };
const mPool = pgMock.__mPool as { connect: jest.Mock };

const PROIBIDOS = ["Centro", "S/N", "SP", "3520400"];

function linhaBase(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idcliente: 10,
    nome_fisico: null,
    nomefantasia: null,
    razaosocial: null,
    cpf: null,
    cnpj: null,
    tipologradouro: null,
    logradouro: null,
    end_numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    emailcliente: null,
    dddtelefoneempresa: null,
    telefoneempresa: null,
    ...extra,
  };
}

describe("AthosService cliente para proposta (Fase 55)", () => {
  let service: AthosService;

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = "localhost";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "user";
    process.env.ATHOS_PG_PASS = "pass";
    process.env.ATHOS_PG_PORT = "5432";
  });

  beforeEach(async () => {
    mClient.query.mockReset();
    mClient.release.mockReset();
    mPool.connect.mockReset();
    mPool.connect.mockResolvedValue(mClient);
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthosService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();
    service = module.get<AthosService>(AthosService);
  });

  it("(a) pessoa juridica devolve a razao social real mesmo com nome fantasia preenchido", async () => {
    mClient.query.mockResolvedValueOnce({
      rows: [
        linhaBase({
          razaosocial: "ORGAO MUNICIPAL X",
          nomefantasia: "PREFEITURA X",
          cnpj: "12.345.678/0001-90",
          tipologradouro: "Rua",
          logradouro: "das Flores",
          end_numero: "100",
          complemento: "Sala 2",
          bairro: "Centro",
          cidade: "Ilhabela",
          uf: "SP",
          cep: "11630-000",
          emailcliente: "contato@x.gov.br",
          dddtelefoneempresa: "12",
          telefoneempresa: "33961234",
        }),
      ],
    });
    const r = await service.buscarClienteParaProposta(10);
    expect(r).toEqual({
      idcliente: 10,
      tipoPessoa: "juridico",
      razaoSocial: "ORGAO MUNICIPAL X",
      nomeFantasia: "PREFEITURA X",
      documento: "12345678000190",
      endereco: {
        logradouro: "Rua das Flores",
        numero: "100",
        complemento: "Sala 2",
        bairro: "Centro",
        cidade: "Ilhabela",
        uf: "SP",
        cep: "11630000",
      },
      email: "contato@x.gov.br",
      telefone: "1233961234",
    });
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("(b) endereco sem numero, bairro e uf devolve null e nenhum fallback proibido", async () => {
    mClient.query.mockResolvedValueOnce({
      rows: [
        linhaBase({
          razaosocial: "EMPRESA Y",
          cnpj: "11222333000181",
          logradouro: "Avenida Brasil",
          cidade: "Ilhabela",
          cep: "11630000",
        }),
      ],
    });
    const r = await service.buscarClienteParaProposta(10);
    expect(r?.endereco).toEqual({
      logradouro: "Avenida Brasil",
      numero: null,
      complemento: null,
      bairro: null,
      cidade: "Ilhabela",
      uf: null,
      cep: "11630000",
    });
    const serializado = JSON.stringify(r);
    for (const proibido of PROIBIDOS) {
      expect(serializado).not.toContain(proibido);
    }
  });

  it("(c) cliente inexistente devolve null", async () => {
    mClient.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.buscarClienteParaProposta(999)).resolves.toBeNull();
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("(c2) id invalido devolve null sem consultar o banco", async () => {
    await expect(service.buscarClienteParaProposta(0)).resolves.toBeNull();
    await expect(service.buscarClienteParaProposta(Number.NaN)).resolves.toBeNull();
    expect(mPool.connect).not.toHaveBeenCalled();
  });

  it("(d) telefone com DDD nulo e numero preenchido nao produz o texto null", async () => {
    mClient.query.mockResolvedValueOnce({
      rows: [linhaBase({ razaosocial: "EMPRESA Z", telefoneempresa: "33961234", dddtelefoneempresa: null })],
    });
    const r = await service.buscarClienteParaProposta(10);
    expect(r?.telefone).toBe("33961234");
    expect(JSON.stringify(r)).not.toContain("null33961234");
    expect(String(r?.telefone)).not.toMatch(/null/i);
  });

  it("(d2) telefone sem numero vira null e endereco totalmente ausente vira null", async () => {
    mClient.query.mockResolvedValueOnce({
      rows: [linhaBase({ razaosocial: "EMPRESA Z", dddtelefoneempresa: "12", telefoneempresa: "  " })],
    });
    const r = await service.buscarClienteParaProposta(10);
    expect(r?.telefone).toBeNull();
    expect(r?.endereco).toBeNull();
    expect(r?.email).toBeNull();
  });

  it("pessoa fisica usa o nome como razao social e o cpf como documento", async () => {
    mClient.query.mockResolvedValueOnce({
      rows: [linhaBase({ nome_fisico: "MARIA DA SILVA", cpf: "123.456.789-09" })],
    });
    const r = await service.buscarClienteParaProposta(10);
    expect(r).toMatchObject({
      tipoPessoa: "fisico",
      razaoSocial: "MARIA DA SILVA",
      nomeFantasia: null,
      documento: "12345678909",
    });
  });

  it("(e) o SQL emitido e parametrizado e nao usa LATERAL, FILTER nem jsonb", async () => {
    mClient.query.mockResolvedValueOnce({ rows: [linhaBase({ razaosocial: "X" })] });
    await service.buscarClienteParaProposta(10);
    expect(mClient.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mClient.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/\bLATERAL\b|\bFILTER\b|jsonb/i);
    expect(sql).toMatch(/DISTINCT ON \(idcliente\)/);
    expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/i);
    expect(params).toEqual([10]);
  });

  it("erro de banco vira InternalServerErrorException e libera o client", async () => {
    mClient.query.mockRejectedValueOnce(new Error("boom"));
    await expect(service.buscarClienteParaProposta(10)).rejects.toMatchObject({ status: 500 });
    expect(mClient.release).toHaveBeenCalledTimes(1);
  });

  it("(f) buscarClientes devolve razaoSocial e preserva nome (nomefantasia primeiro) e os fallbacks anteriores", async () => {
    mClient.query
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          linhaBase({
            razaosocial: "ORGAO MUNICIPAL X",
            nomefantasia: "PREFEITURA X",
            cnpj: "12345678000190",
            logradouro: "das Flores",
            tipologradouro: "Rua",
          }),
        ],
      });
    const r = await service.buscarClientes({ idcliente: 10 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].razaoSocial).toBe("ORGAO MUNICIPAL X");
    expect(r.items[0].nome).toBe("PREFEITURA X");
    expect(r.items[0].endereco).toEqual({
      logradouro: "Rua das Flores",
      numero: "S/N",
      bairro: "Centro",
      cep: "",
      codigoMunicipio: "3520400",
      uf: "SP",
    });
  });

  it("(f2) buscarClientes de pessoa fisica usa o nome como razaoSocial", async () => {
    mClient.query
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({ rows: [linhaBase({ nome_fisico: "MARIA DA SILVA", cpf: "12345678909" })] });
    const r = await service.buscarClientes({ idcliente: 10 });
    expect(r.items[0].razaoSocial).toBe("MARIA DA SILVA");
    expect(r.items[0].nome).toBe("MARIA DA SILVA");
    expect(r.items[0].endereco).toBeNull();
  });
});
