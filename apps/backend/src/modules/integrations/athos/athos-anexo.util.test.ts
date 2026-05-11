import { BadRequestException } from "@nestjs/common";
import { buildContaPagarAnexoPaths, sanitizeAthosAttachmentName } from "./athos-anexo.util";

describe("athos-anexo.util", () => {
  it("deve sanitizar nome removendo segmentos de path e caracteres invalidos", () => {
    expect(sanitizeAthosAttachmentName("../Boleto final:maio.pdf")).toBe("Boleto-final-maio.pdf");
  });

  it("deve rejeitar extensao fora da whitelist", () => {
    expect(() => sanitizeAthosAttachmentName("script.exe")).toThrow(BadRequestException);
  });

  it("deve construir diretoria e caminho final UNC da conta a pagar", () => {
    const result = buildContaPagarAnexoPaths(55, "boleto final.pdf");

    expect(result.fileName).toBe("boleto-final.pdf");
    expect(result.directoryPath).toBe("\\\\192.168.3.203\\html\\Anexo\\contapagar\\55");
    expect(result.fullPath).toBe("\\\\192.168.3.203\\html\\Anexo\\contapagar\\55\\boleto-final.pdf");
  });
});