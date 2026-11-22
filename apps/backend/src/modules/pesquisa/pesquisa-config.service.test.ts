/**
 * Fase 52 (plano 52-03): PesquisaConfigService — singleton criado no primeiro acesso.
 * Plano 52-07: escrita da config inteira com validacao no servidor e DTO.
 */
import { BadRequestException, Logger } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { AtualizarPesquisaConfigDto } from "./dto/atualizar-pesquisa-config.dto";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { type ConfigEntrada, TEXTOS_PADRAO } from "./pesquisa-regras";

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
      update: jest.fn(async ({ data }: { data: Linha }) => {
        estado.linha = { ...(estado.linha ?? {}), ...data, atualizadoEm: new Date("2026-11-22T13:00:00Z") };
        return { ...estado.linha };
      }),
    },
  };
  const config = { get: jest.fn((chave: string) => env[chave]) };
  const service = new PesquisaConfigService(prisma as never, config as never);
  return { service, prisma, estado };
}

describe("PesquisaConfigService", () => {
  it("primeiro acesso concorrente: P2002 no create relê a linha do vencedor em vez de falhar", async () => {
    const { service, prisma, estado } = montar();
    const vencedora: Linha = { id: "default", ativo: false, percentualDesconto: 10, atualizadoEm: new Date("2026-11-22T12:00:00Z"), atualizadoPor: null };
    prisma.pesquisaConfig.create.mockImplementationOnce(async () => {
      estado.linha = vencedora;
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });

    const [a, b] = await Promise.all([service.obter(), service.obter()]);

    expect(a.ativo).toBe(false);
    expect(b.ativo).toBe(false);
    expect(prisma.pesquisaConfig.findUnique).toHaveBeenCalled();
  });

  it("primeiro acesso: erro do create que nao e P2002 continua propagando", async () => {
    const { service, prisma } = montar();
    prisma.pesquisaConfig.create.mockRejectedValueOnce(new Error("banco fora"));

    await expect(service.obter()).rejects.toThrow("banco fora");
  });

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

// ---------------------------------------------------------------------------------------------
// Plano 52-07: escrita da config inteira (D-24, D-39, UI-D15, UI-D16)
// ---------------------------------------------------------------------------------------------

const ENTRADA_VALIDA: ConfigEntrada = {
  ativo: true,
  percentualDesconto: 10.5,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: 300,
  prefixoCupom: "box",
  linkGoogle: "https://g.page/r/abc/review",
  varianteVisual: "AB",
  ...TEXTOS_PADRAO,
};

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
    return null;
  } catch (err) {
    return err;
  }
}

