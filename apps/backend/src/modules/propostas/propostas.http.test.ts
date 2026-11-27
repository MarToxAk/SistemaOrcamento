/**
 * Teste HTTP do tracer da Fase 55 (plano 55-06): guards reais (InternalAuthGuard global e AdminAuthGuard via
 * @AdminOnly), ValidationPipe igual ao main.ts, Prisma em memoria e Athos simulado.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { AthosService } from "../integrations/athos/athos.service";
import { AthosOrcamentoService, OrcamentoAthosError } from "../integrations/athos/athos-orcamento.service";
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

describe("PropostasController (HTTP): gerar e recuperar (plano 55-17)", () => {
  let app: INestApplication;
  let base = "";
  const envAnterior: Record<string, string | undefined> = {};
  const obterProdutoProposta = jest.fn();
  const buscarClienteParaProposta = jest.fn();
  const exigirEscritaPropostaAtiva = jest.fn();
  const criarOrcamentoProposta = jest.fn();
  const buscarOrcamentoPorRefProposta = jest.fn();
  const capturarSnapshot = jest.fn();
  const gerarOficial = jest.fn();
  const prisma = criarPrismaPropostaFake();
  let propostasService: PropostasService;
  const UUID_INEXISTENTE = "6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11";
  const CORPO_GERAR = { assinanteNome: "Fulano de Tal", confirmar: true };

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

  /** Rascunho com cliente e um item, criado por HTTP; devolve o id. */
  async function propostaPronta(): Promise<string> {
    const criado = await chamar("POST", "/propostas", { idclienteAthos: 5 });
    const id = criado.json.id as string;
    const add = await chamar("POST", `/propostas/${id}/itens`, { idproduto: 60, quantidade: 2 });
    expect(add.status).toBe(201);
    return id;
  }

  beforeAll(async () => {
    for (const k of ["INTERNAL_API_KEY", "ADMIN_API_KEY"]) envAnterior[k] = process.env[k];
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    process.env.ADMIN_API_KEY = CHAVE_ADMIN;
    const modulo = await Test.createTestingModule({
      controllers: [PropostasController],
      providers: [
        PropostasService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AthosOrcamentoService,
          useValue: { obterProdutoProposta, exigirEscritaPropostaAtiva, criarOrcamentoProposta, buscarOrcamentoPorRefProposta },
        },
        { provide: AthosService, useValue: { buscarClienteParaProposta } },
        { provide: PropostasPdfService, useValue: { capturarSnapshot, gerarOficial } },
        { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
      ],
    }).compile();
    propostasService = modulo.get(PropostasService);
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
    jest.restoreAllMocks();
    for (const m of [exigirEscritaPropostaAtiva, criarOrcamentoProposta, buscarOrcamentoPorRefProposta, capturarSnapshot, gerarOficial]) m.mockReset();
    buscarClienteParaProposta.mockReset().mockResolvedValue({ idcliente: 5, razaoSocial: "MUNICIPIO DE TESTE", endereco: null });
    obterProdutoProposta.mockReset().mockResolvedValue({
      idproduto: 60,
      descricao: "CANETA ESFEROGRAFICA AZUL",
      descricaoCurta: "Caneta azul",
      marca: "BIC",
      referencia: null,
      codigoBarra: null,
      preco: "3.500",
      emPromocao: false,
      estoqueLoja: "10.000",
      estoqueDeposito: "0.000",
      permiteFracionar: true,
      unidade: "UN",
      custoUnitario: "1.000",
    });
    capturarSnapshot.mockResolvedValue({
      versao: 1,
      banco: { banco: "Banco Teste", agencia: "0001", conta: "12345-6", titular: "Empresa Teste Ltda", documentoTitular: "00.000.000/0001-00" },
      empresa: { nome: "Empresa Teste Ltda", cnpj: "00.000.000/0001-00", endereco: "Rua Teste, 1" },
      template: { origem: "EMPACOTADO", source: "<html>segredo-do-template</html>" },
    });
    gerarOficial.mockResolvedValue({ objectName: "propostas/teste.pdf" });
    criarOrcamentoProposta.mockResolvedValue({ idorcamento: 555, senhabalcao: 12, data: "2026-11-27", hora: "09:00:00", valorTotal: "7.00", recuperado: false });
  });

  describe("POST :id/gerar", () => {
    it.each([
      ["sem confirmar", { assinanteNome: "Fulano" }],
      ["confirmar false", { assinanteNome: "Fulano", confirmar: false }],
      ["confirmar como texto", { assinanteNome: "Fulano", confirmar: "true" }],
      ["sem assinanteNome", { confirmar: true }],
      ["assinanteNome vazio", { assinanteNome: "", confirmar: true }],
    ])("%s responde 400 e nao chama o servico", async (_nome, corpo) => {
      const gerar = jest.spyOn(propostasService, "gerar");
      const r = await chamar("POST", `/propostas/${UUID_INEXISTENTE}/gerar`, corpo);
      expect(r.status).toBe(400);
      expect(gerar).not.toHaveBeenCalled();
      expect(criarOrcamentoProposta).not.toHaveBeenCalled();
    });

    it("sem as chaves responde 401 e nao chama o servico", async () => {
      const gerar = jest.spyOn(propostasService, "gerar");
      expect((await chamar("POST", `/propostas/${UUID_INEXISTENTE}/gerar`, CORPO_GERAR, { interna: CHAVE_INTERNA, admin: null })).status).toBe(401);
      expect((await chamar("POST", `/propostas/${UUID_INEXISTENTE}/gerar`, CORPO_GERAR, { interna: null, admin: CHAVE_ADMIN })).status).toBe(401);
      expect((await chamar("POST", `/propostas/${UUID_INEXISTENTE}/gerar`, CORPO_GERAR, { interna: null, admin: null })).status).toBe(401);
      expect(gerar).not.toHaveBeenCalled();
    });

    it("id fora do formato UUID responde 400 e nao chama o servico", async () => {
      const gerar = jest.spyOn(propostasService, "gerar");
      const r = await chamar("POST", "/propostas/nao-e-uuid/gerar", CORPO_GERAR);
      expect(r.status).toBe(400);
      expect(gerar).not.toHaveBeenCalled();
    });

    it("flag desligada propaga 503 com codigo ESCRITA_DESABILITADA e a proposta segue RASCUNHO", async () => {
      const id = await propostaPronta();
      exigirEscritaPropostaAtiva.mockImplementation(() => {
        throw new OrcamentoAthosError("ESCRITA_DESABILITADA", "A gravacao de propostas no Athos esta desabilitada.", 503);
      });

      const r = await chamar("POST", `/propostas/${id}/gerar`, CORPO_GERAR);

      expect(r.status).toBe(503);
      expect(r.json.codigo).toBe("ESCRITA_DESABILITADA");
      expect(criarOrcamentoProposta).not.toHaveBeenCalled();
      expect((await chamar("GET", `/propostas/${id}`)).json.status).toBe("RASCUNHO");
    });

    it("gerar valido responde 201 ENVIADA e o detalhe seguinte nao contem pdfSnapshot", async () => {
      const id = await propostaPronta();

      const r = await chamar("POST", `/propostas/${id}/gerar`, CORPO_GERAR);

      expect(r.status).toBe(201);
      expect(r.json).toMatchObject({ id, status: "ENVIADA", idorcamentoAthos: 555, senhaBalcao: 12, pdfDisponivel: true });
      const linha = prisma._propostas.find((p) => p.id === id)!;
      expect(linha.pdfSnapshot).not.toBeNull();

      const detalhe = await chamar("GET", `/propostas/${id}`);
      expect(detalhe.status).toBe(200);
      expect(detalhe.json).toMatchObject({ status: "ENVIADA", idorcamentoAthos: 555 });
      const texto = JSON.stringify(detalhe.json);
      expect(texto).not.toContain("pdfSnapshot");
      expect(texto).not.toContain("segredo-do-template");
      expect(JSON.stringify(r.json)).not.toContain("pdfSnapshot");
    });
  });

  describe("POST :id/recuperar", () => {
    it("com id valido chama recuperarLancamento e devolve o corpo", async () => {
      const resposta = { id: UUID_INEXISTENTE, status: "RASCUNHO" as const, mensagem: "Nenhum orcamento encontrado." };
      const recuperar = jest.spyOn(propostasService, "recuperarLancamento").mockResolvedValueOnce(resposta);

      const r = await chamar("POST", `/propostas/${UUID_INEXISTENTE}/recuperar`);

      expect(r.status).toBe(201);
      expect(r.json).toEqual(resposta);
      expect(recuperar).toHaveBeenCalledTimes(1);
      expect(recuperar).toHaveBeenCalledWith(UUID_INEXISTENTE);
    });

    it("sem as chaves responde 401 e nao chama o servico", async () => {
      const recuperar = jest.spyOn(propostasService, "recuperarLancamento");
      expect((await chamar("POST", `/propostas/${UUID_INEXISTENTE}/recuperar`, undefined, { interna: CHAVE_INTERNA, admin: null })).status).toBe(401);
      expect((await chamar("POST", `/propostas/${UUID_INEXISTENTE}/recuperar`, undefined, { interna: null, admin: CHAVE_ADMIN })).status).toBe(401);
      expect(recuperar).not.toHaveBeenCalled();
    });

    it("id fora do formato UUID responde 400 e nao chama o servico", async () => {
      const recuperar = jest.spyOn(propostasService, "recuperarLancamento");
      expect((await chamar("POST", "/propostas/nao-e-uuid/recuperar")).status).toBe(400);
      expect(recuperar).not.toHaveBeenCalled();
    });

    it("proposta que nao esta em LANCANDO responde 409 TRANSICAO_INVALIDA pela rota", async () => {
      const id = await propostaPronta();
      const r = await chamar("POST", `/propostas/${id}/recuperar`);
      expect(r.status).toBe(409);
      expect(r.json.codigo).toBe("TRANSICAO_INVALIDA");
    });
  });
});

