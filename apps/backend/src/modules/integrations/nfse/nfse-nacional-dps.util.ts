import { SignedXml } from "xml-crypto";

// ---------------------------------------------------------------------------
// Construcao e assinatura da DPS (Declaracao de Prestacao de Servico) para o
// Sistema Nacional NFS-e (ADN/Sefin Nacional). Layout e valores calibrados
// contra o ambiente de producao real em 26/08/2026 (nota #2, cancelada em
// seguida por ser teste tecnico). Ver memoria "nfse-nacional-sefin-integracao"
// para o historico de erros de validacao resolvidos.
// ---------------------------------------------------------------------------

export type ServicoNfseNacional = {
  cTribNac: string;
  cNBS: string;
  descricaoPadrao: string;
};

// Catalogo dos servicos com codigo de tributacao nacional e NBS ja validados
// em producao para o CNPJ da empresa em Ilhabela-SP (municipio 3520400).
export const SERVICOS_NFSE_NACIONAL: Record<string, ServicoNfseNacional> = {
  "130501": {
    cTribNac: "130501",
    cNBS: "121012100",
    descricaoPadrao: "Composicao grafica, confeccao de impressos graficos",
  },
  "140801": {
    cTribNac: "140801",
    cNBS: "121012200",
    descricaoPadrao: "Encadernacao e acabamento grafico",
  },
  "240101": {
    cTribNac: "240101",
    cNBS: "126060000",
    descricaoPadrao: "Confeccao de carimbos, placas e sinalizacao visual",
  },
};

export type TomadorDps = {
  cpf?: string;
  cnpj?: string;
  nome: string;
  // Endereco opcional — quando informado, deve vir direto do cadastro do
  // cliente (Athos), nunca redigitado, para evitar divergencia com o
  // registro oficial do tomador.
  endereco?: {
    logradouro: string;
    numero: string;
    bairro: string;
    cep: string;
    codigoMunicipio: string;
  };
};

export type BuildDpsParams = {
  ambiente: "producao" | "homologacao";
  cnpjPrestador: string;
  codigoMunicipio: string;
  codigoServico: keyof typeof SERVICOS_NFSE_NACIONAL;
  descricaoServico?: string;
  valorServico: number;
  tomador: TomadorDps;
  serie?: string;
  numeroDps: number;
  // Grupo IBS/CBS da reforma tributaria — opcional (nao exigido ainda pelo
  // convenio de Ilhabela em 27/08/2026; a nota real emitida pelo portal do
  // governo tambem nao o inclui). Diferente do modelo antigo (iiBrasil), o
  // layout nacional NAO permite o emitente informar uma aliquota de CBS/IBS:
  // o emitente so declara a classificacao tributaria (CST/cClassTrib) e o
  // Sistema Nacional calcula os valores a partir da parametrizacao do
  // municipio. Por isso este campo e apenas um interruptor (incluir o grupo
  // ou nao), nao uma aliquota configuravel.
  incluirIbsCbs?: boolean;
};

export type DpsBuilt = {
  idDps: string;
  xmlAssinado: string;
};

function pad(value: string | number, length: number): string {
  return String(value).padStart(length, "0");
}

// Margem de seguranca contra clock drift entre este servidor e o servidor
// do Sistema Nacional NFS-e: dhEmi precisa ser sempre anterior a
// dataHoraProcessamento (regra de negocio E0008), senao a DPS e rejeitada.
const CLOCK_DRIFT_MARGIN_MS = 5 * 60 * 1000;

function dataHoraEmissao(): string {
  const agora = new Date();
  const comMargem = new Date(agora.getTime() - 3 * 3600 * 1000 - CLOCK_DRIFT_MARGIN_MS);
  return `${comMargem.toISOString().slice(0, 19)}-03:00`;
}