describe("PesquisaConfigService.atualizar", () => {
  it("grava a config inteira de uma vez com atualizadoPor e devolve a view relida", async () => {
    const { service, prisma, estado } = montar();

    const view = await service.atualizar(ENTRADA_VALIDA, "admin");

    expect(prisma.pesquisaConfig.update).toHaveBeenCalledTimes(1);
    expect(prisma.pesquisaConfig.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: expect.objectContaining({
        ativo: true,
        percentualDesconto: 10.5,
        tetoDesconto: 5,
        compraMinima: 30,
        validadeCupomDias: 30,
        validadeLinkDias: 7,
        intervaloDias: 90,
        tetoMensal: 300,
        prefixoCupom: "BOX",
        linkGoogle: "https://g.page/r/abc/review",
        varianteVisual: "AB",
        textoFechamento: TEXTOS_PADRAO.textoFechamento,
        paginaGoogleCorpo: TEXTOS_PADRAO.paginaGoogleCorpo,
        atualizadoPor: "admin",
      }),
    });
    expect(estado.linha).not.toBeNull();
    expect(view).toMatchObject({ ativo: true, prefixoCupom: "BOX", atualizadoPor: "admin" });
  });

  it("garante a linha singleton antes de gravar (cria com os padroes e depois atualiza)", async () => {
    const { service, prisma } = montar(null);

    await service.atualizar(ENTRADA_VALIDA, "admin");

    expect(prisma.pesquisaConfig.create).toHaveBeenCalledTimes(1);
    expect(prisma.pesquisaConfig.update).toHaveBeenCalledTimes(1);
    const ordemCreate = prisma.pesquisaConfig.create.mock.invocationCallOrder[0];
    const ordemUpdate = prisma.pesquisaConfig.update.mock.invocationCallOrder[0];
    expect(ordemCreate).toBeLessThan(ordemUpdate);
  });

  it("usa 'admin' como atualizadoPor quando o autor nao e informado", async () => {
    const { service, prisma } = montar();

    await service.atualizar(ENTRADA_VALIDA);

    expect(prisma.pesquisaConfig.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: expect.objectContaining({ atualizadoPor: "admin" }),
    });
  });

  it("recusa percentual, link fora do Google, texto sem {link} e validade do link longa em uma so resposta por campo", async () => {
    const { service, prisma } = montar();

    const erro = (await capturar(
      service.atualizar(
        {
          ...ENTRADA_VALIDA,
          percentualDesconto: 60,
          linkGoogle: "https://evil.com",
          textoFechamento: "Responda nossa pesquisa de satisfacao.",
          validadeLinkDias: 20,
        },
        "admin",
      ),
    )) as BadRequestException;

    expect(erro).toBeInstanceOf(BadRequestException);
    const resposta = erro.getResponse() as { message: string[]; campos: Record<string, string> };
    expect(Object.keys(resposta.campos).sort()).toEqual(
      ["linkGoogle", "percentualDesconto", "textoFechamento", "validadeLinkDias"].sort(),
    );
    expect(resposta.campos.percentualDesconto).toBe("Máximo de 50%.");
    expect(resposta.campos.textoFechamento).toBe("Inclua {link} para o cliente encontrar a pesquisa.");
    expect(resposta.campos.validadeLinkDias).toBe("Máximo de 14 dias.");
    expect(Array.isArray(resposta.message)).toBe(true);
    expect(resposta.message).toContain("percentualDesconto: Máximo de 50%.");
    expect(resposta.message.every((linha) => typeof linha === "string" && linha.includes(": "))).toBe(true);
    expect(prisma.pesquisaConfig.update).not.toHaveBeenCalled();
  });

  it("normaliza o prefixo em maiusculas, limpa o link vazio e apara os textos", async () => {
    const { service, prisma } = montar();

    const view = await service.atualizar(
      {
        ...ENTRADA_VALIDA,
        prefixoCupom: "  box ",
        linkGoogle: "   ",
        textoFechamento: `  ${TEXTOS_PADRAO.textoFechamento}  `,
      },
      "admin",
    );

    expect(prisma.pesquisaConfig.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: expect.objectContaining({
        prefixoCupom: "BOX",
        linkGoogle: null,
        textoFechamento: TEXTOS_PADRAO.textoFechamento,
      }),
    });
    expect(view.prefixoCupom).toBe("BOX");
    expect(view.linkGoogle).toBeNull();
  });

  it("aceita no maximo 2 casas decimais nos valores monetarios", async () => {
    const { service, prisma } = montar();

    await service.atualizar({ ...ENTRADA_VALIDA, percentualDesconto: 10.5 }, "admin");
    expect(prisma.pesquisaConfig.update).toHaveBeenCalledTimes(1);

    prisma.pesquisaConfig.update.mockClear();
    const erro = (await capturar(
      service.atualizar({ ...ENTRADA_VALIDA, percentualDesconto: 10.555 }, "admin"),
    )) as BadRequestException;

    expect(erro).toBeInstanceOf(BadRequestException);
    const resposta = erro.getResponse() as { campos: Record<string, string> };
    expect(resposta.campos.percentualDesconto).toBe("Use no máximo 2 casas decimais.");
    expect(prisma.pesquisaConfig.update).not.toHaveBeenCalled();
  });

  it("registra so a mudanca de ativo, sem expor textos nem links", async () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const { service } = montar();

      await service.atualizar({ ...ENTRADA_VALIDA, ativo: true }, "admin");

      expect(log).toHaveBeenCalledTimes(1);
      const mensagem = String(log.mock.calls[0][0]);
      expect(mensagem).toContain("ativada");
      expect(mensagem).not.toContain(TEXTOS_PADRAO.textoFechamento);
      expect(mensagem).not.toContain("g.page");
    } finally {
      log.mockRestore();
    }
  });

  it("nao registra log quando o ativo nao muda", async () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const { service } = montar();
      await service.atualizar({ ...ENTRADA_VALIDA, ativo: false }, "admin");
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe("AtualizarPesquisaConfigDto", () => {
  const erros = async (corpo: object) =>
    (await validate(plainToInstance(AtualizarPesquisaConfigDto, corpo), { whitelist: true, forbidNonWhitelisted: true }))
      .length;

  it("corpo completo e valido passa (incluindo linkGoogle preenchido)", async () => {
    expect(await erros({ ...ENTRADA_VALIDA })).toBe(0);
  });

  it("campo desconhecido e rejeitado pelo whitelist/forbidNonWhitelisted", async () => {
    expect(await erros({ ...ENTRADA_VALIDA, campoExtra: "x" })).toBeGreaterThan(0);
  });

  it("tipos errados falham (ativo textual, percentual textual e validade fracionada)", async () => {
    for (const corpo of [
      { ...ENTRADA_VALIDA, ativo: "sim" },
      { ...ENTRADA_VALIDA, percentualDesconto: "10" },
      { ...ENTRADA_VALIDA, validadeCupomDias: 30.5 },
    ]) {
      expect(await erros(corpo)).toBeGreaterThan(0);
    }
  });

  it("texto acima de 2000 caracteres falha (guarda de tamanho)", async () => {
    expect(await erros({ ...ENTRADA_VALIDA, textoFechamento: "a".repeat(2001) })).toBeGreaterThan(0);
  });

  it("linkGoogle nulo e aceito", async () => {
    expect(await erros({ ...ENTRADA_VALIDA, linkGoogle: null })).toBe(0);
  });
});
