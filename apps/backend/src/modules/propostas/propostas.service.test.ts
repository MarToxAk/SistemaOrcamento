/**
 * Testes de servico do modulo de propostas (Fase 55, plano 55-06): Prisma em memoria e Athos simulado.
 * Cobrem ajuste por item (D-02, D-02a), aplicar percentual (D-11), snapshot sem Athos (D-09), bloqueio fora de
 * RASCUNHO (D-08), cabecalho e cliente do Athos (D-14..D-16), listagem e rotas de apoio.
 */
import { Prisma } from "@prisma/client";

import { criarPrismaPropostaFake } from "./__fixtures__/prisma-proposta.fake";
import { PropostasService } from "./propostas.service";

function produto(o: Record<string, unknown> = {}) {
  return {
    idproduto: 1,
    descricao: "PRODUTO TESTE",
    descricaoCurta: "Curta",
    marca: null,
    referencia: null,
    codigoBarra: null,
    preco: "3.500",
    emPromocao: false,
    estoqueLoja: "10.000",
    estoqueDeposito: "0.000",
    permiteFracionar: true,
    unidade: "UN",
    custoUnitario: "1.000",
    ...o,
  };
}

function criarContexto() {
  const prisma = criarPrismaPropostaFake();
  const athosOrcamento = { obterProdutoProposta: jest.fn(), buscarProdutosProposta: jest.fn() };
  const athos = { buscarClienteParaProposta: jest.fn() };
  const service = new PropostasService(prisma as any, athosOrcamento as any, athos as any);
  return { prisma, athosOrcamento, athos, service };
}

type Ctx = ReturnType<typeof criarContexto>;

/** Cria rascunho e adiciona um produto; devolve o id da proposta e o id do item. */
async function comItem(ctx: Ctx, produtoOverrides: Record<string, unknown> = {}, quantidade = 1) {
  const criado = await ctx.service.criarRascunho({});
  ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto(produtoOverrides));
  const det = await ctx.service.adicionarItem(criado.id, { idproduto: Number(produtoOverrides.idproduto ?? 1), quantidade });
  return { id: criado.id, itemId: det.itens[det.itens.length - 1].id, det };
}

async function esperarErro(promessa: Promise<unknown>, codigo: string, status: number) {
  try {
    await promessa;
  } catch (err: any) {
    expect(err.codigo).toBe(codigo);
    expect(err.getStatus()).toBe(status);
    return err;
  }
  throw new Error(`esperava erro ${codigo}, mas a chamada resolveu`);
}

