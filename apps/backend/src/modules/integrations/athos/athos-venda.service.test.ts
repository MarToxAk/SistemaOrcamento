import { AthosVendaService, type LancarVendaInput } from "./athos-venda.service";
import { VendaAthosError } from "./athos-venda.util";

// NUNCA conecta ao Athos real. pg e mockado por completo.
jest.mock("pg", () => {
  const mClient = { query: jest.fn(), release: jest.fn() };
  const mPool = { connect: jest.fn().mockResolvedValue(mClient), on: jest.fn(), end: jest.fn() };
  return { Pool: jest.fn(() => mPool), __mClient: mClient, __mPool: mPool };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgMock = require("pg");
const mClient = pgMock.__mClient as { query: jest.Mock; release: jest.Mock };
const mPool = pgMock.__mPool as { connect: jest.Mock };

const INPUT: LancarVendaInput = {
  idorcamento: 26698,
  idvendedor: 3,
  idterminal: 3,
  idcaixaMovimento: 291,
  descontoCupom: 11.5,
  simular: false,
  hoje: "2026-11-23",
};

interface Cenario {
  orcamento?: Array<{ idorcamento: number; statusorcamento: boolean | null; cancelado: boolean | null }>;
  relacao?: Array<{ idvenda: number }>;
  caixa?: Array<{ idcaixamovimento: number }>;
  itens?: Array<Record<string, unknown>>;
  limite?: string | null;
  falharEm?: RegExp;
}

function item(seq: number, idproduto: number, qtd: string, preco: string, extra: Record<string, unknown> = {}) {
  return {
    sequenciaitem: seq,
    idproduto,
    quantidadeitem: qtd,
    valoritem: preco,
    orcamentodesconto: "0.000",
    statusproduto: true,
    vende: true,
    controlaestoque: true,
    custo: "8.000",
    origem: 0,
    tributacao: "",
    csosn: "102",
    cfop: "5102",
    cest: "",
    icms: "18",
    ...extra,
  };
}

function tipo(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^BEGIN/i.test(s)) return "BEGIN";
  if (/^COMMIT/i.test(s)) return "COMMIT";
  if (/^ROLLBACK/i.test(s)) return "ROLLBACK";
  if (/^SET TRANSACTION READ ONLY/i.test(s)) return "SET_RO";
  if (/^SELECT .* FROM orcamento WHERE/i.test(s)) return "LER_ORC";
  if (/^SELECT idvenda FROM relacao_orcamento_venda/i.test(s)) return "LER_REL";
  if (/^SELECT idcaixamovimento FROM caixa_movimento/i.test(s)) return "LER_CAIXA";
  if (/^SELECT .* FROM orcamento_item/i.test(s)) return "LER_ITENS";
  if (/^SELECT permitedescontode FROM conf_vendas/i.test(s)) return "LER_LIMITE";
  if (/^INSERT INTO venda\(/i.test(s)) return "INS_VENDA";
  if (/^INSERT INTO venda_item/i.test(s)) return "INS_ITEM";
  if (/^INSERT INTO forma_pagamento_venda/i.test(s)) return "INS_PAG";
  if (/^INSERT INTO recebimento_cartao/i.test(s)) return "INS_CARTAO";
  if (/^UPDATE produto SET estoqueloja/i.test(s)) return "UPD_ESTOQUE";
  if (/^UPDATE produto SET dataultimavenda/i.test(s)) return "UPD_ULTIMA";
  if (/^UPDATE orcamento SET statusorcamento/i.test(s)) return "UPD_ORC";
  if (/^INSERT INTO relacao_orcamento_venda/i.test(s)) return "INS_REL";
  if (/^UPDATE venda SET sfSAT/i.test(s)) return "UPD_NFCE";
  return `OUTRO:${s}`;
}

function instalar(c: Cenario = {}): void {
  const itens = c.itens ?? [item(1, 28, "12.000", "15.000"), item(2, 42, "2.000", "25.000", { csosn: "500", cfop: "5405" })];
  mClient.query.mockImplementation(async (sql: string) => {
    const t = tipo(sql);
    if (c.falharEm && c.falharEm.test(`${t}|${sql}`)) throw Object.assign(new Error("falha simulada"), { code: "XX000" });
    switch (t) {
      case "LER_ORC":
        return { rows: c.orcamento ?? [{ idorcamento: 26698, statusorcamento: null, cancelado: false }] };
      case "LER_REL":
        return { rows: c.relacao ?? [] };
      case "LER_CAIXA":
        return { rows: c.caixa ?? [{ idcaixamovimento: 291 }] };
      case "LER_ITENS":
        return { rows: itens };
      case "LER_LIMITE":
        return { rows: [{ permitedescontode: c.limite === undefined ? "20.000" : c.limite }] };
      case "INS_VENDA":
        return { rows: [{ idvenda: 37642 }] };
      case "INS_PAG":
        return { rows: [{ idformapagamentovenda: 37853 }] };
      default:
        return { rows: [] };
    }
  });
}

function tipos(): string[] {
  return mClient.query.mock.calls.map((c: unknown[]) => tipo(c[0] as string));
}

const ESCRITAS = ["INS_VENDA", "INS_ITEM", "INS_PAG", "INS_CARTAO", "UPD_ESTOQUE", "UPD_ULTIMA", "UPD_ORC", "INS_REL", "UPD_NFCE"];

async function falha(p: Promise<unknown>): Promise<VendaAthosError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VendaAthosError);
    return e as VendaAthosError;
  }
  throw new Error("deveria ter falhado");
}

