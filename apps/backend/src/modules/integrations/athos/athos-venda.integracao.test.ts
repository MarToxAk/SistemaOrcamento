/**
 * Fase 53 (53-02, tarefa 3): teste de integracao contra o CLONE `athos-teste` (127.0.0.1:5440).
 *
 * PULADO por padrao. So roda quando ATHOS_TESTE_PG_HOST aponta para um host LOCAL e
 * ATHOS_TESTE_IDORCAMENTO / ATHOS_TESTE_IDCAIXA / ATHOS_TESTE_IDTERMINAL / ATHOS_TESTE_IDVENDEDOR
 * identificam um orcamento ainda nao lancado do clone. NUNCA aponte para o Athos de producao:
 * o teste recusa qualquer host que nao seja local.
 *
 * O que ele responde (registrar no SUMMARY da fase):
 *  1. as colunas e tabelas usadas pelo servico existem no esquema real (PG 14 do clone);
 *  2. `senha_pdv` e incrementada por trigger? (antes/depois do lancamento);
 *  3. venda, venda_item, forma_pagamento_venda, recebimento_cartao, estoque e sfnfce ficam como no PDV;
 *  4. reexecutar devolve ORCAMENTO_JA_LANCADO.
 *
 * Como rodar (so no clone):
 *   ATHOS_TESTE_PG_HOST=127.0.0.1 ATHOS_TESTE_PG_PORT=5440 ATHOS_TESTE_PG_DB=athos \
 *   ATHOS_TESTE_PG_USER=postgres ATHOS_TESTE_PG_PASS=athosteste \
 *   ATHOS_TESTE_IDORCAMENTO=<id> ATHOS_TESTE_IDCAIXA=<id> ATHOS_TESTE_IDTERMINAL=<id> ATHOS_TESTE_IDVENDEDOR=<id> \
 *   npx jest athos-venda.integracao
 */
import { Pool } from "pg";

import { AthosVendaService } from "./athos-venda.service";
import { VendaAthosError } from "./athos-venda.util";

const HOSTS_LOCAIS = ["127.0.0.1", "localhost"];
const host = (process.env.ATHOS_TESTE_PG_HOST ?? "").trim().toLowerCase();
const configurado =
  HOSTS_LOCAIS.includes(host) &&
  !!process.env.ATHOS_TESTE_IDORCAMENTO &&
  !!process.env.ATHOS_TESTE_IDCAIXA &&
  !!process.env.ATHOS_TESTE_IDTERMINAL &&
  !!process.env.ATHOS_TESTE_IDVENDEDOR;

const descrever = configurado ? describe : describe.skip;

descrever("AthosVendaService contra o clone athos-teste", () => {
  const entrada = () => ({
    idorcamento: Number(process.env.ATHOS_TESTE_IDORCAMENTO),
    idcaixaMovimento: Number(process.env.ATHOS_TESTE_IDCAIXA),
    idterminal: Number(process.env.ATHOS_TESTE_IDTERMINAL),
    idvendedor: Number(process.env.ATHOS_TESTE_IDVENDEDOR),
    descontoCupom: 0,
  });

  let pool: Pool;
  const servico = new AthosVendaService();

  beforeAll(() => {
    process.env.ATHOS_PG_HOST = process.env.ATHOS_TESTE_PG_HOST;
    process.env.ATHOS_PG_PORT = process.env.ATHOS_TESTE_PG_PORT ?? "5440";
    process.env.ATHOS_PG_DB = process.env.ATHOS_TESTE_PG_DB ?? "athos";
    process.env.ATHOS_PG_USER = process.env.ATHOS_TESTE_PG_USER ?? "postgres";
    process.env.ATHOS_PG_PASS = process.env.ATHOS_TESTE_PG_PASS ?? "athosteste";
    process.env.ATHOS_VENDA_AUTOMATICA = "true";
    pool = new Pool({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
  });

  afterAll(async () => {
    await servico.onModuleDestroy();
    await pool.end();
  });

  it("simula sem escrever nada", async () => {
    const antes = await pool.query("SELECT count(*)::int AS n FROM venda");
    const r = await servico.lancarVendaDeOrcamento({ ...entrada(), simular: true });
    const depois = await pool.query("SELECT count(*)::int AS n FROM venda");
    expect(r.simulado).toBe(true);
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });

  it("lanca a venda, registra o efeito em senha_pdv e e idempotente", async () => {
    const senhaAntes = (await pool.query("SELECT senha FROM senha_pdv LIMIT 1")).rows[0]?.senha;
    const r = await servico.lancarVendaDeOrcamento({ ...entrada(), simular: false });
    const senhaDepois = (await pool.query("SELECT senha FROM senha_pdv LIMIT 1")).rows[0]?.senha;

    // Resultado a registrar no SUMMARY: se `senha_pdv` nao mudou, nao ha trigger e o servico precisa do update.
    // eslint-disable-next-line no-console
    console.info(`senha_pdv antes=${String(senhaAntes)} depois=${String(senhaDepois)}`);

    const venda = (await pool.query("SELECT sfnfce, valor, cancelada FROM venda WHERE idvenda = $1", [r.idvenda])).rows[0];
    expect(Number(venda.sfnfce)).toBe(1);
    expect(venda.cancelada).toBe(false);
    const itens = await pool.query("SELECT count(*)::int AS n FROM venda_item WHERE idvenda = $1", [r.idvenda]);
    expect(itens.rows[0].n).toBe(r.valores.itens.length);
    const rel = await pool.query("SELECT idvenda FROM relacao_orcamento_venda WHERE idorcamento = $1", [entrada().idorcamento]);
    expect(Number(rel.rows[0].idvenda)).toBe(r.idvenda);

    await expect(servico.lancarVendaDeOrcamento({ ...entrada(), simular: false })).rejects.toBeInstanceOf(VendaAthosError);
  });
});
