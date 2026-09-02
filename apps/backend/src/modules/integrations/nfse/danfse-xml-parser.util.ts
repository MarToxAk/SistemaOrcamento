// Extrai os campos necessarios para renderizar o DANFSe (documento auxiliar
// em PDF) a partir do XML da NFS-e retornado pelo Sistema Nacional. A API do
// governo que gerava esse PDF foi descontinuada em 03/08/2026 (NT 008/2026 —
// DANFSe 2.0); agora cada sistema gera o proprio PDF a partir do XML.
export type DanfseFields = {
  chaveAcesso: string | null;
  numeroNfse: string | null;
  dataEmissao: Date | null;
  municipio: string | null;
  prestador: {
    cnpj: string | null;
    nome: string | null;
    endereco: string | null;
  };
  tomador: {
    documento: string | null;
    nome: string | null;
  };
  servico: {
    descricao: string | null;
    codigoTributacaoNacional: string | null;
  };
  valores: {
    servico: number | null;
    liquido: number | null;
    aliquotaIssqn: number | null;
  };
};

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return match ? match[1].trim() : null;
}

function toNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export function parseDanfseFields(xml: string): DanfseFields {
  // Id = "NFS" + chave de acesso (50 digitos, TSChaveNFSe) — exibir so a chave.
  const idMatch = xml.match(/<infNFSe\s+[^>]*Id="([^"]+)"/);
  const chaveAcesso = idMatch ? idMatch[1].replace(/^NFS/, "") : null;

  const dhRaw = extractTag(xml, "dhProc") ?? extractTag(xml, "dhEmi");
  const dataEmissao = dhRaw ? new Date(dhRaw) : null;

  // Bloco <emit> — dados do prestador conforme retornados pelo Sistema
  // Nacional (fonte da verdade fiscal; nao usar variaveis de configuracao
  // separadas para nao arriscar divergencia com o documento emitido).
  const emitMatch = xml.match(/<emit>([\s\S]*?)<\/emit>/);
  const emitXml = emitMatch ? emitMatch[1] : "";
  const enderMatch = emitXml.match(/<enderNac>([\s\S]*?)<\/enderNac>/);
  const enderXml = enderMatch ? enderMatch[1] : "";
  const xLgr = extractTag(enderXml, "xLgr");
  const nro = extractTag(enderXml, "nro");
  const xBairro = extractTag(enderXml, "xBairro");
  const uf = extractTag(enderXml, "UF");
  const cep = extractTag(enderXml, "CEP");
  const endereco = xLgr
    ? `${xLgr}, ${nro ?? "s/n"} - ${xBairro ?? ""}${uf ? ` - ${uf}` : ""}${cep ? `, CEP ${cep}` : ""}`
    : null;

  // Bloco <toma> dentro de infDPS — dados do tomador.
  const tomaMatch = xml.match(/<toma>([\s\S]*?)<\/toma>/);
  const tomaXml = tomaMatch ? tomaMatch[1] : "";
  const tomadorDocumento = extractTag(tomaXml, "CNPJ") ?? extractTag(tomaXml, "CPF");

  return {
    chaveAcesso,
    numeroNfse: extractTag(xml, "nNFSe"),
    dataEmissao: dataEmissao && !Number.isNaN(dataEmissao.getTime()) ? dataEmissao : null,
    municipio: extractTag(xml, "xLocPrestacao") ?? extractTag(xml, "xLocEmi"),
    prestador: {
      cnpj: extractTag(emitXml, "CNPJ"),
      nome: extractTag(emitXml, "xNome"),
      endereco,
    },
    tomador: {
      documento: tomadorDocumento,
      nome: extractTag(tomaXml, "xNome"),
    },
    servico: {
      descricao: extractTag(xml, "xDescServ") ?? extractTag(xml, "xTribNac"),
      codigoTributacaoNacional: extractTag(xml, "cTribNac"),
    },
    valores: {
      servico: toNumber(extractTag(xml, "vServ")),
      liquido: toNumber(extractTag(xml, "vLiq")),
      aliquotaIssqn: toNumber(extractTag(xml, "pAliq")),
    },
  };
}