describe("PropostasController (HTTP): pdf, previa, duplicar e status (plano 55-13)", () => {
  let app: INestApplication;
  let base = "";
  const envAnterior: Record<string, string | undefined> = {};
  const obterProdutoProposta = jest.fn();
  const buscarClienteParaProposta = jest.fn();
  const capturarSnapshot = jest.fn();
  const gerarOficial = jest.fn();
  const gerarPrevia = jest.fn();
  const gerarPreviaTemplate = jest.fn();
  const baixarOficial = jest.fn();
  const existeOficial = jest.fn();
  const prisma = criarPrismaPropostaFake();
  const UUID_INEXISTENTE = "6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11";
  const SNAPSHOT = {
    versao: 1,
    banco: { bancoNome: "Banco Teste", agencia: "0001", conta: "12345-6", titular: "Empresa Teste Ltda", documentoTitular: "00.000.000/0001-00" },
    empresa: { nome: "Empresa Teste Ltda", cnpj: "00.000.000/0001-00", endereco: "Rua Teste, 1" },
    template: { origem: "EMPACOTADO", source: "<html>segredo-do-template</html>" },
  };

  /** Chamada que devolve o corpo bruto (PDF) em vez de JSON. */
  async function chamarBruto(
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
    const corpoBruto = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, corpo: corpoBruto };
  }

  async function chamar(
    metodo: string,
    caminho: string,
    corpo?: unknown,
    chaves: { interna?: string | null; admin?: string | null } = { interna: CHAVE_INTERNA, admin: CHAVE_ADMIN },
  ) {
    const r = await chamarBruto(metodo, caminho, corpo, chaves);
    let json: Record<string, any> = {};
    try {
      json = JSON.parse(r.corpo.toString("utf-8"));
    } catch {
      json = {};
    }
    return { status: r.status, json };
  }

  /** Proposta lancada (ENVIADA, numero proprio) com 1 item, semeada direto no Prisma em memoria. */
  async function semearLancada(extra: Record<string, unknown> = {}): Promise<string> {
    const criada: any = await prisma.proposta.create({
      data: {
        status: "ENVIADA",
        idclienteAthos: 5,
        clienteSnapshot: { idcliente: 5, razaoSocial: "MUNICIPIO DE TESTE" },
        totalValor: "7.00",
        idorcamentoAthos: 777 + prisma._propostas.length,
        senhaBalcao: 12,
        athosData: "2026-11-27",
        athosHora: "10:20:30",
        enviadaEm: new Date(),
        pdfObjectName: "propostas/teste.pdf",
        pdfSnapshot: SNAPSHOT,
        ...extra,
      },
    });
    await prisma.propostaItem.create({
      data: {
        propostaId: criada.id,
        sequencia: 1,
        idproduto: 60,
        nomeAthos: "CANETA",
        nome: "Caneta",
        quantidade: "2.000",
        precoBase: "3.500",
        precoUnitario: "3.50",
        totalLinha: "7.00",
        custoUnitario: "1.000",
      },
    });
    return criada.id as string;
  }

  beforeAll(async () => {
    for (const k of ["INTERNAL_API_KEY", "ADMIN_API_KEY"]) envAnterior[k] = process.env[k];
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    process.env.ADMIN_API_KEY = CHAVE_ADMIN;
    const modulo = await Test.createTestingModule({
      controllers: [PropostasController],
      providers: [
        PropostasService,
        { provide: PrismaService, useValue: prisma },
        { provide: AthosOrcamentoService, useValue: { obterProdutoProposta } },
        { provide: AthosService, useValue: { buscarClienteParaProposta } },
        {
          provide: PropostasPdfService,
          useValue: { capturarSnapshot, gerarOficial, gerarPrevia, gerarPreviaTemplate, baixarOficial, existeOficial },
        },
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
    for (const m of [capturarSnapshot, gerarOficial, gerarPrevia, gerarPreviaTemplate, baixarOficial, existeOficial, obterProdutoProposta, buscarClienteParaProposta]) m.mockReset();
    existeOficial.mockResolvedValue(true);
    baixarOficial.mockResolvedValue(Buffer.from("%PDF-1.7 oficial armazenado"));
    gerarPrevia.mockResolvedValue(Buffer.from("%PDF-1.7 previa"));
    gerarOficial.mockResolvedValue({ objectName: "propostas/regerado.pdf" });
  });

  describe("GET :id/pdf", () => {
    it("proposta ENVIADA com arquivo armazenado: 200 application/pdf inline com o nome Proposta-<numero>.pdf e sem regenerar", async () => {
      const id = await semearLancada({ idorcamentoAthos: 4242 });

      const r = await chamarBruto("GET", `/propostas/${id}/pdf`);

      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("application/pdf");
      expect(r.headers.get("content-disposition")).toBe('inline; filename="Proposta-4242.pdf"');
      expect(Number(r.headers.get("content-length"))).toBe(r.corpo.length);
      expect(r.corpo.subarray(0, 4).toString()).toBe("%PDF");
      expect(gerarOficial).not.toHaveBeenCalled();
      expect(capturarSnapshot).not.toHaveBeenCalled();
      expect(buscarClienteParaProposta).not.toHaveBeenCalled();
    });

    it("arquivo ausente: regenera so do snapshot gravado e devolve o PDF", async () => {
      const id = await semearLancada({ idorcamentoAthos: 4243 });
      existeOficial.mockResolvedValue(false);
      baixarOficial.mockResolvedValue(Buffer.from("%PDF-1.7 regerado"));

      const r = await chamarBruto("GET", `/propostas/${id}/pdf`);

      expect(r.status).toBe(200);
      expect(r.corpo.toString()).toContain("regerado");
      expect(gerarOficial).toHaveBeenCalledTimes(1);
      expect(gerarOficial.mock.calls[0][1]).toEqual(SNAPSHOT);
      expect(capturarSnapshot).not.toHaveBeenCalled();
      expect(prisma._propostas.find((p) => p.id === id)!.pdfObjectName).toBe("propostas/regerado.pdf");
    });

    it("sem pdfSnapshot: 409 PDF_INDISPONIVEL", async () => {
      const id = await semearLancada({ pdfSnapshot: null, pdfObjectName: null });
      const r = await chamar("GET", `/propostas/${id}/pdf`);
      expect(r.status).toBe(409);
      expect(r.json.codigo).toBe("PDF_INDISPONIVEL");
      expect(gerarOficial).not.toHaveBeenCalled();
    });

    it.each([
      ["RASCUNHO", { status: "RASCUNHO", idorcamentoAthos: null, pdfObjectName: null, pdfSnapshot: null }],
      ["LANCANDO", { status: "LANCANDO", idorcamentoAthos: null, pdfObjectName: null }],
      ["sem idorcamentoAthos", { idorcamentoAthos: null }],
    ])("%s: 409 PDF_INDISPONIVEL", async (_nome, extra) => {
      const id = await semearLancada(extra);
      const r = await chamar("GET", `/propostas/${id}/pdf`);
      expect(r.status).toBe(409);
      expect(r.json.codigo).toBe("PDF_INDISPONIVEL");
    });

    it("inexistente 404, UUID invalido 400 e sem a chave admin 401", async () => {
      expect((await chamar("GET", `/propostas/${UUID_INEXISTENTE}/pdf`)).status).toBe(404);
      expect((await chamar("GET", "/propostas/nao-e-uuid/pdf")).status).toBe(400);
      const id = await semearLancada();
      expect((await chamar("GET", `/propostas/${id}/pdf`, undefined, { interna: CHAVE_INTERNA, admin: null })).status).toBe(401);
      expect((await chamar("GET", `/propostas/${id}/pdf`, undefined, { interna: null, admin: CHAVE_ADMIN })).status).toBe(401);
    });
  });

  describe("GET :id/previa", () => {
    it.each(["RASCUNHO", "ENVIADA", "CANCELADA"])("%s com itens: 200 application/pdf, nunca gera o oficial nem armazena", async (status) => {
      const id = await semearLancada({ status });

      const r = await chamarBruto("GET", `/propostas/${id}/previa`);

      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("application/pdf");
      expect(r.headers.get("content-disposition")).toBe('inline; filename="Previa-Proposta.pdf"');
      expect(r.corpo.subarray(0, 4).toString()).toBe("%PDF");
      expect(gerarPrevia).toHaveBeenCalledTimes(1);
      expect(gerarOficial).not.toHaveBeenCalled();
      expect(baixarOficial).not.toHaveBeenCalled();
    });

    it("sem cliente mas com 1 item: 200", async () => {
      const id = await semearLancada({ status: "RASCUNHO", idclienteAthos: null, clienteSnapshot: null });
      const r = await chamarBruto("GET", `/propostas/${id}/previa`);
      expect(r.status).toBe(200);
      expect(gerarOficial).not.toHaveBeenCalled();
    });

    it("sem itens: 422 SEM_ITENS", async () => {
      const criada: any = await prisma.proposta.create({ data: {} });
      const r = await chamar("GET", `/propostas/${criada.id}/previa`);
      expect(r.status).toBe(422);
      expect(r.json.codigo).toBe("SEM_ITENS");
      expect(gerarPrevia).not.toHaveBeenCalled();
      expect(gerarOficial).not.toHaveBeenCalled();
    });

    it("inexistente 404, UUID invalido 400 e sem a chave admin 401", async () => {
      expect((await chamar("GET", `/propostas/${UUID_INEXISTENTE}/previa`)).status).toBe(404);
      expect((await chamar("GET", "/propostas/nao-e-uuid/previa")).status).toBe(400);
      const id = await semearLancada({ status: "RASCUNHO" });
      expect((await chamar("GET", `/propostas/${id}/previa`, undefined, { interna: CHAVE_INTERNA, admin: null })).status).toBe(401);
      expect(gerarPrevia).not.toHaveBeenCalled();
    });
  });

  // <<TASK-2-HTTP>>
});
