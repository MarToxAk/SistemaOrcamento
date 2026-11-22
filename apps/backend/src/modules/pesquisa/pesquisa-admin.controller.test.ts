/**
 * Fase 52 (plano 52-12): PesquisaAdminController — rotas administrativas (config, resultados, cupons,
 * resgate e revogar). Controller instanciado com colaboradores falsos: nenhum Nest app, nenhuma rede.
 *
 * A guarda e conferida por metadata (AdminAuthGuard em cada handler e ausencia de marca de rota
 * publica) e os DTOs sao validados com class-validator.
 */
import "reflect-metadata";

import { BadRequestException, NotFoundException, RequestMethod } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { AdminAuthGuard } from "../security/admin-auth.guard";
import { IS_PUBLIC_KEY } from "../security/security.constants";
import { AtualizarPesquisaConfigDto } from "./dto/atualizar-pesquisa-config.dto";
import { ListarCuponsQueryDto } from "./dto/listar-cupons.query.dto";
import { ResgatarCupomDto } from "./dto/resgatar-cupom.dto";
import { PesquisaAdminController } from "./pesquisa-admin.controller";
import { PesquisaConfigService, type PesquisaConfigView } from "./pesquisa-config.service";
import { HOSTS_GOOGLE, PLACEHOLDERS_VALIDOS, type ConfigEntrada } from "./pesquisa-regras";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const PESQUISA_ID = "8f14e45f-ceea-467f-a1d3-6e0b3a7c1f22";
const ATUALIZADO_EM = new Date("2026-11-22T12:00:00Z");

const CONFIG: ConfigEntrada = {
  ativo: true,
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: 300,
  prefixoCupom: "BC",
  linkGoogle: "https://g.page/r/abc",
  varianteVisual: "ESTRELAS",
  textoFechamento: "Responda: {link}",
  textoSemRecompensa: "Responda: {link}",
  textoPosResposta: "Cupom {codigo}",
  textoConviteGoogle: "Avalie: {link_google}",
  paginaTitulo: "Como foi seu atendimento?",
  paginaSubtitulo: "Leva menos de 1 minuto.",
  paginaObrigadoSemRecompensa: "Obrigado por responder.",
  paginaGoogleTitulo: "Quer compartilhar sua experiencia?",
  paginaGoogleCorpo: "Sua avaliacao ajuda outros clientes.",
};

const CONFIG_VIEW: PesquisaConfigView = { ...CONFIG, atualizadoEm: ATUALIZADO_EM, atualizadoPor: "admin" };

const RESULTADOS: Linha = {
  periodo: "mes",
  notaMedia: 4.2,
  totalRespostas: 10,
  taxaResposta: { respondidas: 10, enviadas: 20, percentual: 50 },
  cupons: { emitidos: 8, usados: 3, vencidos: 0 },
  gastoMes: { valor: 30, teto: 300, percentual: 10, atingido: false },
  variantes: [],
  amostraPequena: true,
  distribuicao: [],
  ultimas: [
    {
      id: PESQUISA_ID,
      respondidaEm: ATUALIZADO_EM.toISOString(),
      nota: 5,
      variante: "ESTRELAS",
      comentario: null,
      telefoneMascarado: "(12) *****-4918",
      revogada: false,
      cupom: { situacao: "EMITIDO" },
    },
  ],
  relatorioChatwootUrl: null,
};

const DETALHE: Linha = {
  codigo: "BC-ABC234",
  criadoEm: ATUALIZADO_EM.toISOString(),
  telefoneMascarado: "(12) *****-4918",
  percentual: 10,
  teto: 5,
  compraMinima: 30,
  validadeAte: "2026-12-20T15:00:00.000Z",
  situacao: "EMITIDO",
  usadoEm: null,
  descontoAplicado: null,
  notaPesquisa: 5,
  valorCompra: null,
  usadoPor: null,
  suspensoAte: null,
};

const RESGATE: Linha = { cupom: { ...DETALHE, situacao: "USADO" }, descontoAplicado: 5, valorFinal: 45 };

const RESULTADO_REVOGACAO = {
  pesquisaId: PESQUISA_ID,
  jaRevogada: false,
  cupomCancelado: true,
  cupomJaUsado: false,
};

const HANDLERS = [
  "obterConfig",
  "atualizarConfig",
  "resultados",
  "listarCupons",
  "detalheCupom",
  "resgatarCupom",
  "revogarPesquisa",
] as const;

type Dependencias = {
  configPesquisa?: Linha;
  resultados?: Linha;
  cupom?: Linha;
  revogacao?: Linha;
};

