/**
 * Fase 52 (plano 52-03): regras puras da pesquisa de satisfacao.
 * Dinheiro em centavos, mes de America/Sao_Paulo, situacao derivada, opt-out, mascara de telefone,
 * contraste, link do Google, validacao de mensagens e de config e padroes por empresa.
 */
import {
  ALFABETO_CODIGO,
  HOSTS_GOOGLE,
  PLACEHOLDERS_VALIDOS,
  REGEX_CODIGO,
  REGEX_TOKEN,
  TEXTOS_PADRAO,
  calcularDescontoCentavos,
  corPrimariaAcessivel,
  deCentavos,
  ehOptOut,
  formatarPercentual,
  formatarReais,
  gerarCodigoCupom,
  gerarToken,
  janelaMesSaoPaulo,
  mascararTelefone,
  montarConfigPadrao,
  normalizarCodigo,
  normalizarTelefone,
  notaValida,
  paraCentavos,
  razaoContraste,
  renderizarTexto,
  situacaoCupom,
  sortearVariante,
  validarConfig,
  validarLinkGoogle,
  validarTextoMensagem,
  type ConfigEntrada,
} from "./pesquisa-regras";

const CONFIG_BASE = (): ConfigEntrada => montarConfigPadrao(() => undefined);

const MENSAGEM_PLACEHOLDER_INVALIDO =
  "Campo {xyz} não existe. Use: link, percentual, teto, compra_minima, validade, codigo, link_google, nome_empresa.";

