/**
 * Teste de integracao de LEITURA contra o CLONE do Athos (container athos-teste).
 *
 * Fase 55 / plano 55-03. Somente executa com ATHOS_IT_CLONE=1; sem isso (CI) a suite fica
 * em describe.skip. Trava dupla: so aceita 127.0.0.1:5440, banco "athos". A senha do clone
 * NUNCA fica neste arquivo: vem de ATHOS_PG_PASS na linha de comando. Somente leitura: nada e gravado.
 *
 * Comando:
 *   ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos \
 *   ATHOS_PG_USER=postgres ATHOS_PG_PASS=<senha-do-clone> \
 *   npm --prefix apps/backend run test -- athos-proposta-leitura.clone --no-coverage
 */
import { Client } from "pg";

import { AthosOrcamentoService } from "./athos-orcamento.service";

const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;

/** Formula da Fase 44 (SQL_LER_PRODUTOS): sem COALESCE por termo, zera o custo quando qualquer imposto e NULL. */
const SQL_CUSTO_FASE_44 = `SELECT round(COALESCE(CASE WHEN p.quantidadecaixa > 0
         THEN (p.valorcustocaixa / p.quantidadecaixa) + ((p.valorcustocaixa / p.quantidadecaixa) * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100)
         ELSE p.valorcustocaixa + (p.valorcustocaixa * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100) END, 0), 3) AS custo
  FROM produto p WHERE p.idproduto = $1`;

rodar("IT clone athos-teste: leitura de produto para a proposta", () => {
  let pg: Client;
  let service: AthosOrcamentoService;
  let idproduto = 0;
  const envsGuardadas: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // Trava dupla ANTES de criar qualquer cliente pg.
    if (
      process.env.ATHOS_PG_HOST !== "127.0.0.1" ||
      process.env.ATHOS_PG_PORT !== "5440" ||
      process.env.ATHOS_PG_DB !== "athos"
    ) {
      throw new Error("IT bloqueado: somente o clone local 127.0.0.1:5440/athos");
    }
    envsGuardadas.NODE_ENV = process.env.NODE_ENV;

    pg = new Client({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
    await pg.connect();

    // Produto escolhido dinamicamente (nunca id fixo): imposto NULL com custo de caixa positivo.
    const r = await pg.query<{ idproduto: number }>(
      `SELECT idproduto FROM produto
        WHERE statusproduto = true AND COALESCE(vendeproduto, true)
          AND imposto IS NULL AND valorcustocaixa > 0 AND quantidadecaixa > 0
          AND precovendaproduto(idproduto) > 0
        ORDER BY idproduto LIMIT 1`,
    );
    if (r.rows.length === 0) throw new Error("Clone sem produto de imposto NULL com custo para o IT");
    idproduto = r.rows[0].idproduto;

    service = new AthosOrcamentoService();
  });

  afterAll(async () => {
    if (service) await service.onModuleDestroy();
    if (pg) await pg.end();
  });

  it("custoUnitario de produto com imposto NULL e maior que zero e bate com o calculo independente (D-24)", async () => {
    const produto = await service.obterProdutoProposta(idproduto);
    expect(produto).not.toBeNull();
    const custo = Number(produto!.custoUnitario);
    expect(custo).toBeGreaterThan(0);

    const raw = await pg.query<Record<string, string | null>>(
      `SELECT valorcustocaixa::text AS caixa, quantidadecaixa::text AS qtd, imposto::text AS imposto, ipi::text AS ipi,
              frete::text AS frete, outroimposto::text AS outro, precovendaproduto(idproduto)::text AS preco
         FROM produto WHERE idproduto = $1`,
      [idproduto],
    );
    const l = raw.rows[0];
    const soma = Number(l.imposto ?? 0) + Number(l.ipi ?? 0) + Number(l.frete ?? 0) + Number(l.outro ?? 0);
    const esperado = (Number(l.caixa) / Number(l.qtd)) * (1 + soma / 100);
    expect(Math.abs(custo - esperado)).toBeLessThan(0.002);
    expect(produto!.preco).not.toBeNull();
    expect(Number(produto!.preco)).toBeCloseTo(Number(l.preco), 3);

    // A formula da Fase 44 zera o custo para o mesmo produto: prova do defeito corrigido.
    const antigo = await pg.query<{ custo: string }>(SQL_CUSTO_FASE_44, [idproduto]);
    expect(Number(antigo.rows[0].custo)).toBe(0);
  });

  it("buscarProdutosProposta com o id do produto o devolve na primeira posicao", async () => {
    const lista = await service.buscarProdutosProposta(String(idproduto));
    expect(lista.length).toBeGreaterThan(0);
    expect(lista[0].idproduto).toBe(idproduto);
    expect(Number(lista[0].custoUnitario)).toBeGreaterThan(0);
  });
});
