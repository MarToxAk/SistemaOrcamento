// Parser do XML da NFS-e no padrao nacional NBS (sucessor do ABRASF/iiBrasil,
// descontinuado pela prefeitura de Ilhabela). A nota agora e emitida manualmente
// fora do sistema e o XML assinado e anexado aqui — este parser so le os campos
// necessarios para preencher os registros locais, nao valida a assinatura.
export interface ParsedNfse {
  numeroNfse: string | null;
  chaveAcesso: string | null;
  dataEmissao: Date | null;
  valorServico: number | null;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return match ? match[1].trim() : null;
}

export function parseNfseXml(xml: string): ParsedNfse {
  const numeroNfse = extractTag(xml, "nNFSe");

  const idMatch = xml.match(/<infNFSe\s+[^>]*Id="([^"]+)"/);
  const chaveAcesso = idMatch ? idMatch[1] : null;

  const dhRaw = extractTag(xml, "dhProc") ?? extractTag(xml, "dhEmi");
  const dataEmissao = dhRaw ? new Date(dhRaw) : null;

  const vServRaw = extractTag(xml, "vServ") ?? extractTag(xml, "vLiq");
  const valorServico = vServRaw ? Number(vServRaw.replace(",", ".")) : null;

  return {
    numeroNfse,
    chaveAcesso,
    dataEmissao: dataEmissao && !Number.isNaN(dataEmissao.getTime()) ? dataEmissao : null,
    valorServico: valorServico != null && !Number.isNaN(valorServico) ? valorServico : null,
  };
}