function montar(deps: Dependencias = {}) {
  const configPesquisa = deps.configPesquisa ?? {
    obter: jest.fn(async () => ({ ...CONFIG_VIEW })),
    padroes: jest.fn(() => ({ ...CONFIG })),
    atualizar: jest.fn(async () => ({ ...CONFIG_VIEW })),
  };
  const resultados = deps.resultados ?? { resultados: jest.fn(async () => RESULTADOS) };
  const cupom = deps.cupom ?? {
    buscarPorCodigo: jest.fn(async () => DETALHE),
    listar: jest.fn(async () => ({ itens: [DETALHE], proximoCursor: null })),
    resgatar: jest.fn(async () => RESGATE),
  };
  const revogacao = deps.revogacao ?? { revogar: jest.fn(async () => RESULTADO_REVOGACAO) };
  const controller = new PesquisaAdminController(
    configPesquisa as never,
    resultados as never,
    cupom as never,
    revogacao as never,
  );
  return { controller, configPesquisa, resultados, cupom, revogacao };
}

/** PesquisaConfigService REAL sobre Prisma falso (para provar a validacao do link no servico). */
function configuracaoReal(): PesquisaConfigService {
  const linha: Linha = { ...CONFIG };
  const prisma = {
    pesquisaConfig: {
      findUnique: jest.fn(async () => ({ ...linha })),
      create: jest.fn(async ({ data }: Linha) => {
        Object.assign(linha, data);
        return { ...linha };
      }),
      update: jest.fn(async ({ data }: Linha) => {
        Object.assign(linha, data);
        return { ...linha };
      }),
    },
  };
  const configService = { get: jest.fn(() => undefined) };
  return new PesquisaConfigService(prisma as never, configService as never);
}

function dtoConfig(extra: Partial<ConfigEntrada> = {}): AtualizarPesquisaConfigDto {
  return plainToInstance(AtualizarPesquisaConfigDto, { ...CONFIG, ...extra });
}

function temChave(valor: unknown, procurada: string): boolean {
  if (Array.isArray(valor)) return valor.some((item) => temChave(item, procurada));
  if (valor && typeof valor === "object") {
    return Object.entries(valor as Linha).some(([chave, item]) => chave === procurada || temChave(item, procurada));
  }
  return false;
}

