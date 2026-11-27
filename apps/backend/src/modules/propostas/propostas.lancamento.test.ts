/**
 * Testes do lancamento seguro da proposta no Athos (Fase 55, plano 55-17): concorrencia, ordem do snapshot,
 * erro definitivo x ambiguo, orfao (falha local depois do COMMIT), recuperacao e falha de PDF. Prisma em
 * memoria e Athos/PDF simulados: NENHUM acesso a banco real.
 */
import { Logger } from "@nestjs/common";

import { OrcamentoAthosError } from "../integrations/athos/athos-orcamento.service";
import { refDoOrcamento } from "../integrations/athos/athos-orcamento-idempotencia.service";
import { criarPrismaPropostaFake } from "./__fixtures__/prisma-proposta.fake";
import { PropostaError } from "./propostas.errors";
import { PropostasService } from "./propostas.service";

const DTO_GERAR = { assinanteNome: "Fulano de Tal", assinanteCargo: "Diretor", confirmar: true as const };

const SNAPSHOT = {
  versao: 1 as const,
  banco: { banco: "Banco Teste", agencia: "0001", conta: "12345-6", titular: "Empresa Teste Ltda", documentoTitular: "00.000.000/0001-00" },
  empresa: { nome: "Empresa Teste Ltda", cnpj: "00.000.000/0001-00", endereco: "Rua Teste, 1" },
  template: { origem: "EMPACOTADO" as const, source: "<html>teste</html>" },
};

const LANCADO = { idorcamento: 777, senhabalcao: 4321, data: "2026-11-27", hora: "10:20:30", valorTotal: "7.00", recuperado: false };

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
  const athosOrcamento = {
    obterProdutoProposta: jest.fn(),
    buscarProdutosProposta: jest.fn(),
    exigirEscritaPropostaAtiva: jest.fn(),
    criarOrcamentoProposta: jest.fn().mockResolvedValue(LANCADO),
    buscarOrcamentoPorRefProposta: jest.fn(),
  };
  const athos = { buscarClienteParaProposta: jest.fn().mockResolvedValue({ idcliente: 5, razaoSocial: "MUNICIPIO DE TESTE", endereco: null }) };
  const propostasPdf = {
    capturarSnapshot: jest.fn().mockResolvedValue(SNAPSHOT),
    gerarOficial: jest.fn().mockResolvedValue({ objectName: "propostas/teste.pdf" }),
  };
  const service = new PropostasService(prisma as any, athosOrcamento as any, athos as any, propostasPdf as any);
  return { prisma, athosOrcamento, athos, propostasPdf, service };
}

type Ctx = ReturnType<typeof criarContexto>;

/** Rascunho pronto para gerar: cliente associado e dois itens (2 x 3,50 = 7,00 com 1 item de 2). */
async function propostaPronta(ctx: Ctx, opcoes: { cliente?: boolean; itens?: boolean } = {}) {
  const { cliente = true, itens = true } = opcoes;
  const criada = await ctx.service.criarRascunho(cliente ? { idclienteAthos: 5 } : {});
  if (itens) {
    ctx.athosOrcamento.obterProdutoProposta.mockResolvedValueOnce(produto());
    await ctx.service.adicionarItem(criada.id, { idproduto: 1, quantidade: 2 });
  }
  return criada.id;
}

const linha = (ctx: Ctx, id: string) => ctx.prisma._propostas.find((p) => p.id === id)!;

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

describe("PropostasService.gerar - concorrencia (D-07, T-55-38)", () => {
  it("duas chamadas simultaneas resultam em UM unico INSERT no Athos e a segunda recebe 409", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);

    const resultados = await Promise.allSettled([ctx.service.gerar(id, DTO_GERAR), ctx.service.gerar(id, DTO_GERAR)]);

    expect(ctx.athosOrcamento.criarOrcamentoProposta).toHaveBeenCalledTimes(1);
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].reason.codigo).toBe("LANCAMENTO_EM_ANDAMENTO");
    expect(falhas[0].reason.getStatus()).toBe(409);
    expect(linha(ctx, id).status).toBe("ENVIADA");
  });
});

