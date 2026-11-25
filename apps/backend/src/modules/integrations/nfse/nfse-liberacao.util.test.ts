import {
  LIMITE_FALHAS_GLOBAL,
  LIMITE_FALHAS_POR_IP,
  LimitadorFalhas,
  NFSE_OVERRIDE_ENV,
  resolverIpOperador,
  sanitizarLiberadoPor,
  senhaConfere,
} from "./nfse-liberacao.util";

// Literais obviamente falsos: o valor real da senha e definido pelo usuario fora do repositorio.
const FALSA = "senha-falsa-de-teste";

describe("NFSE_OVERRIDE_ENV", () => {
  it("vale exatamente NFSE_OVERRIDE_PASSWORD", () => {
    expect(NFSE_OVERRIDE_ENV).toBe("NFSE_OVERRIDE_PASSWORD");
  });
});

describe("senhaConfere", () => {
  it("true quando iguais", () => {
    expect(senhaConfere("abc", "abc")).toBe(true);
  });

  it("false quando diferentes com mesmo tamanho", () => {
    expect(senhaConfere("abc", "abd")).toBe(false);
  });

  it("false sem lancar quando os tamanhos diferem", () => {
    expect(() => senhaConfere("abc", "abcd")).not.toThrow();
    expect(senhaConfere("abc", "abcd")).toBe(false);
    expect(senhaConfere("abcd", "abc")).toBe(false);
  });

  it("nunca libera por omissao: vazio ou ausente de qualquer lado", () => {
    expect(senhaConfere("", "abc")).toBe(false);
    expect(senhaConfere(undefined, "abc")).toBe(false);
    expect(senhaConfere("abc", "")).toBe(false);
    expect(senhaConfere("abc", undefined)).toBe(false);
    expect(senhaConfere("", "")).toBe(false);
    expect(senhaConfere(undefined, undefined)).toBe(false);
  });

  it("respeita unicode exatamente", () => {
    expect(senhaConfere("sença-ão", "sença-ão")).toBe(true);
    expect(senhaConfere("senca-ao", "sença-ão")).toBe(false);
  });

  it("respeita espacos nas bordas (sem trim silencioso)", () => {
    expect(senhaConfere(` ${FALSA} `, FALSA)).toBe(false);
    expect(senhaConfere(FALSA, ` ${FALSA}`)).toBe(false);
    expect(senhaConfere(` ${FALSA} `, ` ${FALSA} `)).toBe(true);
  });
});

describe("LimitadorFalhas", () => {
  const MIN = 60_000;

  function criar(max = 5, janelaMs = 15 * MIN) {
    let agora = 1_000_000;
    const lim = new LimitadorFalhas(max, janelaMs, () => agora);
    return {
      lim,
      avancar: (ms: number) => {
        agora += ms;
      },
    };
  }

  it("bloqueia somente apos atingir o maximo de falhas", () => {
    const { lim } = criar();
    for (let i = 0; i < 4; i++) {
      lim.registrarFalha("ip-a");
      expect(lim.bloqueado("ip-a")).toBe(false);
    }
    lim.registrarFalha("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(true);
  });

  it("chaves diferentes sao independentes", () => {
    const { lim } = criar();
    for (let i = 0; i < 5; i++) lim.registrarFalha("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(true);
    expect(lim.bloqueado("ip-b")).toBe(false);
  });

  it("desbloqueia depois que a janela expira", () => {
    const { lim, avancar } = criar();
    for (let i = 0; i < 5; i++) lim.registrarFalha("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(true);
    avancar(15 * MIN - 1);
    expect(lim.bloqueado("ip-a")).toBe(true);
    avancar(2);
    expect(lim.bloqueado("ip-a")).toBe(false);
  });

  it("falha apos a janela vencida abre uma janela nova", () => {
    const { lim, avancar } = criar();
    for (let i = 0; i < 4; i++) lim.registrarFalha("ip-a");
    avancar(15 * MIN + 1);
    lim.registrarFalha("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(false);
  });

  it("limpar zera a contagem", () => {
    const { lim } = criar();
    for (let i = 0; i < 5; i++) lim.registrarFalha("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(true);
    lim.limpar("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(false);
  });

  it("consultar bloqueado nao conta como falha", () => {
    const { lim } = criar();
    for (let i = 0; i < 50; i++) lim.bloqueado("ip-a");
    expect(lim.bloqueado("ip-a")).toBe(false);
  });

  it("mantem no maximo 10000 chaves descartando as mais antigas", () => {
    const { lim } = criar(1, 15 * MIN);
    for (let i = 0; i < 10_050; i++) lim.registrarFalha(`ip-${i}`);
    expect(lim.tamanho()).toBeLessThanOrEqual(10_000);
    // as mais antigas foram descartadas; as mais recentes continuam bloqueadas
    expect(lim.bloqueado("ip-0")).toBe(false);
    expect(lim.bloqueado("ip-10049")).toBe(true);
  });

  it("constantes de limite da D-09", () => {
    expect(LIMITE_FALHAS_POR_IP).toEqual({ max: 5, janelaMs: 900_000 });
    expect(LIMITE_FALHAS_GLOBAL).toEqual({ max: 20, janelaMs: 900_000 });
  });
});

describe("resolverIpOperador", () => {
  it("IPv4 encaminhado valido vence o socket", () => {
    expect(resolverIpOperador({ ipEncaminhado: "203.0.113.7", ipSocket: "10.0.0.1" })).toBe("203.0.113.7");
  });

  it("IPv6 encaminhado valido vence o socket", () => {
    expect(resolverIpOperador({ ipEncaminhado: "2001:db8::1", ipSocket: "10.0.0.1" })).toBe("2001:db8::1");
  });

  it("encaminhado invalido cai para o socket", () => {
    expect(resolverIpOperador({ ipEncaminhado: "nao-e-ip", ipSocket: "10.0.0.1" })).toBe("10.0.0.1");
  });

  it("encaminhado ausente cai para o socket", () => {
    expect(resolverIpOperador({ ipSocket: "10.0.0.1" })).toBe("10.0.0.1");
  });

  it("sem nenhum devolve desconhecido", () => {
    expect(resolverIpOperador({})).toBe("desconhecido");
    expect(resolverIpOperador({ ipEncaminhado: "xx" })).toBe("desconhecido");
  });
});

describe("sanitizarLiberadoPor", () => {
  it("remove controle e quebras, colapsa espacos e aplica trim", () => {
    expect(sanitizarLiberadoPor("  Maria\r\n\tda   Silva\u0000  ")).toBe("Maria da Silva");
  });

  it("limita a 80 caracteres", () => {
    expect(sanitizarLiberadoPor("a".repeat(200))).toHaveLength(80);
  });

  it("devolve vazio para nulo, undefined, so espacos ou so controle", () => {
    expect(sanitizarLiberadoPor(null)).toBe("");
    expect(sanitizarLiberadoPor(undefined)).toBe("");
    expect(sanitizarLiberadoPor("    ")).toBe("");
    expect(sanitizarLiberadoPor("\u0000\u0007\r\n")).toBe("");
  });

  it("preserva acentos", () => {
    expect(sanitizarLiberadoPor("José Conceição")).toBe("José Conceição");
  });
});
