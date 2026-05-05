import pathlib

service_path = pathlib.Path("apps/backend/src/modules/integrations/nfse/nfse.service.ts")
test_path = pathlib.Path("apps/backend/src/modules/integrations/nfse/nfse.service.test.ts")

service = service_path.read_text(encoding="utf-8")

service = service.replace(
    "const valorServicos  = Number(quote.total);",
    "const valorServicosBruto  = Number(quote.total);",
)
service = service.replace(
    "const base = valorServicos;",
    "const base = valorServicosBruto;",
)
service = service.replace(
    "if (descontoIncondicionado > valorServicos) {",
    "if (descontoIncondicionado > valorServicosBruto) {",
)
service = service.replace(
    "descontoIncondicionado (${descontoIncondicionado.toFixed(2)}) nao pode ser maior que valorServicos (${valorServicos.toFixed(2)}).",
    "descontoIncondicionado (${descontoIncondicionado.toFixed(2)}) nao pode ser maior que valorServicos (${valorServicosBruto.toFixed(2)}).",
)

insert_marker = "    const itensDesc = (quote.items ?? [])"
insert_block = (
    "    const valorServicos = Number((valorServicosBruto - descontoIncondicionado).toFixed(2));\n\n"
)
if insert_marker in service and "const valorServicos = Number((valorServicosBruto - descontoIncondicionado).toFixed(2));" not in service:
    service = service.replace(insert_marker, insert_block + insert_marker, 1)

service_path.write_text(service, encoding="utf-8")

# Add regression test
text = test_path.read_text(encoding="utf-8")
new_test = '''

  it("cenario 7: desconto incondicionado reduz ValorServicos no XML", async () => {
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValueOnce(CLIENTE_PJ) });
    const service = await buildService(mocks);

    const soapSpy = jest
      .spyOn(service as any, "enviarSoap")
      .mockResolvedValueOnce(
        `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>1003</NumeroNfse><CodigoVerificacao>XYZ</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,
      );
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    await service.emitir("q1", {
      clienteAthosId: 100,
      servicoCodigo: "24.01",
      descontoAtivo: true,
      descontoValor: 10,
    });

    const xmlSent: string = (soapSpy.mock.calls[0] as string[])[1];
    expect(xmlSent).toContain("<ValorServicos>90.00</ValorServicos>");
    expect(xmlSent).toContain("<DescontoIncondicionado>10.00</DescontoIncondicionado>");
  });
'''

anchor = "  it(\"cenario 6: clienteAthosId PF - CPF do tomador presente no XML enviado ao SOAP (QUAL-02)\", async () => {"
if anchor in text and "cenario 7: desconto incondicionado reduz ValorServicos no XML" not in text:
    idx = text.rfind("});\n")
    # insert before final describe closure
    text = text[:idx] + new_test + "\n" + text[idx:]

test_path.write_text(text, encoding="utf-8")

print("OK - nfse.service.ts e nfse.service.test.ts atualizados")
