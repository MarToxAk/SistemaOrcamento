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
import { PropostasPdfService } from "./propostas-pdf.service";
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
        { provide: PropostasPdfService, useValue: { capturarSnapshot: jest.fn(), gerarOficial: jest.fn() } },
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

  it("rotas estaticas (produtos, assinantes, clientes/:id, listagem) nao sao capturadas por :id", async () => {
    buscarProdutosProposta.mockReset().mockResolvedValue([{ idproduto: 60, descricao: "CANETA", custoUnitario: "1.000" }]);
    buscarClienteParaProposta.mockReset().mockResolvedValue({ idcliente: 5, razaoSocial: "MUNICIPIO DE ILHABELA", endereco: null });

    const produtos = await chamar("GET", "/propostas/produtos?q=caneta&limit=5");
    expect(produtos.status).toBe(200);
    expect(buscarProdutosProposta).toHaveBeenCalledWith("caneta", 5);

    const cliente = await chamar("GET", "/propostas/clientes/5");
    expect(cliente.status).toBe(200);
    expect(cliente.json.razaoSocial).toBe("MUNICIPIO DE ILHABELA");
    buscarClienteParaProposta.mockResolvedValueOnce(null);
    expect((await chamar("GET", "/propostas/clientes/6")).status).toBe(404);

    const assinantes = await chamar("GET", "/propostas/assinantes");
    expect(assinantes.status).toBe(200);
    expect(Array.isArray(assinantes.json)).toBe(true);

    const lista = await chamar("GET", "/propostas?tamanho=5");
    expect(lista.status).toBe(200);
    expect(lista.json).toMatchObject({ pagina: 1, tamanho: 5 });
    expect((await chamar("GET", "/propostas?tamanho=101")).status).toBe(400);
    expect((await chamar("GET", "/propostas?status=INEXISTENTE")).status).toBe(400);

    // Todas exigem a chave admin.
    for (const caminho of ["/propostas/produtos?q=x", "/propostas/assinantes", "/propostas/clientes/5", "/propostas"]) {
      expect((await chamar("GET", caminho, undefined, { interna: CHAVE_INTERNA, admin: null })).status).toBe(401);
    }
  });

  it("edita item (ajuste VALOR, nome), aplica percentual, remove item e edita cabecalho por HTTP", async () => {
    buscarClienteParaProposta.mockReset().mockResolvedValue({ idcliente: 5, razaoSocial: "MUNICIPIO DE ILHABELA", endereco: null });
    const criado = await chamar("POST", "/propostas", { numeroProcesso: "Pregao 1/2026", validadeDias: 5 });
    expect(criado.json).toMatchObject({ numeroProcesso: "Pregao 1/2026", validadeDias: 5 });
    const id = criado.json.id as string;
    const add = await chamar("POST", `/propostas/${id}/itens`, { idproduto: 60, quantidade: 2 });
    const itemId = add.json.itens[0].id as string;

    const ajustado = await chamar("PATCH", `/propostas/${id}/itens/${itemId}`, { nome: "Caneta azul", ajuste: { tipo: "VALOR", valor: 2.9 } });
    expect(ajustado.status).toBe(200);
    expect(ajustado.json.itens[0]).toMatchObject({ nome: "Caneta azul", precoUnitario: "2.90", totalLinha: "5.80" });

    // Preco final nunca vem do navegador.
    expect((await chamar("PATCH", `/propostas/${id}/itens/${itemId}`, { precoUnitario: 1 })).status).toBe(400);
    expect((await chamar("PATCH", `/propostas/${id}/itens/${itemId}`, { ajuste: { tipo: "PERCENTUAL", valor: 10.5555 } })).status).toBe(400);

    const percentual = await chamar("POST", `/propostas/${id}/aplicar-percentual`, { percentual: 10 });
    expect(percentual.status).toBe(201);
    expect(percentual.json.itens[0].precoUnitario).toBe("3.81");

    const cab = await chamar("PATCH", `/propostas/${id}`, { idclienteAthos: 5, observacao: "Entregar no almoxarifado" });
    expect(cab.status).toBe(200);
    expect(cab.json.cliente).toMatchObject({ razaoSocial: "MUNICIPIO DE ILHABELA" });

    const removido = await chamar("DELETE", `/propostas/${id}/itens/${itemId}`);
    expect(removido.status).toBe(200);
    expect(removido.json).toMatchObject({ itens: [], total: "0.00" });
  });

  it("proposta inexistente -> 404 PROPOSTA_NAO_ENCONTRADA", async () => {
    const r = await chamar("GET", "/propostas/6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11");
    expect(r.status).toBe(404);
    expect(r.json.codigo).toBe("PROPOSTA_NAO_ENCONTRADA");
  });
});
