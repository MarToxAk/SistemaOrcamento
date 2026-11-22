import { QuoteStatus } from "@prisma/client";

import {
  aguardarFilaEtiquetas,
  aplicarEtiquetasGerenciadas,
  clienteEhFrequente,
  enfileirarPorConversa,
  ENV_CLIENTE_FREQUENTE_MESES,
  ENV_CLIENTE_FREQUENTE_MIN,
  inicioJanelaClienteFrequente,
  lerLimiaresClienteFrequente,
  MAX_CONCORRENCIA_CHATWOOT,
  STATUS_PEDIDO_CONCRETIZADO,
  ETIQUETA_CLIENTE_FREQUENTE,
  ETIQUETA_FINALIZADO,
  ETIQUETA_AVALIOU,
  ETIQUETA_CSAT_BAIXO,
  ETIQUETAS_PESQUISA,
  ETIQUETAS_DE_FASE,
  ETIQUETAS_GERENCIADAS,
  etiquetaDaFase,
  etiquetasAtivas,
  etiquetasIguais,
  mesclarEtiquetas,
  mesclarEtiquetasFechamento,
  type EtiquetasApi,
} from "./chatwoot-etiquetas";

describe("chatwoot-etiquetas - mapa de fase (D-15)", () => {
  it("todo valor do enum QuoteStatus tem etiqueta de fase", () => {
    for (const status of Object.values(QuoteStatus)) {
      expect(etiquetaDaFase(status)).toEqual(expect.any(String));
    }
  });

  it("PENDENTE, ENVIADO e PRONTO_PARA_ENTREGA seguem o D-15", () => {
    expect(etiquetaDaFase(QuoteStatus.PENDENTE)).toBe("orcamento-pendente");
    expect(etiquetaDaFase(QuoteStatus.ENVIADO)).toBe("orcamento-enviado");
    expect(etiquetaDaFase(QuoteStatus.PRONTO_PARA_ENTREGA)).toBe("pronto-entrega");
  });

  it("as 8 etiquetas de fase sao distintas", () => {
    expect(ETIQUETAS_DE_FASE).toHaveLength(8);
    expect(new Set(ETIQUETAS_DE_FASE).size).toBe(8);
  });

  it("status nulo ou indefinido nao tem etiqueta", () => {
    expect(etiquetaDaFase(null)).toBeNull();
    expect(etiquetaDaFase(undefined)).toBeNull();
  });
});

describe("chatwoot-etiquetas - conjunto gerenciado", () => {
  it("contem as 8 de fase e cliente-frequente, e nao contem finalizado", () => {
    for (const etiqueta of ETIQUETAS_DE_FASE) expect(ETIQUETAS_GERENCIADAS).toContain(etiqueta);
    expect(ETIQUETAS_GERENCIADAS).toContain(ETIQUETA_CLIENTE_FREQUENTE);
    expect(ETIQUETAS_GERENCIADAS).not.toContain(ETIQUETA_FINALIZADO);
  });
});

describe("chatwoot-etiquetas - etiquetas de pesquisa (D-14, D-34)", () => {
  it("ETIQUETAS_PESQUISA = [avaliou, csat-baixo] e ficam fora do conjunto gerenciado e das de fase", () => {
    expect(ETIQUETA_AVALIOU).toBe("avaliou");
    expect(ETIQUETA_CSAT_BAIXO).toBe("csat-baixo");
    expect([...ETIQUETAS_PESQUISA]).toEqual(["avaliou", "csat-baixo"]);
    for (const etiqueta of ETIQUETAS_PESQUISA) {
      expect(ETIQUETAS_GERENCIADAS).not.toContain(etiqueta);
      expect(ETIQUETAS_DE_FASE).not.toContain(etiqueta);
    }
  });

  it("mesclarEtiquetasFechamento preserva so as de pesquisa e poe as desejadas primeiro", () => {
    expect(mesclarEtiquetasFechamento(["orcamento-pendente", "manual-x", "avaliou"], ["finalizado"])).toEqual([
      "finalizado",
      "avaliou",
    ]);
    expect(mesclarEtiquetasFechamento(["csat-baixo", "avaliou"], ["finalizado", "cliente-frequente"])).toEqual([
      "finalizado",
      "cliente-frequente",
      "csat-baixo",
      "avaliou",
    ]);
  });

  it("mesclarEtiquetasFechamento nao duplica e atuais vazio devolve so as desejadas", () => {
    expect(mesclarEtiquetasFechamento(["avaliou", "csat-baixo"], ["finalizado", "avaliou"])).toEqual([
      "finalizado",
      "avaliou",
      "csat-baixo",
    ]);
    expect(mesclarEtiquetasFechamento([], ["finalizado"])).toEqual(["finalizado"]);
  });
});

