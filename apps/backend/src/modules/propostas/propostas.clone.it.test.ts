/**
 * IT HTTP ponta a ponta do lancamento da proposta contra o CLONE do Athos (container athos-teste).
 *
 * Fase 55 / plano 55-08 (tracer). Somente executa com ATHOS_IT_CLONE=1; sem isso (CI) a suite fica em describe.skip.
 * Trava dupla: so aceita 127.0.0.1:5440, banco "athos". A senha do clone NUNCA fica neste arquivo: vem de
 * ATHOS_PG_PASS na linha de comando. Todo orcamento criado e apagado em afterAll (3 tabelas), so no clone.
 *
 * Real: guards, ValidationPipe, PropostasController/Service, AthosOrcamentoService, AthosService, PropostasPdfService
 * (render em Chromium) e QuotesPdfStorageService (so o armazenamento MinIO e trocado por um mapa em memoria).
 * Em memoria: o Prisma do Sistema. Dados de empresa e banco sao FICTICIOS.
 *
 * Comando:
 *   ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos \
 *   ATHOS_PG_USER=postgres ATHOS_PG_PASS=<senha-do-clone> \
 *   ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 \
 *   ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 PROPOSTA_ESCRITA_ATIVA=true \
 *   npm --prefix apps/backend run test -- src/modules/propostas/propostas.clone.it.test.ts --no-coverage
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Client } from "pg";

import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { AthosOrcamentoService, MARCADOR_OBS_PROPOSTA } from "../integrations/athos/athos-orcamento.service";
import { refDoOrcamento } from "../integrations/athos/athos-orcamento-idempotencia.service";
import { PdfTemplatesRepository } from "../pdf-templates/pdf-templates.repository";
import { QuotesPdfStorageService } from "../quotes/quotes-pdf-storage.service";
import { InternalAuthGuard } from "../security/internal-auth.guard";
import { criarPrismaPropostaFake } from "./__fixtures__/prisma-proposta.fake";
import { PropostasController } from "./propostas.controller";
import { PropostasService } from "./propostas.service";
import { PropostasPdfService } from "./propostas-pdf.service";

const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;

const CHAVE_INTERNA = "chave-interna-it-55-08";
const CHAVE_ADMIN = "chave-admin-it-55-08";

rodar("IT clone athos-teste: gerar proposta por HTTP (tracer 55-08)", () => {
  const envsGuardadas: Record<string, string | undefined> = {};
  const prisma = criarPrismaPropostaFake();
  const objetosPdf = new Map<string, Buffer>();
  const idsCriados: number[] = [];

  let app: INestApplication;
  let base = "";
  let pg: Client;
  let athosService: AthosService;
  let athosOrcamento: AthosOrcamentoService;
  let propostasPdf: PropostasPdfService;
  let idcliente = 0;
  let produtoPreco3Casas = 0;
  let produtoB = 0;

  const ordemChamadas: string[] = [];
  let espiaoCapturar: jest.SpyInstance;
  let espiaoCriarProposta: jest.SpyInstance;
  let espiaoCriarFase44: jest.SpyInstance;

  function definirEnv(chave: string, valor: string) {
    if (!(chave in envsGuardadas)) envsGuardadas[chave] = process.env[chave];
    process.env[chave] = valor;
  }

  async function chamar(metodo: string, caminho: string, corpo?: unknown) {
    const res = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: {
        "content-type": "application/json",
        "x-internal-api-key": CHAVE_INTERNA,
        "x-admin-api-key": CHAVE_ADMIN,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  beforeAll(async () => {
    // Trava dupla ANTES de criar qualquer cliente pg ou modulo.
    if (
      process.env.ATHOS_PG_HOST !== "127.0.0.1" ||
      process.env.ATHOS_PG_PORT !== "5440" ||
      process.env.ATHOS_PG_DB !== "athos"
    ) {
      throw new Error("IT bloqueado: somente o clone local 127.0.0.1:5440/athos");
    }
    definirEnv("INTERNAL_API_KEY", CHAVE_INTERNA);
    definirEnv("ADMIN_API_KEY", CHAVE_ADMIN);
    definirEnv("PROPOSTA_ESCRITA_ATIVA", "true");
    // Dados de empresa FICTICIOS (o snapshot recusa nome e CNPJ vazios).
    definirEnv("EMPRESA_NOME", "Empresa Ficticia de Teste Ltda");
    definirEnv("EMPRESA_CNPJ", "00.000.000/0001-00");
    definirEnv("EMPRESA_ENDERECO", "Rua de Teste, 1 - Cidade Ficticia/SP");
    definirEnv("EMPRESA_TELEFONES", "(00) 0000-0000");
    definirEnv("EMPRESA_EMAIL", "contato@exemplo.invalid");
    definirEnv("EMPRESA_LOGO_URL", "");

    pg = new Client({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
    await pg.connect();

    // Cliente juridico e produtos escolhidos dinamicamente (nunca ids fixos).
    const cli = await pg.query<{ idcliente: number }>(
      `SELECT c.idcliente FROM cliente c JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
        WHERE COALESCE(cj.razaosocial, '') <> '' ORDER BY c.idcliente LIMIT 1`,
    );
    if (cli.rows.length < 1) throw new Error("Clone sem cliente juridico com razao social");
    idcliente = cli.rows[0].idcliente;

    const base3 = `statusproduto = true AND COALESCE(vendeproduto, true) AND precovendaproduto(idproduto) >= 3`;
    // Preferencia por um produto cujo preco-base tem 3 casas decimais (arredondamento visivel).
    const tres = await pg.query<{ idproduto: number }>(
      `SELECT idproduto FROM produto
        WHERE ${base3} AND NOT COALESCE(permitefracionar, true)
          AND round(precovendaproduto(idproduto) * 100) <> precovendaproduto(idproduto) * 100
        ORDER BY idproduto LIMIT 1`,
    );
    const qualquer = await pg.query<{ idproduto: number }>(
      `SELECT idproduto FROM produto WHERE ${base3} AND NOT COALESCE(permitefracionar, true) ORDER BY idproduto LIMIT 2`,
    );
    if (qualquer.rows.length < 2) throw new Error("Clone sem dois produtos elegiveis (ativos, vendaveis, inteiros, preco >= 3)");
    produtoPreco3Casas = tres.rows[0]?.idproduto ?? qualquer.rows[0].idproduto;
    produtoB = qualquer.rows.map((r) => r.idproduto).find((id) => id !== produtoPreco3Casas) as number;

    // Servicos reais; so o armazenamento (MinIO) do PDF e substituido por um mapa em memoria.
    const configService = { get: (k: string) => process.env[k] } as unknown as ConfigService;
    athosService = new AthosService(prisma as unknown as PrismaService);
    athosOrcamento = new AthosOrcamentoService();
    const repositorioTemplates = new PdfTemplatesRepository(prisma as unknown as PrismaService);
    const storage = new QuotesPdfStorageService(configService, repositorioTemplates);
    jest.spyOn(storage, "armazenarPdf").mockImplementation(async (objectName: string, buffer: Buffer) => {
      objetosPdf.set(objectName, buffer);
      return { objectName };
    });
    jest.spyOn(storage, "downloadObjectBuffer").mockImplementation(async (objectName: string) => {
      const buf = objetosPdf.get(objectName);
      if (!buf) throw new Error("objeto inexistente");
      return buf;
    });
    jest.spyOn(storage, "objectExists").mockImplementation(async (objectName: string) => objetosPdf.has(objectName));
    propostasPdf = new PropostasPdfService(prisma as unknown as PrismaService, configService, storage, repositorioTemplates);

    espiaoCapturar = jest.spyOn(propostasPdf, "capturarSnapshot").mockImplementation(async function (this: unknown) {
      ordemChamadas.push("capturarSnapshot");
      return (PropostasPdfService.prototype.capturarSnapshot as () => Promise<never>).call(propostasPdf);
    });
    espiaoCriarProposta = jest.spyOn(athosOrcamento, "criarOrcamentoProposta");
    espiaoCriarFase44 = jest.spyOn(athosOrcamento, "criarOrcamento");

    const modulo = await Test.createTestingModule({
      controllers: [PropostasController],
      providers: [
        PropostasService,
        { provide: PrismaService, useValue: prisma },
        { provide: AthosOrcamentoService, useValue: athosOrcamento },
        { provide: AthosService, useValue: athosService },
        { provide: PropostasPdfService, useValue: propostasPdf },
        { provide: ConfigService, useValue: configService },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  }, 60_000);

  afterAll(async () => {
    try {
      if (pg) {
        // Apaga o que o proprio IT criou: pelos ids devolvidos e, por garantia, pelos marcadores das propostas do IT.
        const refs: string[] = [];
        for (const p of prisma._propostas) {
          refs.push(`${MARCADOR_OBS_PROPOSTA}${refDoOrcamento(p.id)}`);
        }
        const porRef =
          refs.length > 0
            ? await pg.query<{ idorcamento: number }>("SELECT idorcamento FROM orcamento WHERE obs = ANY($1::text[])", [refs])
            : { rows: [] as Array<{ idorcamento: number }> };
        const ids = [...new Set([...idsCriados, ...porRef.rows.map((r) => Number(r.idorcamento))])];
        if (ids.length > 0) {
          await pg.query("DELETE FROM orcamento_forma_pagamento WHERE idorcamento = ANY($1::int[])", [ids]);
          await pg.query("DELETE FROM orcamento_item WHERE idorcamento = ANY($1::int[])", [ids]);
          await pg.query("DELETE FROM orcamento WHERE idorcamento = ANY($1::int[])", [ids]);
        }
      }
    } finally {
      if (app) await app.close();
      if (pg) await pg.end();
      if (athosOrcamento) await athosOrcamento.onModuleDestroy();
      const pool = (athosService as unknown as { _pool?: { end(): Promise<void> } } | undefined)?._pool;
      if (pool) await pool.end();
      jest.restoreAllMocks();
      for (const [k, v] of Object.entries(envsGuardadas)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("flag desligada: 503 ESCRITA_DESABILITADA, proposta segue em RASCUNHO e nada chega ao Athos", async () => {
    const criada = await chamar("POST", "/propostas", { idclienteAthos: idcliente });
    expect(criada.status).toBe(201);
    const id = criada.json.id as string;
    expect((await chamar("POST", `/propostas/${id}/itens`, { idproduto: produtoB, quantidade: 1 })).status).toBe(201);

    const anterior = process.env.PROPOSTA_ESCRITA_ATIVA;
    process.env.PROPOSTA_ESCRITA_ATIVA = "false";
    const chamadasAntes = espiaoCriarProposta.mock.calls.length;
    try {
      const r = await chamar("POST", `/propostas/${id}/gerar`, { assinanteNome: "Fulano de Tal", confirmar: true });
      expect(r.status).toBe(503);
      expect(r.json.codigo).toBe("ESCRITA_DESABILITADA");
    } finally {
      process.env.PROPOSTA_ESCRITA_ATIVA = anterior;
    }
    expect((await chamar("GET", `/propostas/${id}`)).json.status).toBe("RASCUNHO");
    expect(espiaoCriarProposta.mock.calls.length).toBe(chamadasAntes);
  });

  it("validacoes: sem cliente 422, sem itens 422, sem confirmar 400", async () => {
    const semCliente = await chamar("POST", "/propostas", {});
    await chamar("POST", `/propostas/${semCliente.json.id}/itens`, { idproduto: produtoB, quantidade: 1 });
    const r1 = await chamar("POST", `/propostas/${semCliente.json.id}/gerar`, { assinanteNome: "Fulano", confirmar: true });
    expect(r1.status).toBe(422);
    expect(r1.json.codigo).toBe("CLIENTE_OBRIGATORIO");

    const semItens = await chamar("POST", "/propostas", { idclienteAthos: idcliente });
    const r2 = await chamar("POST", `/propostas/${semItens.json.id}/gerar`, { assinanteNome: "Fulano", confirmar: true });
    expect(r2.status).toBe(422);
    expect(r2.json.codigo).toBe("SEM_ITENS");

    const r3 = await chamar("POST", `/propostas/${semItens.json.id}/gerar`, { assinanteNome: "Fulano", confirmar: false });
    expect(r3.status).toBe(400);
  });

  it("tracer: monta, ajusta, gera (Athos real + PDF real) e confere as tres tabelas, o PDF e o snapshot", async () => {
    // --- montar a proposta por HTTP
    const criada = await chamar("POST", "/propostas", {});
    expect(criada.status).toBe(201);
    const id = criada.json.id as string;

    const comCliente = await chamar("PATCH", `/propostas/${id}`, { idclienteAthos: idcliente, numeroProcesso: "Pregao 1/2026" });
    expect(comCliente.status).toBe(200);
    expect(comCliente.json.idclienteAthos).toBe(idcliente);

    const add1 = await chamar("POST", `/propostas/${id}/itens`, { idproduto: produtoPreco3Casas, quantidade: 3 });
    expect(add1.status).toBe(201);
    const add2 = await chamar("POST", `/propostas/${id}/itens`, { idproduto: produtoB, quantidade: 2 });
    expect(add2.status).toBe(201);
    const itemAjustar = add2.json.itens.find((i: any) => i.idproduto === produtoB);
    const precoCadastro = Number(itemAjustar.precoBase);
    expect(precoCadastro).toBeGreaterThanOrEqual(3);

    // --- ajustar um item com VALOR abaixo do preco de cadastro, e renomear (o nome nunca vai ao Athos)
    const ajustado = await chamar("PATCH", `/propostas/${id}/itens/${itemAjustar.id}`, {
      nome: "Nome alterado so na proposta",
      descricaoCurta: "Descricao curta so na proposta",
      ajuste: { tipo: "VALOR", valor: 2.9 },
    });
    expect(ajustado.status).toBe(200);
    expect(ajustado.json.itens.find((i: any) => i.id === itemAjustar.id).precoUnitario).toBe("2.90");
    const detalheAntes = ajustado.json;
    const precoFinalPorProduto = new Map<number, number>(
      detalheAntes.itens.map((i: any) => [i.idproduto as number, Number(i.precoUnitario)]),
    );
    const quantidadePorProduto = new Map<number, number>(detalheAntes.itens.map((i: any) => [i.idproduto as number, Number(i.quantidade)]));

    // --- gerar
    ordemChamadas.length = 0;
    espiaoCriarProposta.mockClear();
    espiaoCriarFase44.mockClear();
    espiaoCriarProposta.mockImplementationOnce(async function (this: unknown, ...args: unknown[]) {
      ordemChamadas.push("criarOrcamentoProposta");
      return (AthosOrcamentoService.prototype.criarOrcamentoProposta as (...a: unknown[]) => Promise<never>).apply(athosOrcamento, args);
    });
    const gerada = await chamar("POST", `/propostas/${id}/gerar`, {
      assinanteNome: "Fulano de Tal",
      assinanteCargo: "Secretario",
      confirmar: true,
    });
    expect(gerada.status).toBe(201);
    expect(gerada.json).toMatchObject({ id, status: "ENVIADA", pdfDisponivel: true });
    expect(gerada.json.aviso).toBeUndefined();
    const idorcamento = gerada.json.idorcamentoAthos as number;
    expect(idorcamento).toBeGreaterThan(0);
    idsCriados.push(idorcamento);

    // Ordem do snapshot (T-55-55): capturarSnapshot ANTES de criarOrcamentoProposta.
    expect(ordemChamadas).toEqual(["capturarSnapshot", "criarOrcamentoProposta"]);
    expect(espiaoCapturar.mock.invocationCallOrder[espiaoCapturar.mock.invocationCallOrder.length - 1]).toBeLessThan(
      espiaoCriarProposta.mock.invocationCallOrder[0],
    );
    expect(espiaoCriarProposta).toHaveBeenCalledTimes(1);
    // A Fase 44 nunca e acionada.
    expect(espiaoCriarFase44).not.toHaveBeenCalled();

    // O Athos recebeu somente idproduto, quantidade, preco final e custo: nunca nome nem descricao (D-04).
    const entrada = espiaoCriarProposta.mock.calls[0][0] as { itens: Array<Record<string, unknown>> };
    for (const item of entrada.itens) {
      expect(Object.keys(item).sort()).toEqual(["custoUnitario", "idproduto", "precoUnitario", "quantidade"]);
    }

    // --- proposta ENVIADA com os dados do Athos e o snapshot gravado
    const lida = await chamar("GET", `/propostas/${id}`);
    expect(lida.json).toMatchObject({
      status: "ENVIADA",
      idorcamentoAthos: idorcamento,
      pdfDisponivel: true,
      assinante: { nome: "Fulano de Tal", cargo: "Secretario", cpf: null },
    });
    expect(lida.json.senhaBalcao).toBe(gerada.json.senhaBalcao);
    expect(lida.json.athosData).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lida.json.athosHora).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(JSON.stringify(lida.json)).not.toContain("pdfSnapshot");

    const registro = prisma._propostas.find((p) => p.id === id)!;
    expect(registro.lancandoEm).toBeInstanceOf(Date);
    expect(registro.pdfSnapshot).toMatchObject({
      versao: 1,
      banco: { bancoNome: expect.any(String), agencia: expect.any(String), conta: expect.any(String) },
      empresa: { nome: "Empresa Ficticia de Teste Ltda", cnpj: "00.000.000/0001-00" },
      template: { origem: expect.stringMatching(/^(BANCO|EMPACOTADO)$/) },
    });
    expect(String((registro.pdfSnapshot as any).template.source).length).toBeGreaterThan(0);

    // --- PDF armazenado: nome sob propostas/ e conteudo %PDF
    expect(registro.pdfObjectName).toMatch(/^propostas\//);
    expect(registro.pdfObjectName).toContain(String(idorcamento));
    const pdf = objetosPdf.get(registro.pdfObjectName as string);
    expect(pdf).toBeDefined();
    expect((pdf as Buffer).subarray(0, 4).toString("latin1")).toBe("%PDF");

    // --- as tres tabelas do Athos
    const cab = await pg.query(
      `SELECT valor::text AS valor, desconto::text AS desconto, descontors::text AS descontors, obs, idcliente,
              to_char(dataorcamento, 'YYYY-MM-DD') AS data, to_char(hora, 'HH24:MI:SS') AS hora, senhabalcao
         FROM orcamento WHERE idorcamento = $1`,
      [idorcamento],
    );
    expect(cab.rows).toHaveLength(1);
    const o = cab.rows[0];
    expect(Number(o.desconto)).toBe(0);
    expect(Number(o.descontors)).toBe(0);
    expect(o.idcliente).toBe(idcliente);
    expect(String(o.obs).startsWith(MARCADOR_OBS_PROPOSTA)).toBe(true);
    expect(lida.json.athosData).toBe(o.data);
    expect(lida.json.athosHora).toBe(o.hora);
    expect(lida.json.senhaBalcao).toBe(Number(o.senhabalcao));

    const itens = await pg.query(
      `SELECT idproduto, quantidadeitem::text AS q, valoritem::text AS v, valordesconto::text AS vd,
              orcamentodesconto::text AS od, orcamentovalorfinalitem::text AS vf
         FROM orcamento_item WHERE idorcamento = $1 ORDER BY sequenciaitem`,
      [idorcamento],
    );
    expect(itens.rows).toHaveLength(2);
    let soma = 0;
    for (const it0 of itens.rows) {
      // Preco final da proposta (sem desconto) em valoritem; total da linha em orcamentovalorfinalitem.
      expect(Number(it0.v)).toBe(precoFinalPorProduto.get(it0.idproduto));
      expect(Number(it0.q)).toBe(quantidadePorProduto.get(it0.idproduto));
      expect(Number(it0.vd)).toBe(0);
      expect(Number(it0.od)).toBe(0);
      soma += Number(it0.vf);
    }
    const ajustadoNoAthos = itens.rows.find((r) => r.idproduto === produtoB);
    expect(Number(ajustadoNoAthos.v)).toBe(2.9);
    expect(Number(ajustadoNoAthos.v)).toBeLessThan(precoCadastro);
    // Total do cabecalho = soma das linhas = total da proposta.
    expect(Number(o.valor)).toBeCloseTo(soma, 2);
    expect(Number(o.valor)).toBeCloseTo(Number(lida.json.total), 2);

    const pag = await pg.query(`SELECT valor::text AS valor FROM orcamento_forma_pagamento WHERE idorcamento = $1`, [idorcamento]);
    expect(pag.rows).toHaveLength(1);
    expect(Number(pag.rows[0].valor)).toBeCloseTo(Number(o.valor), 2);

    // --- segunda chamada: recusada (a proposta ja foi lancada) e sem nova escrita no Athos
    const segunda = await chamar("POST", `/propostas/${id}/gerar`, { assinanteNome: "Fulano de Tal", confirmar: true });
    expect(segunda.status).toBe(409);
    expect(segunda.json.codigo).toBe("TRANSICAO_INVALIDA");
    expect(espiaoCriarProposta).toHaveBeenCalledTimes(1);
    const existentes = await pg.query("SELECT count(*)::int AS n FROM orcamento WHERE obs = $1", [o.obs]);
    expect(existentes.rows[0].n).toBe(1);
  }, 120_000);
});
