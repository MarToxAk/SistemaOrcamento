import { BadRequestException } from "@nestjs/common";
import { buildContaPagarAnexoPaths, sanitizeAthosAttachmentName } from "./athos-anexo.util";

describe("athos-anexo.util", () => {
  it("deve gerar nome tokenizado mantendo apenas extensao permitida", () => {
    expect(sanitizeAthosAttachmentName("../Boleto final:maio.pdf")).toMatch(/^[a-f0-9]{32}\.pdf$/);
  });

  it("deve rejeitar extensao fora da whitelist", () => {
    expect(() => sanitizeAthosAttachmentName("script.exe")).toThrow(BadRequestException);
  });

  describe("buildContaPagarAnexoPaths — sem ATHOS_SMB_MOUNT_PATH (Windows nativo)", () => {
    beforeEach(() => { delete process.env.ATHOS_SMB_MOUNT_PATH; });
    afterEach(() => { delete process.env.ATHOS_SMB_MOUNT_PATH; });

    it("deve usar UNC como path de escrita e path do banco quando sem mount", () => {
      const result = buildContaPagarAnexoPaths(55, "boleto final.pdf");

      expect(result.fileName).toMatch(/^[a-f0-9]{32}\.pdf$/);
      expect(result.dbFullPath).toMatch(/^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\55\\[a-f0-9]{32}\.pdf$/);
      expect(result.writeDirectoryPath).toBe("\\\\192.168.3.203\\html\\Anexo\\contapagar\\55");
      expect(result.writeFullPath).toBe(result.dbFullPath);
    });
  });

  describe("buildContaPagarAnexoPaths — com ATHOS_SMB_MOUNT_PATH (Docker Linux)", () => {
    beforeEach(() => { process.env.ATHOS_SMB_MOUNT_PATH = "/mnt/samba/contapagar"; });
    afterEach(() => { delete process.env.ATHOS_SMB_MOUNT_PATH; });

    it("deve usar path Linux para escrita e UNC para banco", () => {
      const result = buildContaPagarAnexoPaths(42, "fatura.pdf");

      expect(result.fileName).toMatch(/^[a-f0-9]{32}\.pdf$/);
      // writeDirectoryPath deve ser Linux
      expect(result.writeDirectoryPath).toBe("/mnt/samba/contapagar/42");
      expect(result.writeFullPath).toMatch(/^\/mnt\/samba\/contapagar\/42\/[a-f0-9]{32}\.pdf$/);
      // dbFullPath deve ser UNC (para o Athos ERP Windows)
      expect(result.dbFullPath).toMatch(/^\\\\192\.168\.3\.203\\html\\Anexo\\contapagar\\42\\[a-f0-9]{32}\.pdf$/);
      // paths de escrita e banco devem ser diferentes
      expect(result.writeFullPath).not.toBe(result.dbFullPath);
    });
  });
});