describe("chatwoot-etiquetas - mesclarEtiquetas", () => {
  it("remove a fase anterior e coloca a nova, preservando a manual", () => {
    expect(mesclarEtiquetas(["manual", "orcamento-pendente"], ["aprovado"])).toEqual(["manual", "aprovado"]);
  });

  it("preserva as manuais na ordem original", () => {
    expect(mesclarEtiquetas(["z-manual", "a-manual", "aprovado"], ["em-producao"])).toEqual([
      "z-manual",
      "a-manual",
      "em-producao",
    ]);
  });

  it("nao duplica quando a desejada ja existe", () => {
    expect(mesclarEtiquetas(["manual", "aprovado"], ["aprovado"])).toEqual(["manual", "aprovado"]);
  });

  it("mantem finalizado, que fica fora do conjunto gerenciado", () => {
    expect(mesclarEtiquetas(["finalizado", "aprovado"], ["em-producao"])).toEqual(["finalizado", "em-producao"]);
  });

  it("remove cliente-frequente quando nao esta nas desejadas", () => {
    expect(mesclarEtiquetas(["cliente-frequente", "aprovado"], ["entregue"])).toEqual(["entregue"]);
  });

  it("lista atual vazia mais desejada devolve so a desejada", () => {
    expect(mesclarEtiquetas([], ["aprovado"])).toEqual(["aprovado"]);
  });

  it("desejadas vazias devolvem so as manuais", () => {
    expect(mesclarEtiquetas(["manual", "aprovado"], [])).toEqual(["manual"]);
  });
});

describe("chatwoot-etiquetas - etiquetasIguais", () => {
  it("ignora ordem e duplicatas", () => {
    expect(etiquetasIguais(["a", "b"], ["b", "a"])).toBe(true);
    expect(etiquetasIguais(["a", "a", "b"], ["b", "a"])).toBe(true);
  });

  it("listas diferentes nao sao iguais", () => {
    expect(etiquetasIguais(["a"], ["a", "b"])).toBe(false);
    expect(etiquetasIguais(["a", "b"], ["a", "c"])).toBe(false);
  });
});

describe("chatwoot-etiquetas - etiquetasAtivas (kill-switch)", () => {
  it("ausente, vazio ou qualquer outro valor mantem ligada", () => {
    for (const valor of [undefined, null, "", "true", "qualquer"]) {
      expect(etiquetasAtivas(valor)).toBe(true);
    }
  });

  it("so o texto false (trim, qualquer caixa) desliga", () => {
    expect(etiquetasAtivas("false")).toBe(false);
    expect(etiquetasAtivas(" FALSE ")).toBe(false);
  });
});