describe("AthosVendaService", () => {
  const envOriginal = { ...process.env };
  let servico: AthosVendaService;

  beforeEach(() => {
    jest.clearAllMocks();
    mPool.connect.mockResolvedValue(mClient);
    process.env.ATHOS_PG_HOST = "127.0.0.1";
    process.env.ATHOS_PG_DB = "athos";
    process.env.ATHOS_PG_USER = "teste";
    process.env.ATHOS_PG_PASS = "teste";
    process.env.ATHOS_VENDA_AUTOMATICA = "true";
    servico = new AthosVendaService();
    instalar();
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  describe("gravacao", () => {
    it("grava na ordem do PDV, em uma transacao, com estoque relativo e NFC-e pendente", async () => {
      const r = await servico.lancarVendaDeOrcamento(INPUT);

      expect(tipos()).toEqual([
        "BEGIN",
        "LER_ORC",
        "LER_REL",
        "LER_CAIXA",
        "LER_ITENS",
        "LER_LIMITE",
        "INS_VENDA",
        "INS_ITEM",
        "INS_ITEM",
        "INS_PAG",
        "INS_CARTAO",
        "UPD_ESTOQUE",
        "UPD_ULTIMA",
        "UPD_ESTOQUE",
        "UPD_ULTIMA",
        "UPD_ORC",
        "INS_REL",
        "UPD_NFCE",
        "COMMIT",
      ]);
      expect(r.simulado).toBe(false);
      expect(r.idvenda).toBe(37642);
      expect(r.idformapagamentovenda).toBe(37853);
      expect(r.valores.venda.valor).toBe("218.50");
      expect(mClient.release).toHaveBeenCalledTimes(1);
    });

    it("trava o orcamento com FOR UPDATE e usa os parametros da captura 2", async () => {
      await servico.lancarVendaDeOrcamento(INPUT);
      const chamadas = mClient.query.mock.calls as Array<[string, unknown[]?]>;
      const orc = chamadas.find((c) => tipo(c[0]) === "LER_ORC");
      expect(orc?.[0]).toMatch(/FOR UPDATE/);

      const venda = chamadas.find((c) => tipo(c[0]) === "INS_VENDA");
      // descontoRS, idvendedor, idcaixaMovimento, idorcamento, idterminal, valor, desconto(%)
      expect(venda?.[1]).toEqual(["11.50", 3, 291, 26698, 3, "218.50", "5.000"]);

      const itens = chamadas.filter((c) => tipo(c[0]) === "INS_ITEM");
      expect(itens[0][1]).toEqual([37642, 28, "12.000", "8.000", "15.000", "18", "0.00", "9.00", "171.00", 1, 3, "0", "", "102", "5102", ""]);
      expect(itens[1][1]?.slice(0, 10)).toEqual([37642, 42, "2.000", "8.000", "25.000", "18", "0.00", "2.50", "47.50", 2]);
      expect(itens[1][1]?.slice(13, 15)).toEqual(["500", "5405"]);

      const cartao = chamadas.find((c) => tipo(c[0]) === "INS_CARTAO");
      expect(cartao?.[1]).toEqual([37853, "218.50", "2026-11-23", "AVC", "0.00"]);
    });

    it("baixa estoque so de produto que controla estoque, sempre de forma relativa", async () => {
      instalar({ itens: [item(1, 28, "12.000", "15.000"), item(2, 42, "2.000", "25.000", { controlaestoque: false })] });
      await servico.lancarVendaDeOrcamento({ ...INPUT, descontoCupom: 0 });
      expect(tipos().filter((t) => t === "UPD_ESTOQUE")).toHaveLength(1);
      const estoque = (mClient.query.mock.calls as Array<[string, unknown[]?]>).find((c) => tipo(c[0]) === "UPD_ESTOQUE");
      expect(estoque?.[0]).toMatch(/estoqueloja = COALESCE\(estoqueloja, 0\) - \$2/);
      expect(estoque?.[1]).toEqual([28, "12.000"]);
    });

    it("nunca usa as armadilhas do PDV (ultimo id, saldo absoluto, ids estranhos)", async () => {
      await servico.lancarVendaDeOrcamento(INPUT);
      const todas = (mClient.query.mock.calls as Array<[string]>).map((c) => c[0]).join("\n");
      expect(todas).not.toMatch(/order by idvenda desc/i);
      expect(todas).not.toMatch(/110540769|5682/);
      expect(todas).not.toMatch(/estoqueloja\s*=\s*-?\d/);
      expect(todas).toMatch(/RETURNING idvenda/i);
      expect(todas).not.toMatch(/update senha_pdv/i);
    });

    it("falha no meio: ROLLBACK, sem COMMIT, sem vazar detalhes", async () => {
      instalar({ falharEm: /^INS_CARTAO/ });
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("ERRO_BANCO");
      expect(erro.message).not.toMatch(/falha simulada|INSERT|127\.0\.0\.1/);
      const t = tipos();
      expect(t).toContain("ROLLBACK");
      expect(t).not.toContain("COMMIT");
      expect(mClient.release).toHaveBeenCalledTimes(1);
    });

    it("esquema divergente (coluna inexistente) vira ESQUEMA_DIVERGENTE", async () => {
      mClient.query.mockImplementation(async (sql: string) => {
        if (tipo(sql) === "LER_ITENS") throw Object.assign(new Error("column p.icms does not exist"), { code: "42703" });
        return { rows: tipo(sql) === "LER_ORC" ? [{ idorcamento: 1, statusorcamento: null, cancelado: false }] : tipo(sql) === "LER_CAIXA" ? [{ idcaixamovimento: 291 }] : [] };
      });
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("ESQUEMA_DIVERGENTE");
    });
  });

  describe("simulacao", () => {
    it("le, calcula e devolve o plano sem escrever (READ ONLY + ROLLBACK)", async () => {
      const r = await servico.lancarVendaDeOrcamento({ ...INPUT, simular: true });
      expect(r.simulado).toBe(true);
      expect(r.idvenda).toBeUndefined();
      expect(r.valores.itens.map((i) => i.vendaDesconto)).toEqual(["9.00", "2.50"]);
      expect(r.comandos[0]).toBe("INSERT venda");
      expect(r.comandos).toContain("INSERT relacao_orcamento_venda");
      const t = tipos();
      expect(t.slice(0, 2)).toEqual(["BEGIN", "SET_RO"]);
      expect(t[t.length - 1]).toBe("ROLLBACK");
      for (const e of ESCRITAS) expect(t).not.toContain(e);
      const orc = (mClient.query.mock.calls as Array<[string]>).find((c) => tipo(c[0]) === "LER_ORC");
      expect(orc?.[0]).not.toMatch(/FOR UPDATE/);
    });

    it("funciona com o recurso desligado", async () => {
      process.env.ATHOS_VENDA_AUTOMATICA = "false";
      const r = await servico.lancarVendaDeOrcamento({ ...INPUT, simular: true });
      expect(r.simulado).toBe(true);
    });
  });

  describe("pre-condicoes", () => {
    it("recurso desligado bloqueia a gravacao sem abrir conexao", async () => {
      process.env.ATHOS_VENDA_AUTOMATICA = "false";
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("RECURSO_DESLIGADO");
      expect(mPool.connect).not.toHaveBeenCalled();
    });

    it("forma de pagamento diferente de 5 bloqueia sem abrir conexao", async () => {
      const erro = await falha(servico.lancarVendaDeOrcamento({ ...INPUT, idformapagamento: 7 }));
      expect(erro.codigo).toBe("FORMA_PAGAMENTO_NAO_SUPORTADA");
      expect(mPool.connect).not.toHaveBeenCalled();
    });

    it("ids invalidos bloqueiam", async () => {
      const erro = await falha(servico.lancarVendaDeOrcamento({ ...INPUT, idorcamento: 0 }));
      expect(erro.codigo).toBe("ITEM_INVALIDO");
    });

    it("orcamento inexistente", async () => {
      instalar({ orcamento: [] });
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("ORCAMENTO_NAO_ENCONTRADO");
      for (const e of ESCRITAS) expect(tipos()).not.toContain(e);
    });

    it("idempotencia: ja existe venda para o orcamento", async () => {
      instalar({ relacao: [{ idvenda: 777 }] });
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("ORCAMENTO_JA_LANCADO");
      expect(erro.idvenda).toBe(777);
      for (const e of ESCRITAS) expect(tipos()).not.toContain(e);
      expect(tipos()).toContain("ROLLBACK");
    });

    it("orcamento ja usado ou cancelado", async () => {
      instalar({ orcamento: [{ idorcamento: 26698, statusorcamento: true, cancelado: false }] });
      expect((await falha(servico.lancarVendaDeOrcamento(INPUT))).codigo).toBe("ORCAMENTO_JA_LANCADO");
      jest.clearAllMocks();
      mPool.connect.mockResolvedValue(mClient);
      instalar({ orcamento: [{ idorcamento: 26698, statusorcamento: null, cancelado: true }] });
      expect((await falha(servico.lancarVendaDeOrcamento(INPUT))).codigo).toBe("ORCAMENTO_JA_LANCADO");
    });

    it("caixa fechado", async () => {
      instalar({ caixa: [] });
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("CAIXA_FECHADO");
      for (const e of ESCRITAS) expect(tipos()).not.toContain(e);
    });

    it("produto nao vendavel", async () => {
      instalar({ itens: [item(1, 28, "1.000", "15.000", { vende: false })] });
      expect((await falha(servico.lancarVendaDeOrcamento(INPUT))).codigo).toBe("PRODUTO_NAO_VENDAVEL");
      jest.clearAllMocks();
      mPool.connect.mockResolvedValue(mClient);
      instalar({ itens: [item(1, 28, "1.000", "15.000", { statusproduto: false })] });
      expect((await falha(servico.lancarVendaDeOrcamento(INPUT))).codigo).toBe("PRODUTO_NAO_VENDAVEL");
    });

    it("orcamento com desconto nos itens ainda nao e suportado", async () => {
      instalar({ itens: [item(1, 28, "1.000", "15.000", { orcamentodesconto: "1.500" })] });
      const erro = await falha(servico.lancarVendaDeOrcamento({ ...INPUT, descontoCupom: 0 }));
      expect(erro.codigo).toBe("ORCAMENTO_COM_DESCONTO_NAO_SUPORTADO");
    });

    it("desconto acima do maximo permitido (conf_vendas.permitedescontode)", async () => {
      instalar({ limite: "4.000" });
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("DESCONTO_ACIMA_DO_MAXIMO");
      for (const e of ESCRITAS) expect(tipos()).not.toContain(e);
    });

    it("desconto maior que o total", async () => {
      const erro = await falha(servico.lancarVendaDeOrcamento({ ...INPUT, descontoCupom: 999 }));
      expect(erro.codigo).toBe("DESCONTO_INVALIDO");
    });
  });

  describe("trava de ambiente", () => {
    it("em NODE_ENV=test recusa host que nao e local, antes de conectar", async () => {
      process.env.ATHOS_PG_HOST = "athos.exemplo.interno";
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("AMBIENTE_TESTE_HOST_REAL");
      expect(mPool.connect).not.toHaveBeenCalled();
    });

    it("configuracao ausente", async () => {
      delete process.env.ATHOS_PG_PASS;
      const erro = await falha(servico.lancarVendaDeOrcamento(INPUT));
      expect(erro.codigo).toBe("CONFIG_INVALIDA");
    });
  });
});
