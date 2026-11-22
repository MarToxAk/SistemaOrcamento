/**
 * Fase 52 (quick 261122-rlb): testes unitarios da variacao por IA (helpers puros, servico com
 * axios mockado e DI opcional). Sem rede e sem banco.
 */
import { Logger, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import axios from "axios";

import { PrismaService } from "../database/prisma.service";
import { ChatwootAutomationService } from "../integrations/chatwoot/chatwoot-automation.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { PesquisaConfigService } from "./pesquisa-config.service";
import { TEXTOS_PADRAO } from "./pesquisa-regras";
import { PesquisaService } from "./pesquisa.service";
import {
  DIRETRIZES_VARIACAO,
  ENV_VARIACAO_IA,
  TIMEOUT_VARIACAO_MS,
  montarPromptVariacao,
  sortearDiretriz,
  validarVariacao,
  variacaoAtiva,
  type TipoVariacao,
} from "./pesquisa-variacao";
import { PesquisaVariacaoService } from "./pesquisa-variacao.service";

jest.mock("axios", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

function aprova(tipo: TipoVariacao, modelo: string, variante: string): void {
  expect(validarVariacao(modelo, variante, tipo)).toEqual({ valido: true, texto: variante });
}

function reprova(tipo: TipoVariacao, modelo: string, variante: string, motivo: string): void {
  expect(validarVariacao(modelo, variante, tipo)).toEqual({ valido: false, motivo });
}

describe("pesquisa-variacao: helpers puros", () => {
  it("variacaoAtiva: ausente, vazio e valores desconhecidos ligam; false/0/off desligam", () => {
    expect(variacaoAtiva(undefined)).toBe(true);
    expect(variacaoAtiva(null)).toBe(true);
    expect(variacaoAtiva("")).toBe(true);
    expect(variacaoAtiva("true")).toBe(true);
    expect(variacaoAtiva("1")).toBe(true);
    expect(variacaoAtiva("lixo")).toBe(true);

    expect(variacaoAtiva("false")).toBe(false);
    expect(variacaoAtiva("FALSE")).toBe(false);
    expect(variacaoAtiva(" 0 ")).toBe(false);
    expect(variacaoAtiva("off")).toBe(false);
    expect(variacaoAtiva("Off")).toBe(false);
  });

  it("sortearDiretriz e deterministica com o sorteio injetado", () => {
    expect(sortearDiretriz(() => 0)).toBe(DIRETRIZES_VARIACAO[0]);
    expect(sortearDiretriz(() => 0.4)).toBe(DIRETRIZES_VARIACAO[2]);
    expect(sortearDiretriz(() => 0.9999)).toBe(DIRETRIZES_VARIACAO[DIRETRIZES_VARIACAO.length - 1]);
  });

  it("montarPromptVariacao contem o modelo cru, a diretriz e as instrucoes de reescrita leve", () => {
    const prompt = montarPromptVariacao(TEXTOS_PADRAO.textoFechamento, "fechamento", "troque alguns sinônimos");
    expect(prompt).toContain(TEXTOS_PADRAO.textoFechamento);
    expect(prompt).toContain("troque alguns sinônimos");
    expect(prompt).toContain("Reescreva de forma LEVE");
    expect(prompt).toContain("placeholders");
    expect(prompt).toContain("SAIR");
    expect(prompt).toContain("sem aspas, sem markdown");
    expect(prompt).toContain("{link}");
  });

  it("validarVariacao aprova a variante legitima de cada tipo", () => {
    aprova("fechamento", TEXTOS_PADRAO.textoFechamento, TEXTOS_PADRAO.textoFechamento.replace("Responda nossa pesquisa", "Responda a pesquisa"));
    aprova("semRecompensa", TEXTOS_PADRAO.textoSemRecompensa, TEXTOS_PADRAO.textoSemRecompensa.replace("o nosso atendimento", "o atendimento"));
    aprova("posResposta", TEXTOS_PADRAO.textoPosResposta, TEXTOS_PADRAO.textoPosResposta.replace("Use o código", "Utilize o código"));
    aprova("convite", TEXTOS_PADRAO.textoConviteGoogle, TEXTOS_PADRAO.textoConviteGoogle.replace("Quer compartilhar", "Gostaria de compartilhar"));
  });

  it("validarVariacao aprova variado identico ao modelo em todos os tipos", () => {
    aprova("fechamento", TEXTOS_PADRAO.textoFechamento, TEXTOS_PADRAO.textoFechamento);
    aprova("semRecompensa", TEXTOS_PADRAO.textoSemRecompensa, TEXTOS_PADRAO.textoSemRecompensa);
    aprova("posResposta", TEXTOS_PADRAO.textoPosResposta, TEXTOS_PADRAO.textoPosResposta);
    aprova("convite", TEXTOS_PADRAO.textoConviteGoogle, TEXTOS_PADRAO.textoConviteGoogle);
  });

  it("validarVariacao aceita {LINK} em caixa alta no lugar de {link}", () => {
    aprova("fechamento", "Responda: {link}", "Responda: {LINK}");
  });

  it("validarVariacao reprova vazio", () => {
    reprova("fechamento", TEXTOS_PADRAO.textoFechamento, "   ", "vazio");
  });

  it("validarVariacao reprova texto envolvido em aspas (duplas, tipograficas) e crase", () => {
    const modelo = TEXTOS_PADRAO.textoFechamento;
    reprova("fechamento", modelo, `"${modelo}"`, "envolvido_em_aspas");
    reprova("fechamento", modelo, `“${modelo}”`, "envolvido_em_aspas");
    reprova("fechamento", modelo, `\`${modelo}\``, "envolvido_em_aspas");
  });

  it("validarVariacao reprova markdown (negrito, tres crases e linha com #)", () => {
    const modelo = TEXTOS_PADRAO.textoFechamento;
    reprova("fechamento", modelo, `**${modelo}**`, "markdown");
    reprova("fechamento", modelo, `\`\`\`${modelo}\`\`\``, "markdown");
    reprova("fechamento", modelo, `# ${modelo}`, "markdown");
  });

  it("validarVariacao reprova tamanho fora da faixa 0,5x..1,8x", () => {
    const modelo = TEXTOS_PADRAO.textoFechamento;
    reprova("fechamento", modelo, "Oi {link} SAIR", "tamanho");
    reprova("fechamento", modelo, `${modelo}\n${modelo}`, "tamanho");
  });

  it("validarVariacao reprova placeholder faltando, a mais, duplicado ou inexistente", () => {
    const modelo = TEXTOS_PADRAO.textoPosResposta;
    reprova("posResposta", modelo, modelo.replace("{validade}", "validade"), "placeholders");
    reprova("posResposta", modelo, `${modelo} {link}`, "placeholders");
    reprova("posResposta", modelo, modelo.replace("{validade}", "{validade} {validade}"), "placeholders");
    reprova("posResposta", modelo, modelo.replace("{validade}", "{nao_existe}"), "placeholders");
  });

  it("validarVariacao reprova chave solta (quantidade de chaves diferente do modelo)", () => {
    reprova("fechamento", "Responda: {link}", "Responda: {link} }", "chaves_soltas");
  });

  it("validarVariacao reprova URL nova (https://, www. e dominio nu)", () => {
    const modelo = TEXTOS_PADRAO.textoFechamento;
    reprova("fechamento", modelo, `${modelo} veja https://exemplo.com`, "url_nova");
    reprova("fechamento", modelo, `${modelo} veja www.exemplo.com`, "url_nova");
    reprova("fechamento", modelo, `${modelo} veja exemplo.com`, "url_nova");
  });

  it("validarVariacao reprova numero novo e mantem numero proprio do modelo", () => {
    reprova("fechamento", "Responda: {link}", "Responda: {link} ligue 1234", "numero_novo");
    aprova("fechamento", "Responda: {link} em 2 dias", "Responda: {link} dentro de 2 dias");
  });

  it("validarVariacao reprova a perda da palavra SAIR (trocada ou em minuscula)", () => {
    const modelo = TEXTOS_PADRAO.textoFechamento;
    reprova("fechamento", modelo, modelo.replace("SAIR", "PARAR"), "palavra_obrigatoria_ausente");
    reprova("fechamento", modelo, modelo.replace("SAIR", "sair"), "palavra_obrigatoria_ausente");
  });

  it("validarVariacao reprova as regras da mensagem (emoji, cupom no convite e http no cupom)", () => {
    reprova("fechamento", TEXTOS_PADRAO.textoFechamento, `${TEXTOS_PADRAO.textoFechamento} 😀`, "regras_da_mensagem");
    reprova("convite", TEXTOS_PADRAO.textoConviteGoogle, TEXTOS_PADRAO.textoConviteGoogle.replace("{nome_empresa}", "{nome_empresa} cupom"), "regras_da_mensagem");
    reprova("posResposta", TEXTOS_PADRAO.textoPosResposta, `${TEXTOS_PADRAO.textoPosResposta} http`, "regras_da_mensagem");
  });
});

describe("PesquisaVariacaoService.variar", () => {
  const MODELO = TEXTOS_PADRAO.textoPosResposta;
  const VARIANTE_VALIDA = TEXTOS_PADRAO.textoPosResposta.replace("Use o código", "Utilize o código");
  const ENV_COMPLETO: Record<string, string> = {
    CHATWOOT_AI_URL: "https://ia.exemplo.test",
    CHATWOOT_AI_TOKEN: "tok-secreto-ia",
    CHATWOOT_AI_MODEL: "openclaw/main",
  };

  let logs: string[] = [];

  function configFalso(env: Record<string, string>): ConfigService {
    return { get: (chave: string) => env[chave] } as unknown as ConfigService;
  }

  function respostaIA(texto: string): unknown {
    return { data: { output: [{ content: [{ text: texto }] }] } };
  }

  function espiarLogs(): void {
    logs = [];
    for (const nivel of ["log", "warn", "error", "debug", "verbose"] as const) {
      jest.spyOn(Logger.prototype, nivel).mockImplementation((...args: unknown[]) => {
        logs.push(`${nivel}: ${args.map((a) => String(a)).join(" ")}`);
      });
    }
  }

  function semSegredos(): void {
    for (const linha of logs) {
      expect(linha).not.toContain("tok-secreto-ia");
      expect(linha).not.toContain("https://ia.exemplo.test");
      expect(linha).not.toContain("Authorization");
      expect(linha).not.toContain(MODELO);
      expect(linha).not.toContain(VARIANTE_VALIDA);
    }
  }

  beforeEach(() => {
    (axios.post as jest.Mock).mockReset();
    espiarLogs();
  });

  afterEach(() => jest.restoreAllMocks());

  it("aprovado devolve o texto variado e chama a IA uma vez com o modelo cru", async () => {
    (axios.post as jest.Mock).mockResolvedValue(respostaIA(VARIANTE_VALIDA));
    const service = new PesquisaVariacaoService(configFalso(ENV_COMPLETO));

    await expect(service.variar(MODELO, "posResposta")).resolves.toBe(VARIANTE_VALIDA);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, corpo, configAxios] = (axios.post as jest.Mock).mock.calls[0] as [
      string,
      { model: string; input: string },
      { headers?: Record<string, string>; timeout?: number },
    ];
    expect(url).toBe("https://ia.exemplo.test");
    expect(corpo.model).toBe("openclaw/main");
    expect(corpo.input).toContain(MODELO);
    expect(configAxios.headers?.Authorization).toBe("Bearer tok-secreto-ia");
    expect(configAxios.timeout).toBe(TIMEOUT_VARIACAO_MS);
  });

  it("flag desligada (false/0/off) devolve o modelo sem chamar a IA", async () => {
    for (const valor of ["false", "0", "off"]) {
      const service = new PesquisaVariacaoService(configFalso({ ...ENV_COMPLETO, [ENV_VARIACAO_IA]: valor }));
      await expect(service.variar(MODELO, "posResposta")).resolves.toBe(MODELO);
    }
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("sem CHATWOOT_AI_URL ou CHATWOOT_AI_TOKEN devolve o modelo sem chamar a IA", async () => {
    const semUrl = new PesquisaVariacaoService(configFalso({ CHATWOOT_AI_TOKEN: "tok-secreto-ia" }));
    await expect(semUrl.variar(MODELO, "posResposta")).resolves.toBe(MODELO);

    const semToken = new PesquisaVariacaoService(configFalso({ CHATWOOT_AI_URL: "https://ia.exemplo.test" }));
    await expect(semToken.variar(MODELO, "posResposta")).resolves.toBe(MODELO);

    expect(axios.post).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes("motivo=ia_nao_configurada"))).toBe(true);
    semSegredos();
  });

  it("sem CHATWOOT_AI_MODEL usa o modelo padrao openclaw/main", async () => {
    (axios.post as jest.Mock).mockResolvedValue(respostaIA(VARIANTE_VALIDA));
    const service = new PesquisaVariacaoService(configFalso({ CHATWOOT_AI_URL: "https://ia.exemplo.test", CHATWOOT_AI_TOKEN: "tok-secreto-ia" }));

    await expect(service.variar(MODELO, "posResposta")).resolves.toBe(VARIANTE_VALIDA);

    const corpo = (axios.post as jest.Mock).mock.calls[0][1] as { model: string };
    expect(corpo.model).toBe("openclaw/main");
  });

  it("axios rejeitando devolve o modelo, loga motivo e nao vaza o token do erro", async () => {
    const erro = new Error("falhou com tok-secreto-ia");
    (erro as { config?: unknown }).config = { headers: { Authorization: "Bearer tok-secreto-ia" } };
    (axios.post as jest.Mock).mockRejectedValue(erro);
    const service = new PesquisaVariacaoService(configFalso(ENV_COMPLETO));

    await expect(service.variar(MODELO, "posResposta")).resolves.toBe(MODELO);
    expect(logs.some((l) => l.includes("motivo=falha_chamada"))).toBe(true);
    semSegredos();
  });

  it("resposta vazia ou formato inesperado devolve o modelo com motivo=resposta_vazia", async () => {
    for (const resposta of [respostaIA("   "), { data: { output: [] } }, {}]) {
      (axios.post as jest.Mock).mockResolvedValue(resposta);
      const service = new PesquisaVariacaoService(configFalso(ENV_COMPLETO));
      await expect(service.variar(MODELO, "posResposta")).resolves.toBe(MODELO);
    }
    expect(logs.some((l) => l.includes("motivo=resposta_vazia"))).toBe(true);
    semSegredos();
  });

  it("validacao reprovada devolve o modelo com motivo=validacao_reprovada", async () => {
    (axios.post as jest.Mock).mockResolvedValue(respostaIA("Texto sem placeholder"));
    const service = new PesquisaVariacaoService(configFalso(ENV_COMPLETO));

    await expect(service.variar(MODELO, "posResposta")).resolves.toBe(MODELO);
    expect(logs.some((l) => l.includes("motivo=validacao_reprovada") && l.includes("razao="))).toBe(true);
    semSegredos();
  });

  it("timeout devolve o modelo com motivo=timeout e nunca rejeita", async () => {
    jest.useFakeTimers();
    (axios.post as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const service = new PesquisaVariacaoService(configFalso(ENV_COMPLETO));

    const promessa = service.variar(MODELO, "posResposta");
    await jest.advanceTimersByTimeAsync(TIMEOUT_VARIACAO_MS);
    await expect(promessa).resolves.toBe(MODELO);

    expect(logs.some((l) => l.includes("motivo=timeout"))).toBe(true);
    semSegredos();
    jest.useRealTimers();
  });
});

describe("PesquisaService: DI opcional do PesquisaVariacaoService", () => {
  async function montarModulo(comVariacao: boolean) {
    const providers: Provider[] = [
      PesquisaService,
      { provide: PrismaService, useValue: {} },
      { provide: ChatwootService, useValue: {} },
      { provide: ConfigService, useValue: { get: () => undefined } },
      { provide: ChatwootAutomationService, useValue: { registrarGanchoPesquisa: jest.fn() } },
      { provide: PesquisaConfigService, useValue: {} },
    ];
    if (comVariacao) providers.push(PesquisaVariacaoService);
    return Test.createTestingModule({ providers }).compile();
  }

  it("com o provider, o PesquisaService recebe o PesquisaVariacaoService", async () => {
    const modulo = await montarModulo(true);
    const service = modulo.get(PesquisaService);
    expect((service as unknown as { variacao?: unknown }).variacao).toBeInstanceOf(PesquisaVariacaoService);
    await modulo.close();
  });

  it("sem o provider, o modulo compila e o PesquisaService fica sem variacao", async () => {
    const modulo = await montarModulo(false);
    const service = modulo.get(PesquisaService);
    expect((service as unknown as { variacao?: unknown }).variacao).toBeUndefined();
    await modulo.close();
  });
});