describe("chatwoot-etiquetas - aplicarEtiquetasGerenciadas", () => {
  const criarApi = (atuais: string[]) => {
    const api = {
      getConversationLabels: jest.fn().mockResolvedValue(atuais),
      addConversationLabels: jest.fn().mockResolvedValue({ enabled: true }),
    };
    return api satisfies EtiquetasApi;
  };

  it("faz GET e POST com a lista mesclada quando muda", async () => {
    const api = criarApi(["manual", "orcamento-pendente"]);

    const resultado = await aplicarEtiquetasGerenciadas(api, "42", ["aprovado"]);

    expect(api.getConversationLabels).toHaveBeenCalledWith("42");
    expect(api.addConversationLabels).toHaveBeenCalledWith("42", ["manual", "aprovado"]);
    expect(resultado).toEqual({ alterou: true, etiquetas: ["manual", "aprovado"] });
  });

  it("nao faz POST quando a lista ja esta correta", async () => {
    const api = criarApi(["aprovado", "manual"]);

    const resultado = await aplicarEtiquetasGerenciadas(api, "42", ["aprovado"]);

    expect(api.addConversationLabels).not.toHaveBeenCalled();
    expect(resultado.alterou).toBe(false);
  });

  it("GET rejeitando rejeita e nao faz POST", async () => {
    const api = criarApi([]);
    api.getConversationLabels.mockRejectedValue(new Error("falhou"));

    await expect(aplicarEtiquetasGerenciadas(api, "42", ["aprovado"])).rejects.toThrow("falhou");
    expect(api.addConversationLabels).not.toHaveBeenCalled();
  });

  it("gerenciadas customizada (com finalizado) remove finalizado", async () => {
    const api = criarApi(["finalizado", "manual"]);

    await aplicarEtiquetasGerenciadas(api, "42", ["aprovado"], [...ETIQUETAS_GERENCIADAS, ETIQUETA_FINALIZADO]);

    expect(api.addConversationLabels).toHaveBeenCalledWith("42", ["manual", "aprovado"]);
  });
});