describe("PropostasService - ajuste por item", () => {
  it("PERCENTUAL 10 sobre base 3.500 resulta em 3.85", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx, { preco: "3.500" });
    const det = await ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "PERCENTUAL", valor: 10 } });
    expect(det.itens[0].precoUnitario).toBe("3.85");
    expect(det.itens[0].ajuste).toEqual({ tipo: "PERCENTUAL", valor: "10.000" });
    expect(det.total).toBe("3.85");
  });

  it("VALOR 2.90 com custo 3.000 resulta em 2.90, abaixo do custo e margem negativa", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx, { preco: "4.000", custoUnitario: "3.000" });
    const det = await ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "VALOR", valor: 2.9 } });
    expect(det.itens[0].precoUnitario).toBe("2.90");
    expect(det.itens[0].abaixoDoCusto).toBe(true);
    expect(det.itens[0].margemPercentual).toBe("-3.448");
  });

  it("VALOR substitui o preco base (D-02a): base 2.000 e base 3.500 com 2.90 resultam em 2.90, nunca 4.90", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx, { preco: "2.000" });
    const detA = await ctx.service.atualizarItem(a.id, a.itemId, { ajuste: { tipo: "VALOR", valor: 2.9 } });
    expect(detA.itens[0].precoUnitario).toBe("2.90");
    expect(detA.itens[0].precoUnitario).not.toBe("4.90");

    const b = await comItem(ctx, { preco: "3.500" });
    const detB = await ctx.service.atualizarItem(b.id, b.itemId, { ajuste: { tipo: "VALOR", valor: 2.9 } });
    expect(detB.itens[0].precoUnitario).toBe("2.90");
    expect(detB.itens[0].ajuste).toEqual({ tipo: "VALOR", valor: "2.90" });
  });

  it("NENHUM volta ao preco base arredondado para cima e limpa o ajuste", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx, { preco: "3.456" });
    await ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "PERCENTUAL", valor: 10 } });
    const det = await ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "NENHUM" } });
    expect(det.itens[0].precoUnitario).toBe("3.46");
    expect(det.itens[0].ajuste).toBeNull();
    expect(ctx.prisma._itens[0].ajusteTipo).toBeNull();
    expect(ctx.prisma._itens[0].ajusteValor).toBeNull();
  });

  it.each([
    [-100, "percentual -100"],
    [10.5555, "percentual com 4 casas"],
    [1000.001, "percentual acima de 1000"],
  ])("percentual invalido (%s: %s) responde 422 e nada e gravado", async (valor) => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx, { preco: "3.500" });
    const antes = JSON.stringify(ctx.prisma._itens[0]);
    await esperarErro(ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "PERCENTUAL", valor } }), "VALOR_INVALIDO", 422);
    expect(JSON.stringify(ctx.prisma._itens[0])).toBe(antes);
  });

  it("ajuste PERCENTUAL ou VALOR sem valor responde 422", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx);
    await esperarErro(ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "VALOR" } }), "VALOR_INVALIDO", 422);
  });

  it("altera nome, descricaoCurta e quantidade sem consultar o Athos (snapshot, D-09)", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx, { preco: "3.500" }, 1);
    expect(ctx.athosOrcamento.obterProdutoProposta).toHaveBeenCalledTimes(1);

    await ctx.service.atualizarItem(id, itemId, { nome: "  Caneta azul  ", descricaoCurta: "Ponta fina" });
    await ctx.service.atualizarItem(id, itemId, { quantidade: 4 });
    const det = await ctx.service.atualizarItem(id, itemId, { ajuste: { tipo: "PERCENTUAL", valor: 10 } });

    expect(ctx.athosOrcamento.obterProdutoProposta).toHaveBeenCalledTimes(1);
    expect(det.itens[0].nome).toBe("Caneta azul");
    expect(det.itens[0].nomeAthos).toBe("PRODUTO TESTE");
    expect(det.itens[0].descricaoCurta).toBe("Ponta fina");
    expect(det.itens[0].quantidade).toBe("4.000");
    expect(det.itens[0].totalLinha).toBe("15.40");
    expect(det.total).toBe("15.40");
  });

  it("descricaoCurta vazia vira null", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx);
    const det = await ctx.service.atualizarItem(id, itemId, { descricaoCurta: "" });
    expect(det.itens[0].descricaoCurta).toBeNull();
  });

  it("quantidade fracionada em produto que nao permite responde 422", async () => {
    const ctx = criarContexto();
    const { id, itemId } = await comItem(ctx, { permiteFracionar: false });
    await esperarErro(ctx.service.atualizarItem(id, itemId, { quantidade: 1.5 }), "QUANTIDADE_FRACIONADA", 422);
    const ok = await ctx.service.atualizarItem(id, itemId, { quantidade: 3 });
    expect(ok.itens[0].quantidade).toBe("3.000");
  });

  it("item de outra proposta responde 404", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx);
    const outra = await ctx.service.criarRascunho({});
    await esperarErro(ctx.service.atualizarItem(outra.id, a.itemId, { nome: "x" }), "PROPOSTA_NAO_ENCONTRADA", 404);
  });
});

