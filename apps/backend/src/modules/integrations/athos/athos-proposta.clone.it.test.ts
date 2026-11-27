/**
 * Teste de integracao de ESCRITA da proposta contra o CLONE do Athos (container athos-teste).
 *
 * Fase 55 / plano 55-04. Somente executa com ATHOS_IT_CLONE=1; sem isso (CI) a suite fica em describe.skip.
 * Trava dupla: so aceita 127.0.0.1:5440, banco "athos". A senha do clone NUNCA fica neste arquivo: vem de
 * ATHOS_PG_PASS na linha de comando. Cada orcamento criado e apagado em afterAll (3 tabelas), so no clone.
 *
 * Comando:
 *   ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos \
 *   ATHOS_PG_USER=postgres ATHOS_PG_PASS=<senha-do-clone> \
 *   ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 \
 *   ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 PROPOSTA_ESCRITA_ATIVA=true \
 *   npm --prefix apps/backend run test -- athos-proposta.clone --no-coverage
 */
import { randomBytes } from "crypto";

import { Client } from "pg";

import {
  AthosOrcamentoService,
  MARCADOR_OBS_PROPOSTA,
  OrcamentoAthosError,
  SQL_INSERIR_ITEM,
  SQL_INSERIR_ORCAMENTO,
  SQL_INSERIR_PAGAMENTO,
  SQL_LIMPAR_PAGAMENTO,
} from "./athos-orcamento.service";

const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;