describe("chatwoot-etiquetas - cliente frequente (D-09, D-11, D-16)", () => {
  const AGORA = new Date("2026-11-21T12:00:00Z");
  const envs = (valores: Record<string, string | undefined>) => (chave: string) => valores[chave];

  it("STATUS_PEDIDO_CONCRETIZADO e exatamente APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE", () => {
    expect([...STATUS_PEDIDO_CONCRETIZADO]).toEqual([
      QuoteStatus.APROVADO,
      QuoteStatus.EM_PRODUCAO,
      QuoteStatus.PRONTO_PARA_ENTREGA,
      QuoteStatus.ENTREGUE,
    ]);
  });

  it("inicioJanelaClienteFrequente recua N meses mantendo o horario", () => {
    expect(inicioJanelaClienteFrequente(6, AGORA).toISOString()).toBe("2026-05-21T12:00:00.000Z");
    expect(inicioJanelaClienteFrequente(12, AGORA).toISOString()).toBe("2025-11-21T12:00:00.000Z");
  });

  it("lerLimiaresClienteFrequente usa o padrao sem envs", () => {
    expect(lerLimiaresClienteFrequente(envs({}))).toEqual({ min: 3, meses: 6 });
  });

  it("lerLimiaresClienteFrequente le inteiros validos das envs", () => {
    expect(
      lerLimiaresClienteFrequente(envs({ [ENV_CLIENTE_FREQUENTE_MIN]: "5", [ENV_CLIENTE_FREQUENTE_MESES]: "12" })),
    ).toEqual({ min: 5, meses: 12 });
  });

  it.each(["abc", "0", "-2", "1.5", ""])("lerLimiaresClienteFrequente volta ao padrao com valor invalido %p", (valor) => {
    expect(
      lerLimiaresClienteFrequente(envs({ [ENV_CLIENTE_FREQUENTE_MIN]: valor, [ENV_CLIENTE_FREQUENTE_MESES]: valor })),
    ).toEqual({ min: 3, meses: 6 });
  });

  describe("clienteEhFrequente", () => {
    const criarPrisma = (total: number) => ({ quote: { count: jest.fn().mockResolvedValue(total) } });

    it("conta uma vez com status concretizados e janela de 6 meses por createdAt", async () => {
      const prisma = criarPrisma(3);

      const resultado = await clienteEhFrequente(prisma, "cus1", envs({}), AGORA);

      expect(resultado).toBe(true);
      expect(prisma.quote.count).toHaveBeenCalledTimes(1);
      expect(prisma.quote.count).toHaveBeenCalledWith({
        where: {
          customerId: "cus1",
          status: { in: ["APROVADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA", "ENTREGUE"] },
          createdAt: { gte: new Date("2026-05-21T12:00:00Z") },
        },
      });
    });

    it("com 2 pedidos nao e frequente (padrao 3)", async () => {
      expect(await clienteEhFrequente(criarPrisma(2), "cus1", envs({}), AGORA)).toBe(false);
    });

    it("com min 2 por env, 2 pedidos bastam", async () => {
      expect(
        await clienteEhFrequente(criarPrisma(2), "cus1", envs({ [ENV_CLIENTE_FREQUENTE_MIN]: "2" }), AGORA),
      ).toBe(true);
    });

    it("sem relogio explicito usa a data atual", async () => {
      jest.useFakeTimers({ now: AGORA });
      try {
        const prisma = criarPrisma(0);
        await clienteEhFrequente(prisma, "cus1", envs({}));
        expect(prisma.quote.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ createdAt: { gte: new Date("2026-05-21T12:00:00Z") } }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe("chatwoot-etiquetas - fila por conversa (R1, R4)", () => {
  /** Promessa controlada manualmente. */
  const manual = <T = void>() => {
    let resolver!: (valor: T) => void;
    let rejeitar!: (erro: unknown) => void;
    const promessa = new Promise<T>((res, rej) => {
      resolver = res;
      rejeitar = rej;
    });
    return { promessa, resolver, rejeitar };
  };
  const ciclos = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it("a mesma conversa roda em serie e na ordem de chegada", async () => {
    const ordem: string[] = [];
    const c1 = manual();
    const p1 = enfileirarPorConversa("a", async () => {
      ordem.push("inicio-1");
      await c1.promessa;
      ordem.push("fim-1");
      return 1;
    });
    const p2 = enfileirarPorConversa("a", async () => {
      ordem.push("inicio-2");
      return 2;
    });

    await ciclos();
    expect(ordem).toEqual(["inicio-1"]);

    c1.resolver();
    expect(await p1).toBe(1);
    expect(await p2).toBe(2);
    expect(ordem).toEqual(["inicio-1", "fim-1", "inicio-2"]);
  });

  it("conversas diferentes rodam em paralelo", async () => {
    const ordem: string[] = [];
    const ca = manual();
    const pa = enfileirarPorConversa("a", async () => {
      ordem.push("inicio-a");
      await ca.promessa;
    });
    const pb = enfileirarPorConversa("b", async () => {
      ordem.push("inicio-b");
    });

    await ciclos();
    expect(ordem).toEqual(["inicio-a", "inicio-b"]);
    ca.resolver();
    await Promise.all([pa, pb]);
  });

  it("a rejeicao da primeira nao trava a segunda e a promessa da primeira rejeita", async () => {
    const p1 = enfileirarPorConversa("a", async () => {
      throw new Error("falhou-1");
    });
    const p2 = enfileirarPorConversa("a", async () => "ok-2");

    await expect(p1).rejects.toThrow("falhou-1");
    await expect(p2).resolves.toBe("ok-2");
  });

  it("com 5 conversas diferentes no maximo 3 execucoes simultaneas", async () => {
    expect(MAX_CONCORRENCIA_CHATWOOT).toBe(3);
    let ativas = 0;
    let maximo = 0;
    const portoes = Array.from({ length: 5 }, () => manual());
    const promessas = portoes.map((portao, i) =>
      enfileirarPorConversa(`conv-${i}`, async () => {
        ativas++;
        maximo = Math.max(maximo, ativas);
        await portao.promessa;
        ativas--;
      }),
    );

    await ciclos();
    expect(ativas).toBe(3);

    for (const portao of portoes) {
      portao.resolver();
      await ciclos();
    }
    await Promise.all(promessas);
    expect(maximo).toBe(3);
  });

  it("aguardarFilaEtiquetas so resolve depois da ultima tarefa", async () => {
    const c = manual();
    let terminou = false;
    void enfileirarPorConversa("a", async () => {
      await c.promessa;
      terminou = true;
    });
    void enfileirarPorConversa("a", async () => {
      throw new Error("ignorada pela espera");
    }).catch(() => undefined);

    const espera = aguardarFilaEtiquetas();
    await ciclos();
    expect(terminou).toBe(false);

    c.resolver();
    await espera;
    expect(terminou).toBe(true);
  });
});