describe("PropostasService - adicionarItem (regras de produto)", () => {
  it("recusa produto sem preco, com preco zero e fracionado em produto inteiro; limite de 200 itens", async () => {
    const ctx = criarContexto();
    const criado = await ctx.service.criarRascunho({});

    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto({ preco: null }));
    await esperarErro(ctx.service.adicionarItem(criado.id, { idproduto: 1, quantidade: 1 }), "PRECO_INDISPONIVEL", 422);
    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto({ preco: "0.000" }));
    await esperarErro(ctx.service.adicionarItem(criado.id, { idproduto: 1, quantidade: 1 }), "PRECO_INDISPONIVEL", 422);
    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto({ permiteFracionar: false }));
    await esperarErro(ctx.service.adicionarItem(criado.id, { idproduto: 1, quantidade: 1.5 }), "QUANTIDADE_FRACIONADA", 422);

    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValue(produto());
    for (let i = 0; i < 200; i++) await ctx.service.adicionarItem(criado.id, { idproduto: 1, quantidade: 1 });
    await esperarErro(ctx.service.adicionarItem(criado.id, { idproduto: 1, quantidade: 1 }), "LIMITE_ITENS", 422);
  }, 60000);
});

describe("PropostasService - aplicarPercentualEmTodos (D-11)", () => {
  it("10% sobre bases 3.500 e 2.900 resulta em 3.85 e 3.19, em uma unica transacao", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx, { idproduto: 1, preco: "3.500" });
    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto({ idproduto: 2, preco: "2.900" }));
    await ctx.service.adicionarItem(a.id, { idproduto: 2, quantidade: 1 });

    const espiao = jest.spyOn(ctx.prisma, "$transaction");
    const det = await ctx.service.aplicarPercentualEmTodos(a.id, { percentual: 10 });
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(det.itens.map((i) => i.precoUnitario)).toEqual(["3.85", "3.19"]);
    expect(det.total).toBe("7.04");
    expect(det.itens.every((i) => i.ajuste?.tipo === "PERCENTUAL")).toBe(true);
  });

  it("substitui ajustes individuais anteriores e percentual 0 limpa todos", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx, { preco: "3.500" });
    await ctx.service.atualizarItem(a.id, a.itemId, { ajuste: { tipo: "VALOR", valor: 1.5 } });

    const det = await ctx.service.aplicarPercentualEmTodos(a.id, { percentual: 10 });
    expect(det.itens[0].precoUnitario).toBe("3.85");
    expect(det.itens[0].ajuste).toEqual({ tipo: "PERCENTUAL", valor: "10.000" });

    const zerado = await ctx.service.aplicarPercentualEmTodos(a.id, { percentual: 0 });
    expect(zerado.itens[0].ajuste).toBeNull();
    expect(zerado.itens[0].precoUnitario).toBe("3.50");
    expect(zerado.total).toBe("3.50");
  });

  it("percentual invalido responde 422 e nada muda", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx, { preco: "3.500" });
    await esperarErro(ctx.service.aplicarPercentualEmTodos(a.id, { percentual: -100 }), "VALOR_INVALIDO", 422);
    expect(ctx.prisma._itens[0].ajusteTipo).toBeNull();
  });
});

describe("PropostasService - removerItem", () => {
  it("renumera a sequencia 1..n e recalcula o total", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx, { idproduto: 1, preco: "1.000" });
    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto({ idproduto: 2, preco: "2.000" }));
    const d2 = await ctx.service.adicionarItem(a.id, { idproduto: 2, quantidade: 1 });
    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto({ idproduto: 3, preco: "4.000" }));
    await ctx.service.adicionarItem(a.id, { idproduto: 3, quantidade: 1 });

    const meio = d2.itens[1].id;
    const det = await ctx.service.removerItem(a.id, meio);
    expect(det.itens.map((i) => [i.sequencia, i.idproduto])).toEqual([
      [1, 1],
      [2, 3],
    ]);
    expect(det.total).toBe("5.00");
  });

  it("remover o ultimo item zera o total e item de outra proposta responde 404", async () => {
    const ctx = criarContexto();
    const a = await comItem(ctx);
    const outra = await ctx.service.criarRascunho({});
    await esperarErro(ctx.service.removerItem(outra.id, a.itemId), "PROPOSTA_NAO_ENCONTRADA", 404);
    const det = await ctx.service.removerItem(a.id, a.itemId);
    expect(det.itens).toHaveLength(0);
    expect(det.total).toBe("0.00");
  });
});

