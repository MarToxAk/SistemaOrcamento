/**
 * Testes do ciclo da proposta depois do lancamento (Fase 55, plano 55-13): PDF oficial por snapshot, previa,
 * duplicar e transicoes manuais de status. Prisma em memoria e Athos/PDF simulados: NENHUM acesso a banco real.
 */
import { criarPrismaPropostaFake } from "./__fixtures__/prisma-proposta.fake";
import { PropostaError } from "./propostas.errors";
import { PropostasService } from "./propostas.service";

const SNAPSHOT = {
  versao: 1 as const,
  banco: { bancoNome: "Banco Teste", agencia: "0001", conta: "12345-6", titular: "Empresa Teste Ltda", documentoTitular: "00.000.000/0001-00" },
  empresa: { nome: "Empresa Teste Ltda", cnpj: "00.000.000/0001-00", endereco: "Rua Teste, 1" },
  template: { origem: "BANCO" as const, source: "<html>template-do-lancamento</html>" },
};

const SNAPSHOT_DE_AGORA = {
  versao: 1 as const,
  banco: { bancoNome: "Outro Banco", agencia: "9999", conta: "99999-9", titular: "Outra Empresa", documentoTitular: "11.111.111/0001-11" },
  empresa: { nome: "Empresa Alterada Ltda", cnpj: "11.111.111/0001-11", endereco: "Rua Nova, 9" },
  template: { origem: "BANCO" as const, source: "<html>template-de-agora</html>" },
};

const PDF_ARMAZENADO = Buffer.from("%PDF-1.7 armazenado");
const PDF_REGERADO = Buffer.from("%PDF-1.7 regerado");

function criarContexto() {
  const prisma = criarPrismaPropostaFake();
  const athosOrcamento = {
    obterProdutoProposta: jest.fn(),
    buscarProdutosProposta: jest.fn(),
    exigirEscritaPropostaAtiva: jest.fn(),
    criarOrcamentoProposta: jest.fn(),
    buscarOrcamentoPorRefProposta: jest.fn(),
  };
  const athos = { buscarClienteParaProposta: jest.fn() };
  const propostasPdf = {
    capturarSnapshot: jest.fn().mockResolvedValue(SNAPSHOT_DE_AGORA),
    gerarOficial: jest.fn().mockResolvedValue({ objectName: "propostas/777/Proposta-777.pdf" }),
    gerarPrevia: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.7 previa")),
    gerarPreviaTemplate: jest.fn(),
    baixarOficial: jest.fn().mockResolvedValue(PDF_ARMAZENADO),
    existeOficial: jest.fn().mockResolvedValue(true),
  };
  const service = new PropostasService(prisma as any, athosOrcamento as any, athos as any, propostasPdf as any);
  return { prisma, athosOrcamento, athos, propostasPdf, service };
}

type Ctx = ReturnType<typeof criarContexto>;

/** Chamadas feitas a QUALQUER metodo do Athos (contagem zero e a prova de que nada foi consultado). */
function chamadasAoAthos(ctx: Ctx): number {
  return [...Object.values(ctx.athosOrcamento), ...Object.values(ctx.athos)].reduce(
    (total, m) => total + (m as jest.Mock).mock.calls.length,
    0,
  );
}

interface Semente {
  status?: string;
  idorcamentoAthos?: number | null;
  pdfObjectName?: string | null;
  pdfSnapshot?: unknown;
  itens?: number;
  cliente?: boolean;
}

/** Semeia uma proposta direto no Prisma em memoria (o lancamento tem seus proprios testes nos planos 55-08 e 55-17). */
async function semear(ctx: Ctx, o: Semente = {}): Promise<string> {
  const { status = "ENVIADA", itens = 1, cliente = true } = o;
  const lancada = status === "ENVIADA" || status === "FECHADA" || status === "CANCELADA";
  const criada: any = await ctx.prisma.proposta.create({
    data: {
      status,
      ...(cliente ? { idclienteAthos: 5, clienteSnapshot: { idcliente: 5, razaoSocial: "MUNICIPIO DE TESTE" } } : {}),
      numeroProcesso: "Pregao 7/2026",
      setorResponsavel: "Compras",
      contatoEmail: "compras@teste.gov.br",
      contatoTelefone: "(12) 3333-0000",
      validadeDias: 5,
      prazoEntregaDias: 10,
      observacao: "Entregar no almoxarifado",
      assinanteNome: "Fulano de Tal",
      assinanteCargo: "Diretor",
      assinanteCpf: "000.000.000-00",
      totalValor: "7.00",
      idorcamentoAthos: o.idorcamentoAthos === undefined ? (lancada ? 777 : null) : o.idorcamentoAthos,
      senhaBalcao: lancada ? 4321 : null,
      athosData: lancada ? "2026-11-27" : null,
      athosHora: lancada ? "10:20:30" : null,
      lancandoEm: lancada || status === "LANCANDO" ? new Date("2026-11-27T10:00:00Z") : null,
      enviadaEm: lancada ? new Date("2026-11-27T10:00:05Z") : null,
      fechadaEm: status === "FECHADA" ? new Date("2026-11-28T10:00:00Z") : null,
      canceladaEm: status === "CANCELADA" ? new Date("2026-11-28T10:00:00Z") : null,
      pdfObjectName: o.pdfObjectName === undefined ? (lancada ? "propostas/777/Proposta-777.pdf" : null) : o.pdfObjectName,
      pdfGeradoEm: lancada ? new Date("2026-11-27T10:00:06Z") : null,
      pdfSnapshot: o.pdfSnapshot === undefined ? (lancada ? SNAPSHOT : null) : o.pdfSnapshot,
    },
  });
  for (let i = 1; i <= itens; i++) {
    await ctx.prisma.propostaItem.create({
      data: {
        propostaId: criada.id,
        sequencia: i,
        idproduto: 60 + i,
        nomeAthos: `PRODUTO ATHOS ${i}`,
        nome: `Nome na proposta ${i}`,
        descricaoCurta: `Curta ${i}`,
        unidade: "UN",
        permiteFracionar: false,
        quantidade: "2.000",
        precoBase: "3.456",
        ajusteTipo: "VALOR",
        ajusteValor: "3.50",
        precoUnitario: "3.50",
        totalLinha: "7.00",
        custoUnitario: "1.000",
      },
    });
  }
  return criada.id as string;
}