describe("PropostasService.gerar - validacao antes de reservar (D-30)", () => {
  it("flag desligada: 503, status segue RASCUNHO e o Athos nao e chamado", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    ctx.athosOrcamento.exigirEscritaPropostaAtiva.mockImplementation(() => {
      throw new OrcamentoAthosError("ESCRITA_DESABILITADA", "desabilitada", 503);
    });

    await esperarErro(ctx.service.gerar(id, DTO_GERAR), "ESCRITA_DESABILITADA", 503);

    expect(linha(ctx, id).status).toBe("RASCUNHO");
    expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
    expect(ctx.athosOrcamento.criarOrcamentoProposta).not.toHaveBeenCalled();
  });

  it("cliente ausente e proposta sem itens falham antes da flag, do snapshot e da reserva", async () => {
    const ctx = criarContexto();
    const semCliente = await propostaPronta(ctx, { cliente: false });
    const semItens = await propostaPronta(ctx, { itens: false });
    const updateMany = jest.spyOn(ctx.prisma.proposta, "updateMany");

    await esperarErro(ctx.service.gerar(semCliente, DTO_GERAR), "CLIENTE_OBRIGATORIO", 422);
    await esperarErro(ctx.service.gerar(semItens, DTO_GERAR), "SEM_ITENS", 422);

    expect(ctx.athosOrcamento.exigirEscritaPropostaAtiva).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(linha(ctx, semCliente).status).toBe("RASCUNHO");
    expect(linha(ctx, semItens).status).toBe("RASCUNHO");
  });
});

describe("PropostasService.gerar - snapshot do PDF (D-18, T-55-55)", () => {
  it("captura o snapshot ANTES da reserva, grava-o na mesma atualizacao e entrega o MESMO objeto a gerarOficial", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    const updateMany = jest.spyOn(ctx.prisma.proposta, "updateMany");

    await ctx.service.gerar(id, DTO_GERAR);

    expect(ctx.propostasPdf.capturarSnapshot).toHaveBeenCalledTimes(1);
    const indiceReserva = updateMany.mock.calls.findIndex(([arg]) => (arg as any).data.status === "LANCANDO");
    expect(indiceReserva).toBeGreaterThanOrEqual(0);
    const dadosReserva = (updateMany.mock.calls[indiceReserva][0] as any).data;
    expect(dadosReserva.pdfSnapshot).toBe(SNAPSHOT);
    expect(ctx.propostasPdf.capturarSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[indiceReserva],
    );
    expect(ctx.propostasPdf.capturarSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.athosOrcamento.criarOrcamentoProposta.mock.invocationCallOrder[0],
    );
    expect(ctx.propostasPdf.gerarOficial).toHaveBeenCalledTimes(1);
    expect(ctx.propostasPdf.gerarOficial.mock.calls[0][1]).toBe(SNAPSHOT);
    expect(ctx.propostasPdf.capturarSnapshot).toHaveBeenCalledTimes(1);
  });

  it("PDF_INDISPONIVEL na captura deixa RASCUNHO, nao chama o Athos e repassa o erro", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    const erro = new PropostaError("PDF_INDISPONIVEL", "Sem configuracao bancaria.", 503);
    ctx.propostasPdf.capturarSnapshot.mockRejectedValueOnce(erro);

    await expect(ctx.service.gerar(id, DTO_GERAR)).rejects.toBe(erro);

    expect(linha(ctx, id).status).toBe("RASCUNHO");
    expect(linha(ctx, id).pdfSnapshot).toBeNull();
    expect(ctx.athosOrcamento.criarOrcamentoProposta).not.toHaveBeenCalled();
  });
});

describe("PropostasService.gerar - entrada enviada ao Athos (D-04)", () => {
  it("itens com so idproduto, quantidade, precoUnitario e custoUnitario; ref e refDoOrcamento do id", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);

    await ctx.service.gerar(id, DTO_GERAR);

    const entrada = ctx.athosOrcamento.criarOrcamentoProposta.mock.calls[0][0];
    expect(entrada.idcliente).toBe(5);
    expect(entrada.ref).toBe(refDoOrcamento(id));
    expect(entrada.itens).toHaveLength(1);
    for (const item of entrada.itens) {
      expect(Object.keys(item).sort()).toEqual(["custoUnitario", "idproduto", "precoUnitario", "quantidade"]);
      expect(item).not.toHaveProperty("nome");
      expect(item).not.toHaveProperty("descricao");
      expect(item).not.toHaveProperty("nomeAthos");
      expect(item).not.toHaveProperty("descricaoCurta");
    }
    expect(entrada.itens[0]).toEqual({ idproduto: 1, quantidade: "2.000", precoUnitario: "3.50", custoUnitario: "1.000" });
  });
});