describe("PropostasService - atualizarCabecalho", () => {
  const clienteAthos = {
    idcliente: 77,
    tipoPessoa: "juridico",
    razaoSocial: "MUNICIPIO DE ILHABELA",
    nomeFantasia: "Prefeitura de Ilhabela",
    documento: "46639345000130",
    endereco: { logradouro: "Av. Princesa Isabel", numero: "1", complemento: null, bairro: "Perequê", cidade: "Ilhabela", uf: "SP", cep: "11630000" },
    email: null,
    telefone: null,
  };

  it("com idclienteAthos busca o cliente e grava o snapshot", async () => {
    const ctx = criarContexto();
    const p = await ctx.service.criarRascunho({});
    ctx.athos.buscarClienteParaProposta.mockResolvedValueOnce(clienteAthos);
    const det = await ctx.service.atualizarCabecalho(p.id, { idclienteAthos: 77 });
    expect(ctx.athos.buscarClienteParaProposta).toHaveBeenCalledWith(77);
    expect(det.idclienteAthos).toBe(77);
    expect(det.cliente).toMatchObject({ razaoSocial: "MUNICIPIO DE ILHABELA", documento: "46639345000130" });
    expect((det.cliente as any).endereco.cidade).toBe("Ilhabela");
  });

  it("cliente inexistente responde 422 CLIENTE_INEXISTENTE e nada muda", async () => {
    const ctx = criarContexto();
    const p = await ctx.service.criarRascunho({ numeroProcesso: "P-1" });
    ctx.athos.buscarClienteParaProposta.mockResolvedValueOnce(null);
    await esperarErro(
      ctx.service.atualizarCabecalho(p.id, { idclienteAthos: 999999, numeroProcesso: "P-2" }),
      "CLIENTE_INEXISTENTE",
      422,
    );
    const det = await ctx.service.obter(p.id);
    expect(det.idclienteAthos).toBeNull();
    expect(det.numeroProcesso).toBe("P-1");
  });

  it("idclienteAthos nulo limpa cliente e snapshot (Prisma.DbNull)", async () => {
    const ctx = criarContexto();
    const p = await ctx.service.criarRascunho({});
    ctx.athos.buscarClienteParaProposta.mockResolvedValueOnce(clienteAthos);
    await ctx.service.atualizarCabecalho(p.id, { idclienteAthos: 77 });
    const espiao = jest.spyOn(ctx.prisma.proposta, "update");
    const det = await ctx.service.atualizarCabecalho(p.id, { idclienteAthos: null });
    expect(espiao.mock.calls[0][0].data).toMatchObject({ idclienteAthos: null, clienteSnapshot: Prisma.DbNull });
    expect(det.idclienteAthos).toBeNull();
    expect(det.cliente).toBeNull();
  });

  it("grava dados de orgao, validade, prazo, observacao e sobrescritas; texto vazio vira null", async () => {
    const ctx = criarContexto();
    const p = await ctx.service.criarRascunho({});
    const det = await ctx.service.atualizarCabecalho(p.id, {
      numeroProcesso: " Pregao 12/2026 ",
      setorResponsavel: "Compras",
      contatoEmail: "compras@ilhabela.sp.gov.br",
      contatoTelefone: "(12) 3896-0000",
      validadeDias: 30,
      prazoEntregaDias: 10,
      observacao: "Entrega no almoxarifado",
      clienteOverride: { razaoSocial: " Prefeitura Municipal ", cidade: "Ilhabela", uf: "" },
    });
    expect(det).toMatchObject({
      numeroProcesso: "Pregao 12/2026",
      setorResponsavel: "Compras",
      contatoEmail: "compras@ilhabela.sp.gov.br",
      contatoTelefone: "(12) 3896-0000",
      validadeDias: 30,
      prazoEntregaDias: 10,
      observacao: "Entrega no almoxarifado",
      clienteOverride: { razaoSocial: "Prefeitura Municipal", cidade: "Ilhabela" },
    });

    const limpo = await ctx.service.atualizarCabecalho(p.id, { numeroProcesso: "", observacao: "  ", clienteOverride: null });
    expect(limpo.numeroProcesso).toBeNull();
    expect(limpo.observacao).toBeNull();
    expect(limpo.clienteOverride).toBeNull();
    expect(limpo.setorResponsavel).toBe("Compras");
  });

  it("validade e prazo fora de 1 a 365 e e-mail invalido respondem 422", async () => {
    const ctx = criarContexto();
    const p = await ctx.service.criarRascunho({});
    await esperarErro(ctx.service.atualizarCabecalho(p.id, { validadeDias: 0 }), "VALOR_INVALIDO", 422);
    await esperarErro(ctx.service.atualizarCabecalho(p.id, { prazoEntregaDias: 366 }), "VALOR_INVALIDO", 422);
    await esperarErro(ctx.service.atualizarCabecalho(p.id, { contatoEmail: "sem-arroba" }), "VALOR_INVALIDO", 422);
  });
});

