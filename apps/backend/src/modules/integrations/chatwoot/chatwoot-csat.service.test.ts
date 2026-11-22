/**
 * Fase 52 (plano 52-04): suíte de payloads do ChatwootService para o CSAT e a inbox.
 * Cobre os métodos do tracer (plano 52-01) — createPrivateCsatMessage, submitCsatResponse e
 * getInbox — e os novos listMessagesAfter e updateContactCustomAttributes (D-13, D-40).
 * axios sempre falso: nenhuma chamada ao Chatwoot real.
 */
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

import axios from "axios";
import { ChatwootService } from "./chatwoot.service";

const axiosGet = (axios as unknown as { get: jest.Mock }).get;
const axiosPost = (axios as unknown as { post: jest.Mock }).post;
const axiosPut = (axios as unknown as { put: jest.Mock }).put;

const URL_MESSAGES = "https://chat.exemplo.test/api/v1/accounts/7/conversations/42/messages";
const URL_INBOX = "https://chat.exemplo.test/api/v1/accounts/7/inboxes/1";
const URL_CONTACTS = "https://chat.exemplo.test/api/v1/accounts/7/contacts/9";
const URL_CSAT_PUBLICO = "https://chat.exemplo.test/public/api/v1/csat_survey/uuid-123";

const criarService = (valores: Record<string, string | undefined>) =>
  new ChatwootService({ get: (chave: string) => valores[chave] } as any);

const configCompleta = {
  CHATWOOT_BASE_URL: "https://chat.exemplo.test",
  CHATWOOT_ACCOUNT_ID: "7",
  CHATWOOT_API_TOKEN: "token-agente",
};

describe("ChatwootService - sendOutgoingMessage (WR-08, Fase 52)", () => {
  beforeEach(() => {
    axiosPost.mockReset();
  });

  it("faz POST publico na conversa com header api_access_token e timeout 10000", async () => {
    axiosPost.mockResolvedValue({ data: { id: 5 } });

    const resultado = await criarService(configCompleta).sendOutgoingMessage("42", "oi");

    expect(axiosPost).toHaveBeenCalledWith(
      URL_MESSAGES,
      { content: "oi", message_type: "outgoing", private: false },
      { headers: { api_access_token: "token-agente" }, timeout: 10000 },
    );
    expect(resultado).toEqual({ enabled: true, response: { id: 5 } });
  });
});

describe("ChatwootService - createPrivateCsatMessage (D-06, Fase 52)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
    axiosPut.mockReset();
  });

  it("faz POST na conversa com corpo exato, header api_access_token e timeout 10000", async () => {
    axiosPost.mockResolvedValue({ data: { id: 99 } });

    const resultado = await criarService(configCompleta).createPrivateCsatMessage("42", "link");

    expect(axiosPost).toHaveBeenCalledWith(
      URL_MESSAGES,
      { content: "link", message_type: "outgoing", private: true, content_type: "input_csat" },
      { headers: { api_access_token: "token-agente" }, timeout: 10000 },
    );
    expect(resultado).toEqual({ enabled: true, id: 99 });
  });

  it("sem as tres envs devolve { enabled: false } sem chamar axios", async () => {
    for (const faltando of ["CHATWOOT_BASE_URL", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_API_TOKEN"]) {
      const parcial = { ...configCompleta, [faltando]: undefined };
      expect(await criarService(parcial).createPrivateCsatMessage("42", "link")).toEqual({ enabled: false });
    }
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("propaga o erro do axios", async () => {
    axiosPost.mockRejectedValue(new Error("Request failed with status code 500"));

    await expect(criarService(configCompleta).createPrivateCsatMessage("42", "link")).rejects.toThrow(
      "status code 500",
    );
  });
});

describe("ChatwootService - submitCsatResponse (D-07, Fase 52)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
    axiosPut.mockReset();
  });

  it("faz PUT na rota publica com corpo exato, timeout 10000 e sem api_access_token", async () => {
    axiosPut.mockResolvedValue({ data: {} });

    const resultado = await criarService(configCompleta).submitCsatResponse("uuid-123", 4, "ok");

    expect(axiosPut).toHaveBeenCalledWith(
      URL_CSAT_PUBLICO,
      { message: { submitted_values: { csat_survey_response: { rating: 4, feedback_message: "ok" } } } },
      { timeout: 10000 },
    );
    const config = axiosPut.mock.calls[0][2] as Record<string, unknown> | undefined;
    expect(config && config.headers).toBeUndefined();
    expect(resultado).toEqual({ enabled: true });
  });

  it("feedback ausente vira feedback_message vazio", async () => {
    axiosPut.mockResolvedValue({ data: {} });

    await criarService(configCompleta).submitCsatResponse("uuid-123", 5);

    expect(axiosPut).toHaveBeenCalledWith(
      URL_CSAT_PUBLICO,
      { message: { submitted_values: { csat_survey_response: { rating: 5, feedback_message: "" } } } },
      { timeout: 10000 },
    );
  });

  it("usa so CHATWOOT_BASE_URL: sem ACCOUNT_ID e sem token ainda funciona", async () => {
    axiosPut.mockResolvedValue({ data: {} });

    const resultado = await criarService({ CHATWOOT_BASE_URL: "https://chat.exemplo.test" }).submitCsatResponse(
      "uuid-123",
      3,
    );

    expect(axiosPut).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ enabled: true });
  });

  it("sem CHATWOOT_BASE_URL devolve { enabled: false } sem chamar axios", async () => {
    expect(await criarService({}).submitCsatResponse("uuid-123", 3)).toEqual({ enabled: false });
    expect(axiosPut).not.toHaveBeenCalled();
  });
});

