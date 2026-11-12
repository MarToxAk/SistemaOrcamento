/**
 * Teste de integracao contra o CLONE do Athos (container athos-teste).
 *
 * Fase 46 / plano 46-03. Executa o CAMINHO REAL de codigo:
 *   AthosService.buscarOrcamentoPorNumero (pg real no clone)
 *     -> payload no formato da pagina /orcamento/novo
 *     -> QuotesService.create -> QuotesService.enviarParaCliente
 * e compara esperado x obtido (item, subtotal, desconto, total, valor passado a
 * createPixPaymentLink, texto da mensagem). Chatwoot e EFI sao FALSOS (jest.fn): nada real e enviado.
 *
 * Somente executa com ATHOS_IT_CLONE=1; sem isso (CI) a suite fica em describe.skip.
 * Trava: so aceita 127.0.0.1:5440, banco "athos" (verificada ANTES de criar qualquer cliente pg).
 * A senha do clone NUNCA fica neste arquivo: vem de ATHOS_PG_PASS na linha de comando.
 *
 * Comando:
 *   ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos \
 *   ATHOS_PG_USER=postgres ATHOS_PG_PASS=<senha-do-clone> \
 *   ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 \
 *   ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 \
 *   npm --prefix apps/backend run test -- quotes-mensagem.clone --no-coverage
 */
import { Prisma } from "@prisma/client";
import { Client } from "pg";

import { AthosOrcamentoService } from "../integrations/athos/athos-orcamento.service";
import { AthosService } from "../integrations/athos/athos.service";
import { EfiService } from "../integrations/efi/efi.service";
import { QuotesService } from "./quotes.service";

const rodar = process.env.ATHOS_IT_CLONE === "1" ? describe : describe.skip;

jest.setTimeout(120000);

const MARCADOR = "IT46";
const CODIGO_PIX_FICTICIO = "IT46-CODIGO-PIX-FICTICIO";

// ---------------------------------------------------------------------------
// Tipos e SQL do padrao do Balcao (copiados de athos-orcamento.service.ts, com
// valordesconto, valoracrescimo e desconto percentual como parametros).
// ---------------------------------------------------------------------------

type LinhaSpec = { qtd: number; valoritem: number; vd: number; od: number; final: number };
type HeaderSpec = { valor: number; descontors: number; desconto: number; valoracrescimo: number };
type Spec = { header: HeaderSpec; itens: LinhaSpec[] };

const SQL_INSERIR_ORCAMENTO = `INSERT INTO orcamento (descontors, idvendedor, idcliente, idfuncionariousuario, idterminal, dataorcamento, hora,
                       validadeorcamento, valor, desconto, statusorcamento, obs, idtransportadora, dataentrega,
                       idenderecocliente, valoracrescimo, statusimpressao)
VALUES ($1, $2, NULL, $3, $4, current_date, cast(current_time(0) as time), NULL, $5, $6, NULL, $7, NULL, NULL, NULL, $8, false)
RETURNING idorcamento`;

const SQL_INSERIR_ITEM = `INSERT INTO orcamento_item (idorcamento, sequenciaitem, idproduto, quantidadeitem, valoritem, valordesconto,
                            valorcustoitem, valorcomissao, codigovariante, comprimento, pesoliquido, pesobruto,
                            observacao, depositoloja, orcamentodesconto, orcamentovalorfinalitem)
VALUES ($1, $2, $3, $4, $5, $6, 0, 0, '', 0, 0, 0, '', false, $7, $8)`;

const t3 = (n: number) => n.toFixed(3);
const t2 = (n: number) => n.toFixed(2);

// Replicas dos pedidos reais de referencia (usadas so quando o dump do clone nao os contem).
const SPEC_25822: Spec = {
  header: { valor: 13, descontors: 0, desconto: 0, valoracrescimo: 0 },
  itens: [{ qtd: 13, valoritem: 1, vd: 13, od: 0, final: 13 }],
};
// Pedido real 25877: 2 itens (o item 2 e o caso do bug: preco digitado 0,65 sobre tabela 0,95; valordesconto = TOTAL da linha).
const SPEC_25877: Spec = {
  header: { valor: 280, descontors: 0, desconto: 0, valoracrescimo: 0 },
  itens: [
    { qtd: 200, valoritem: 0.75, vd: 0, od: 0, final: 150 },
    { qtd: 200, valoritem: 0.65, vd: 60, od: 0, final: 130 },
  ],
};
const SPEC_25952: Spec = {
  header: { valor: 583, descontors: 58.3, desconto: 10, valoracrescimo: 0 },
  itens: [{ qtd: 110, valoritem: 5.3, vd: 0, od: 58.3, final: 524.7 }],
};
// Pedido real 25900: 3 itens (o item 3 e o aumento de preco: 5,00 sobre tabela 1,00).
const SPEC_25900: Spec = {
  header: { valor: 11, descontors: 0, desconto: 0, valoracrescimo: 0 },
  itens: [
    { qtd: 4, valoritem: 1, vd: 0, od: 0, final: 4 },
    { qtd: 1, valoritem: 2, vd: 0, od: 0, final: 2 },
    { qtd: 1, valoritem: 5, vd: 0, od: 0, final: 5 },
  ],
};

/** Converte "1.234,56" (pt-BR) em numero. */
const brl = (texto: string) => Number(texto.replace(/\./g, "").replace(",", "."));
/** Extrai um valor do bloco de totais da mensagem (rotulo como "Subtotal", "Desconto -", "Acrescimo +"). */
function extrairValor(msg: string, regex: RegExp): number | null {
  const m = msg.match(regex);
  return m ? brl(m[1]) : null;
}
const RE_SUBTOTAL = /Subtotal: R\$ ([\d.]+,\d{2})/;
const RE_DESCONTO = /Desconto: -R\$ ([\d.]+,\d{2})/;
const RE_ACRESCIMO = /Acréscimo: \+R\$ ([\d.]+,\d{2})/;
const RE_TOTAL = /\*Total: R\$ ([\d.]+,\d{2})\*/;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const NBSP = /[  ]/g;
const norm = (texto: string) => texto.replace(NBSP, " ");
const dec = (valor: unknown) => Number((valor as Prisma.Decimal).toString());

type Mapped = Awaited<ReturnType<AthosService["buscarOrcamentoPorNumero"]>>["mapped"];