export function buildAndSignDps(
  params: BuildDpsParams,
  certPem: string,
  keyPem: string,
): DpsBuilt {
  const servico = SERVICOS_NFSE_NACIONAL[params.codigoServico];
  if (!servico) {
    throw new Error(`Codigo de servico NFS-e nao cadastrado: ${params.codigoServico}`);
  }
  if (!params.tomador.cpf && !params.tomador.cnpj) {
    throw new Error("Tomador precisa de CPF ou CNPJ.");
  }

  const tpAmb = params.ambiente === "producao" ? "1" : "2";
  const serie = params.serie ?? "00001";
  const nDPS = String(params.numeroDps);
  const tpInsc = "2"; // CNPJ do prestador
  const idDps = `DPS${params.codigoMunicipio}${tpInsc}${pad(params.cnpjPrestador, 14)}${serie}${pad(nDPS, 15)}`;

  const tomadorXml = params.tomador.cnpj
    ? `<CNPJ>${params.tomador.cnpj}</CNPJ>`
    : `<CPF>${params.tomador.cpf}</CPF>`;

  const end = params.tomador.endereco;
  const enderecoXml = end
    ? `<end><endNac><cMun>${end.codigoMunicipio}</cMun><CEP>${end.cep.replace(/\D/g, "")}</CEP></endNac>` +
      `<xLgr>${escapeXml(end.logradouro)}</xLgr><nro>${escapeXml(end.numero || "S/N")}</nro>` +
      `<xBairro>${escapeXml(end.bairro || "Centro")}</xBairro></end>`
    : "";

  const infDPS =
    `<infDPS Id="${idDps}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<dhEmi>${dataHoraEmissao()}</dhEmi>` +
    `<verAplic>1.0.0-orcamento</verAplic>` +
    `<serie>${serie}</serie>` +
    `<nDPS>${nDPS}</nDPS>` +
    `<dCompet>${new Date().toISOString().slice(0, 10)}</dCompet>` +
    `<tpEmit>1</tpEmit>` +
    `<cLocEmi>${params.codigoMunicipio}</cLocEmi>` +
    `<prest>` +
    `<CNPJ>${params.cnpjPrestador}</CNPJ>` +
    `<regTrib>` +
    `<opSimpNac>3</opSimpNac>` +
    `<regApTribSN>1</regApTribSN>` +
    `<regEspTrib>0</regEspTrib>` +
    `</regTrib>` +
    `</prest>` +
    `<toma>` +
    tomadorXml +
    `<xNome>${escapeXml(params.tomador.nome)}</xNome>` +
    enderecoXml +
    `</toma>` +
    `<serv>` +
    `<locPrest><cLocPrestacao>${params.codigoMunicipio}</cLocPrestacao></locPrest>` +
    `<cServ>` +
    `<cTribNac>${servico.cTribNac}</cTribNac>` +
    `<xDescServ>${escapeXml(params.descricaoServico ?? servico.descricaoPadrao)}</xDescServ>` +
    `<cNBS>${servico.cNBS}</cNBS>` +
    `</cServ>` +
    `</serv>` +
    `<valores>` +
    `<vServPrest><vServ>${params.valorServico.toFixed(2)}</vServ></vServPrest>` +
    `<trib>` +
    `<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>` +
    `<tribFed><piscofins><CST>00</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>` +
    // <totTrib> e obrigatorio (grupo <xs:choice> em TCTribTotal, XSD v1.01) e
    // NAO aceita <indTotTrib> para prestador ME/EPP (opSimpNac=3, hardcoded
    // acima) — regra E0712: "Para ME/EPP o indicador de informacao de valor
    // total de tributos nao pode ser informado". O XSD reserva justamente
    // <pTotTribSN> (percentual aproximado da aliquota do Simples Nacional)
    // para este regime; "0" nao calcula uma aliquota efetiva mas satisfaz o
    // schema (TSDec2V2 aceita "0") sem violar a regra de negocio.
    `<totTrib><pTotTribSN>0</pTotTribSN></totTrib>` +
    `</trib>` +
    `</valores>` +
    (params.incluirIbsCbs ? buildIbsCbsXml() : "") +
    `</infDPS>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">${infDPS}</DPS>`;

  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: `//*[local-name(.)='infDPS']`,
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    uri: `#${idDps}`,
  });
  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='infDPS']`, action: "after" },
  });

  return { idDps, xmlAssinado: sig.getSignedXml() };
}

export type BuildCancelamentoParams = {
  ambiente: "producao" | "homologacao";
  cnpjAutor: string;
  chaveAcesso: string;
  motivo: string;
};

// Codigo do evento de cancelamento (e101101). O identificador do pedido de
// registro de evento NAO inclui mais o numero sequencial (nPedRegEvento foi
// removido do layout na atualizacao de 27/12/2025) — Id = "PRE" + chave(50) +
// tipoEvento(6).
const TIPO_EVENTO_CANCELAMENTO = "101101";

export function buildAndSignCancelamento(
  params: BuildCancelamentoParams,
  certPem: string,
  keyPem: string,
): string {
  const tpAmb = params.ambiente === "producao" ? "1" : "2";
  const id = `PRE${params.chaveAcesso}${TIPO_EVENTO_CANCELAMENTO}`;

  const infPedReg =
    `<infPedReg Id="${id}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<verAplic>1.0.0-orcamento</verAplic>` +
    `<dhEvento>${dataHoraEmissao()}</dhEvento>` +
    `<CNPJAutor>${params.cnpjAutor}</CNPJAutor>` +
    `<chNFSe>${params.chaveAcesso}</chNFSe>` +
    `<e101101>` +
    `<xDesc>Cancelamento de NFS-e</xDesc>` +
    `<cMotivo>1</cMotivo>` +
    `<xMotivo>${escapeXml(params.motivo)}</xMotivo>` +
    `</e101101>` +
    `</infPedReg>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infPedReg}</pedRegEvento>`;

  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: `//*[local-name(.)='infPedReg']`,
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    uri: `#${id}`,
  });
  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='infPedReg']`, action: "after" },
  });

  return sig.getSignedXml();
}

// Campos do grupo IBSCBS validados contra a API real (producaorestrita e
// producao) durante a calibracao desta integracao: passaram por toda a
// validacao de schema e regra de negocio ate o ponto testado. Classificacao
// "CST 000 / cClassTrib 000001" = tributacao integral (caso padrao, sem
// reducoes/isencoes) — e o Sistema Nacional que calcula o valor do CBS/IBS
// a partir disso, nao o emitente.
function buildIbsCbsXml(): string {
  return (
    `<IBSCBS>` +
    `<finNFSe>0</finNFSe>` +
    `<indFinal>1</indFinal>` +
    `<cIndOp>010101</cIndOp>` +
    `<indDest>0</indDest>` +
    `<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores>` +
    `</IBSCBS>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
