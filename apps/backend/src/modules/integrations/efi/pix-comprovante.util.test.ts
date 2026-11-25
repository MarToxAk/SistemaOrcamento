/**
 * Fase 54 (plano 54-03): texto da nota privada do comprovante PIX e sanitizacao de texto livre.
 */
import {
  DadosComprovantePix,
  formatarBRL,
  formatarDataHoraSaoPaulo,
  montarTextoComprovante,
  nomeArquivoComprovante,
  sanitizarTextoLivre,
} from "./pix-comprovante.util";

const E2E = "E1803615022211340s08793XPJ";

const base: DadosComprovantePix = {
  numeroOrcamento: "26809",
  valorPago: 164.35,
  desconto: 8.65,
  totalOrcamento: 173,
  totalPagoAcumulado: 164.35,
  pendente: 0,
  quitado: true,
  e2eId: E2E,
  txid: "txid26809abcdef",
  horario: "2026-11-25T14:40:00.000Z",
};

const agoraFixo = () => new Date("2026-01-02T15:30:00.000Z");

describe("formatarBRL", () => {
  it("usa separadores pt-BR com espaco comum", () => {
    expect(formatarBRL(1234.5)).toBe("R$ 1.234,50");
    expect(formatarBRL(173)).toBe("R$ 173,00");
  });
});

describe("formatarDataHoraSaoPaulo", () => {
  it("formata DD/MM/AAAA HH:mm em America/Sao_Paulo", () => {
    expect(formatarDataHoraSaoPaulo(new Date("2026-11-25T14:40:00.000Z"))).toBe("25/11/2026 11:40");
  });
});

describe("montarTextoComprovante", () => {
  it("contem todos os campos minimos da D-04 para o orcamento #26809", () => {
    const texto = montarTextoComprovante(base, agoraFixo);

    expect(texto.split("\n")[0]).toBe("Pagamento PIX confirmado - Orcamento #26809");
    expect(texto).toContain("164,35");
    expect(texto).toContain("8,65");
    expect(texto).toContain("173,00");
    expect(texto).toContain(E2E);
    expect(texto).toContain("txid26809abcdef");
    expect(texto).toContain("25/11/2026 11:40");
  });

  it("omite a linha de desconto quando desconto e zero", () => {
    const semDesconto = montarTextoComprovante({ ...base, desconto: 0 }, agoraFixo);
    expect(semDesconto.toLowerCase()).not.toContain("desconto");

    const comDesconto = montarTextoComprovante(base, agoraFixo);
    expect(comDesconto.toLowerCase()).toContain("desconto");
  });

  it("descreve pagamento integral quando quitado", () => {
    const texto = montarTextoComprovante(base, agoraFixo).toLowerCase();
    expect(texto).toContain("integral");
  });

  it("descreve pagamento parcial com o valor pendente quando nao quitado", () => {
    const texto = montarTextoComprovante(
      { ...base, quitado: false, valorPago: 50, desconto: 0, totalPagoAcumulado: 50, pendente: 123 },
      agoraFixo,
    );
    expect(texto.toLowerCase()).toContain("parcial");
    expect(texto).toContain("R$ 123,00");
  });

  it("inclui a linha do pagador quando o webhook trouxe nome e documento", () => {
    const texto = montarTextoComprovante(
      { ...base, pagadorNome: "Maria Silva", pagadorDocumento: "***.123.456-**" },
      agoraFixo,
    );
    expect(texto).toContain("Pagador: Maria Silva");
    expect(texto).toContain("\u2022\u2022\u2022.123.456-\u2022\u2022");
  });

  it("omite a linha do pagador quando nao ha dados", () => {
    const texto = montarTextoComprovante(base, agoraFixo);
    expect(texto).not.toContain("Pagador");
    expect(texto).not.toContain("Mensagem do pagador");
  });

  it("sanitiza texto malicioso de infoPagador e nome", () => {
    const texto = montarTextoComprovante(
      {
        ...base,
        pagadorNome: "Joao\nAdmin <b>x</b>",
        infoPagador: "<script>x</script> **bold** [a](http://evil)",
      },
      agoraFixo,
    );
    expect(texto).not.toContain("<");
    expect(texto).not.toContain(">");
    expect(texto).not.toContain("**");
    expect(texto).not.toContain("http");
    expect(texto).not.toContain("](");
    // o nome com quebra de linha nao cria linha extra forjada
    expect(texto.split("\n").filter((l) => l.startsWith("Admin"))).toHaveLength(0);
  });

  it("cai para a hora atual injetada quando o horario e ausente ou invalido", () => {
    const esperado = formatarDataHoraSaoPaulo(agoraFixo());
    expect(montarTextoComprovante({ ...base, horario: undefined }, agoraFixo)).toContain(esperado);
    expect(montarTextoComprovante({ ...base, horario: "nao-e-data" }, agoraFixo)).toContain(esperado);
    expect(montarTextoComprovante({ ...base, horario: null }, agoraFixo)).toContain(esperado);
  });
});

describe("sanitizarTextoLivre", () => {
  it("devolve string vazia para nulo/undefined", () => {
    expect(sanitizarTextoLivre(null)).toBe("");
    expect(sanitizarTextoLivre(undefined)).toBe("");
  });

  it("remove quebras de linha e caracteres de controle e colapsa espacos", () => {
    expect(sanitizarTextoLivre("a\r\nb\tc\u0000   d")).toBe("a b c d");
  });

  it("troca URLs por [link]", () => {
    expect(sanitizarTextoLivre("veja https://x.com/a?b=1 e www.evil.com ok")).toBe("veja [link] e [link] ok");
    expect(sanitizarTextoLivre("http://a.b")).toBe("[link]");
  });

  it("remove caracteres de markdown", () => {
    const saida = sanitizarTextoLivre("`a` *b* _c_ ~d~ (e) <f> #g | h");
    expect(saida).not.toMatch(/[`*_~()<>#|]/);
    expect(saida).toContain("a");
    expect(saida).toContain("h");
  });

  it("trunca em 140 caracteres por padrao e respeita max", () => {
    expect(sanitizarTextoLivre("x".repeat(500))).toHaveLength(140);
    expect(sanitizarTextoLivre("x".repeat(500), 10)).toHaveLength(10);
  });

  it("neutraliza o exemplo malicioso", () => {
    const saida = sanitizarTextoLivre("<script>x</script> **bold** [a](http://evil)");
    expect(saida).not.toMatch(/[<>*]/);
    expect(saida).not.toContain("http");
    expect(saida).not.toContain("](");
  });
});

describe("nomeArquivoComprovante", () => {
  it("devolve nome .png so com caracteres seguros", () => {
    const nome = nomeArquivoComprovante("26809", E2E);
    expect(nome).toMatch(/^[A-Za-z0-9._-]+\.png$/);
    expect(nome).toContain("26809");
  });

  it("aceita pdf e jpg e cai para png em outros valores", () => {
    expect(nomeArquivoComprovante("26809", E2E, "pdf")).toMatch(/\.pdf$/);
    expect(nomeArquivoComprovante("26809", E2E, "jpg")).toMatch(/\.jpg$/);
    expect(nomeArquivoComprovante("26809", E2E, "exe")).toMatch(/\.png$/);
  });

  it("sanitiza numero e E2E hostis", () => {
    const nome = nomeArquivoComprovante('26"809\r\n', "../../etc/passwd");
    expect(nome).toMatch(/^[A-Za-z0-9._-]+\.png$/);
    expect(nome).not.toContain("/");
  });
});