describe("ChatwootService - listMessagesAfter (D-40, Fase 52)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
    axiosPut.mockReset();
  });

  it("faz GET na URL de messages com params after e filter_internal_messages, header e timeout", async () => {
    axiosGet.mockResolvedValue({ data: { payload: [{ id: 1 }] } });

    const resultado = await criarService(configCompleta).listMessagesAfter("42", 777);

    expect(axiosGet).toHaveBeenCalledWith(
      URL_MESSAGES,
      {
        params: { after: 777, filter_internal_messages: true },
        headers: { api_access_token: "token-agente" },
        timeout: 10000,
      },
    );
    expect(resultado).toEqual([{ id: 1 }]);
  });

  it("sem afterId os params NAO tem a chave after", async () => {
    axiosGet.mockResolvedValue({ data: { payload: [] } });

    await criarService(configCompleta).listMessagesAfter("42");

    const config = axiosGet.mock.calls[0][1] as { params: Record<string, unknown> };
    expect(config.params).not.toHaveProperty("after");
    expect(config.params.filter_internal_messages).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("afterId %p e tratado como ausente", async (afterId) => {
    axiosGet.mockResolvedValue({ data: { payload: [] } });

    await criarService(configCompleta).listMessagesAfter("42", afterId);

    const config = axiosGet.mock.calls[0][1] as { params: Record<string, unknown> };
    expect(config.params).not.toHaveProperty("after");
  });

  it("com opcoes.incluirInternas a chave filter_internal_messages some e o after continua quando informado", async () => {
    axiosGet.mockResolvedValue({ data: { payload: [] } });

    await criarService(configCompleta).listMessagesAfter("42", 777, { incluirInternas: true });

    const config = axiosGet.mock.calls[0][1] as { params: Record<string, unknown> };
    expect(config.params).not.toHaveProperty("filter_internal_messages");
    expect(config.params.after).toBe(777);
  });

  it("devolve o payload quando e array", async () => {
    const payload = [{ message_type: 0, created_at: 1_800_000_000 }];
    axiosGet.mockResolvedValue({ data: { payload } });

    expect(await criarService(configCompleta).listMessagesAfter("42")).toBe(payload);
  });

  it.each([
    ["payload ausente", {}],
    ["payload nao-array", { payload: "nao-e-lista" }],
  ])("devolve null quando %s", async (_nome, data) => {
    axiosGet.mockResolvedValue({ data });

    expect(await criarService(configCompleta).listMessagesAfter("42")).toBeNull();
  });

  it("sem as tres envs devolve null sem chamar axios", async () => {
    for (const faltando of ["CHATWOOT_BASE_URL", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_API_TOKEN"]) {
      const parcial = { ...configCompleta, [faltando]: undefined };
      expect(await criarService(parcial).listMessagesAfter("42")).toBeNull();
    }
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("propaga o erro do axios", async () => {
    axiosGet.mockRejectedValue(new Error("timeout of 10000ms exceeded"));

    await expect(criarService(configCompleta).listMessagesAfter("42")).rejects.toThrow("timeout of 10000ms exceeded");
  });
});

describe("ChatwootService - updateContactCustomAttributes (D-13, Fase 52)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
    axiosPut.mockReset();
  });

  it("faz PUT no contato com custom_attributes, header do agente e timeout 10000", async () => {
    axiosPut.mockResolvedValue({ data: {} });

    const resultado = await criarService(configCompleta).updateContactCustomAttributes(9, { ultima_nota_csat: 4 });

    expect(axiosPut).toHaveBeenCalledWith(
      URL_CONTACTS,
      { custom_attributes: { ultima_nota_csat: 4 } },
      { headers: { api_access_token: "token-agente" }, timeout: 10000 },
    );
    expect(resultado).toEqual({ enabled: true });
  });

  it("sem as tres envs devolve { enabled: false } sem chamar axios", async () => {
    expect(await criarService({}).updateContactCustomAttributes(9, { ultima_nota_csat: 4 })).toEqual({
      enabled: false,
    });
    expect(axiosPut).not.toHaveBeenCalled();
  });

  it("propaga o erro do axios", async () => {
    axiosPut.mockRejectedValue(new Error("Request failed with status code 404"));

    await expect(criarService(configCompleta).updateContactCustomAttributes(9, { ultima_nota_csat: 4 })).rejects.toThrow(
      "status code 404",
    );
  });
});

describe("ChatwootService - getInbox (Fase 52)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
    axiosPut.mockReset();
  });

  it("faz GET na inbox com header api_access_token e timeout 10000 e devolve response.data", async () => {
    const inbox = { csat_survey_enabled: true };
    axiosGet.mockResolvedValue({ data: inbox });

    const resultado = await criarService(configCompleta).getInbox(1);

    expect(axiosGet).toHaveBeenCalledWith(URL_INBOX, {
      headers: { api_access_token: "token-agente" },
      timeout: 10000,
    });
    expect(resultado).toBe(inbox);
  });

  it("sem as tres envs devolve null sem chamar axios", async () => {
    for (const faltando of ["CHATWOOT_BASE_URL", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_API_TOKEN"]) {
      const parcial = { ...configCompleta, [faltando]: undefined };
      expect(await criarService(parcial).getInbox(1)).toBeNull();
    }
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("propaga o erro do axios", async () => {
    axiosGet.mockRejectedValue(new Error("Request failed with status code 500"));

    await expect(criarService(configCompleta).getInbox(1)).rejects.toThrow("status code 500");
  });
});