/**
 * Espelha, campo a campo, o gerarOrcamento de apps/frontend/src/app/orcamento/novo/page.tsx:
 * valoritem = item.valor, valordesconto = item.desconto, orcamentovalorfinalitem = item.total;
 * totais.valor = soma dos totais dos itens (liquido, sem acrescimo), totais.desconto = soma dos
 * descontos e totais.valoracrescimo = acrescimo do cabecalho (so quando > 0). Se a pagina mudar,
 * este helper deve mudar junto.
 */
function payloadComoPaginaNovo(mapped: Mapped) {
  const itens = (mapped.itensDetalhados as Array<Record<string, any>>).map((item) => ({
    descricao: String(item?.produto?.descricaocurta || item?.produto?.descricaoproduto || item?.descricao || ""),
    quantidade: Number(item?.quantidade ?? 0),
    valor: Number(item?.valor ?? 0),
    desconto: Number(item?.desconto ?? 0),
    total: Number(item?.total ?? 0),
  }));
  const acrescimoAthos = Number((mapped as any).totais?.valoracrescimo ?? 0);
  const valorAcrescimo = Number.isFinite(acrescimoAthos) && acrescimoAthos > 0 ? acrescimoAthos : 0;

  return {
    idorcamento: Number(mapped.numero),
    vendedorNome: "Vendedor IT46",
    conversationId: 990046,
    chatwootContactId: 990047,
    cliente: { nome: "Cliente IT46", telefone: "5512999990046" },
    itens: itens.map((item, idx) => {
      const totalCalculado = Number.isFinite(Number(item.total))
        ? Number(item.total)
        : Number((item.quantidade * item.valor - item.desconto).toFixed(2));
      return {
        sequenciaitem: idx + 1,
        produto: { descricaoproduto: item.descricao, descricaocurta: item.descricao },
        quantidadeitem: item.quantidade,
        valoritem: item.valor,
        valordesconto: item.desconto,
        orcamentovalorfinalitem: totalCalculado,
      };
    }),
    totais: {
      desconto: Number(itens.reduce((acc, item) => acc + item.desconto, 0).toFixed(2)),
      valor: Number(itens.reduce((acc, item) => acc + item.total, 0).toFixed(2)),
      ...(valorAcrescimo > 0 ? { valoracrescimo: Number(valorAcrescimo.toFixed(2)) } : {}),
    },
    source: "MANUAL" as const,
  };
}

