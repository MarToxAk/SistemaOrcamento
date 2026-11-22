/**
 * Fase 51 (plano 51-01): getConversationLabels e addConversationLabels do ChatwootService.
 * axios sempre falso: nenhuma chamada ao Chatwoot real.
 */
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

import axios from "axios";
import { ChatwootService } from "./chatwoot.service";

const axiosGet = (axios as unknown as { get: jest.Mock }).get;
const axiosPost = (axios as unknown as { post: jest.Mock }).post;

const URL_LABELS = "https://chat.exemplo.test/api/v1/accounts/7/conversations/42/labels";

const criarService = (valores: Record<string, string | undefined>) =>
  new ChatwootService({ get: (chave: string) => valores[chave] } as any);

const configCompleta = {
  CHATWOOT_BASE_URL: "https://chat.exemplo.test",
  CHATWOOT_ACCOUNT_ID: "7",
  CHATWOOT_API_TOKEN: "token-secreto-xyz",
};

describe("ChatwootService - labels de conversa (Fase 51)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
  });

  it("getConversationLabels chama a URL correta com api_access_token e timeout 10000", async () => {
    axiosGet.mockResolvedValue({ data: { payload: ["aprovado"] } });

    const labels = await criarService(configCompleta).getConversationLabels("42");

    expect(axiosGet).toHaveBeenCalledWith(URL_LABELS, {
      headers: { api_access_token: "token-secreto-xyz" },
      timeout: 10000,
    });
    expect(labels).toEqual(["aprovado"]);
  });

  it("getConversationLabels devolve so as strings do payload", async () => {
    axiosGet.mockResolvedValue({ data: { payload: ["a", 3, null, { x: 1 }, "b"] } });

    expect(await criarService(configCompleta).getConversationLabels("42")).toEqual(["a", "b"]);
  });

  it("getConversationLabels devolve lista vazia quando o payload nao e array", async () => {
    axiosGet.mockResolvedValue({ data: { payload: "nao-e-lista" } });

    expect(await criarService(configCompleta).getConversationLabels("42")).toEqual([]);
  });

  it("getConversationLabels devolve lista vazia sem chamar axios quando falta configuracao", async () => {
    const semToken = { ...configCompleta, CHATWOOT_API_TOKEN: undefined };

    expect(await criarService(semToken).getConversationLabels("42")).toEqual([]);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("getConversationLabels propaga o erro do axios", async () => {
    axiosGet.mockRejectedValue(new Error("timeout of 10000ms exceeded"));

    await expect(criarService(configCompleta).getConversationLabels("42")).rejects.toThrow("timeout of 10000ms exceeded");
  });

  it("addConversationLabels continua enviando { labels } na mesma URL, agora com timeout 10000", async () => {
    axiosPost.mockResolvedValue({ data: { payload: ["aprovado"] } });

    const resultado = await criarService(configCompleta).addConversationLabels("42", ["aprovado"]);

    expect(axiosPost).toHaveBeenCalledWith(
      URL_LABELS,
      { labels: ["aprovado"] },
      { headers: { api_access_token: "token-secreto-xyz" }, timeout: 10000 },
    );
    expect(resultado).toEqual({ enabled: true, response: { payload: ["aprovado"] } });
  });

  it("getConversation chama GET na URL da conversa com api_access_token e timeout 10000 e devolve response.data", async () => {
    const conversa = { status: "resolved", messages: [] };
    axiosGet.mockResolvedValue({ data: conversa });

    const resultado = await criarService(configCompleta).getConversation("42");

    expect(axiosGet).toHaveBeenCalledWith("https://chat.exemplo.test/api/v1/accounts/7/conversations/42", {
      headers: { api_access_token: "token-secreto-xyz" },
      timeout: 10000,
    });
    expect(resultado).toBe(conversa);
  });

  it("getConversation devolve null sem chamar axios quando falta qualquer das tres envs", async () => {
    for (const faltando of ["CHATWOOT_BASE_URL", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_API_TOKEN"]) {
      const parcial = { ...configCompleta, [faltando]: undefined };
      expect(await criarService(parcial).getConversation("42")).toBeNull();
    }
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("getConversation propaga o erro do axios", async () => {
    axiosGet.mockRejectedValue(new Error("Request failed with status code 500"));

    await expect(criarService(configCompleta).getConversation("42")).rejects.toThrow("status code 500");
  });
});