const linha = (ctx: Ctx, id: string) => ctx.prisma._propostas.find((p) => p.id === id)!;

async function esperarErro(promessa: Promise<unknown>, codigo: string, status: number) {
  try {
    await promessa;
  } catch (err: any) {
    expect(err).toBeInstanceOf(PropostaError);
    expect(err.codigo).toBe(codigo);
    expect(err.getStatus()).toBe(status);
    return err as PropostaError;
  }
  throw new Error(`esperava ${codigo} (${status}), mas nao houve erro`);
}

describe("PropostasService.obterPdf (55-13, D-09, D-18)", () => {
  it("proposta ENVIADA com PDF armazenado devolve o armazenado sem regenerar nem capturar nem tocar no Athos", async () => {
    const ctx = criarContexto();
    const id = await semear(ctx);

    const r = await ctx.service.obterPdf(id);

    expect(r.buffer).toBe(PDF_ARMAZENADO);
    expect(r.nomeArquivo).toBe("Proposta-777.pdf");
    expect(ctx.propostasPdf.existeOficial).toHaveBeenCalledWith("propostas/777/Proposta-777.pdf");
    expect(ctx.propostasPdf.baixarOficial).toHaveBeenCalledWith("propostas/777/Proposta-777.pdf");
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
    expect(chamadasAoAthos(ctx)).toBe(0);
  });

  it("FECHADA e CANCELADA com numero tambem servem o PDF", async () => {
    for (const status of ["FECHADA", "CANCELADA"]) {
      const ctx = criarContexto();
      const id = await semear(ctx, { status });
      const r = await ctx.service.obterPdf(id);
      expect(r.nomeArquivo).toBe("Proposta-777.pdf");
    }
  });

  it("arquivo ausente: regenera SO do pdfSnapshot gravado, grava pdfObjectName e pdfGeradoEm, nunca captura nem toca no Athos", async () => {
    const ctx = criarContexto();
    const id = await semear(ctx, { pdfObjectName: "propostas/777/antigo.pdf" });
    ctx.propostasPdf.existeOficial.mockResolvedValue(false);
    ctx.propostasPdf.baixarOficial.mockResolvedValue(PDF_REGERADO);
    ctx.propostasPdf.gerarOficial.mockResolvedValue({ objectName: "propostas/777/Proposta-777.pdf" });
    const antes = linha(ctx, id).pdfGeradoEm;

    // Configuracao de agora diferente da do lancamento: nada disso pode vazar para o PDF regenerado.
    ctx.prisma._config.linha = { id: "default", bancoNome: "Outro Banco", agencia: "9999", conta: "99999-9", titular: "Outra Empresa", documentoTitular: "11.111.111/0001-11" };
    const envAnterior = process.env.EMPRESA_NOME;
    process.env.EMPRESA_NOME = "Empresa Alterada Ltda";
    ctx.propostasPdf.capturarSnapshot.mockResolvedValue(SNAPSHOT_DE_AGORA);
    try {
      const r = await ctx.service.obterPdf(id);

      expect(r.buffer).toBe(PDF_REGERADO);
      expect(r.nomeArquivo).toBe("Proposta-777.pdf");
      expect(ctx.propostasPdf.gerarOficial).toHaveBeenCalledTimes(1);
      const [propostaEntregue, snapshotEntregue] = ctx.propostasPdf.gerarOficial.mock.calls[0];
      expect(snapshotEntregue).toEqual(SNAPSHOT);
      expect(snapshotEntregue).not.toEqual(SNAPSHOT_DE_AGORA);
      expect(propostaEntregue).toMatchObject({ id, idorcamentoAthos: 777, athosData: "2026-11-27" });
      expect(propostaEntregue.itens).toHaveLength(1);
      expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
      expect(chamadasAoAthos(ctx)).toBe(0);
    } finally {
      if (envAnterior === undefined) delete process.env.EMPRESA_NOME;
      else process.env.EMPRESA_NOME = envAnterior;
    }
    expect(linha(ctx, id).pdfObjectName).toBe("propostas/777/Proposta-777.pdf");
    expect(linha(ctx, id).pdfGeradoEm).not.toBe(antes);
    expect(ctx.propostasPdf.baixarOficial).toHaveBeenCalledWith("propostas/777/Proposta-777.pdf");
    // O snapshot gravado nao foi tocado.
    expect(linha(ctx, id).pdfSnapshot).toEqual(SNAPSHOT);
  });

  it("pdfObjectName nulo (geracao falhou no lancamento): regenera do snapshot gravado sem consultar o armazenamento", async () => {
    const ctx = criarContexto();
    const id = await semear(ctx, { pdfObjectName: null });
    ctx.propostasPdf.baixarOficial.mockResolvedValue(PDF_REGERADO);

    const r = await ctx.service.obterPdf(id);

    expect(r.buffer).toBe(PDF_REGERADO);
    expect(ctx.propostasPdf.existeOficial).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.gerarOficial.mock.calls[0][1]).toEqual(SNAPSHOT);
    expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
    expect(linha(ctx, id).pdfObjectName).toBe("propostas/777/Proposta-777.pdf");
    expect(linha(ctx, id).pdfGeradoEm).toBeInstanceOf(Date);
  });

  it.each(["ENVIADA", "FECHADA", "CANCELADA"])("%s com numero mas sem pdfSnapshot: 409 PDF_INDISPONIVEL pedindo para duplicar, sem regenerar", async (status) => {
    const ctx = criarContexto();
    const id = await semear(ctx, { status, pdfObjectName: null, pdfSnapshot: null });

    const erro = await esperarErro(ctx.service.obterPdf(id), "PDF_INDISPONIVEL", 409);

    expect(JSON.stringify(erro.getResponse())).toMatch(/dupliqu/i);
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
  });

  it("arquivo ausente e sem snapshot: tambem 409 (nao regenera com dados atuais)", async () => {
    const ctx = criarContexto();
    const id = await semear(ctx, { pdfSnapshot: null });
    ctx.propostasPdf.existeOficial.mockResolvedValue(false);

    await esperarErro(ctx.service.obterPdf(id), "PDF_INDISPONIVEL", 409);
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.capturarSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ["RASCUNHO", { status: "RASCUNHO" }],
    ["LANCANDO", { status: "LANCANDO" }],
    ["ENVIADA sem idorcamentoAthos", { status: "ENVIADA", idorcamentoAthos: null }],
  ])("%s: 409 PDF_INDISPONIVEL", async (_nome, semente) => {
    const ctx = criarContexto();
    const id = await semear(ctx, semente as Semente);

    await esperarErro(ctx.service.obterPdf(id), "PDF_INDISPONIVEL", 409);
    expect(ctx.propostasPdf.baixarOficial).not.toHaveBeenCalled();
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
  });

  it("proposta inexistente: 404 PROPOSTA_NAO_ENCONTRADA", async () => {
    const ctx = criarContexto();
    await esperarErro(ctx.service.obterPdf("6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11"), "PROPOSTA_NAO_ENCONTRADA", 404);
  });
});

