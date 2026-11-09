/**
 * Teste de integracao HTTP REAL contra o CLONE do Athos (container athos-teste).
 *
 * Fase 44 / plano 44-01. Somente executa com ATHOS_IT_CLONE=1; sem isso (CI) a suite fica
 * em describe.skip. Trava dupla: so aceita 127.0.0.1:5440, banco "athos". A senha do clone
 * NUNCA fica neste arquivo: vem de ATHOS_PG_PASS na linha de comando.
 *
 * Comando:
 *   ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos \
 *   ATHOS_PG_USER=postgres ATHOS_PG_PASS=<senha-do-clone> \
 *   ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 \
 *   ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 \
 *   npm --prefix apps/backend run test -- athos-orcamento.clone --no-coverage
 */
import { ValidationPipe, INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Client } from "pg";

import { randomBytes } from "crypto";

import { PrismaService } from "../../database/prisma.service";
import { InternalAuthGuard } from "../../security/internal-auth.guard";
import { AthosOrcamentoController } from "./athos-orcamento.controller";
import { AthosOrcamentoIdempotenciaService, refDoOrcamento } from "./athos-orcamento-idempotencia.service";
import { AthosOrcamentoService } from "./athos-orcamento.service";

const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;

/** Prisma falso em memoria (por idempotencyKey): o IT nunca toca o banco do Sistema. */
function criarPrismaFalso() {
  const linhas = new Map<string, Record<string, any>>();
  const auditoriaSemChave: Record<string, any>[] = [];
  return {
    linhas,
    auditoriaSemChave,
    athosOrcamentoIa: {
      create: async ({ data }: { data: Record<string, any> }) => {
        if (data.idempotencyKey == null) {
          auditoriaSemChave.push({ ...data });
          return data;
        }
        if (linhas.has(data.idempotencyKey)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        linhas.set(data.idempotencyKey, { ...data });
        return data;
      },
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => linhas.get(where.idempotencyKey) ?? null,
      update: async ({ where, data }: { where: { idempotencyKey: string }; data: Record<string, any> }) => {
        const atual = linhas.get(where.idempotencyKey);
        if (!atual) throw new Error("registro inexistente");
        Object.assign(atual, data);
        return atual;
      },
      delete: async ({ where }: { where: { idempotencyKey: string } }) => {
        linhas.delete(where.idempotencyKey);
        return {};
      },
    },
  };
}

rodar("IT clone athos-teste: POST /api/athos/orcamentos", () => {
  const CHAVE = "chave-it-local-44";
  const envsGuardadas: Record<string, string | undefined> = {};
  const idsCriados: number[] = [];
  let app: INestApplication;
  let pg: Client;
  let base = "";
  let produtoA = 0;
  let produtoB = 0;

  function definirEnv(chave: string, valor: string) {
    if (!(chave in envsGuardadas)) envsGuardadas[chave] = process.env[chave];
    process.env[chave] = valor;
  }

  async function postar(corpo: unknown, chave: string | undefined = CHAVE, idempotencyKey?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (chave) headers["x-internal-api-key"] = chave;
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const res = await fetch(`${base}/api/athos/orcamentos`, { method: "POST", headers, body: JSON.stringify(corpo) });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  beforeAll(async () => {
    // Trava dupla ANTES de criar qualquer cliente pg ou app.
    if (
      process.env.ATHOS_PG_HOST !== "127.0.0.1" ||
      process.env.ATHOS_PG_PORT !== "5440" ||
      process.env.ATHOS_PG_DB !== "athos"
    ) {
      throw new Error("IT bloqueado: somente o clone local 127.0.0.1:5440/athos");
    }
    definirEnv("ATHOS_ORCAMENTO_ESCRITA", "true");
    definirEnv("INTERNAL_API_KEY", CHAVE);

    pg = new Client({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
    await pg.connect();

    // Produtos escolhidos dinamicamente (nunca ids fixos).
    const escolhidos = await pg.query<{ idproduto: number }>(
      `SELECT idproduto FROM produto
        WHERE statusproduto = true AND COALESCE(vendeproduto, true)
          AND precovendaproduto(idproduto) >= 10 AND COALESCE(permitefracionar, true)
        ORDER BY idproduto LIMIT 2`,
    );
    if (escolhidos.rows.length < 2) throw new Error("Clone sem 2 produtos elegiveis para o IT");
    produtoA = escolhidos.rows[0].idproduto;
    produtoB = escolhidos.rows[1].idproduto;

    const modulo = await Test.createTestingModule({
      controllers: [AthosOrcamentoController],
      providers: [
        AthosOrcamentoService,
        AthosOrcamentoIdempotenciaService,
        { provide: PrismaService, useValue: criarPrismaFalso() },
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
    try {
      if (pg && idsCriados.length > 0) {
        await pg.query("DELETE FROM orcamento_forma_pagamento WHERE idorcamento = ANY($1::int[])", [idsCriados]);
        await pg.query("DELETE FROM orcamento_item WHERE idorcamento = ANY($1::int[])", [idsCriados]);
        await pg.query("DELETE FROM orcamento WHERE idorcamento = ANY($1::int[])", [idsCriados]);
      }
    } finally {
      if (pg) await pg.end();
      if (app) await app.close();
      for (const [k, v] of Object.entries(envsGuardadas)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("IT1 cria orcamento via HTTP e grava as 3 tabelas", async () => {
    const { status, json } = await postar({
      itens: [
        { idproduto: produtoA, quantidade: 2 },
        { idproduto: produtoB, quantidade: 1 },
      ],
      obs: "teste IT fase 44",
    });
    expect(status).toBe(201);
    expect(json.simulado).toBe(false);
    expect(json.idorcamento).toBeGreaterThan(0);
    expect(json.senhabalcao).toBeGreaterThan(0);
    idsCriados.push(json.idorcamento);

    const cab = await pg.query(
      `SELECT statusorcamento, statusimpressao, obs, idfuncionariousuario, idvendedor, idterminal,
              descontors::text AS descontors, desconto::text AS desconto, valor::text AS valor,
              (round(2 * precovendaproduto($2), 2) + round(1 * precovendaproduto($3), 2))::text AS esperado
         FROM orcamento WHERE idorcamento = $1`,
      [json.idorcamento, produtoA, produtoB],
    );
    expect(cab.rows).toHaveLength(1);
    const o = cab.rows[0];
    expect(o.statusorcamento).toBeNull();
    expect(o.statusimpressao).toBe(false);
    expect(String(o.obs)).toMatch(/^\[IA\]/);
    expect(o.idfuncionariousuario).toBe(Number(process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO));
    expect(o.idvendedor).toBe(Number(process.env.ATHOS_ORCAMENTO_ID_VENDEDOR));
    expect(o.idterminal).toBe(Number(process.env.ATHOS_ORCAMENTO_ID_TERMINAL));
    expect(Number(o.descontors)).toBe(0);
    expect(Number(o.desconto)).toBe(0);
    expect(Number(o.valor)).toBeCloseTo(Number(o.esperado), 2);

    const itens = await pg.query(
      `SELECT i.sequenciaitem, i.idproduto, i.quantidadeitem::text AS q, i.valoritem::text AS v,
              i.orcamentodesconto::text AS od, i.orcamentovalorfinalitem::text AS vf,
              i.valordesconto::text AS vd, i.valorcomissao::text AS vc,
              (i.valoritem = precovendaproduto(i.idproduto)) AS preco_ok,
              (i.orcamentovalorfinalitem = round(i.quantidadeitem * i.valoritem, 2)) AS final_ok
         FROM orcamento_item i WHERE i.idorcamento = $1 ORDER BY i.sequenciaitem`,
      [json.idorcamento],
    );
    expect(itens.rows).toHaveLength(2);
    expect(itens.rows.map((r) => r.sequenciaitem)).toEqual([1, 2]);
    expect(itens.rows.map((r) => r.idproduto)).toEqual([produtoA, produtoB]);
    for (const r of itens.rows) {
      expect(r.preco_ok).toBe(true);
      expect(r.final_ok).toBe(true);
      expect(Number(r.od)).toBe(0);
      expect(Number(r.vd)).toBe(0);
      expect(Number(r.vc)).toBe(0);
    }

    const pag = await pg.query(
      `SELECT idformapagamento, idcondicaopagamento, valor::text AS valor, valorrecebido::text AS recebido
         FROM orcamento_forma_pagamento WHERE idorcamento = $1`,
      [json.idorcamento],
    );
    expect(pag.rows).toHaveLength(1);
    expect(pag.rows[0].idformapagamento).toBe(5);
    expect(pag.rows[0].idcondicaopagamento).toBe(0);
    expect(Number(pag.rows[0].valor)).toBeCloseTo(Number(o.valor) - Number(o.descontors), 2);
    expect(Number(pag.rows[0].recebido)).toBeCloseTo(Number(pag.rows[0].valor), 2);

    // A resposta HTTP traz os mesmos valores em texto.
    expect(json.valorBruto).toBe(Number(o.valor).toFixed(2));
    expect(json.valorLiquido).toBe(Number(o.valor).toFixed(2));
    expect(json.itens).toHaveLength(2);
    expect(json.itens[0].sequenciaitem).toBe(1);
    expect(json.itens[0].valorFinal).toBe(Number(itens.rows[0].vf).toFixed(2));
    expect(json.itens[1].valorFinal).toBe(Number(itens.rows[1].vf).toFixed(2));
    expect(json.pagamento.idformapagamento).toBe(5);
  });

  it("IT2 flag desligada nao grava", async () => {
    const antes = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento");
    process.env.ATHOS_ORCAMENTO_ESCRITA = "false";
    try {
      const { status, json } = await postar({ itens: [{ idproduto: produtoA, quantidade: 1 }] });
      expect(status).toBe(503);
      expect(json.codigo).toBe("ESCRITA_DESABILITADA");
    } finally {
      process.env.ATHOS_ORCAMENTO_ESCRITA = "true";
    }
    const depois = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento");
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });

  async function contarPorRef(ref: string): Promise<number> {
    const r = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento WHERE obs LIKE $1", [
      `[IA] ref:${ref}%`,
    ]);
    return Number(r.rows[0].n);
  }

  it("IT3 replay com a mesma Idempotency-Key nao duplica o orcamento", async () => {
    const idem = randomBytes(16).toString("hex");
    const corpo = { itens: [{ idproduto: produtoA, quantidade: 1 }], obs: "teste IT3 fase 44" };

    const primeiro = await postar(corpo, CHAVE, idem);
    expect(primeiro.status).toBe(201);
    expect(primeiro.json.idorcamento).toBeGreaterThan(0);
    expect(primeiro.json.replay).toBeUndefined();
    idsCriados.push(primeiro.json.idorcamento);

    const segundo = await postar(corpo, CHAVE, idem);
    expect(segundo.status).toBe(201);
    expect(segundo.json.idorcamento).toBe(primeiro.json.idorcamento);
    expect(segundo.json.senhabalcao).toBe(primeiro.json.senhabalcao);
    expect(segundo.json.replay).toBe(true);

    expect(await contarPorRef(refDoOrcamento(idem))).toBe(1);
  });

  it("IT4 mesma chave com outro corpo -> 409 e nenhum orcamento novo", async () => {
    const idem = randomBytes(16).toString("hex");
    const primeiro = await postar({ itens: [{ idproduto: produtoA, quantidade: 1 }] }, CHAVE, idem);
    expect(primeiro.status).toBe(201);
    idsCriados.push(primeiro.json.idorcamento);

    const outro = await postar({ itens: [{ idproduto: produtoA, quantidade: 2 }] }, CHAVE, idem);
    expect(outro.status).toBe(409);
    expect(outro.json.codigo).toBe("IDEMPOTENCY_KEY_REUTILIZADA");

    expect(await contarPorRef(refDoOrcamento(idem))).toBe(1);
  });

  async function ler(caminho: string, chave: string | null = CHAVE) {
    const headers: Record<string, string> = {};
    if (chave) headers["x-internal-api-key"] = chave;
    const res = await fetch(`${base}/api/athos/orcamentos${caminho}`, { headers });
    const json = (await res.json()) as any;
    return { status: res.status, json };
  }

  /** Orcamento criado no IT5, reaproveitado pelo IT8. */
  let orcamentoIT5: { id: number; resposta: Record<string, any> } | null = null;

  it("IT5 desconto e fracao: invariantes do Balcao nas 3 tabelas", async () => {
    const { status, json } = await postar({
      itens: [
        { idproduto: produtoA, quantidade: 1.5, descontoRS: 0.1 },
        { idproduto: produtoB, quantidade: 2 },
      ],
      descontoTotalRS: 0.37,
      obs: "teste IT5 fase 44",
    });
    expect(status).toBe(201);
    expect(json.simulado).toBe(false);
    idsCriados.push(json.idorcamento);
    orcamentoIT5 = { id: json.idorcamento, resposta: json };

    const inv = await pg.query(
      `SELECT o.valor::text AS valor, o.descontors::text AS descontors, o.desconto::text AS desconto,
              (o.descontors = (SELECT sum(orcamentodesconto) FROM orcamento_item WHERE idorcamento = o.idorcamento)) AS desc_ok,
              (o.desconto = round(o.descontors / o.valor * 100, 3)) AS pct_ok,
              (o.valor = (SELECT sum(round(quantidadeitem * valoritem, 2)) FROM orcamento_item WHERE idorcamento = o.idorcamento)) AS valor_ok,
              ((o.valor - o.descontors) = (SELECT sum(orcamentovalorfinalitem) FROM orcamento_item WHERE idorcamento = o.idorcamento)) AS final_ok,
              ((o.valor - o.descontors) = (SELECT sum(valor) FROM orcamento_forma_pagamento WHERE idorcamento = o.idorcamento)) AS pag_ok,
              ((o.valor - o.descontors) = (SELECT sum(valorrecebido) FROM orcamento_forma_pagamento WHERE idorcamento = o.idorcamento)) AS recebido_ok,
              (SELECT count(*) FROM orcamento_forma_pagamento WHERE idorcamento = o.idorcamento)::int AS n_pag,
              (SELECT quantidadeitem::text FROM orcamento_item WHERE idorcamento = o.idorcamento AND sequenciaitem = 1) AS q1,
              (SELECT orcamentodesconto FROM orcamento_item WHERE idorcamento = o.idorcamento AND sequenciaitem = 1) >= 0.10 AS item1_desc_ok
         FROM orcamento o WHERE o.idorcamento = $1`,
      [json.idorcamento],
    );
    const o = inv.rows[0];
    expect(Number(o.descontors)).toBeCloseTo(0.47, 2);
    expect(o.desc_ok).toBe(true);
    expect(o.pct_ok).toBe(true);
    expect(o.valor_ok).toBe(true);
    expect(o.final_ok).toBe(true);
    expect(o.pag_ok).toBe(true);
    expect(o.recebido_ok).toBe(true);
    expect(o.n_pag).toBe(1);
    expect(Number(o.q1)).toBeCloseTo(1.5, 3);
    expect(o.item1_desc_ok).toBe(true);

    // A resposta HTTP traz os mesmos numeros.
    expect(Number(json.valorBruto)).toBeCloseTo(Number(o.valor), 2);
    expect(Number(json.descontoRS)).toBeCloseTo(Number(o.descontors), 2);
    expect(Number(json.descontoPercentual)).toBeCloseTo(Number(o.desconto), 3);
    expect(Number(json.valorLiquido)).toBeCloseTo(Number(o.valor) - Number(o.descontors), 2);
  });

  it("IT6 simulacao nao grava (mesmo com a escrita desligada)", async () => {
    const contar = async () =>
      (await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento")).rows[0].n;
    const antes = await contar();
    process.env.ATHOS_ORCAMENTO_ESCRITA = "false";
    try {
      const { status, json } = await postar({
        itens: [{ idproduto: produtoA, quantidade: 1.5, descontoRS: 0.1 }],
        descontoTotalRS: 0.37,
        simular: true,
      });
      expect(status).toBe(201);
      expect(json.simulado).toBe(true);
      expect(json.idorcamento).toBeNull();
      expect(json.senhabalcao).toBeNull();
      expect(Number(json.descontoRS)).toBeCloseTo(0.47, 2);
    } finally {
      process.env.ATHOS_ORCAMENTO_ESCRITA = "true";
    }
    expect(await contar()).toBe(antes);
  });

  it("IT7 busca: o produto vem primeiro com o preco do Athos", async () => {
    const esperado = await pg.query<{ preco: string }>("SELECT precovendaproduto($1)::text AS preco", [produtoA]);
    const { status, json } = await ler(`/produtos?q=${produtoA}&limit=5`);
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].idproduto).toBe(produtoA);
    expect(json[0].preco).toBe(esperado.rows[0].preco);
    expect(JSON.stringify(json)).not.toMatch(/custo/i);
    for (const campo of ["descricao", "marca", "referencia", "codigoBarra", "emPromocao", "estoqueLoja", "estoqueDeposito", "permiteFracionar", "descontoMaximo", "unidade"]) {
      expect(json[0]).toHaveProperty(campo);
    }

    // Busca textual com caracteres especiais do LIKE nao quebra e nao devolve tudo.
    const curinga = await ler(`/produtos?q=${encodeURIComponent("%_\\")}&limit=3`);
    expect(curinga.status).toBe(200);
    expect(Array.isArray(curinga.json)).toBe(true);
  });

  it("IT8 leitura do orcamento criado no IT5", async () => {
    expect(orcamentoIT5).not.toBeNull();
    const { id, resposta } = orcamentoIT5 as { id: number; resposta: Record<string, any> };
    const { status, json } = await ler(`/${id}`);
    expect(status).toBe(200);
    expect(json.idorcamento).toBe(id);
    expect(json.senhabalcao).toBe(resposta.senhabalcao);
    expect(json.status).toBe("aberto");
    expect(Number(json.valorBruto)).toBeCloseTo(Number(resposta.valorBruto), 2);
    expect(Number(json.descontoRS)).toBeCloseTo(Number(resposta.descontoRS), 2);
    expect(Number(json.valorLiquido)).toBeCloseTo(Number(resposta.valorLiquido), 2);
    expect(json.itens).toHaveLength(2);
    expect(json.itens.map((i: any) => i.idproduto)).toEqual([produtoA, produtoB]);
    expect(Number(json.itens[0].quantidade)).toBeCloseTo(1.5, 3);
    expect(json.pagamentos).toHaveLength(1);
    expect(json.pagamentos[0].idformapagamento).toBe(5);
    expect(Number(json.pagamentos[0].valor)).toBeCloseTo(Number(resposta.valorLiquido), 2);
  });

  it("IT9 orcamento inexistente -> 404 ORCAMENTO_INEXISTENTE", async () => {
    const m = await pg.query<{ n: string }>("SELECT (COALESCE(max(idorcamento), 0) + 1000000)::text AS n FROM orcamento");
    const { status, json } = await ler(`/${m.rows[0].n}`);
    expect(status).toBe(404);
    expect(json.codigo).toBe("ORCAMENTO_INEXISTENTE");
  });

  it("IT10 GETs sem x-internal-api-key -> 401", async () => {
    expect((await ler(`/produtos?q=${produtoA}`, null)).status).toBe(401);
    expect((await ler(`/${orcamentoIT5?.id ?? 1}`, null)).status).toBe(401);
  });
});
