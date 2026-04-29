/**
 * Script de teste direto contra o ambiente de homologação do iiBrasil.
 * Não depende do banco de dados nem do NestJS.
 *
 * Uso:
 *   npx ts-node src/modules/integrations/nfse/test-homologacao.ts
 */

import axios from "axios";
import { createHash } from "crypto";

const CNPJ_PRESTADOR = "88888888888888";
const INSCRICAO_MUNICIPAL = "123456";
const CODIGO_MUNICIPIO = "3520400";
const TOKEN = "TLXX4JN38KXTRNSEAJYYEA==";
const CNPJ_TOMADOR = "55555555555555";

const SOAP_URL = "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/homologacao/rps";
const AUX_URL = "https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS";

const NUMERO_RPS = Date.now() % 999999; // número único por execução
const DATA_EMISSAO = new Date().toISOString().slice(0, 10);
const VALOR_SERVICOS = 100.0;
const DISCRIMINACAO = `Teste de homologacao NFS-e - RPS ${NUMERO_RPS}`;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCabecalho(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>`;
}

function buildInfRps(): string {
  const valorCbs = (VALOR_SERVICOS * 0.009).toFixed(2);
  const valorIbs = (VALOR_SERVICOS * 0.001).toFixed(2);

  return `<InfDeclaracaoPrestacaoServico Id="1">
    <Rps>
      <IdentificacaoRps>
        <Numero>${NUMERO_RPS}</Numero>
        <Serie>TESTE</Serie>
        <Tipo>1</Tipo>
      </IdentificacaoRps>
      <DataEmissao>${DATA_EMISSAO}</DataEmissao>
      <Status>1</Status>
    </Rps>
    <Competencia>${DATA_EMISSAO}</Competencia>
    <Servico>
      <Valores>
        <ValorServicos>${VALOR_SERVICOS.toFixed(2)}</ValorServicos>
        <ValorDeducoes>0</ValorDeducoes>
        <ValorPis>0</ValorPis>
        <ValorCofins>0</ValorCofins>
        <ValorInss>0</ValorInss>
        <ValorIr>0</ValorIr>
        <ValorCsll>0</ValorCsll>
        <ValorCbs>${valorCbs}</ValorCbs>
        <ValorIbs>${valorIbs}</ValorIbs>
        <OutrasRetencoes>0</OutrasRetencoes>
        <Aliquota>3.73</Aliquota>
        <DescontoIncondicionado>0</DescontoIncondicionado>
        <DescontoCondicionado>0</DescontoCondicionado>
      </Valores>
      <IssRetido>2</IssRetido>
      <ItemListaServico>24.01</ItemListaServico>
      <CodigoTributacaoMunicipio>240101</CodigoTributacaoMunicipio>
      <Discriminacao>${escapeXml(DISCRIMINACAO)}</Discriminacao>
      <CodigoMunicipio>${CODIGO_MUNICIPIO}</CodigoMunicipio>
    </Servico>
    <Prestador>
      <CpfCnpj><Cnpj>${CNPJ_PRESTADOR}</Cnpj></CpfCnpj>
      <InscricaoMunicipal>${INSCRICAO_MUNICIPAL}</InscricaoMunicipal>
    </Prestador>
    <TomadorServico>
      <IdentificacaoTomador>
        <CpfCnpj><Cnpj>${CNPJ_TOMADOR}</Cnpj></CpfCnpj>
      </IdentificacaoTomador>
      <AtualizaTomador>2</AtualizaTomador>
      <TomadorExterior>2</TomadorExterior>
    </TomadorServico>
    <OptanteSimplesNacional>2</OptanteSimplesNacional>
    <IncentivoFiscal>2</IncentivoFiscal>
  </InfDeclaracaoPrestacaoServico>`;
}

function buildDados(): string {
  const infXml = buildInfRps();
  const rpsXml = `<Rps>${infXml}</Rps>`;
  const integridade = createHash("sha512").update(rpsXml, "utf8").digest("hex");

  return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  ${rpsXml}
  <Integridade>${integridade}</Integridade>
</GerarNfseEnvio>`;
}