describe("PropostasService.gerar - erro definitivo do Athos (T-55-33)", () => {
  it.each([
    ["CLIENTE_INEXISTENTE", 422],
    ["PRODUTO_INATIVO", 422],
    ["PRODUTO_INEXISTENTE", 422],
    ["VALOR_INVALIDO", 422],
    ["VALOR_FORA_DO_LIMITE", 422],
    ["QUANTIDADE_FRACIONADA", 422],
    ["FORMA_PAGAMENTO_INVALIDA", 500],
    ["PERMISSAO_NEGADA", 500],
    ["CONFIG_INVALIDA", 500],
    ["ESCRITA_DESABILITADA", 503],
  ] as const)("%s devolve a proposta a RASCUNHO e repassa o erro original", async (codigo, status) => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    const erro = new OrcamentoAthosError(codigo, "falha definitiva", status);
    ctx.athosOrcamento.criarOrcamentoProposta.mockRejectedValueOnce(erro);

    await expect(ctx.service.gerar(id, DTO_GERAR)).rejects.toBe(erro);

    expect(linha(ctx, id).status).toBe("RASCUNHO");
    expect(linha(ctx, id).lancandoEm).toBeNull();
    expect(linha(ctx, id).pdfSnapshot).toBeNull();
    expect(ctx.athosOrcamento.buscarOrcamentoPorRefProposta).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
  });

  it("depois do erro definitivo a proposta pode ser gerada de novo", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    ctx.athosOrcamento.criarOrcamentoProposta.mockRejectedValueOnce(new OrcamentoAthosError("PRODUTO_INATIVO", "inativo", 422));
    await expect(ctx.service.gerar(id, DTO_GERAR)).rejects.toBeInstanceOf(OrcamentoAthosError);

    const resposta = await ctx.service.gerar(id, DTO_GERAR);
    expect(resposta.status).toBe("ENVIADA");
    expect(ctx.athosOrcamento.criarOrcamentoProposta).toHaveBeenCalledTimes(2);
  });
});

describe("PropostasService.gerar - erro ambiguo do Athos (Pitfall 10)", () => {
  const ambiguos: Array<[string, () => unknown]> = [
    ["ERRO_BANCO", () => new OrcamentoAthosError("ERRO_BANCO", "timeout", 500)],
    ["ATHOS_INDISPONIVEL", () => new OrcamentoAthosError("ATHOS_INDISPONIVEL", "queda", 503)],
    ["erro desconhecido", () => new Error("socket hang up")],
  ];

  it.each(ambiguos)("%s com orcamento achado pelo ref: finaliza como ENVIADA sem novo INSERT", async (_nome, fabricar) => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    ctx.athosOrcamento.criarOrcamentoProposta.mockRejectedValueOnce(fabricar());
    ctx.athosOrcamento.buscarOrcamentoPorRefProposta.mockResolvedValueOnce({
      idorcamento: 888,
      senhabalcao: 99,
      data: "2026-11-27",
      hora: "11:00:00",
      valorTotal: "7.00",
    });

    const resposta = await ctx.service.gerar(id, DTO_GERAR);

    expect(ctx.athosOrcamento.buscarOrcamentoPorRefProposta).toHaveBeenCalledWith(refDoOrcamento(id));
    expect(ctx.athosOrcamento.criarOrcamentoProposta).toHaveBeenCalledTimes(1);
    expect(resposta).toMatchObject({ id, status: "ENVIADA", idorcamentoAthos: 888, senhaBalcao: 99, pdfDisponivel: true });
    expect(linha(ctx, id)).toMatchObject({ status: "ENVIADA", idorcamentoAthos: 888, senhaBalcao: 99, athosData: "2026-11-27", athosHora: "11:00:00" });
    expect(ctx.propostasPdf.gerarOficial.mock.calls[0][1]).toBe(SNAPSHOT);
  });

  it.each(ambiguos)("%s sem orcamento no Athos: volta a RASCUNHO e repassa o erro", async (_nome, fabricar) => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    const erro = fabricar();
    ctx.athosOrcamento.criarOrcamentoProposta.mockRejectedValueOnce(erro);
    ctx.athosOrcamento.buscarOrcamentoPorRefProposta.mockResolvedValueOnce(null);

    await expect(ctx.service.gerar(id, DTO_GERAR)).rejects.toBe(erro);

    expect(linha(ctx, id).status).toBe("RASCUNHO");
    expect(linha(ctx, id).pdfSnapshot).toBeNull();
    expect(ctx.athosOrcamento.criarOrcamentoProposta).toHaveBeenCalledTimes(1);
  });

  it("consulta por ref tambem falha: fica LANCANDO e orienta a recuperar", async () => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    ctx.athosOrcamento.criarOrcamentoProposta.mockRejectedValueOnce(new OrcamentoAthosError("ATHOS_INDISPONIVEL", "queda", 503));
    ctx.athosOrcamento.buscarOrcamentoPorRefProposta.mockRejectedValueOnce(new Error("sem conexao"));

    const erro = await esperarErro(ctx.service.gerar(id, DTO_GERAR), "LANCAMENTO_EM_ANDAMENTO", 409);

    expect(String(erro.getResponse().mensagem)).toMatch(/recuper/i);
    expect(linha(ctx, id).status).toBe("LANCANDO");
    expect(linha(ctx, id).pdfSnapshot).toBe(SNAPSHOT);
    jest.restoreAllMocks();
  });
});

