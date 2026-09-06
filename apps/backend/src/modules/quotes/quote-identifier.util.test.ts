import { buildQuoteIdentifierWhereCandidates, findQuoteByIdentifierBasic } from "./quote-identifier.util";

describe("buildQuoteIdentifierWhereCandidates", () => {
  it("Teste A: identificador numerico devolve 2 candidatos, na ordem externalQuoteId -> internalNumber", () => {
    const candidatos = buildQuoteIdentifierWhereCandidates("22764");

    expect(candidatos).toEqual([{ externalQuoteId: 22764n }, { internalNumber: 22764 }]);
  });

  it("Teste B: identificador UUID devolve 1 candidato filtrando por id", () => {
    const candidatos = buildQuoteIdentifierWhereCandidates("3f1c1234-5678-90ab-cdef-1234567890ab");

    expect(candidatos).toEqual([{ id: "3f1c1234-5678-90ab-cdef-1234567890ab" }]);
  });

  it("Teste C: identificador numerico acima de Number.MAX_SAFE_INTEGER devolve SOMENTE o candidato de externalQuoteId", () => {
    const identifier = "99999999999999999999";

    const candidatos = buildQuoteIdentifierWhereCandidates(identifier);

    expect(candidatos).toEqual([{ externalQuoteId: BigInt(identifier) }]);
  });
});

describe("findQuoteByIdentifierBasic", () => {
  it("Teste D: devolve o registro encontrado no segundo candidato, chamando o duplo 2x na ordem dos candidatos", async () => {
    const registro = { id: "uuid-1", externalQuoteId: null, internalNumber: 22764 } as any;
    const findFirst = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(registro);
    const prisma = { quote: { findFirst } };

    const resultado = await findQuoteByIdentifierBasic(prisma, "22764");

    expect(resultado).toEqual(registro);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenNthCalledWith(1, { where: { externalQuoteId: 22764n } });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: { internalNumber: 22764 } });
  });

  it("Teste E: devolve null quando nenhum candidato casa", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { quote: { findFirst } };

    const resultado = await findQuoteByIdentifierBasic(prisma, "22764");

    expect(resultado).toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