describe("PesquisaAdminController - rotas admin da pesquisa (plano 52-12)", () => {
  it("X1. todas as 7 rotas tem AdminAuthGuard e nenhuma e rota publica", () => {
    const proto = PesquisaAdminController.prototype as Linha;
    for (const nome of HANDLERS) {
      const handler = proto[nome];
      expect(typeof handler).toBe("function");
      const guards: unknown[] = Reflect.getMetadata("__guards__", handler) ?? [];
      expect(guards).toContain(AdminAuthGuard);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      const valores = Reflect.getMetadataKeys(handler).map((chave) => Reflect.getMetadata(chave, handler));
      expect(valores).not.toContain(true);
    }
  });

  it("X2. o controller vive em pesquisa/admin e expoe exatamente 7 handlers", () => {
    expect(Reflect.getMetadata("path", PesquisaAdminController)).toBe("pesquisa/admin");
    const expostos = HANDLERS.filter((nome) => typeof (PesquisaAdminController.prototype as Linha)[nome] === "function");
    expect(expostos).toHaveLength(7);
  });

  it("R1. revogar: rota POST pesquisas/:id/revogar com 200 e delega ao servico", async () => {
    const { controller, revogacao } = montar();
    const handler = PesquisaAdminController.prototype.revogarPesquisa;
    expect(Reflect.getMetadata("path", handler)).toBe("pesquisas/:id/revogar");
    expect(Reflect.getMetadata("method", handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata("__httpCode__", handler)).toBe(200);

    const resposta = await controller.revogarPesquisa(PESQUISA_ID);
    expect(resposta).toEqual(RESULTADO_REVOGACAO);
    expect(revogacao.revogar).toHaveBeenCalledWith(PESQUISA_ID);
  });

  it("R2. revogar propaga NotFoundException e nao expoe telefone, token nem conversationId", async () => {
    const revogacao = {
      revogar: jest
        .fn()
        .mockRejectedValueOnce(new NotFoundException("Pesquisa não encontrada."))
        .mockResolvedValueOnce(RESULTADO_REVOGACAO),
    };
    const { controller } = montar({ revogacao });

    await expect(controller.revogarPesquisa(PESQUISA_ID)).rejects.toBeInstanceOf(NotFoundException);
    const resposta = await controller.revogarPesquisa(PESQUISA_ID);
    expect(temChave(resposta, "telefone")).toBe(false);
    expect(temChave(resposta, "token")).toBe(false);
    expect(temChave(resposta, "conversationId")).toBe(false);
  });

  it("C1. GET config monta a resposta completa com limites, placeholders e hosts do Google", async () => {
    const { controller } = montar();
    const resposta = await controller.obterConfig();

    expect(resposta.config).toMatchObject({ ativo: true, percentualDesconto: 10, linkGoogle: CONFIG.linkGoogle });
    expect(resposta.config).not.toHaveProperty("atualizadoEm");
    expect(resposta.config).not.toHaveProperty("atualizadoPor");
    expect(resposta.padroes).toEqual({
      percentualDesconto: 10,
      tetoDesconto: 5,
      compraMinima: 30,
      tetoMensal: 300,
      prefixoCupom: "BC",
    });
    expect(resposta.limites).toEqual({
      percentualMin: 1,
      percentualMax: 50,
      validadeCupomMin: 1,
      validadeCupomMax: 180,
      validadeLinkMin: 1,
      validadeLinkMax: 14,
      intervaloMin: 0,
      intervaloMax: 365,
      textoMax: 600,
    });
    expect(resposta.placeholders).toEqual(PLACEHOLDERS_VALIDOS);
    expect(resposta.hostsGoogle).toEqual(HOSTS_GOOGLE);
    expect(resposta.atualizadoEm).toBe(ATUALIZADO_EM.toISOString());
  });

  it("C2. GET config devolve atualizadoEm nulo quando a config nunca foi atualizada", async () => {
    const configPesquisa = {
      obter: jest.fn(async () => ({ ...CONFIG_VIEW, atualizadoEm: null, atualizadoPor: null })),
      padroes: jest.fn(() => ({ ...CONFIG })),
      atualizar: jest.fn(),
    };
    const { controller } = montar({ configPesquisa });

    const resposta = await controller.obterConfig();
    expect(resposta.atualizadoEm).toBeNull();
  });

  it("C3. PUT config repassa o DTO inteiro e responde no mesmo formato", async () => {
    const { controller, configPesquisa } = montar();
    const dto = dtoConfig();

    const resposta = await controller.atualizarConfig(dto);

    expect(configPesquisa.atualizar).toHaveBeenCalledWith(dto, "admin");
    expect(resposta.config).toMatchObject({ ativo: true, percentualDesconto: 10 });
    expect(resposta.atualizadoEm).toBe(ATUALIZADO_EM.toISOString());
  });

  it("C4. PUT config propaga o 400 com { message, campos } do servico", async () => {
    const erro = new BadRequestException({ message: ["tetoDesconto: Máximo"], campos: { tetoDesconto: "Máximo" } });
    const configPesquisa = {
      obter: jest.fn(async () => ({ ...CONFIG_VIEW })),
      padroes: jest.fn(() => ({ ...CONFIG })),
      atualizar: jest.fn().mockRejectedValueOnce(erro),
    };
    const { controller } = montar({ configPesquisa });

    const capturado = await controller.atualizarConfig(dtoConfig()).catch((err: unknown) => err);
    expect(capturado).toBeInstanceOf(BadRequestException);
    expect((capturado as BadRequestException).getResponse()).toMatchObject({
      campos: { tetoDesconto: "Máximo" },
    });
  });

  it("L1. o DTO de config aceita linkGoogle nulo e string valida", async () => {
    for (const linkGoogle of [null, "https://g.page/r/abc"]) {
      const dto = dtoConfig({ linkGoogle });
      const erros = await validate(dto);
      expect(erros).toHaveLength(0);
    }
  });

  it("L2. PUT config com link fora da allowlist do Google vira 400 vindo do servico real", async () => {
    const servico = configuracaoReal();
    const controller = new PesquisaAdminController(servico, {} as never, {} as never, {} as never);

    const capturado = await controller
      .atualizarConfig(dtoConfig({ linkGoogle: "https://exemplo-malicioso.test/pagina" }))
      .catch((err: unknown) => err);

    expect(capturado).toBeInstanceOf(BadRequestException);
    const corpo = (capturado as BadRequestException).getResponse() as Linha;
    expect(String(corpo.campos.linkGoogle)).toContain("Google");
  });

  it("P1. resultados: periodo ausente vira mes, 30d e tudo sao repassados", async () => {
    const { controller, resultados } = montar();
    resultados.resultados.mockResolvedValue(RESULTADOS);

    expect(await controller.resultados(undefined)).toEqual(RESULTADOS);
    expect(resultados.resultados).toHaveBeenLastCalledWith("mes");
    await controller.resultados("30d");
    expect(resultados.resultados).toHaveBeenLastCalledWith("30d");
    await controller.resultados("tudo");
    expect(resultados.resultados).toHaveBeenLastCalledWith("tudo");
  });

  it("P2. resultados: periodo fora da lista fechada vira 400", async () => {
    const { controller, resultados } = montar();

    await expect(controller.resultados("xyz")).rejects.toBeInstanceOf(BadRequestException);
    expect(resultados.resultados).not.toHaveBeenCalled();
  });

  it("K1. cupons: status, cursor e limite sao repassados ao servico", async () => {
    const { controller, cupom } = montar();

    await controller.listarCupons({ status: "usados", cursor: "abc", limite: 20 });

    expect(cupom.listar).toHaveBeenCalledWith({ status: "usados", cursor: "abc", limite: 20 });
  });

  it("K2. o DTO da lista rejeita limite acima de 100 e status desconhecido", async () => {
    const acima = plainToInstance(ListarCuponsQueryDto, { limite: "500" });
    expect(await validate(acima)).not.toHaveLength(0);

    const statusInvalido = plainToInstance(ListarCuponsQueryDto, { status: "outros" });
    expect(await validate(statusInvalido)).not.toHaveLength(0);

    const valido = plainToInstance(ListarCuponsQueryDto, { status: "usados", limite: "20", cursor: "abc" });
    expect(await validate(valido)).toHaveLength(0);
    expect(valido.limite).toBe(20);
  });

  it("K3. detalhe de cupom inexistente vira 404 e o existente e devolvido", async () => {
    const cupom = {
      buscarPorCodigo: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(DETALHE),
      listar: jest.fn(),
      resgatar: jest.fn(),
    };
    const { controller } = montar({ cupom });
    const handler = PesquisaAdminController.prototype.detalheCupom;
    expect(Reflect.getMetadata("path", handler)).toBe("cupons/:codigo");
    expect(Reflect.getMetadata("method", handler)).toBe(RequestMethod.GET);

    await expect(controller.detalheCupom("BC-NAOEXISTE")).rejects.toBeInstanceOf(NotFoundException);
    expect(await controller.detalheCupom("BC-ABC234")).toEqual(DETALHE);
  });

  it("K4. resgate repassa valorCompra e devolve cupom, desconto e valor final", async () => {
    const { controller, cupom } = montar();
    cupom.resgatar.mockResolvedValue(RESGATE);

    const resposta = await controller.resgatarCupom("BC-ABC234", { valorCompra: 50 });

    expect(resposta).toEqual(RESGATE);
    expect(cupom.resgatar).toHaveBeenCalledWith("BC-ABC234", 50);
  });

  it("K5. o DTO do resgate rejeita 0, negativo, string e mais de 2 casas", async () => {
    const invalidos = [{ valorCompra: 0 }, { valorCompra: -1 }, { valorCompra: "10" }, { valorCompra: 10.001 }];
    for (const corpo of invalidos) {
      const dto = plainToInstance(ResgatarCupomDto, corpo);
      expect(await validate(dto as object)).not.toHaveLength(0);
    }
    const valido = plainToInstance(ResgatarCupomDto, { valorCompra: 10.5 });
    expect(await validate(valido as object)).toHaveLength(0);
  });

  it("K6. resgate e revogar sao POST com HttpCode 200", () => {
    for (const nome of ["resgatarCupom", "revogarPesquisa"] as const) {
      const handler = PesquisaAdminController.prototype[nome];
      expect(Reflect.getMetadata("method", handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata("__httpCode__", handler)).toBe(200);
    }
    expect(Reflect.getMetadata("path", PesquisaAdminController.prototype.resgatarCupom)).toBe(
      "cupons/:codigo/resgate",
    );
  });

  it("E1. nao existe rota de etiquetas e o construtor recebe so os quatro servicos", () => {
    expect(PesquisaAdminController.length).toBe(4);
    const nomes = Object.getOwnPropertyNames(PesquisaAdminController.prototype);
    expect(nomes.some((nome) => /etiqueta/i.test(nome))).toBe(false);
  });

  it("E2. nenhuma resposta do controller expoe a chave telefone", async () => {
    const { controller } = montar();
    const respostas = [
      await controller.obterConfig(),
      await controller.resultados(undefined),
      await controller.listarCupons({}),
      await controller.detalheCupom("BC-ABC234"),
      await controller.resgatarCupom("BC-ABC234", { valorCompra: 50 }),
      await controller.revogarPesquisa(PESQUISA_ID),
    ];
    for (const resposta of respostas) {
      expect(temChave(resposta, "telefone")).toBe(false);
    }
    expect(temChave(await controller.listarCupons({}), "telefoneMascarado")).toBe(true);
  });
});