describe("PropostasService - bloqueio de edicao fora de RASCUNHO (D-08, T-55-22)", () => {
  it.each(["ENVIADA", "FECHADA", "CANCELADA", "LANCANDO"])("%s responde 409 PROPOSTA_NAO_EDITAVEL em toda edicao", async (status) => {
    const ctx = criarContexto();
    const a = await comItem(ctx);
    ctx.prisma._propostas[0].status = status;
    const antes = JSON.stringify(ctx.prisma._itens);

    const err = await esperarErro(ctx.service.atualizarItem(a.id, a.itemId, { nome: "x" }), "PROPOSTA_NAO_EDITAVEL", 409);
    expect(err.getResponse().mensagem).toMatch(/duplique/i);
    await esperarErro(ctx.service.removerItem(a.id, a.itemId), "PROPOSTA_NAO_EDITAVEL", 409);
    await esperarErro(ctx.service.aplicarPercentualEmTodos(a.id, { percentual: 5 }), "PROPOSTA_NAO_EDITAVEL", 409);
    await esperarErro(ctx.service.atualizarCabecalho(a.id, { observacao: "x" }), "PROPOSTA_NAO_EDITAVEL", 409);
    await esperarErro(ctx.service.adicionarItem(a.id, { idproduto: 1, quantidade: 1 }), "PROPOSTA_NAO_EDITAVEL", 409);
    expect(JSON.stringify(ctx.prisma._itens)).toBe(antes);
  });
});