describe("PropostasService - orfao e recuperacao (D-07, D-17, T-55-32, T-55-62)", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** Falha o Prisma so na finalizacao (updateMany para ENVIADA), simulando queda local depois do COMMIT. */
  function falharFinalizacao(ctx: Ctx) {
    const original = ctx.prisma.proposta.updateMany.bind(ctx.prisma.proposta);
    return jest.spyOn(ctx.prisma.proposta, "updateMany").mockImplementation((async (args: any) => {
      if (args?.data?.status === "ENVIADA") throw new Error("conexao com o banco local perdida");
      return original(args);
    }) as any);
  }

  /** So Date e simulado: promessas e filas continuam reais. */
  function relogioControlavel(agora: Date) {
    jest.useFakeTimers({
      now: agora,
      doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance", "hrtime"],
    });
  }

  it("falha do Prisma depois do COMMIT: fica LANCANDO, o erro cita o numero e o log traz idorcamento e ref", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    const logErro = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    falharFinalizacao(ctx);

    const erro = await esperarErro(ctx.service.gerar(id, DTO_GERAR), "LANCAMENTO_EM_ANDAMENTO", 409);

    expect(String(erro.getResponse().mensagem)).toContain("777");
    expect(linha(ctx, id).status).toBe("LANCANDO");
    const logado = logErro.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logado).toContain("777");
    expect(logado).toContain(refDoOrcamento(id));
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
  });

  it("recuperar antes de 120 s responde 409 LANCAMENTO_EM_ANDAMENTO e nao consulta o Athos", async () => {
    const t0 = new Date("2026-11-27T12:00:00Z");
    relogioControlavel(t0);
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    falharFinalizacao(ctx);
    await esperarErro(ctx.service.gerar(id, DTO_GERAR), "LANCAMENTO_EM_ANDAMENTO", 409);

    jest.setSystemTime(new Date(t0.getTime() + 119_000));
    await esperarErro(ctx.service.recuperarLancamento(id), "LANCAMENTO_EM_ANDAMENTO", 409);

    expect(ctx.athosOrcamento.buscarOrcamentoPorRefProposta).not.toHaveBeenCalled();
    expect(linha(ctx, id).status).toBe("LANCANDO");
  });

  it("recuperar depois de 120 s acha o orcamento pelo ref, finaliza como ENVIADA com o snapshot ja gravado e sem novo INSERT", async () => {
    const t0 = new Date("2026-11-27T12:00:00Z");
    relogioControlavel(t0);
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const falha = falharFinalizacao(ctx);
    await esperarErro(ctx.service.gerar(id, DTO_GERAR), "LANCAMENTO_EM_ANDAMENTO", 409);
    falha.mockRestore();

    jest.setSystemTime(new Date(t0.getTime() + 121_000));
    ctx.athosOrcamento.buscarOrcamentoPorRefProposta.mockResolvedValueOnce({
      idorcamento: 777,
      senhabalcao: 4321,
      data: "2026-11-27",
      hora: "10:20:30",
      valorTotal: "7.00",
    });
    const resposta = (await ctx.service.recuperarLancamento(id)) as any;

    expect(ctx.athosOrcamento.buscarOrcamentoPorRefProposta).toHaveBeenCalledWith(refDoOrcamento(id));
    expect(resposta).toMatchObject({ id, status: "ENVIADA", idorcamentoAthos: 777, senhaBalcao: 4321, pdfDisponivel: true });
    expect(linha(ctx, id)).toMatchObject({ status: "ENVIADA", idorcamentoAthos: 777 });
    expect(ctx.athosOrcamento.criarOrcamentoProposta).toHaveBeenCalledTimes(1);
    expect(ctx.propostasPdf.capturarSnapshot).toHaveBeenCalledTimes(1);
    expect(ctx.propostasPdf.gerarOficial).toHaveBeenCalledTimes(1);
    expect(ctx.propostasPdf.gerarOficial.mock.calls[0][1]).toBe(SNAPSHOT);
  });

  it("recuperar sem orcamento no Athos devolve a proposta a RASCUNHO com mensagem", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    const original = linha(ctx, id);
    original.status = "LANCANDO";
    original.lancandoEm = new Date(Date.now() - 600_000);
    original.pdfSnapshot = SNAPSHOT;
    ctx.athosOrcamento.buscarOrcamentoPorRefProposta.mockResolvedValueOnce(null);

    const resposta = (await ctx.service.recuperarLancamento(id)) as any;

    expect(resposta.status).toBe("RASCUNHO");
    expect(typeof resposta.mensagem).toBe("string");
    expect(resposta.mensagem.length).toBeGreaterThan(0);
    expect(linha(ctx, id).status).toBe("RASCUNHO");
    expect(ctx.athosOrcamento.criarOrcamentoProposta).not.toHaveBeenCalled();
  });

  it.each(["RASCUNHO", "ENVIADA"])("recuperar fora de LANCANDO (%s) responde 409 TRANSICAO_INVALIDA", async (status) => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    linha(ctx, id).status = status;

    await esperarErro(ctx.service.recuperarLancamento(id), "TRANSICAO_INVALIDA", 409);
    expect(ctx.athosOrcamento.buscarOrcamentoPorRefProposta).not.toHaveBeenCalled();
  });

  it("recuperar proposta inexistente responde 404", async () => {
    const ctx = criarContexto();
    await esperarErro(ctx.service.recuperarLancamento("6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11"), "PROPOSTA_NAO_ENCONTRADA", 404);
  });
});