/** Prisma em memoria: so o que QuotesService.create/enviarParaCliente tocam. */
function criarPrismaEmMemoria() {
  const itensCriados: Array<Record<string, any>> = [];
  const quoteCriados: Array<Record<string, any>> = [];

  const montarQuote = () => {
    const data = quoteCriados[0] ?? {};
    return {
      id: "q-it46",
      internalNumber: 1,
      externalQuoteId: data.externalQuoteId ?? null,
      budgetDate: null,
      sellerExternalId: null,
      saleExternalId: null,
      sellerName: data.sellerName ?? null,
      conversationId: data.conversationId ?? null,
      chatwootContactId: data.chatwootContactId ?? null,
      status: data.status ?? "PENDENTE",
      approved: false,
      approvedAt: null,
      approvalToken: null,
      approvalExpiresAt: null,
      approvalRequestedAt: null,
      notes: null,
      validity: null,
      deliveryDate: null,
      paymentTerms: null,
      createdAt: new Date("2026-11-12T00:00:00Z"),
      updatedAt: new Date("2026-11-12T00:00:00Z"),
      editedAt: null,
      discount: data.discount,
      surcharge: data.surcharge,
      total: data.total,
      customer: { id: "cus-it46", fullName: "Cliente IT46", phone: "5512999990046", email: null, isAssociated: false },
      items: itensCriados.filter((i) => !i.parentItemId).map((i) => ({ ...i, children: [] })),
      stamps: [],
      documents: [],
    };
  };

  const tx: any = {
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: "cus-it46", ...data })),
      update: jest.fn(),
    },
    quote: {
      findFirst: jest.fn().mockImplementation(async () => (quoteCriados.length > 0 ? montarQuote() : null)),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        quoteCriados.push(data);
        return { id: "q-it46" };
      }),
      update: jest.fn().mockImplementation(async () => montarQuote()),
      findUnique: jest.fn().mockImplementation(async () => montarQuote()),
    },
    quoteItem: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        itensCriados.push(data);
        return { id: `qi-${itensCriados.length}` };
      }),
      createMany: jest.fn().mockImplementation(async ({ data }: any) => {
        itensCriados.push(...data);
        return { count: data.length };
      }),
      deleteMany: jest.fn(),
    },
    quoteStampItem: { createMany: jest.fn(), deleteMany: jest.fn() },
    quoteStatusHistory: { create: jest.fn() },
  };

  const prisma: any = {
    $transaction: jest.fn(async (cb: (client: any) => unknown) => cb(tx)),
    quoteDocument: {
      create: jest.fn().mockResolvedValue({ fileName: "orc-it46.pdf", contentType: "application/pdf", storagePath: "orc-it46.pdf" }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    orcamentoItemCorrecao: { findMany: jest.fn().mockResolvedValue([]) },
    quote: tx.quote,
  };
  return { prisma, itensCriados, quoteCriados };
}

type Ambiente = ReturnType<typeof criarAmbiente>;

/** QuotesService real + AthosService real (clone) + Prisma em memoria + Chatwoot/EFI/PDF falsos. */
function criarAmbiente(athos: AthosService) {
  const infra = criarPrismaEmMemoria();
  const pdf = {
    objectExists: jest.fn().mockResolvedValue(false),
    downloadObjectBuffer: jest.fn().mockResolvedValue(Buffer.from("pdf-it46")),
    generateAndStore: jest.fn().mockResolvedValue({
      fileName: "orc-it46.pdf",
      contentType: "application/pdf",
      objectName: "orc-it46.pdf",
      publicUrl: null,
    }),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const chatwoot = {
    sendOutgoingMessage: jest.fn().mockResolvedValue({ enabled: true }),
    sendAttachment: jest.fn().mockResolvedValue({ enabled: true }),
  };
  // Prototipo real so para que resolvePaymentOptions (puro) aplique as regras; a rede e falsa.
  const efi: any = Object.assign(Object.create(EfiService.prototype), {
    createPixPaymentLink: jest.fn(async (input: { amount: number }) => ({
      txid: "it46-tx",
      amount: input.amount,
      originalAmount: input.amount,
      discountAmount: 0,
      linkVisualizacao: "https://pix.exemplo/it46",
      pixCopiaECola: CODIGO_PIX_FICTICIO,
    })),
    createPix5050Link: jest.fn(async (input: { totalAmount: number }) => ({
      linkVisualizacao: "https://pix.exemplo/it46-50",
      txid: "it46-tx50",
      halfAmount: Number((input.totalAmount / 2).toFixed(2)),
    })),
    createCardPaymentLink: jest.fn().mockResolvedValue({ paymentUrl: "https://cartao.exemplo/it46", chargeId: 4646 }),
  });
  const quotes = new QuotesService(infra.prisma, athos, pdf as any, config as any, chatwoot as any, efi);
  (quotes as any).checkPaymentStatus = jest.fn().mockResolvedValue(undefined);
  return { ...infra, quotes, chatwoot, efi };
}

type Resultado = {
  id: number;
  mapped: Mapped;
  itensLidos: Array<{ valor: number; desconto: number; total: number; quantidade: number }>;
  quote: { total: number; discount: number; surcharge: number };
  itensQuote: Array<{ unitPrice: number; discount: number; finalPrice: number }>;
  mensagens: string[];
  mensagemPrincipal: string;
  pixAmount: number | null;
  pixChamadas: number;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

rodar("IT clone athos-teste: Athos real -> Quote -> mensagem/PIX (fase 46)", () => {
  const envsGuardadas: Record<string, string | undefined> = {};
  const idsCriados: number[] = [];
  const relatorio: Array<{ caso: string; campo: string; esperado: string | number; obtido: string | number }> = [];
  let pg: Client;
  let athos: AthosService;
  let athosOrcamento: AthosOrcamentoService;
  let produtoA = 0;
  let produtoB = 0;
  let contagemAntes = 0;

  function definirEnv(chave: string, valor: string) {
    if (!(chave in envsGuardadas)) envsGuardadas[chave] = process.env[chave];
    process.env[chave] = valor;
  }

  /** Compara e registra a linha da tabela esperado x obtido. */
  function comparar(caso: string, campo: string, esperado: number | string, obtido: number | string | null | undefined) {
    relatorio.push({ caso, campo, esperado, obtido: obtido ?? "null" });
    if (typeof esperado === "number") expect(Number(obtido)).toBeCloseTo(esperado, 2);
    else expect(obtido).toBe(esperado);
  }

  function contem(caso: string, campo: string, texto: string, trecho: string) {
    relatorio.push({ caso, campo, esperado: `contem "${trecho}"`, obtido: texto.includes(trecho) ? "sim" : "NAO" });
    expect(texto).toContain(trecho);
  }

  function naoContem(caso: string, campo: string, texto: string, trecho: string) {
    relatorio.push({ caso, campo, esperado: `nao contem "${trecho}"`, obtido: texto.includes(trecho) ? "CONTEM" : "ok" });
    expect(texto).not.toContain(trecho);
  }

  async function contarOrcamentos(): Promise<number> {
    const r = await pg.query<{ n: string }>("SELECT count(*)::text AS n FROM orcamento");
    return Number(r.rows[0].n);
  }

  async function apagarPorIds(ids: number[]) {
    if (ids.length === 0) return;
    await pg.query("DELETE FROM orcamento_forma_pagamento WHERE idorcamento = ANY($1::int[])", [ids]);
    await pg.query("DELETE FROM orcamento_item WHERE idorcamento = ANY($1::int[])", [ids]);
    await pg.query("DELETE FROM orcamento WHERE idorcamento = ANY($1::int[])", [ids]);
  }

  /** Varredura do marcador: remove pedidos orfaos de execucoes interrompidas (so o marcador IT46). */
  async function varrerMarcador() {
    const r = await pg.query<{ idorcamento: number }>("SELECT idorcamento FROM orcamento WHERE obs LIKE $1", [`%${MARCADOR}%`]);
    await apagarPorIds(r.rows.map((x) => x.idorcamento));
  }

  /** INSERT no padrao do Balcao: valordesconto = TOTAL da linha; final = qtd x valoritem - descontos. */
  async function inserirPedido(spec: Spec, obs: string, produto = produtoA, idFixo?: number): Promise<number> {
    const cab = await pg.query<{ idorcamento: number }>(SQL_INSERIR_ORCAMENTO, [
      t3(spec.header.descontors),
      Number(process.env.ATHOS_ORCAMENTO_ID_VENDEDOR),
      Number(process.env.ATHOS_ORCAMENTO_ID_FUNCIONARIO),
      Number(process.env.ATHOS_ORCAMENTO_ID_TERMINAL),
      t3(spec.header.valor),
      t3(spec.header.desconto),
      obs,
      t3(spec.header.valoracrescimo),
    ]);
    let id = Number(cab.rows[0].idorcamento);
    if (idFixo !== undefined) {
      // Replica de pedido de referencia: assume o mesmo numero (ainda sem itens, entao nenhuma FK depende do id).
      await pg.query("UPDATE orcamento SET idorcamento = $1 WHERE idorcamento = $2", [idFixo, id]);
      id = idFixo;
    }
    idsCriados.push(id);
    for (const [k, linha] of spec.itens.entries()) {
      await pg.query(SQL_INSERIR_ITEM, [id, k + 1, produto, t3(linha.qtd), t3(linha.valoritem), t3(linha.vd), t2(linha.od), t2(linha.final)]);
    }
    return id;
  }

  /** Pedido real do clone (modo "dump") ou replica por INSERT (modo "replica"). */
  async function obterOuCriarReferencia(ref: number, spec: Spec): Promise<{ id: number; modo: "dump" | "replica" }> {
    if (idsCriados.includes(ref)) return { id: ref, modo: "replica" }; // replica criada antes neste IT
    const existe = await pg.query("SELECT 1 FROM orcamento WHERE idorcamento = $1", [ref]);
    if (existe.rows.length > 0) {
      console.log(`[IT46] modo-referencia=dump caso=${ref}`);
      return { id: ref, modo: "dump" };
    }
    const id = await inserirPedido(spec, `[IT46] replica de ${ref}`, produtoA, ref);
    console.log(`[IT46] modo-referencia=replica caso=${ref} id-no-clone=${id}`);
    return { id, modo: "replica" };
  }

  /** Caminho completo: leitura real do Athos -> payload da pagina -> Quote -> mensagem e PIX. */
  async function executarFluxo(id: number): Promise<Resultado> {
    const { mapped } = await athos.buscarOrcamentoPorNumero(String(id));
    const payload = payloadComoPaginaNovo(mapped);
    const amb: Ambiente = criarAmbiente(athos);

    await amb.quotes.create(payload as any);
    amb.chatwoot.sendOutgoingMessage.mockClear();
    amb.chatwoot.sendAttachment.mockClear();
    amb.efi.createPixPaymentLink.mockClear();

    await amb.quotes.enviarParaCliente("q-it46");

    const q = amb.quoteCriados[0];
    const mensagens = amb.chatwoot.sendOutgoingMessage.mock.calls.map((c: unknown[]) => norm(String(c[1])));
    const pix = amb.efi.createPixPaymentLink.mock.calls;
    return {
      id,
      mapped,
      itensLidos: (mapped.itensDetalhados as Array<Record<string, any>>).map((i) => ({
        valor: Number(i.valor),
        desconto: Number(i.desconto),
        total: Number(i.total),
        quantidade: Number(i.quantidade),
      })),
      quote: { total: dec(q.total), discount: dec(q.discount), surcharge: dec(q.surcharge) },
      itensQuote: amb.itensCriados.map((i) => ({
        unitPrice: dec(i.unitPrice),
        discount: dec(i.discount),
        finalPrice: dec(i.finalPrice),
      })),
      mensagens,
      mensagemPrincipal: mensagens[0] ?? "",
      pixAmount: pix.length > 0 ? Number(pix[0][0].amount) : null,
      pixChamadas: pix.length,
    };
  }

  beforeAll(async () => {
    // Trava ANTES de criar qualquer cliente pg ou servico.
    if (
      process.env.ATHOS_PG_HOST !== "127.0.0.1" ||
      process.env.ATHOS_PG_PORT !== "5440" ||
      process.env.ATHOS_PG_DB !== "athos"
    ) {
      throw new Error("IT bloqueado: somente o clone local 127.0.0.1:5440/athos");
    }
    if (process.env.NODE_ENV !== "test") throw new Error("IT bloqueado: NODE_ENV deve ser test");
    definirEnv("ATHOS_ORCAMENTO_ESCRITA", "true");

    pg = new Client({
      host: process.env.ATHOS_PG_HOST,
      port: Number(process.env.ATHOS_PG_PORT),
      database: process.env.ATHOS_PG_DB,
      user: process.env.ATHOS_PG_USER,
      password: process.env.ATHOS_PG_PASS,
    });
    await pg.connect();

    await varrerMarcador();
    contagemAntes = await contarOrcamentos();

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

    athos = new AthosService({ orcamentoItemCorrecao: { findMany: jest.fn().mockResolvedValue([]) } } as any);
    athosOrcamento = new AthosOrcamentoService();
    void athosOrcamento;
  });

  afterAll(async () => {
    try {
      if (pg) {
        await apagarPorIds(idsCriados);
        await varrerMarcador();
        const depois = await contarOrcamentos();
        console.log(`[IT46] orcamentos no clone: antes=${contagemAntes} depois=${depois}`);
      }
      console.log("[IT46] tabela esperado x obtido");
      console.table(relatorio);
    } finally {
      if (pg) await pg.end();
      await (athos as any)?._pool?.end?.();
      await (athosOrcamento as any)?.onModuleDestroy?.();
      for (const [k, v] of Object.entries(envsGuardadas)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("IT0 trava: so o clone local e nada real e enviado (Chatwoot/EFI sao mocks)", () => {
    expect(process.env.ATHOS_PG_HOST).toBe("127.0.0.1");
    expect(process.env.ATHOS_PG_PORT).toBe("5440");
    expect(process.env.ATHOS_PG_DB).toBe("athos");
    expect(process.env.NODE_ENV).toBe("test");
    const amb = criarAmbiente(athos);
    expect(jest.isMockFunction(amb.chatwoot.sendOutgoingMessage)).toBe(true);
    expect(jest.isMockFunction(amb.chatwoot.sendAttachment)).toBe(true);
    expect(jest.isMockFunction(amb.efi.createPixPaymentLink)).toBe(true);
  });

  it("IT1 tracer 25877: item 2 = 0,95 / desconto 60 / total 130; pedido 280 (Subtotal 340, Desconto 60); PIX 280; codigo Pix em mensagem separada", async () => {
    const { id } = await obterOuCriarReferencia(25877, SPEC_25877);
    const r = await executarFluxo(id);

    comparar("25877", "item 2 valor (preco original)", 0.95, r.itensLidos[1].valor);
    comparar("25877", "item 2 desconto", 60, r.itensLidos[1].desconto);
    comparar("25877", "item 2 total", 130, r.itensLidos[1].total);
    comparar("25877", "item 1 total (sem desconto)", 150, r.itensLidos[0].total);
    comparar("25877", "Quote.total", 280, r.quote.total);
    comparar("25877", "Quote.discount", 60, r.quote.discount);
    comparar("25877", "Quote.surcharge", 0, r.quote.surcharge);
    contem("25877", "mensagem item riscado", r.mensagemPrincipal, "~R$ 190,00~ R$ 130,00");
    contem("25877", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 340,00");
    contem("25877", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 60,00");
    contem("25877", "mensagem Total", r.mensagemPrincipal, "Total: R$ 280,00");
    comparar("25877", "PIX amount (createPixPaymentLink)", 280, r.pixAmount);
    comparar("25877", "mensagens enviadas (principal + Pix)", 2, r.mensagens.length);
    comparar("25877", "mensagem 2 (so o codigo Pix)", CODIGO_PIX_FICTICIO, r.mensagens[1]);
    naoContem("25877", "codigo Pix fora da principal", r.mensagemPrincipal, CODIGO_PIX_FICTICIO);
  });

  it("R1 25822: original 2,00; desconto 13,00; total 13,00; Subtotal 26,00; PIX 13,00", async () => {
    const { id } = await obterOuCriarReferencia(25822, SPEC_25822);
    const r = await executarFluxo(id);

    comparar("25822", "item.valor (preco original)", 2, r.itensLidos[0].valor);
    comparar("25822", "item.desconto", 13, r.itensLidos[0].desconto);
    comparar("25822", "item.total", 13, r.itensLidos[0].total);
    comparar("25822", "Quote.total", 13, r.quote.total);
    contem("25822", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 26,00");
    contem("25822", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 13,00");
    contem("25822", "mensagem Total", r.mensagemPrincipal, "Total: R$ 13,00");
    comparar("25822", "PIX amount", 13, r.pixAmount);
  });

  it("R2 25877: Quote.total 280 e a soma dos totais lidos bate com mapped.totais.liquido", async () => {
    const { id } = await obterOuCriarReferencia(25877, SPEC_25877);
    const r = await executarFluxo(id);

    comparar("25877", "Quote.total", 280, r.quote.total);
    const somaTotais = r.itensLidos.reduce((acc, i) => acc + i.total, 0);
    comparar("25877", "soma dos totais dos itens", 280, somaTotais);
    comparar("25877", "mapped.totais.liquido", 280, (r.mapped as any).totais.liquido);
    contem("25877", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 340,00");
  });

  it("R3 25952: original 5,30; desconto 58,30; total 524,70; cabecalho 583 e liquido 524,70; Quote NUNCA 583; PIX 524,70", async () => {
    const { id } = await obterOuCriarReferencia(25952, SPEC_25952);
    const r = await executarFluxo(id);

    comparar("25952", "item.valor (preco original)", 5.3, r.itensLidos[0].valor);
    comparar("25952", "item.desconto", 58.3, r.itensLidos[0].desconto);
    comparar("25952", "item.total", 524.7, r.itensLidos[0].total);
    comparar("25952", "mapped.totais.valor (bruto do cabecalho)", 583, (r.mapped as any).totais.valor);
    comparar("25952", "mapped.totais.liquido", 524.7, (r.mapped as any).totais.liquido);
    comparar("25952", "Quote.total", 524.7, r.quote.total);
    expect(r.quote.total).not.toBeCloseTo(583, 2);
    contem("25952", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 583,00");
    contem("25952", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 58,30");
    contem("25952", "mensagem Total", r.mensagemPrincipal, "Total: R$ 524,70");
    comparar("25952", "PIX amount", 524.7, r.pixAmount);
  });

  it("R4 25900 (aumento de preco): item 3 original 5,00; desconto 0; pedido 11,00; sem Subtotal/Desconto/riscado; PIX 11,00", async () => {
    const { id } = await obterOuCriarReferencia(25900, SPEC_25900);
    const r = await executarFluxo(id);

    comparar("25900", "item 3 valor (preco original)", 5, r.itensLidos[2].valor);
    comparar("25900", "item 3 desconto", 0, r.itensLidos[2].desconto);
    comparar("25900", "item 3 total", 5, r.itensLidos[2].total);
    comparar("25900", "Quote.total", 11, r.quote.total);
    naoContem("25900", "mensagem sem Subtotal", r.mensagemPrincipal, "Subtotal");
    naoContem("25900", "mensagem sem Desconto:", r.mensagemPrincipal, "Desconto:");
    naoContem("25900", "mensagem sem item riscado", r.mensagemPrincipal, "~");
    contem("25900", "mensagem Total", r.mensagemPrincipal, "Total: R$ 11,00");
    comparar("25900", "PIX amount", 11, r.pixAmount);
  });

  it("R5 outros de referencia (25951, 26047, 26109, quando existirem): itens reconciliam, Quote.total = liquido e a mensagem fecha", async () => {
    const existentes = await pg.query<{ idorcamento: number }>(
      "SELECT idorcamento FROM orcamento WHERE idorcamento = ANY($1::int[]) ORDER BY idorcamento",
      [[25951, 26047, 26109]],
    );
    console.log(`[IT46] R5 referencias presentes no clone: ${existentes.rows.map((x) => x.idorcamento).join(",") || "nenhuma"}`);
    for (const { idorcamento } of existentes.rows) {
      const caso = String(idorcamento);
      const r = await executarFluxo(idorcamento);
      const totais = (r.mapped as any).totais;

      r.itensLidos.forEach((i, k) => {
        const reconciliado = i.quantidade * i.valor - i.desconto;
        relatorio.push({
          caso,
          campo: `item ${k + 1}: qtd x valor - desconto = total (qtd ${i.quantidade}, valor ${i.valor}, desc ${i.desconto})`,
          esperado: Number(i.total.toFixed(2)),
          obtido: Number(reconciliado.toFixed(2)),
        });
        // D-04: desconto maior que a linha trava o total em 0; fora isso a conta fecha.
        if (reconciliado >= 0) expect(Math.abs(reconciliado - i.total)).toBeLessThanOrEqual(0.011);
        else expect(i.total).toBe(0);
      });
      comparar(caso, "Quote.total = mapped.totais.liquido", totais.liquido, r.quote.total);
      comparar(caso, "PIX amount = Quote.total", r.quote.total, r.pixAmount);

      const msg = r.mensagemPrincipal;
      const total = extrairValor(msg, RE_TOTAL) as number;
      const subtotal = extrairValor(msg, RE_SUBTOTAL);
      const desconto = extrairValor(msg, RE_DESCONTO) ?? 0;
      const acrescimo = extrairValor(msg, RE_ACRESCIMO) ?? 0;
      comparar(caso, "mensagem Total = Quote.total", r.quote.total, total);
      const somaItens = r.itensLidos.reduce((acc, i) => acc + i.total, 0);
      const base = subtotal ?? somaItens;
      comparar(caso, "mensagem: Subtotal - Desconto + Acrescimo = Total", Number(total.toFixed(2)), Number((base - desconto + acrescimo).toFixed(2)));
      console.log(
        `[IT46] R5 ${caso}: itens=${r.itensLidos.length} subtotal=${subtotal ?? "-"} desconto=${desconto} acrescimo=${acrescimo} total=${total} pix=${r.pixAmount}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Pedidos criados pela API da Fase 44 (AthosOrcamentoService.criarOrcamento) no clone.
  // O esperado e calculado em SQL/centavos aqui, independente das funcoes de producao.
  // -------------------------------------------------------------------------

  /** Preco de tabela (3 casas) e bruto da linha arredondado a centavos, lidos do proprio Athos do clone. */
  async function precoTabela(idproduto: number, quantidade: number) {
    const r = await pg.query<{ p: string; b: string }>(
      "SELECT precovendaproduto($1)::text AS p, round($2::numeric * precovendaproduto($1), 2)::text AS b",
      [idproduto, String(quantidade)],
    );
    return { preco: Number(r.rows[0].p), brutoC: Math.round(Number(r.rows[0].b) * 100) };
  }

  /** Formata em pt-BR com separador de milhar (como a mensagem). */
  function fmtBRL(centavos: number): string {
    const abs = Math.abs(centavos);
    const inteiro = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${inteiro},${String(abs % 100).padStart(2, "0")}`;
  }

  async function criarViaFase44(caso: string, input: Parameters<AthosOrcamentoService["criarOrcamento"]>[0]) {
    const resp = await athosOrcamento.criarOrcamento({ ...input, obs: `teste ${MARCADOR} ${caso}` });
    if (resp.idorcamento == null) throw new Error("Fase 44 nao devolveu idorcamento (simulacao?)");
    idsCriados.push(resp.idorcamento);
    return { ...resp, idorcamento: resp.idorcamento };
  }

  it("F44-1 desconto por item: desconto 1,50; Quote.total e PIX = valorLiquido; mensagem com Desconto -R$ 1,50", async () => {
    const { preco, brutoC } = await precoTabela(produtoA, 3);
    const esperadoLiquidoC = brutoC - 150;
    const resp = await criarViaFase44("f44-item", { itens: [{ idproduto: produtoA, quantidade: 3, descontoRS: 1.5 }] });
    const r = await executarFluxo(resp.idorcamento);

    comparar("F44-1", "valorLiquido da Fase 44 (esperado independente)", esperadoLiquidoC / 100, resp.valorLiquido);
    comparar("F44-1", "item.valor = preco de tabela", preco, r.itensLidos[0].valor);
    comparar("F44-1", "item.valor = itens[0].valorUnitario da Fase 44", Number(resp.itens[0].valorUnitario), r.itensLidos[0].valor);
    comparar("F44-1", "item.desconto", 1.5, r.itensLidos[0].desconto);
    comparar("F44-1", "item.total = itens[0].valorFinal da Fase 44", Number(resp.itens[0].valorFinal), r.itensLidos[0].total);
    comparar("F44-1", "item.total (esperado independente)", esperadoLiquidoC / 100, r.itensLidos[0].total);
    comparar("F44-1", "Quote.total = valorLiquido", Number(resp.valorLiquido), r.quote.total);
    comparar("F44-1", "PIX amount = valorLiquido", Number(resp.valorLiquido), r.pixAmount);
    contem("F44-1", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 1,50");
    contem("F44-1", "mensagem Subtotal = valorBruto", r.mensagemPrincipal, `Subtotal: R$ ${fmtBRL(brutoC)}`);
    contem("F44-1", "mensagem Total", r.mensagemPrincipal, `Total: R$ ${fmtBRL(esperadoLiquidoC)}`);
  });

  it("F44-2 desconto global (2 itens, descontoTotalRS 2): rateio soma 2,00; Subtotal = valorBruto; Quote.total e PIX = valorLiquido", async () => {
    const a = await precoTabela(produtoA, 2);
    const b = await precoTabela(produtoB, 1);
    const brutoC = a.brutoC + b.brutoC;
    const resp = await criarViaFase44("f44-global", {
      itens: [
        { idproduto: produtoA, quantidade: 2 },
        { idproduto: produtoB, quantidade: 1 },
      ],
      descontoTotalRS: 2,
    });
    const r = await executarFluxo(resp.idorcamento);

    comparar("F44-2", "valorBruto da Fase 44 (esperado independente)", brutoC / 100, resp.valorBruto);
    comparar("F44-2", "valorLiquido da Fase 44 (esperado independente)", (brutoC - 200) / 100, resp.valorLiquido);
    comparar("F44-2", "soma dos desconto dos itens lidos (rateio)", 2, r.itensLidos.reduce((acc, i) => acc + i.desconto, 0));
    comparar("F44-2", "soma dos totais dos itens lidos", Number(resp.valorLiquido), r.itensLidos.reduce((acc, i) => acc + i.total, 0));
    comparar("F44-2", "Quote.total = valorLiquido", Number(resp.valorLiquido), r.quote.total);
    comparar("F44-2", "PIX amount = valorLiquido", Number(resp.valorLiquido), r.pixAmount);
    contem("F44-2", "mensagem Subtotal = valorBruto", r.mensagemPrincipal, `Subtotal: R$ ${fmtBRL(brutoC)}`);
    contem("F44-2", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 2,00");
    contem("F44-2", "mensagem Total", r.mensagemPrincipal, `Total: R$ ${fmtBRL(brutoC - 200)}`);
  });

  it("F44-3 preco unitario abaixo da tabela (-0,50, qtd 4): desconto implicito 2,00 e total = 4 x preco - 2,00", async () => {
    const { preco, brutoC } = await precoTabela(produtoA, 4);
    const resp = await criarViaFase44("f44-abaixo", {
      itens: [{ idproduto: produtoA, quantidade: 4, valorUnitario: Number((preco - 0.5).toFixed(3)) }],
    });
    const r = await executarFluxo(resp.idorcamento);

    comparar("F44-3", "item.valor = preco de tabela", preco, r.itensLidos[0].valor);
    comparar("F44-3", "item.desconto (implicito)", 2, r.itensLidos[0].desconto);
    comparar("F44-3", "item.total (esperado independente)", (brutoC - 200) / 100, r.itensLidos[0].total);
    comparar("F44-3", "Quote.total = valorLiquido da Fase 44", Number(resp.valorLiquido), r.quote.total);
    comparar("F44-3", "PIX amount = valorLiquido", Number(resp.valorLiquido), r.pixAmount);
    contem("F44-3", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 2,00");
  });

  it("F44-4 preco unitario ACIMA da tabela (+0,50, qtd 2): desconto 0, valor = preco + 0,50, sem riscado nem Subtotal", async () => {
    const { preco } = await precoTabela(produtoB, 2);
    const unitario = Number((preco + 0.5).toFixed(3));
    const totalC = Math.round(2 * unitario * 100);
    const resp = await criarViaFase44("f44-acima", { itens: [{ idproduto: produtoB, quantidade: 2, valorUnitario: unitario }] });
    const r = await executarFluxo(resp.idorcamento);

    comparar("F44-4", "item.valor = preco + 0,50", unitario, r.itensLidos[0].valor);
    comparar("F44-4", "item.desconto", 0, r.itensLidos[0].desconto);
    comparar("F44-4", "item.total (esperado independente)", totalC / 100, r.itensLidos[0].total);
    comparar("F44-4", "Quote.total = valorLiquido da Fase 44", Number(resp.valorLiquido), r.quote.total);
    comparar("F44-4", "Quote.total (esperado independente)", totalC / 100, r.quote.total);
    comparar("F44-4", "PIX amount", totalC / 100, r.pixAmount);
    naoContem("F44-4", "mensagem sem item riscado", r.mensagemPrincipal, "~");
    naoContem("F44-4", "mensagem sem Subtotal", r.mensagemPrincipal, "Subtotal");
    naoContem("F44-4", "mensagem sem Desconto:", r.mensagemPrincipal, "Desconto:");
  });

  // -------------------------------------------------------------------------
  // Pedidos por INSERT no padrao do Balcao (D-11): valoritem = preco digitado, valordesconto = TOTAL da
  // linha, orcamentovalorfinalitem = qtd x valoritem - descontos.
  // -------------------------------------------------------------------------

  it("B1 qtd 30, 2,10, valordesconto 6,00: original 2,30; desconto 6,00; total 63,00; Subtotal 69,00", async () => {
    const id = await inserirPedido(
      { header: { valor: 63, descontors: 0, desconto: 0, valoracrescimo: 0 }, itens: [{ qtd: 30, valoritem: 2.1, vd: 6, od: 0, final: 63 }] },
      "[IT46] caso B1",
    );
    const r = await executarFluxo(id);
    comparar("B1", "item.valor (preco original)", 2.3, r.itensLidos[0].valor);
    comparar("B1", "item.desconto", 6, r.itensLidos[0].desconto);
    comparar("B1", "item.total", 63, r.itensLidos[0].total);
    comparar("B1", "Quote.total", 63, r.quote.total);
    contem("B1", "mensagem item riscado", r.mensagemPrincipal, "~R$ 69,00~ R$ 63,00");
    contem("B1", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 69,00");
    contem("B1", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 6,00");
    comparar("B1", "PIX amount", 63, r.pixAmount);
  });

  it("B2 qtd 5, 0,90, valordesconto 0,50 + orcamentodesconto 1,38: original 1,00; desconto 1,88; total 3,12; Subtotal 5,00", async () => {
    const id = await inserirPedido(
      { header: { valor: 4.5, descontors: 1.38, desconto: 30.667, valoracrescimo: 0 }, itens: [{ qtd: 5, valoritem: 0.9, vd: 0.5, od: 1.38, final: 3.12 }] },
      "[IT46] caso B2",
    );
    const r = await executarFluxo(id);
    comparar("B2", "item.valor (preco original)", 1, r.itensLidos[0].valor);
    comparar("B2", "item.desconto (valordesconto + orcamentodesconto)", 1.88, r.itensLidos[0].desconto);
    comparar("B2", "item.total", 3.12, r.itensLidos[0].total);
    comparar("B2", "Quote.total", 3.12, r.quote.total);
    contem("B2", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 5,00");
    contem("B2", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 1,88");
    contem("B2", "mensagem Total", r.mensagemPrincipal, "Total: R$ 3,12");
    comparar("B2", "PIX amount", 3.12, r.pixAmount);
  });

  it("B3 aumento de preco 1,00 -> 1,50 (qtd 4, Balcao): valor 1,50; desconto 0; total 6,00; sem Subtotal nem riscado; PIX 6,00", async () => {
    const id = await inserirPedido(
      { header: { valor: 6, descontors: 0, desconto: 0, valoracrescimo: 0 }, itens: [{ qtd: 4, valoritem: 1.5, vd: 0, od: 0, final: 6 }] },
      "[IT46] caso B3 aumento 1.5",
    );
    const r = await executarFluxo(id);
    comparar("B3", "item.valor (preco original)", 1.5, r.itensLidos[0].valor);
    comparar("B3", "item.desconto", 0, r.itensLidos[0].desconto);
    comparar("B3", "item.total", 6, r.itensLidos[0].total);
    comparar("B3", "Quote.total", 6, r.quote.total);
    naoContem("B3", "mensagem sem Subtotal", r.mensagemPrincipal, "Subtotal");
    naoContem("B3", "mensagem sem item riscado", r.mensagemPrincipal, "~");
    comparar("B3", "PIX amount", 6, r.pixAmount);
  });

  it("B4 acrescimo de cabecalho 7,50 (qtd 2, 10,00): Quote.total 27,50; surcharge 7,50; Acrescimo +R$ 7,50; PIX 27,50", async () => {
    const id = await inserirPedido(
      { header: { valor: 20, descontors: 0, desconto: 0, valoracrescimo: 7.5 }, itens: [{ qtd: 2, valoritem: 10, vd: 0, od: 0, final: 20 }] },
      "[IT46] caso B4",
    );
    const r = await executarFluxo(id);
    comparar("B4", "mapped.totais.valoracrescimo", 7.5, (r.mapped as any).totais.valoracrescimo);
    comparar("B4", "Quote.total", 27.5, r.quote.total);
    comparar("B4", "Quote.surcharge", 7.5, r.quote.surcharge);
    contem("B4", "mensagem Acrescimo", r.mensagemPrincipal, "Acréscimo: +R$ 7,50");
    contem("B4", "mensagem Total", r.mensagemPrincipal, "Total: R$ 27,50");
    comparar("B4", "PIX amount", 27.5, r.pixAmount);
  });

  it("B5 misto (aumento + desconto): item 2 com ~R$ 10,00~ R$ 6,50; Subtotal 13,00; Desconto 3,50; Total e PIX 9,50", async () => {
    const id = await inserirPedido(
      {
        header: { valor: 9.5, descontors: 0, desconto: 0, valoracrescimo: 0 },
        itens: [
          { qtd: 2, valoritem: 1.5, vd: 0, od: 0, final: 3 },
          { qtd: 10, valoritem: 0.65, vd: 3.5, od: 0, final: 6.5 },
        ],
      },
      "[IT46] caso B5",
    );
    const r = await executarFluxo(id);
    comparar("B5", "item 1 valor (aumento)", 1.5, r.itensLidos[0].valor);
    comparar("B5", "item 1 desconto", 0, r.itensLidos[0].desconto);
    comparar("B5", "item 2 valor (preco original)", 1, r.itensLidos[1].valor);
    comparar("B5", "item 2 desconto", 3.5, r.itensLidos[1].desconto);
    comparar("B5", "item 2 total", 6.5, r.itensLidos[1].total);
    comparar("B5", "Quote.total", 9.5, r.quote.total);
    contem("B5", "mensagem item 2 riscado", r.mensagemPrincipal, "~R$ 10,00~ R$ 6,50");
    contem("B5", "mensagem Subtotal", r.mensagemPrincipal, "Subtotal: R$ 13,00");
    contem("B5", "mensagem Desconto", r.mensagemPrincipal, "Desconto: -R$ 3,50");
    contem("B5", "mensagem Total", r.mensagemPrincipal, "Total: R$ 9,50");
    comparar("B5", "PIX amount", 9.5, r.pixAmount);
  });

  // -------------------------------------------------------------------------
  // Varreduras somente leitura sobre a populacao do clone.
  // -------------------------------------------------------------------------

  it("P1 varredura de descontos: ate 200 pedidos (id >= 21000 com valordesconto <> 0) reconciliam item e cabecalho", async () => {
    const alvo = await pg.query<{ idorcamento: number }>(
      `SELECT o.idorcamento FROM orcamento o
        WHERE o.idorcamento >= 21000 AND COALESCE(o.obs, '') NOT LIKE $1
          AND EXISTS (SELECT 1 FROM orcamento_item i WHERE i.idorcamento = o.idorcamento AND i.valordesconto <> 0)
        ORDER BY o.idorcamento DESC LIMIT 200`,
      [`%${MARCADOR}%`],
    );
    const divergencias: string[] = [];
    let itensVarridos = 0;
    for (const { idorcamento } of alvo.rows) {
      const { mapped } = await athos.buscarOrcamentoPorNumero(String(idorcamento));
      const itens = mapped.itensDetalhados as Array<Record<string, any>>;
      let soma = 0;
      for (const [k, item] of itens.entries()) {
        const qtd = Number(item.quantidade);
        const valor = Number(item.valor);
        const desconto = Number(item.desconto);
        const total = Number(item.total);
        soma += total;
        itensVarridos += 1;
        const reconciliado = qtd * valor - desconto;
        if (Math.abs(reconciliado - total) > 0.011) {
          divergencias.push(`#${idorcamento} item ${k + 1}: ${qtd} x ${valor} - ${desconto} = ${reconciliado.toFixed(3)} mas total ${total}`);
        }
      }
      const t = (mapped as any).totais;
      if (Math.abs(soma - (t.valor - t.descontors)) > 0.02) {
        divergencias.push(`#${idorcamento} cabecalho: soma dos totais ${soma.toFixed(3)} x (valor ${t.valor} - descontors ${t.descontors})`);
      }
    }
    relatorio.push({ caso: "P1", campo: `pedidos/itens varridos: ${alvo.rows.length}/${itensVarridos}`, esperado: "0 divergencias", obtido: `${divergencias.length} divergencias` });
    expect(alvo.rows.length).toBeGreaterThan(0);
    expect(divergencias).toEqual([]);
  });

  it("P2 varredura de aumento de preco (D-03): ate 100 itens recentes com valoritem acima da tabela leem desconto 0 e total = qtd x valoritem", async () => {
    const alvo = await pg.query<{ idorcamento: number; iditemorcamento: number; valoritem: string; qtd: string }>(
      `SELECT i.idorcamento, i.iditemorcamento, i.valoritem::text AS valoritem, i.quantidadeitem::text AS qtd
         FROM orcamento_item i
         JOIN orcamento o ON o.idorcamento = i.idorcamento
        WHERE i.idorcamento >= 25000 AND COALESCE(o.obs, '') NOT LIKE $1
          AND i.valoritem > precovendaproduto(i.idproduto) + 0.0005
          AND COALESCE(i.valordesconto, 0) = 0 AND COALESCE(i.orcamentodesconto, 0) = 0
        ORDER BY i.idorcamento DESC, i.iditemorcamento LIMIT 100`,
      [`%${MARCADOR}%`],
    );
    const divergencias: string[] = [];
    const porPedido = new Map<number, typeof alvo.rows>();
    for (const row of alvo.rows) porPedido.set(row.idorcamento, [...(porPedido.get(row.idorcamento) ?? []), row]);
    for (const [idorcamento, linhas] of porPedido) {
      const { mapped } = await athos.buscarOrcamentoPorNumero(String(idorcamento));
      const lidos = mapped.itensDetalhados as Array<Record<string, any>>;
      for (const linha of linhas) {
        const lido = lidos.find((i) => Number(i.itemRaw?.iditemorcamento) === linha.iditemorcamento);
        if (!lido) {
          divergencias.push(`#${idorcamento} item ${linha.iditemorcamento}: nao encontrado na leitura`);
          continue;
        }
        const valoritem = Number(linha.valoritem);
        const esperadoTotal = Number(linha.qtd) * valoritem;
        if (Number(lido.desconto) !== 0) divergencias.push(`#${idorcamento} item ${linha.iditemorcamento}: desconto ${lido.desconto} (esperado 0)`);
        if (Math.abs(Number(lido.valor) - valoritem) > 0.0011) divergencias.push(`#${idorcamento} item ${linha.iditemorcamento}: valor ${lido.valor} (esperado ${valoritem})`);
        if (Math.abs(Number(lido.total) - esperadoTotal) > 0.011) divergencias.push(`#${idorcamento} item ${linha.iditemorcamento}: total ${lido.total} (esperado ${esperadoTotal.toFixed(3)})`);
      }
    }
    relatorio.push({
      caso: "P2",
      campo: `itens acima da tabela varridos: ${alvo.rows.length} em ${porPedido.size} pedidos (ex.: ${[...porPedido.keys()].slice(0, 3).join(",")})`,
      esperado: "0 divergencias",
      obtido: `${divergencias.length} divergencias`,
    });
    expect(divergencias).toEqual([]);
  });
});
