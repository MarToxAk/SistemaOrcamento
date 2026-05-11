import { BadRequestException } from "@nestjs/common";
import { buildContaPagarAnexoPaths, sanitizeAthosAttachmentName } from "./athos-anexo.util";

describe("athos-anexo.util", () => {
  it("deve gerar nome tokenizado mantendo apenas extensao permitida", () => {
    expect(sanitizeAthosAttachmentName("../Boleto final:maio.pdf")).toMatch(/^[a-f0-9]{32}\.pdf$/);
  });

  it("deve rejeitar extensao fora da whitelist", () => {
    expect(() => sanitizeAthosAttachmentName("script.exe")).toThrow(BadRequestException);
  });

  it("deve construir diretoria e caminho final UNC da conta a pagar", () => {
    const result = buildContaPagarAnexoPaths(55, "boleto final.pdf");

    expect(result.fileName).toMatch(/^[a-f0-9]{32}\.pdf$/);
    expect(result.directoryPath).toBe("\\\\192.168.3.203\\html\\Anexo\\contapagar\\55");
    expect(result.fullPath).toMatch(/^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\55\\[a-f0-9]{32}\.pdf$/);
  });
});