rodar("IT clone athos-teste: criarOrcamentoProposta (escrita)", () => {
  const envsGuardadas: Record<string, string | undefined> = {};
  const idsCriados: number[] = [];
  const refsCriados: string[] = [];
  let pg: Client;
  let servico: AthosOrcamentoService;
  let idcliente = 0;
  let produtoA = 0;
  /** Produto que permite fracionar (quantidade com 3 casas). */
  let produtoFrac = 0;

  function definirEnv(chave: string, valor: string) {
    if (!(chave in envsGuardadas)) envsGuardadas[chave] = process.env[chave];
    process.env[chave] = valor;
  }

  function novoRef(): string {
    const ref = randomBytes(6).toString("hex");
    refsCriados.push(ref);
    return ref;
  }

  beforeAll(async () => {
    // Trava dupla ANTES de criar qualquer cliente pg.
    if (
      process.env.ATHOS_PG_HOST !== "127.0.0.1" ||
      process.env.ATHOS_PG_PORT !== "5440" ||
      process.env.ATHOS_PG_DB !== "athos"
    ) {
      throw new Error("IT bloqueado: somente o clone local 127.0.0.1:5440/athos");
    }
    definirEnv("PROPOSTA_ESCRITA_ATIVA", "true");

    pg = new Client({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
    await pg.connect();

    // Produto e cliente escolhidos dinamicamente (nunca ids fixos).
    const prod = await pg.query<{ idproduto: number }>(
      `SELECT idproduto FROM produto
        WHERE statusproduto = true AND COALESCE(vendeproduto, true)
          AND precovendaproduto(idproduto) >= 3 AND NOT COALESCE(permitefracionar, true)
        ORDER BY idproduto LIMIT 1`,
    );
    if (prod.rows.length < 1) throw new Error("Clone sem produto elegivel (ativo, vendavel, nao fracionado, preco >= 3)");
    produtoA = prod.rows[0].idproduto;

    const frac = await pg.query<{ idproduto: number }>(
      `SELECT idproduto FROM produto
        WHERE statusproduto = true AND COALESCE(vendeproduto, true)
          AND precovendaproduto(idproduto) >= 3 AND COALESCE(permitefracionar, true)
        ORDER BY idproduto LIMIT 1`,
    );
    if (frac.rows.length < 1) throw new Error("Clone sem produto fracionavel elegivel");
    produtoFrac = frac.rows[0].idproduto;

    const cli = await pg.query<{ idcliente: number }>("SELECT idcliente FROM cliente ORDER BY idcliente LIMIT 1");
    if (cli.rows.length < 1) throw new Error("Clone sem cliente");
    idcliente = cli.rows[0].idcliente;

    servico = new AthosOrcamentoService();
  });

  afterAll(async () => {
    try {
      if (pg) {
        // Apaga o que o proprio IT criou: pelos ids devolvidos e, por garantia, pelos refs gerados aqui.
        const porRef =
          refsCriados.length > 0
            ? await pg.query<{ idorcamento: number }>("SELECT idorcamento FROM orcamento WHERE obs = ANY($1::text[])", [
                refsCriados.map((r) => `${MARCADOR_OBS_PROPOSTA}${r}`),
              ])
            : { rows: [] as Array<{ idorcamento: number }> };
        const ids = [...new Set([...idsCriados, ...porRef.rows.map((r) => Number(r.idorcamento))])];
        if (ids.length > 0) {
          await pg.query("DELETE FROM orcamento_forma_pagamento WHERE idorcamento = ANY($1::int[])", [ids]);
          await pg.query("DELETE FROM orcamento_item WHERE idorcamento = ANY($1::int[])", [ids]);
          await pg.query("DELETE FROM orcamento WHERE idorcamento = ANY($1::int[])", [ids]);
        }
      }
    } finally {
      if (pg) await pg.end();
      if (servico) await servico.onModuleDestroy();
      for (const [k, v] of Object.entries(envsGuardadas)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("tracer: item a 2,90 sobre cadastro >= 3,00 e gravado como 2.900 sem desconto (D-03)", async () => {
    const ref = novoRef();
    const res = await servico.criarOrcamentoProposta({
      idcliente,
      ref,
      itens: [{ idproduto: produtoA, quantidade: "2", precoUnitario: "2.90", custoUnitario: "1.500" }],
    });
    expect(res.recuperado).toBe(false);
    expect(res.idorcamento).toBeGreaterThan(0);
    expect(res.valorTotal).toBe("5.80");
    idsCriados.push(res.idorcamento);

    const cab = await pg.query(
      `SELECT valor::text AS valor, desconto::text AS desconto, descontors::text AS descontors, obs, statusorcamento,
              idcliente, to_char(dataorcamento, 'YYYY-MM-DD') AS data, to_char(hora, 'HH24:MI:SS') AS hora,
              senhabalcao
         FROM orcamento WHERE idorcamento = $1`,
      [res.idorcamento],
    );
    expect(cab.rows).toHaveLength(1);
    const o = cab.rows[0];
    expect(Number(o.valor)).toBe(5.8);
    expect(Number(o.desconto)).toBe(0);
    expect(Number(o.descontors)).toBe(0);
    expect(o.obs).toBe(`${MARCADOR_OBS_PROPOSTA}${ref}`);
    expect(o.statusorcamento).toBeNull();
    expect(o.idcliente).toBe(idcliente);
    // Pitfall 13: data e hora devolvidas sao as gravadas pelo Athos.
    expect(res.data).toBe(o.data);
    expect(res.hora).toBe(o.hora);
    expect(res.senhabalcao).toBe(Number(o.senhabalcao));

    const itens = await pg.query(
      `SELECT i.sequenciaitem, i.idproduto, i.quantidadeitem::text AS q, i.valoritem::text AS v,
              i.valordesconto::text AS vd, i.orcamentodesconto::text AS od, i.orcamentovalorfinalitem::text AS vf,
              i.valorcustoitem::text AS custo, precovendaproduto(i.idproduto)::text AS cadastro
         FROM orcamento_item i WHERE i.idorcamento = $1 ORDER BY i.sequenciaitem`,
      [res.idorcamento],
    );
    expect(itens.rows).toHaveLength(1);
    const it0 = itens.rows[0];
    expect(it0.idproduto).toBe(produtoA);
    expect(Number(it0.q)).toBe(2);
    expect(Number(it0.v)).toBe(2.9);
    expect(Number(it0.v)).toBeLessThan(Number(it0.cadastro));
    expect(Number(it0.vd)).toBe(0);
    expect(Number(it0.od)).toBe(0);
    expect(Number(it0.vf)).toBe(5.8);
    expect(Number(it0.custo)).toBe(1.5);

    const pag = await pg.query(
      `SELECT idformapagamento, idcondicaopagamento, valor::text AS valor, valorrecebido::text AS recebido
         FROM orcamento_forma_pagamento WHERE idorcamento = $1`,
      [res.idorcamento],
    );
    expect(pag.rows).toHaveLength(1);
    expect(pag.rows[0].idformapagamento).toBe(Number(process.env.ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO));
    expect(Number(pag.rows[0].valor)).toBe(5.8);
    expect(Number(pag.rows[0].recebido)).toBe(5.8);
  });

  it("dois itens: valor do cabecalho = soma das linhas = SUM(round(quantidadeitem * valoritem, 2))", async () => {
    const ref = novoRef();
    // Item 1: base de 3 casas no cadastro (ex.: 3,456) ja convertida em centavos pela proposta (3,46).
    // Item 2: quantidade com 3 casas, linha 1.333 x 3.33 = 4.43889 -> 4.44 (half-up).
    const res = await servico.criarOrcamentoProposta({
      idcliente,
      ref,
      itens: [
        { idproduto: produtoA, quantidade: "3", precoUnitario: "3.46", custoUnitario: "2.345" },
        { idproduto: produtoFrac, quantidade: "1.333", precoUnitario: "3.33", custoUnitario: "1.111" },
      ],
    });
    idsCriados.push(res.idorcamento);
    expect(res.valorTotal).toBe("14.82");

    const r = await pg.query(
      `SELECT o.valor::text AS valor, o.descontors::text AS descontors, o.desconto::text AS desconto,
              (SELECT sum(orcamentovalorfinalitem) FROM orcamento_item WHERE idorcamento = o.idorcamento)::text AS soma_final,
              (SELECT sum(round(quantidadeitem * valoritem, 2)) FROM orcamento_item WHERE idorcamento = o.idorcamento)::text AS soma_round,
              (SELECT sum(orcamentodesconto) FROM orcamento_item WHERE idorcamento = o.idorcamento)::text AS soma_desc,
              (SELECT count(*) FROM orcamento_forma_pagamento WHERE idorcamento = o.idorcamento)::int AS n_pag,
              (SELECT valor FROM orcamento_forma_pagamento WHERE idorcamento = o.idorcamento)::text AS pag
         FROM orcamento o WHERE o.idorcamento = $1`,
      [res.idorcamento],
    );
    const o = r.rows[0];
    expect(Number(o.valor)).toBe(14.82);
    expect(Number(o.soma_final)).toBe(Number(o.valor));
    expect(Number(o.soma_round)).toBe(Number(o.valor));
    expect(Number(o.soma_desc)).toBe(0);
    expect(Number(o.descontors)).toBe(0);
    expect(Number(o.desconto)).toBe(0);
    expect(o.n_pag).toBe(1);
    expect(Number(o.pag)).toBe(14.82);

    const itens = await pg.query(
      `SELECT sequenciaitem, idproduto, quantidadeitem::text AS q, valoritem::text AS v, orcamentovalorfinalitem::text AS vf
         FROM orcamento_item WHERE idorcamento = $1 ORDER BY sequenciaitem`,
      [res.idorcamento],
    );
    expect(itens.rows.map((i) => i.sequenciaitem)).toEqual([1, 2]);
    expect(Number(itens.rows[0].v)).toBe(3.46);
    expect(Number(itens.rows[0].vf)).toBe(10.38);
    expect(Number(itens.rows[1].q)).toBe(1.333);
    expect(Number(itens.rows[1].vf)).toBe(4.44);
  });

  it("idempotencia real: segunda chamada com o mesmo ref devolve recuperado=true e nao duplica", async () => {
    const ref = novoRef();
    const entrada = {
      idcliente,
      ref,
      itens: [{ idproduto: produtoA, quantidade: "1", precoUnitario: "2.90", custoUnitario: "1.000" }],
    };
    const primeira = await servico.criarOrcamentoProposta(entrada);
    idsCriados.push(primeira.idorcamento);
    expect(primeira.recuperado).toBe(false);

    const segunda = await servico.criarOrcamentoProposta(entrada);
    expect(segunda.recuperado).toBe(true);
    expect(segunda.idorcamento).toBe(primeira.idorcamento);
    expect(segunda.senhabalcao).toBe(primeira.senhabalcao);
    expect(segunda.data).toBe(primeira.data);
    expect(segunda.hora).toBe(primeira.hora);
    expect(segunda.valorTotal).toBe("2.90");

    const n = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento WHERE obs = $1", [
      `${MARCADOR_OBS_PROPOSTA}${ref}`,
    ]);
    expect(n.rows[0].n).toBe("1");
    const itens = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento_item WHERE idorcamento = $1", [
      primeira.idorcamento,
    ]);
    expect(itens.rows[0].n).toBe("1");

    // A leitura de recuperacao (somente leitura) tambem enxerga o mesmo orcamento.
    const lido = await servico.buscarOrcamentoPorRefProposta(ref);
    expect(lido?.idorcamento).toBe(primeira.idorcamento);
    expect(await servico.buscarOrcamentoPorRefProposta(randomBytes(6).toString("hex"))).toBeNull();
  });

  it("cliente inexistente responde CLIENTE_INEXISTENTE e nao cria nada", async () => {
    const ref = novoRef();
    const contar = async () => (await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento")).rows[0].n;
    const antes = await contar();
    const inexistente = await pg.query<{ n: number }>("SELECT (COALESCE(max(idcliente), 0) + 1000000)::int AS n FROM cliente");

    let erro: unknown;
    try {
      await servico.criarOrcamentoProposta({
        idcliente: inexistente.rows[0].n,
        ref,
        itens: [{ idproduto: produtoA, quantidade: "1", precoUnitario: "2.90", custoUnitario: "1.000" }],
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(OrcamentoAthosError);
    expect((erro as OrcamentoAthosError).codigo).toBe("CLIENTE_INEXISTENTE");
    expect(await contar()).toBe(antes);
    const porRef = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento WHERE obs = $1", [
      `${MARCADOR_OBS_PROPOSTA}${ref}`,
    ]);
    expect(porRef.rows[0].n).toBe("0");
  });

  it("flag da proposta desligada nao grava (mesmo com a flag da IA ligada)", async () => {
    const contar = async () => (await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento")).rows[0].n;
    const antes = await contar();
    definirEnv("ATHOS_ORCAMENTO_ESCRITA", "true");
    process.env.PROPOSTA_ESCRITA_ATIVA = "false";
    try {
      await expect(
        servico.criarOrcamentoProposta({
          idcliente,
          ref: novoRef(),
          itens: [{ idproduto: produtoA, quantidade: "1", precoUnitario: "2.90", custoUnitario: "1.000" }],
        }),
      ).rejects.toMatchObject({ codigo: "ESCRITA_DESABILITADA" });
    } finally {
      process.env.PROPOSTA_ESCRITA_ATIVA = "true";
    }
    expect(await contar()).toBe(antes);
  });

  it("variante ROLLBACK (sem o servico): o Athos aceita preco 2.90 sobre cadastro 3.30 com desconto 0 e o ROLLBACK desfaz tudo", async () => {
    // Espelha a validacao de 2026-11-27 do CONTEXT: INSERT aceito e, depois, ROLLBACK.
    const tx = new Client({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
    await tx.connect();
    let idorcamento = 0;
    try {
      await tx.query("BEGIN");
      const cab = await tx.query<{ idorcamento: number }>(SQL_INSERIR_ORCAMENTO, [
        "0.00",
        Number(process.env.ATHOS_ORCAMENTO_ID_VENDEDOR),
        idcliente,
        Number(process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO),
        Number(process.env.ATHOS_ORCAMENTO_ID_TERMINAL),
        "5.80",
        "0.000",
        `${MARCADOR_OBS_PROPOSTA}ffffffffffff`,
      ]);
      idorcamento = Number(cab.rows[0].idorcamento);
      expect(idorcamento).toBeGreaterThan(0);
      await tx.query(SQL_INSERIR_ITEM, [idorcamento, 1, produtoA, "2.000", "2.900", "1.500", "0.00", "5.80"]);
      await tx.query(SQL_LIMPAR_PAGAMENTO, [idorcamento]);
      await tx.query(SQL_INSERIR_PAGAMENTO, [
        idorcamento,
        Number(process.env.ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO),
        "5.80",
        "5.80",
      ]);
      const dentro = await tx.query<{ v: string; vd: string; od: string }>(
        "SELECT valoritem::text AS v, valordesconto::text AS vd, orcamentodesconto::text AS od FROM orcamento_item WHERE idorcamento = $1",
        [idorcamento],
      );
      expect(Number(dentro.rows[0].v)).toBe(2.9);
      expect(Number(dentro.rows[0].vd)).toBe(0);
      expect(Number(dentro.rows[0].od)).toBe(0);
    } finally {
      await tx.query("ROLLBACK");
      await tx.end();
    }
    const depois = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento WHERE idorcamento = $1", [idorcamento]);
    expect(depois.rows[0].n).toBe("0");
    const itensDepois = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento_item WHERE idorcamento = $1", [idorcamento]);
    expect(itensDepois.rows[0].n).toBe("0");
  });
});
