import * as fs from "node:fs";
import * as path from "node:path";

import { DanfePdfService } from "./danfe-pdf.service";

// Render real: SEM jest.mock. Usa o DanfePdfService real e o gerarPDF real
// da lib nfe-danfe-pdf contra o fixture da NF-e 573 (Simples Nacional,
// CSOSN 500, 5 itens, vNF 489,29). Roda offline.
jest.setTimeout(20000);

describe("DanfePdfService.gerarDanfe (render real do fixture 573)", () => {
  it("renderiza um PDF %PDF- > 10 KB a partir do fixture nfe-573.xml", async () => {
    const service = Object.create(DanfePdfService.prototype) as DanfePdfService;
    (service as any).config = { get: () => "" }; // EMPRESA_LOGO_URL vazio -> sem logo
    (service as any).logger = { warn: jest.fn() };
    (service as any).logoPathCache = new Map<string, string>();

    const xml = fs.readFileSync(path.join(__dirname, "__fixtures__/nfe-573.xml"), "utf8");
    const buf = await service.gerarDanfe({ xml });

    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10 * 1024);
  });
});
