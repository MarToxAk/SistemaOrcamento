/**
 * Teste HTTP do tracer da Fase 55 (plano 55-06): guards reais (InternalAuthGuard global e AdminAuthGuard via
 * @AdminOnly), ValidationPipe igual ao main.ts, Prisma em memoria e Athos simulado.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { AthosService } from "../integrations/athos/athos.service";
import { AthosOrcamentoService } from "../integrations/athos/athos-orcamento.service";
import { PrismaService } from "../database/prisma.service";
import { InternalAuthGuard } from "../security/internal-auth.guard";
import { criarPrismaPropostaFake } from "./__fixtures__/prisma-proposta.fake";
import { PropostasController } from "./propostas.controller";
import { PropostasService } from "./propostas.service";

const CHAVE_INTERNA = "chave-interna-teste-55";
const CHAVE_ADMIN = "chave-admin-teste-55";

describe("PropostasController (HTTP, tracer 55-06)", () => {
  let app: INestApplication;
  let base = "";
  const envAnterior: Record<string, string | undefined> = {};
  const obterProdutoProposta = jest.fn();
  const buscarProdutosProposta = jest.fn();
  const buscarClienteParaProposta = jest.fn();

  async function chamar(
    metodo: string,
    caminho: string,
    corpo?: unknown,
    chaves: { interna?: string | null; admin?: string | null } = { interna: CHAVE_INTERNA, admin: CHAVE_ADMIN },
  ) {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (chaves.interna) h["x-internal-api-key"] = chaves.interna;
    if (chaves.admin) h["x-admin-api-key"] = chaves.admin;
    const res = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: h,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  beforeAll(async () => {
    for (const k of ["INTERNAL_API_KEY", "ADMIN_API_KEY"]) envAnterior[k] = process.env[k];
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    process.env.ADMIN_API_KEY = CHAVE_ADMIN;
    const modulo = await Test.createTestingModule({
      controllers: [PropostasController],
      providers: [
        PropostasService,
        { provide: PrismaService, useValue: criarPrismaPropostaFake() },
        { provide: AthosOrcamentoService, useValue: { obterProdutoProposta, buscarProdutosProposta } },
        { provide: AthosService, useValue: { buscarClienteParaProposta } },
        { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const [k, v] of Object.entries(envAnterior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    obterProdutoProposta.mockReset().mockResolvedValue({
      idproduto: 60,
      descricao: "CANETA ESFEROGRAFICA AZUL",
      descricaoCurta: "Caneta azul",
      marca: "BIC",
      referencia: null,
      codigoBarra: null,
      preco: "3.456",
      emPromocao: false,
      estoqueLoja: "10.000",
      estoqueDeposito: "0.000",
      permiteFracionar: true,
      unidade: "UN",
      custoUnitario: "1.000",
    });
  });

  it("sem a chave admin -> 401 e nada e criado", async () => {
    const r = await chamar("POST", "/propostas", {}, { interna: CHAVE_INTERNA, admin: null });
    expect(r.status).toBe(401);
  });

  it("sem a chave interna -> 401", async () => {
    const r = await chamar("POST", "/propostas", {}, { interna: null, admin: CHAVE_ADMIN });
    expect(r.status).toBe(401);
  });

  it("cria rascunho, adiciona item 3,456 (vira 3,46; total 6,92) e le o detalhe", async () => {
    const criado = await chamar("POST", "/propostas", {});
    expect(criado.status).toBe(201);
    expect(criado.json).toMatchObject({
      status: "RASCUNHO",
      validadeDias: 1,
      prazoEntregaDias: 15,
      total: "0.00",
      itens: [],
    });
    const id = criado.json.id as string;

    const adicionado = await chamar("POST", `/propostas/${id}/itens`, { idproduto: 60, quantidade: 2 });
    expect(adicionado.status).toBe(201);
    expect(adicionado.json.total).toBe("6.92");
    expect(adicionado.json.itens).toHaveLength(1);
    expect(adicionado.json.itens[0]).toMatchObject({
      sequencia: 1,
      idproduto: 60,
      nomeAthos: "CANETA ESFEROGRAFICA AZUL",
      nome: "CANETA ESFEROGRAFICA AZUL",
      unidade: "UN",
      quantidade: "2.000",
      precoBase: "3.456",
      ajuste: null,
      precoUnitario: "3.46",
      totalLinha: "6.92",
      custoUnitario: "1.000",
      abaixoDoCusto: false,
    });
    expect(adicionado.json.itens[0].margemPercentual).toBe("71.098");
    expect(obterProdutoProposta).toHaveBeenCalledWith(60);

    const lido = await chamar("GET", `/propostas/${id}`);
    expect(lido.status).toBe(200);
    expect(lido.json).toEqual(adicionado.json);
  });

  it("preco final enviado pelo navegador e recusado (whitelist) e nada e gravado", async () => {
    const criado = await chamar("POST", "/propostas", {});
    const r = await chamar("POST", `/propostas/${criado.json.id}/itens`, { idproduto: 60, quantidade: 1, precoUnitario: 0.01 });
    expect(r.status).toBe(400);
    const lido = await chamar("GET", `/propostas/${criado.json.id}`);
    expect(lido.json.itens).toHaveLength(0);
  });

  it("produto inexistente -> 422 PRODUTO_INEXISTENTE", async () => {
    obterProdutoProposta.mockResolvedValue(null);
    const criado = await chamar("POST", "/propostas", {});
    const r = await chamar("POST", `/propostas/${criado.json.id}/itens`, { idproduto: 999, quantidade: 1 });
    expect(r.status).toBe(422);
    expect(r.json.codigo).toBe("PRODUTO_INEXISTENTE");
  });

  it("proposta inexistente -> 404 PROPOSTA_NAO_ENCONTRADA", async () => {
    const r = await chamar("GET", "/propostas/6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11");
    expect(r.status).toBe(404);
    expect(r.json.codigo).toBe("PROPOSTA_NAO_ENCONTRADA");
  });
});