describe("pesquisa-regras", () => {
  describe("token", () => {
    it("token: gerarToken devolve 48 caracteres hexadecimais minusculos", () => {
      const token = gerarToken();
      expect(token).toHaveLength(48);
      expect(token).toMatch(REGEX_TOKEN);
    });

    it("token: 1000 tokens gerados sem repeticao", () => {
      const vistos = new Set<string>();
      for (let i = 0; i < 1000; i += 1) vistos.add(gerarToken());
      expect(vistos.size).toBe(1000);
    });

    it("token: REGEX_TOKEN recusa 47 caracteres, maiusculas e nao hexadecimais", () => {
      expect(REGEX_TOKEN.test("a".repeat(47))).toBe(false);
      expect(REGEX_TOKEN.test("A".repeat(48))).toBe(false);
      expect(REGEX_TOKEN.test("g".repeat(48))).toBe(false);
      expect(REGEX_TOKEN.test("a".repeat(48))).toBe(true);
    });
  });

  describe("nota", () => {
    it("nota: aceita apenas inteiros de 1 a 5", () => {
      for (const nota of [1, 2, 3, 4, 5]) expect(notaValida(nota)).toBe(true);
      for (const nota of [0, 6, 3.5, "4", Number.NaN, null, undefined]) expect(notaValida(nota)).toBe(false);
    });
  });

  describe("variante", () => {
    it("variante: AB sorteia 50/50 com rnd injetado", () => {
      expect(sortearVariante("AB", () => 0.2)).toBe("ESTRELAS");
      expect(sortearVariante("AB", () => 0.8)).toBe("CARINHAS");
    });

    it("variante: ESTRELAS e CARINHAS fixos e modo desconhecido cai em ESTRELAS", () => {
      expect(sortearVariante("ESTRELAS")).toBe("ESTRELAS");
      expect(sortearVariante("CARINHAS")).toBe("CARINHAS");
      expect(sortearVariante("qualquer")).toBe("ESTRELAS");
    });
  });

  describe("telefone", () => {
    it("telefone: normaliza os tres formatos brasileiros para a mesma chave", () => {
      expect(normalizarTelefone("+5512996484918")).toBe("5512996484918");
      expect(normalizarTelefone("(12) 99648-4918")).toBe("5512996484918");
      expect(normalizarTelefone("12996484918")).toBe("5512996484918");
      expect(normalizarTelefone("12 3456-7890")).toBe("551234567890");
    });

    it("telefone: invalido vira nulo", () => {
      for (const bruto of ["123", "", null, undefined, "abc"]) expect(normalizarTelefone(bruto)).toBeNull();
    });

    it("telefone: mascara mostra DDD e os quatro ultimos digitos", () => {
      expect(mascararTelefone("5512996484918")).toBe("(12) *****-4918");
      expect(mascararTelefone("551234567890")).toBe("(12) *****-7890");
    });

    it("telefone: mascara de valor invalido nao expoe numero", () => {
      for (const bruto of ["abc", "", null, undefined]) expect(mascararTelefone(bruto)).toBe("*****");
    });
  });

  describe("codigo", () => {
    it("codigo: gerarCodigoCupom casa o formato PREFIXO-XXXXXX e o REGEX_CODIGO", () => {
      const codigo = gerarCodigoCupom("BOX");
      expect(codigo).toMatch(/^BOX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      expect(REGEX_CODIGO.test(codigo)).toBe(true);
      expect(ALFABETO_CODIGO).toHaveLength(31);
    });

    it("codigo: 2000 chamadas nunca usam 0, 1, I, L ou O", () => {
      for (let i = 0; i < 2000; i += 1) {
        const sufixo = gerarCodigoCupom("BC").split("-")[1];
        expect(sufixo).not.toMatch(/[01ILO]/);
      }
    });

    it("codigo: sorteio injetado em zero gera sufixo 222222", () => {
      expect(gerarCodigoCupom("BOX", () => 0)).toBe("BOX-222222");
    });

    it("codigo: normalizarCodigo tira espacos e sobe a caixa", () => {
      expect(normalizarCodigo("  box-7k3q9m ")).toBe("BOX-7K3Q9M");
    });
  });

  describe("desconto", () => {
    it("desconto: 10% de R$ 6,00 com teto de R$ 2,00 da 60 centavos", () => {
      expect(calcularDescontoCentavos(600, 1000, 200)).toBe(60);
    });

    it("desconto: 10% de R$ 30,00 com teto de R$ 5,00 da 300 centavos", () => {
      expect(calcularDescontoCentavos(3000, 1000, 500)).toBe(300);
    });

    it("desconto: nunca passa do teto", () => {
      expect(calcularDescontoCentavos(30000, 1000, 500)).toBe(500);
    });

    it("desconto: arredonda sempre para baixo no centavo", () => {
      expect(calcularDescontoCentavos(1, 1000, 500)).toBe(0);
      expect(calcularDescontoCentavos(999, 1000, 500)).toBe(99);
    });

    it("desconto: nunca passa do valor da compra", () => {
      expect(calcularDescontoCentavos(100, 5000, 9999)).toBe(50);
    });

    it("desconto: paraCentavos e deCentavos tratam centavos inteiros", () => {
      expect(paraCentavos("12.34")).toBe(1234);
      expect(paraCentavos(0.1 + 0.2)).toBe(30);
      expect(Number.isNaN(paraCentavos("abc"))).toBe(true);
      expect(deCentavos(5)).toBe("0.05");
      expect(deCentavos(1234)).toBe("12.34");
    });
  });

  describe("mes", () => {
    it("mes: 2026-12-01T01:00Z ainda e novembro em Sao Paulo", () => {
      const janela = janelaMesSaoPaulo(new Date("2026-12-01T01:00:00Z"));
      expect(janela.rotulo).toBe("2026-11");
      expect(janela.inicio.toISOString()).toBe("2026-11-01T03:00:00.000Z");
      expect(janela.fim.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    });

    it("mes: 2026-12-01T03:00Z ja e dezembro", () => {
      const janela = janelaMesSaoPaulo(new Date("2026-12-01T03:00:00Z"));
      expect(janela.rotulo).toBe("2026-12");
      expect(janela.inicio.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    });

    it("mes: 2026-11-30T23:59:59Z ainda e novembro", () => {
      expect(janelaMesSaoPaulo(new Date("2026-11-30T23:59:59Z")).rotulo).toBe("2026-11");
    });

    it("mes: dezembro para janeiro vira o ano", () => {
      const janela = janelaMesSaoPaulo(new Date("2026-12-15T12:00:00Z"));
      expect(janela.fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
    });
  });

  describe("situacao", () => {
    const agora = new Date("2026-11-15T12:00:00Z");
    const futuro = new Date("2026-12-15T12:00:00Z");
    const passado = new Date("2026-11-01T12:00:00Z");

    it("situacao: status persistidos voltam como estao", () => {
      for (const status of ["USADO", "CANCELADO", "EXPIRADO"]) {
        expect(situacaoCupom({ status, validadeAte: futuro }, agora, 0, 30000)).toBe(status);
      }
    });

    it("situacao: EMITIDO vencido e EXPIRADO", () => {
      expect(situacaoCupom({ status: "EMITIDO", validadeAte: passado }, agora, 0, 30000)).toBe("EXPIRADO");
    });

    it("situacao: EMITIDO valido fica SUSPENSO so ao atingir o teto do mes", () => {
      expect(situacaoCupom({ status: "EMITIDO", validadeAte: futuro }, agora, 29999, 30000)).toBe("EMITIDO");
      expect(situacaoCupom({ status: "EMITIDO", validadeAte: futuro }, agora, 30000, 30000)).toBe("SUSPENSO");
      expect(situacaoCupom({ status: "EMITIDO", validadeAte: futuro }, agora, 41200, 30000)).toBe("SUSPENSO");
      expect(situacaoCupom({ status: "EMITIDO", validadeAte: futuro }, agora, 0, 0)).toBe("SUSPENSO");
    });
  });

  describe("optout", () => {
    it("optout: aceita sair em variacoes simples", () => {
      for (const texto of ["sair", "Sair!", " SAIR ", "S.A.I.R", "sáir"]) expect(ehOptOut(texto)).toBe(true);
    });

    it("optout: recusa frases e variacoes com conteudo extra", () => {
      for (const texto of ["sair por favor", "", "nao sair", "SAIR 2"]) expect(ehOptOut(texto)).toBe(false);
    });
  });

  describe("contraste", () => {
    it("contraste: branco da razao 1 e preto da razao 21", () => {
      expect(razaoContraste("#ffffff")).toBeCloseTo(1, 5);
      expect(razaoContraste("#000000")).toBeCloseTo(21, 5);
    });

    it("contraste: o azul padrao #0d6efd fica no limite de 4,5", () => {
      const razao = razaoContraste("#0d6efd");
      expect(razao).toBeGreaterThanOrEqual(4.49);
      expect(razao).toBeLessThanOrEqual(4.51);
    });

    it("contraste: cor primaria acessivel mantem o azul e rejeita amarelo claro", () => {
      expect(corPrimariaAcessivel("#0d6efd")).toEqual({ cor: "#0d6efd", ajustada: false });
      expect(corPrimariaAcessivel("#ffe066")).toEqual({ cor: "#0d6efd", ajustada: true });
      expect(corPrimariaAcessivel("#0a58ca")).toEqual({ cor: "#0a58ca", ajustada: false });
    });

    it("contraste: valor ausente ou invalido volta ao fallback ajustado", () => {
      for (const cor of [undefined, "azul", "#12", ""]) {
        expect(corPrimariaAcessivel(cor)).toEqual({ cor: "#0d6efd", ajustada: true });
      }
      // O formato curto e aceito pelo calculo (nao vira NaN); como este #abc e claro, cai no fallback.
      expect(Number.isFinite(razaoContraste("#abc"))).toBe(true);
      expect(corPrimariaAcessivel("#abc")).toEqual({ cor: "#0d6efd", ajustada: true });
    });
  });

  describe("link", () => {
    it("link: os quatro hosts do Google com https sao aceitos", () => {
      for (const url of [
        "https://g.page/r/abc/review",
        "https://search.google.com/local/writereview?placeid=X",
        "https://maps.google.com/?cid=1",
        "https://business.google.com/x",
      ]) {
        expect(validarLinkGoogle(url)).toBeNull();
      }
      expect(HOSTS_GOOGLE).toHaveLength(4);
    });

    it("link: vazio, nulo ou so espacos desliga o convite sem erro", () => {
      for (const url of ["", null, undefined, "   "]) expect(validarLinkGoogle(url)).toBeNull();
    });

    it("link: http, dominio de terceiro, subdominio e protocolo estranho sao recusados", () => {
      for (const url of [
        "http://g.page/x",
        "https://evil.com/g.page",
        "https://g.page.evil.com/x",
        "https://www.google.com/maps",
        "https://sub.g.page/x",
        "javascript:alert(1)",
        "g.page/x",
      ]) {
        expect(validarLinkGoogle(url)).not.toBeNull();
      }
    });
  });

  describe("mensagem", () => {
    it("mensagem: fechamento e sem recompensa exigem {link}", () => {
      expect(validarTextoMensagem("fechamento", "Responda {link}")).toBeNull();
      expect(validarTextoMensagem("fechamento", "Responda")).toBe(
        "Inclua {link} para o cliente encontrar a pesquisa.",
      );
      expect(validarTextoMensagem("semRecompensa", "Obrigado")).toBe(
        "Inclua {link} para o cliente encontrar a pesquisa.",
      );
    });

    it("mensagem: pos-resposta recusa qualquer link", () => {
      for (const texto of ["Veja {link}", "Veja {link_google}", "Acesse http://x"]) {
        expect(validarTextoMensagem("posResposta", texto)).toBe(
          "Não inclua link aqui. O convite do Google tem mensagem própria.",
        );
      }
    });

    it("mensagem: pos-resposta exige {codigo}", () => {
      expect(validarTextoMensagem("posResposta", "Seu cupom")).toBe(
        "Inclua {codigo} para o cliente ver o cupom.",
      );
      expect(validarTextoMensagem("posResposta", "Seu cupom {codigo}")).toBeNull();
    });

    it("mensagem: convite recusa cupom e {codigo} e exige {link_google}", () => {
      expect(validarTextoMensagem("convite", "Avalie em {link_google}")).toBeNull();
      expect(validarTextoMensagem("convite", "Seu cupom em {link_google}")).not.toBeNull();
      expect(validarTextoMensagem("convite", "{codigo} {link_google}")).not.toBeNull();
      expect(validarTextoMensagem("convite", "Avalie no Google")).not.toBeNull();
    });

    it("mensagem: placeholder fora da lista e recusado com a lista completa", () => {
      expect(validarTextoMensagem("pagina", "Ola {xyz}")).toBe(MENSAGEM_PLACEHOLDER_INVALIDO);
    });

    it("mensagem: emoji e recusado", () => {
      expect(validarTextoMensagem("pagina", "Ola 😊")).toBe("Remova emoji. Mensagens usam só texto.");
    });

    it("mensagem: maximo de 600 caracteres", () => {
      expect(validarTextoMensagem("pagina", "x".repeat(601))).toBe("Máximo de 600 caracteres.");
      expect(validarTextoMensagem("pagina", "x".repeat(600))).toBeNull();
    });

    it("mensagem: os textos padrao passam na propria validacao", () => {
      expect(validarTextoMensagem("fechamento", TEXTOS_PADRAO.textoFechamento)).toBeNull();
      expect(validarTextoMensagem("semRecompensa", TEXTOS_PADRAO.textoSemRecompensa)).toBeNull();
      expect(validarTextoMensagem("posResposta", TEXTOS_PADRAO.textoPosResposta)).toBeNull();
      expect(validarTextoMensagem("convite", TEXTOS_PADRAO.textoConviteGoogle)).toBeNull();
      for (const texto of [
        TEXTOS_PADRAO.paginaTitulo,
        TEXTOS_PADRAO.paginaSubtitulo,
        TEXTOS_PADRAO.paginaObrigadoSemRecompensa,
        TEXTOS_PADRAO.paginaGoogleTitulo,
        TEXTOS_PADRAO.paginaGoogleCorpo,
      ]) {
        expect(validarTextoMensagem("pagina", texto)).toBeNull();
      }
      expect(PLACEHOLDERS_VALIDOS).toHaveLength(8);
    });
  });

  describe("config", () => {
    it("config: os padroes passam sem nenhum erro", () => {
      expect(validarConfig(CONFIG_BASE())).toEqual({});
    });

    it("config: percentual fora de 1 a 50 e recusado com a mensagem do campo", () => {
      expect(validarConfig({ ...CONFIG_BASE(), percentualDesconto: 0 }).percentualDesconto).toBe("Mínimo de 1%.");
      expect(validarConfig({ ...CONFIG_BASE(), percentualDesconto: 51 }).percentualDesconto).toBe("Máximo de 50%.");
    });

    it("config: validade do cupom vai de 1 a 180 dias", () => {
      expect(validarConfig({ ...CONFIG_BASE(), validadeCupomDias: 0 }).validadeCupomDias).toBe("Mínimo de 1 dia.");
      expect(validarConfig({ ...CONFIG_BASE(), validadeCupomDias: 181 }).validadeCupomDias).toBe(
        "Máximo de 180 dias.",
      );
    });

    it("config: validade do link vai de 1 a 14 dias", () => {
      expect(validarConfig({ ...CONFIG_BASE(), validadeLinkDias: 15 }).validadeLinkDias).toBe("Máximo de 14 dias.");
      expect(validarConfig({ ...CONFIG_BASE(), validadeLinkDias: 0 }).validadeLinkDias).toBe("Mínimo de 1 dia.");
    });

    it("config: intervalo vai de 0 a 365 dias", () => {
      expect(validarConfig({ ...CONFIG_BASE(), intervaloDias: -1 }).intervaloDias).toBe("Não pode ser negativo.");
      expect(validarConfig({ ...CONFIG_BASE(), intervaloDias: 366 }).intervaloDias).toBe("Máximo de 365 dias.");
      expect(validarConfig({ ...CONFIG_BASE(), intervaloDias: 0 }).intervaloDias).toBeUndefined();
    });

    it("config: valores de dinheiro nao podem ser negativos", () => {
      expect(validarConfig({ ...CONFIG_BASE(), tetoDesconto: -1 }).tetoDesconto).toBe("Não pode ser negativo.");
      expect(validarConfig({ ...CONFIG_BASE(), compraMinima: -1 }).compraMinima).toBe("Não pode ser negativo.");
      expect(validarConfig({ ...CONFIG_BASE(), tetoMensal: -1 }).tetoMensal).toBe("Não pode ser negativo.");
    });

    it("config: prefixo recusa espacos e mais de 6 caracteres e aceita BOX", () => {
      expect(validarConfig({ ...CONFIG_BASE(), prefixoCupom: "bom custo" }).prefixoCupom).toBeDefined();
      expect(validarConfig({ ...CONFIG_BASE(), prefixoCupom: "TOOLONGX" }).prefixoCupom).toBeDefined();
      expect(validarConfig({ ...CONFIG_BASE(), prefixoCupom: "BOX" }).prefixoCupom).toBeUndefined();
    });

    it("config: variante e link do Google sao validados", () => {
      expect(validarConfig({ ...CONFIG_BASE(), varianteVisual: "OUTRA" }).varianteVisual).toBeDefined();
      expect(validarConfig({ ...CONFIG_BASE(), linkGoogle: "https://evil.com" }).linkGoogle).toBeDefined();
      expect(validarConfig({ ...CONFIG_BASE(), linkGoogle: "https://g.page/x" }).linkGoogle).toBeUndefined();
    });

    it("config: erro de texto usa o nome do campo como chave", () => {
      const erros = validarConfig({ ...CONFIG_BASE(), textoFechamento: "Responda" });
      expect(Object.keys(erros)).toEqual(["textoFechamento"]);
      expect(erros.textoFechamento).toBe("Inclua {link} para o cliente encontrar a pesquisa.");
    });
  });

  describe("config padrão", () => {
    const env = (valores: Record<string, string>) => (chave: string) => valores[chave];

    it("config padrão: envs da empresa definem os numeros e o prefixo", () => {
      const cfg = montarConfigPadrao(
        env({
          PESQUISA_PERCENTUAL_PADRAO: "10",
          PESQUISA_TETO_PADRAO: "2",
          PESQUISA_COMPRA_MINIMA_PADRAO: "6",
          PESQUISA_TETO_MENSAL_PADRAO: "300",
          PESQUISA_PREFIXO_PADRAO: "box",
        }),
      );
      expect(cfg).toMatchObject({
        percentualDesconto: 10,
        tetoDesconto: 2,
        compraMinima: 6,
        tetoMensal: 300,
        prefixoCupom: "BOX",
        ativo: false,
      });
    });

    it("config padrão: sem envs usa 10, 5, 30, 300 e BC", () => {
      expect(CONFIG_BASE()).toMatchObject({
        percentualDesconto: 10,
        tetoDesconto: 5,
        compraMinima: 30,
        tetoMensal: 300,
        prefixoCupom: "BC",
        validadeCupomDias: 30,
        validadeLinkDias: 7,
        intervaloDias: 90,
        ativo: false,
        varianteVisual: "AB",
        linkGoogle: null,
      });
    });

    it("config padrão: env invalida volta ao padrao do codigo", () => {
      const cfg = montarConfigPadrao(
        env({
          PESQUISA_PERCENTUAL_PADRAO: "abc",
          PESQUISA_TETO_PADRAO: "-1",
          PESQUISA_COMPRA_MINIMA_PADRAO: "",
          PESQUISA_PREFIXO_PADRAO: "bom custo",
        }),
      );
      expect(cfg).toMatchObject({
        percentualDesconto: 10,
        tetoDesconto: 5,
        compraMinima: 30,
        prefixoCupom: "BC",
      });
    });

    it("config padrão: todos os textos nascem preenchidos e ativo e false", () => {
      const cfg = CONFIG_BASE();
      for (const texto of [
        cfg.textoFechamento,
        cfg.textoSemRecompensa,
        cfg.textoPosResposta,
        cfg.textoConviteGoogle,
        cfg.paginaTitulo,
        cfg.paginaSubtitulo,
        cfg.paginaObrigadoSemRecompensa,
        cfg.paginaGoogleTitulo,
        cfg.paginaGoogleCorpo,
      ]) {
        expect(texto.trim().length).toBeGreaterThan(0);
      }
      expect(cfg.ativo).toBe(false);
      expect(renderizarTexto("a {x}", { x: "b" })).toBe("a b");
      expect(formatarReais(2)).toBe("R$ 2,00");
      expect(formatarPercentual("10")).toBe("10%");
    });
  });

  describe("render (plano 52-13)", () => {
    it("T52-13b: renderizarTexto resolve {LINK}, {Link} e {link} para o mesmo valor", () => {
      expect(renderizarTexto("Responda: {LINK}", { link: "https://app.test/pesquisa/abc" })).toBe(
        "Responda: https://app.test/pesquisa/abc",
      );
      expect(renderizarTexto("{LINK} {Link} {link}", { link: "x" })).toBe("x x x");
      expect(renderizarTexto("a {xyz} b", { link: "x" })).toBe("a  b");
      expect(validarTextoMensagem("fechamento", "Responda: {LINK}")).toBeNull();
    });
  });
});
