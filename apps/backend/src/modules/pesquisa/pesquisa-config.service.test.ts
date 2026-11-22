/**
 * Fase 52 (plano 52-03): PesquisaConfigService — singleton criado no primeiro acesso.
 */
import { PesquisaConfigService } from "./pesquisa-config.service";

type Linha = Record<string, unknown>;

/** Imita o Decimal do Prisma (Number(String(valor)) na borda). */
const decimal = (valor: string | number) => ({ toString: () => String(valor) });

const CONFIG_ENV: Record<string, string> = {
  PESQUISA_PERCENTUAL_PADRAO: "10",
  PESQUISA_TETO_PADRAO: "2",
  PESQUISA_COMPRA_MINIMA_PADRAO: "6",
  PESQUISA_TETO_MENSAL_PADRAO: "300",
  PESQUISA_PREFIXO_PADRAO: "BOX",
};

function montar(linhaInicial: Linha | null = null, env: Record<string, string> = CONFIG_ENV) {
  const estado: { linha: Linha | null } = { linha: linhaInicial };
  const prisma = {
    pesquisaConfig: {
      findUnique: jest.fn(async () => (estado.linha ? { ...estado.linha } : null)),
      create: jest.fn(async ({ data }: { data: Linha }) => {
        estado.linha = { atualizadoEm: new Date("2026-11-22T12:00:00Z"), atualizadoPor: null, ...data };
        return { ...estado.linha };
      }),
    },
  };
  const config = { get: jest.fn((chave: string) => env[chave]) };
  const service = new PesquisaConfigService(prisma as never, config as never);
  return { service, prisma, estado };
}

describe("PesquisaConfigService", () => {
  it("cria o singleton no primeiro acesso com ativo false e os padroes das envs", async () => {
    const { service, prisma } = montar();

    const view = await service.obter();

    expect(prisma.pesquisaConfig.create).toHaveBeenCalledTimes(1);
    expect(prisma.pesquisaConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "default",
        ativo: false,
        percentualDesconto: 10,
        tetoDesconto: 2,
        compraMinima: 6,
        tetoMensal: 300,
        prefixoCupom: "BOX",
      }),
    });
    expect(view).toMatchObject({
      ativo: false,
      percentualDesconto: 10,
      tetoDesconto: 2,
      compraMinima: 6,
      tetoMensal: 300,
      prefixoCupom: "BOX",
    });
    expect(typeof view.percentualDesconto).toBe("number");
  });

  it("devolve todos os textos preenchidos no primeiro acesso", async () => {
    const { service } = montar();

    const view = await service.obter();

    for (const texto of [
      view.textoFechamento,
      view.textoSemRecompensa,
      view.textoPosResposta,
      view.textoConviteGoogle,
      view.paginaTitulo,
      view.paginaSubtitulo,
      view.paginaObrigadoSemRecompensa,
      view.paginaGoogleTitulo,
      view.paginaGoogleCorpo,
    ]) {
      expect(typeof texto).toBe("string");
      expect(texto.trim().length).toBeGreaterThan(0);
    }
    expect(view.ativo).toBe(false);
  });

  it("no acesso seguinte nao cria de novo e converte Decimal em number", async () => {
    const { service, prisma } = montar({
      id: "default",
      ativo: true,
      percentualDesconto: decimal("7.5"),
      tetoDesconto: decimal("5"),
      compraMinima: decimal("30"),
      validadeCupomDias: 30,
      validadeLinkDias: 7,
      intervaloDias: 90,
      tetoMensal: decimal("300"),
      prefixoCupom: "BC",
      linkGoogle: "https://g.page/x",
      varianteVisual: "AB",
      textoFechamento: "a {link}",
      textoSemRecompensa: "b {link}",
      textoPosResposta: "c {codigo}",
      textoConviteGoogle: "d {link_google}",
      paginaTitulo: "titulo",
      paginaSubtitulo: "sub",
      paginaObrigadoSemRecompensa: "obrigado",
      paginaGoogleTitulo: "google",
      paginaGoogleCorpo: "corpo",
      atualizadoEm: new Date("2026-11-01T10:00:00Z"),
      atualizadoPor: "admin@exemplo.test",
    });

    const view = await service.obter();

    expect(prisma.pesquisaConfig.create).not.toHaveBeenCalled();
    expect(view.percentualDesconto).toBe(7.5);
    expect(view.tetoDesconto).toBe(5);
    expect(view.compraMinima).toBe(30);
    expect(view.tetoMensal).toBe(300);
    expect(view.linkGoogle).toBe("https://g.page/x");
    expect(view.atualizadoPor).toBe("admin@exemplo.test");
    expect(view.atualizadoEm).toEqual(new Date("2026-11-01T10:00:00Z"));
  });

  it("linha sem linkGoogle devolve null", async () => {
    const { service } = montar({
      id: "default",
      ativo: true,
      percentualDesconto: decimal("10"),
      tetoDesconto: decimal("5"),
      compraMinima: decimal("30"),
      validadeCupomDias: 30,
      validadeLinkDias: 7,
      intervaloDias: 90,
      tetoMensal: decimal("300"),
      prefixoCupom: "BC",
      linkGoogle: null,
      varianteVisual: "AB",
      textoFechamento: "a {link}",
      textoSemRecompensa: "b {link}",
      textoPosResposta: "c {codigo}",
      textoConviteGoogle: "d {link_google}",
      paginaTitulo: "t",
      paginaSubtitulo: "s",
      paginaObrigadoSemRecompensa: "o",
      paginaGoogleTitulo: "g",
      paginaGoogleCorpo: "c",
      atualizadoEm: null,
      atualizadoPor: null,
    });

    const view = await service.obter();
    expect(view.linkGoogle).toBeNull();
    expect(view.atualizadoEm).toBeNull();
  });

  it("padroes() devolve os numeros e o prefixo das envs sem tocar no banco", () => {
    const { service, prisma } = montar();

    const padroes = service.padroes();

    expect(padroes).toMatchObject({
      ativo: false,
      percentualDesconto: 10,
      tetoDesconto: 2,
      compraMinima: 6,
      tetoMensal: 300,
      prefixoCupom: "BOX",
    });
    expect(prisma.pesquisaConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.pesquisaConfig.create).not.toHaveBeenCalled();
  });
});
