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

import { AthosOrcamentoService, MARCADOR_OBS_PROPOSTA } from "./athos-orcamento.service";

const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;

rodar("IT clone athos-teste: criarOrcamentoProposta (escrita)", () => {
  const envsGuardadas: Record<string, string | undefined> = {};
  const idsCriados: number[] = [];
  const refsCriados: string[] = [];
  let pg: Client;
  let servico: AthosOrcamentoService;
  let idcliente = 0;
  let produtoA = 0;

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
});