describe("PropostasService.obterPrevia (55-13, D-12)", () => {
  it.each(["RASCUNHO", "LANCANDO", "ENVIADA", "FECHADA", "CANCELADA"])("%s com itens gera a previa e nunca o oficial", async (status) => {
    const ctx = criarContexto();
    const id = await semear(ctx, { status });

    const pdf = await ctx.service.obterPrevia(id);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(ctx.propostasPdf.gerarPrevia).toHaveBeenCalledTimes(1);
    expect(ctx.propostasPdf.gerarPrevia.mock.calls[0][0]).toMatchObject({ id });
    expect(ctx.propostasPdf.gerarOficial).not.toHaveBeenCalled();
    expect(chamadasAoAthos(ctx)).toBe(0);
  });

  it("funciona sem cliente quando ha pelo menos 1 item", async () => {
    const ctx = criarContexto();
    const id = await semear(ctx, { status: "RASCUNHO", cliente: false });
    const pdf = await ctx.service.obterPrevia(id);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("sem itens: 422 SEM_ITENS e nao renderiza", async () => {
    const ctx = criarContexto();
    const id = await semear(ctx, { status: "RASCUNHO", itens: 0 });

    await esperarErro(ctx.service.obterPrevia(id), "SEM_ITENS", 422);
    expect(ctx.propostasPdf.gerarPrevia).not.toHaveBeenCalled();
  });

  it("inexistente: 404", async () => {
    const ctx = criarContexto();
    await esperarErro(ctx.service.obterPrevia("6f0f3a52-5c6e-4f43-8d3a-0f7a2f5b9c11"), "PROPOSTA_NAO_ENCONTRADA", 404);
  });
});