describe("PropostasService.gerar - falha do PDF depois do lancamento (D-17)", () => {
  it("nao relanca no Athos: ENVIADA, pdfDisponivel falso, aviso e pdfSnapshot preservado", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    ctx.propostasPdf.gerarOficial.mockRejectedValueOnce(new Error("chromium caiu"));

    const resposta = await ctx.service.gerar(id, DTO_GERAR);

    expect(resposta).toMatchObject({ status: "ENVIADA", idorcamentoAthos: 777, pdfDisponivel: false });
    expect(typeof resposta.aviso).toBe("string");
    expect(linha(ctx, id).status).toBe("ENVIADA");
    expect(linha(ctx, id).pdfObjectName).toBeNull();
    expect(linha(ctx, id).pdfSnapshot).toBe(SNAPSHOT);
    expect(ctx.athosOrcamento.criarOrcamentoProposta).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});

describe("PropostasService.obter - detalhe nunca expoe pdfSnapshot (D-12)", () => {
  it("proposta lancada com pdfSnapshot gravado nao contem a chave em nenhum nivel", async () => {
    const ctx = criarContexto();
    const id = await propostaPronta(ctx);
    await ctx.service.gerar(id, DTO_GERAR);
    expect(linha(ctx, id).pdfSnapshot).toBe(SNAPSHOT);

    const detalhe = await ctx.service.obter(id);

    expect(JSON.stringify(detalhe)).not.toContain("pdfSnapshot");
    expect(JSON.stringify(detalhe)).not.toContain(SNAPSHOT.template.source);
    expect(detalhe.status).toBe("ENVIADA");
  });
});
