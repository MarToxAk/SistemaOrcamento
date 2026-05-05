"""Fase 21 - Adiciona cenario 6 (PF) no nfse.service.test.ts"""
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
p = ROOT / "apps/backend/src/modules/integrations/nfse/nfse.service.test.ts"
c = p.read_text(encoding="utf-8")

# Marcador final do describe - ultima linha
old_end = "    expect(mocks.mockAthos.buscarClientePorId).not.toHaveBeenCalled();\n  });\n});"
new_end = (
    "    expect(mocks.mockAthos.buscarClientePorId).not.toHaveBeenCalled();\n"
    "  });\n"
    "\n"
    '  it("cenario 6: clienteAthosId PF - CPF do tomador presente no XML enviado ao SOAP (QUAL-02)", async () => {\n'
    "    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValueOnce(CLIENTE_PF) });\n"
    "    const service = await buildService(mocks);\n"
    "\n"
    "    const soapSpy = jest\n"
    '      .spyOn(service as any, "enviarSoap")\n'
    "      .mockResolvedValueOnce(\n"
    "        `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>1002</NumeroNfse><CodigoVerificacao>XYZ</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,\n"
    "      );\n"
    '    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);\n'
    "\n"
    '    const result = await service.emitir("q1", { clienteAthosId: 200, servicoCodigo: "24.01" });\n'
    "\n"
    "    expect(soapSpy).toHaveBeenCalledTimes(1);\n"
    "    const xmlSent: string = (soapSpy.mock.calls[0] as string[])[0];\n"
    "    // CPF deve estar presente no XML (sem pontuacao)\n"
    "    expect(xmlSent).toMatch(/12345678901/);\n"
    "    // CNPJ nao deve aparecer com este numero de CPF\n"
    "    expect(xmlSent).not.toMatch(/<CNPJ>12345678901<\\/CNPJ>/);\n"
    '    expect(result).toHaveProperty("numero");\n'
    "  });\n"
    "});"
)

if old_end in c:
    c = c.replace(old_end, new_end)
    p.write_text(c, encoding="utf-8")
    print("cenario 6 PF adicionado com sucesso")
else:
    print("WARN: marcador nao encontrado, tentando alternativa...")
    # Tentar encontrar o fim pelo padrao mais simples
    if c.rstrip().endswith("});"):
        # Inserir antes do ultimo });
        idx = c.rstrip().rfind("});")
        new_c = c[:idx] + "\n" + (
            '  it("cenario 6: clienteAthosId PF - CPF do tomador presente no XML enviado ao SOAP (QUAL-02)", async () => {\n'
            "    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValueOnce(CLIENTE_PF) });\n"
            "    const service = await buildService(mocks);\n"
            "\n"
            "    const soapSpy = jest\n"
            '      .spyOn(service as any, "enviarSoap")\n'
            "      .mockResolvedValueOnce(\n"
            "        `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>1002</NumeroNfse><CodigoVerificacao>XYZ</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,\n"
            "      );\n"
            '    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);\n'
            "\n"
            '    const result = await service.emitir("q1", { clienteAthosId: 200, servicoCodigo: "24.01" });\n'
            "\n"
            "    expect(soapSpy).toHaveBeenCalledTimes(1);\n"
            "    const xmlSent: string = (soapSpy.mock.calls[0] as string[])[0];\n"
            "    expect(xmlSent).toMatch(/12345678901/);\n"
            "    expect(xmlSent).not.toMatch(/<CNPJ>12345678901<\\/CNPJ>/);\n"
            '    expect(result).toHaveProperty("numero");\n'
            "  });\n"
        ) + "});"
        p.write_text(new_c, encoding="utf-8")
        print("cenario 6 PF adicionado via alternativa")
    else:
        print("ERRO: nao foi possivel localizar fim do describe")
        import sys; sys.exit(1)