function buildEnvelope(cabecalho: string, dados: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ws="http://nfse.abrasf.org.br"
  xmlns:iibr="http://rps.iibr.com.br/">
  <soapenv:Header>
    <iibr:cnpjRemetente>${CNPJ_PRESTADOR}</iibr:cnpjRemetente>
    <iibr:token>${TOKEN}</iibr:token>
  </soapenv:Header>
  <soapenv:Body>
    <ws:GerarNfseRequest>
      <nfseCabecMsg><![CDATA[${cabecalho}]]></nfseCabecMsg>
      <nfseDadosMsg><![CDATA[${dados}]]></nfseDadosMsg>
    </ws:GerarNfseRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function testarAuxiliar(numero: string) {
  console.log(`\n--- API Auxiliar: consultando NFS-e #${numero} ---`);
  try {
    const params = new URLSearchParams({ cnpj: CNPJ_PRESTADOR, token: TOKEN, numero });
    const url = `${AUX_URL}?${params.toString()}`;
    console.log(`GET ${url}`);
    const resp = await axios.get(url, { timeout: 15_000 });
    console.log("Resposta:", JSON.stringify(resp.data, null, 2));
  } catch (err: any) {
    console.error("Falha API Auxiliar:", err?.response?.data ?? err?.message);
  }
}

async function main() {
  console.log("=== Teste NFS-e Homologação iiBrasil ===");
  console.log(`RPS número: ${NUMERO_RPS}`);
  console.log(`Data emissão: ${DATA_EMISSAO}`);
  console.log(`Valor: R$ ${VALOR_SERVICOS.toFixed(2)}`);
  console.log(`SOAP URL: ${SOAP_URL}`);

  const cabecalho = buildCabecalho();
  const dados = buildDados();
  const envelope = buildEnvelope(cabecalho, dados);

  console.log("\n--- Enviando para SOAP ---");

  try {
    const resp = await axios.post(SOAP_URL, envelope, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://nfse.abrasf.org.br/GerarNfse",
      },
      timeout: 30_000,
      validateStatus: () => true,
      responseType: "text",
    });

    console.log(`Status HTTP: ${resp.status}`);
    if (resp.status >= 400) {
      const body = typeof resp.data === "string" ? resp.data.slice(0, 2000) : JSON.stringify(resp.data);
      console.error(`Resposta de erro (${resp.status}):\n${body}`);
      process.exit(1);
    }

    const xml: string = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    console.log("\nResposta SOAP (primeiros 1500 chars):");
    console.log(xml.slice(0, 1500));

    const numeroNfse = xml.match(/<NumeroNfse>(\d+)<\/NumeroNfse>/)?.[1];
    const codigoVerificacao = xml.match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/)?.[1]?.trim();
    const linkRaw = xml.match(/<LinkNfse>([^<]+)<\/LinkNfse>/)?.[1]?.trim();
    const link = linkRaw ? (() => { try { return Buffer.from(linkRaw, "base64").toString("utf8"); } catch { return linkRaw; } })() : null;
    const erro = xml.match(/<Mensagem>([^<]+)<\/Mensagem>/)?.[1]?.trim();

    if (erro && !numeroNfse) {
      console.error(`\nErro retornado: ${erro}`);
      process.exit(1);
    }

    console.log("\n=== Resultado ===");
    console.log(`NFS-e número  : ${numeroNfse ?? "não retornado"}`);
    console.log(`Cod. verificação: ${codigoVerificacao ?? "não retornado"}`);
    console.log(`Link          : ${link ?? "não retornado"}`);

    if (numeroNfse) {
      await testarAuxiliar(numeroNfse);
    }
  } catch (err: any) {
    console.error("Falha SOAP:");
    console.error("  message   :", err?.message);
    console.error("  code      :", err?.code);
    console.error("  status    :", err?.response?.status);
    const body = err?.response?.data;
    console.error("  response  :", typeof body === "string" ? body.slice(0, 2000) : JSON.stringify(body));
    process.exit(1);
  }
}

main();
