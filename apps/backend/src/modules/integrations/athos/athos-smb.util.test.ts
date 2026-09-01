import { getSmbDebugInfo } from "./athos-smb.util";

describe("athos-smb.util — getSmbDebugInfo().share", () => {
  const originalSmbHost = process.env.SMB_HOST;

  beforeEach(() => {
    delete process.env.SMB_HOST;
  });

  afterEach(() => {
    if (originalSmbHost === undefined) {
      delete process.env.SMB_HOST;
    } else {
      process.env.SMB_HOST = originalSmbHost;
    }
  });

  it("sem SMB_HOST no ambiente, usa o share default 192.168.3.203", () => {
    expect(getSmbDebugInfo().share).toBe("\\\\192.168.3.203\\html");
  });

  it("com SMB_HOST customizado, o share reflete o host configurado", () => {
    process.env.SMB_HOST = "10.0.0.50";

    expect(getSmbDebugInfo().share).toBe("\\\\10.0.0.50\\html");
  });

  it("com SMB_HOST contendo espacos em volta, o share sai sem os espacos (trim)", () => {
    process.env.SMB_HOST = "  10.0.0.50  ";

    expect(getSmbDebugInfo().share).toBe("\\\\10.0.0.50\\html");
  });
});