describe("PropostasService - listar", () => {
  async function semear(ctx: Ctx) {
    const base = Date.parse("2026-11-01T12:00:00Z");
    const dados = [
      { status: "RASCUNHO", razao: "Prefeitura de Ilhabela", orc: null, min: 1 },
      { status: "ENVIADA", razao: "Camara Municipal", orc: 5001, min: 2 },
      { status: "ENVIADA", razao: "PREFEITURA DE UBATUBA", orc: 5002, min: 3 },
      { status: "FECHADA", razao: null, orc: 5003, min: 4 },
    ];
    for (const d of dados) {
      await ctx.prisma.proposta.create({
        data: {
          status: d.status,
          idorcamentoAthos: d.orc,
          clienteSnapshot: d.razao ? { razaoSocial: d.razao, nomeFantasia: null } : Prisma.DbNull,
          totalValor: "10.00",
          atualizadoEm: new Date(base + d.min * 60000),
        },
      });
    }
  }

  it("sem filtro devolve paginado ordenado por atualizadoEm decrescente", async () => {
    const ctx = criarContexto();
    await semear(ctx);
    const r = (await ctx.service.listar({})) as any;
    expect(r).toMatchObject({ total: 4, pagina: 1, tamanho: 20 });
    expect(r.itens.map((i: any) => i.status)).toEqual(["FECHADA", "ENVIADA", "ENVIADA", "RASCUNHO"]);
    expect(r.itens[0]).not.toHaveProperty("custoUnitario");

    const p2 = (await ctx.service.listar({ pagina: 2, tamanho: 3 })) as any;
    expect(p2.itens).toHaveLength(1);
    expect(p2).toMatchObject({ total: 4, pagina: 2, tamanho: 3 });
  });

  it("filtra por status", async () => {
    const ctx = criarContexto();
    await semear(ctx);
    const espiao = jest.spyOn(ctx.prisma.proposta, "findMany");
    const r = (await ctx.service.listar({ status: "ENVIADA" as any })) as any;
    expect(r.total).toBe(2);
    expect(espiao.mock.calls[0][0]!.where).toMatchObject({ status: "ENVIADA" });
  });

  it("q numerico filtra por idorcamentoAthos", async () => {
    const ctx = criarContexto();
    await semear(ctx);
    const r = (await ctx.service.listar({ q: "5002" })) as any;
    expect(r.total).toBe(1);
    expect(r.itens[0].idorcamentoAthos).toBe(5002);
  });

  it("q texto filtra por razaoSocial ou nomeFantasia do snapshot sem diferenciar maiusculas", async () => {
    const ctx = criarContexto();
    await semear(ctx);
    const espiao = jest.spyOn(ctx.prisma.proposta, "findMany");
    const r = (await ctx.service.listar({ q: "prefeitura" })) as any;
    expect(r.total).toBe(2);
    expect(espiao.mock.calls[0][0]!.where).toEqual({
      OR: [
        { clienteSnapshot: { path: ["razaoSocial"], string_contains: "prefeitura", mode: "insensitive" } },
        { clienteSnapshot: { path: ["nomeFantasia"], string_contains: "prefeitura", mode: "insensitive" } },
      ],
    });
  });

  it("tamanho maximo 100", async () => {
    const ctx = criarContexto();
    await semear(ctx);
    const r = (await ctx.service.listar({ tamanho: 500 })) as any;
    expect(r.tamanho).toBe(100);
  });
});

describe("PropostasService - assinantes e apoio", () => {
  it("listarAssinantesRecentes devolve trios distintos do mais recente ao mais antigo, ate 10", async () => {
    const ctx = criarContexto();
    const base = Date.parse("2026-11-01T12:00:00Z");
    for (let i = 1; i <= 14; i++) {
      await ctx.prisma.proposta.create({
        data: {
          assinanteNome: `Assinante ${i % 12}`,
          assinanteCargo: "Diretor",
          assinanteCpf: `0000000000${i % 12}`,
          atualizadoEm: new Date(base + i * 60000),
        },
      });
    }
    await ctx.prisma.proposta.create({ data: { atualizadoEm: new Date(base + 99 * 60000) } });
    const r = (await ctx.service.listarAssinantesRecentes()) as any[];
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({ nome: "Assinante 2", cargo: "Diretor", cpf: "00000000002" });
    expect(new Set(r.map((a) => `${a.nome}|${a.cargo}|${a.cpf}`)).size).toBe(10);
  });

  it("buscarProdutos delega a buscarProdutosProposta", async () => {
    const ctx = criarContexto();
    ctx.athosOrcamento.buscarProdutosProposta.mockResolvedValueOnce([produto()]);
    const r = await ctx.service.buscarProdutos("caneta", 5);
    expect(ctx.athosOrcamento.buscarProdutosProposta).toHaveBeenCalledWith("caneta", 5);
    expect(r).toEqual([produto()]);
  });

  it("buscarCliente delega a buscarClienteParaProposta e responde 404 quando null", async () => {
    const ctx = criarContexto();
    ctx.athos.buscarClienteParaProposta.mockResolvedValueOnce({ idcliente: 5, razaoSocial: "X" });
    expect(await ctx.service.buscarCliente(5)).toMatchObject({ razaoSocial: "X" });
    ctx.athos.buscarClienteParaProposta.mockResolvedValueOnce(null);
    await esperarErro(ctx.service.buscarCliente(6), "CLIENTE_INEXISTENTE", 404);
  });
});
