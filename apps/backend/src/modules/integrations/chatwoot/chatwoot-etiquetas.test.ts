import { QuoteStatus } from "@prisma/client";

import {
  aplicarEtiquetasGerenciadas,
  ETIQUETA_CLIENTE_FREQUENTE,
  ETIQUETA_FINALIZADO,
  ETIQUETAS_DE_FASE,
  ETIQUETAS_GERENCIADAS,
  etiquetaDaFase,
  etiquetasAtivas,
  etiquetasIguais,
  mesclarEtiquetas,
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
