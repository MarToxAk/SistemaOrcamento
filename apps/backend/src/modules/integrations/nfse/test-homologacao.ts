import axios from "axios";
import { createHash } from "crypto";
import * as soap from "soap";

/**
 * Script de teste — NFS-e Produção iiBrasil (Ilhabela)
 *
 * Modos de teste (altere MODO_TOMADOR):
 *   "cpf"         → CPF real com endereço (primeiro teste que funcionou)
 *   "consumidor"  → <TomadorServico><RazaoSocial>CONSUMIDOR FINAL</RazaoSocial></TomadorServico>
 *   "sem-tomador" → omite TomadorServico completamente (XSD: minOccurs=0)
 */
const MODO_TOMADOR: "cpf" | "consumidor" | "sem-tomador" = "cpf";

const WSDL_URL  = "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps?wsdl";
const ENDPOINT  = "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps";
const AUX_URL   = "https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS";
const TOKEN     = "6SQRI36R2WUNKHDW+MWMEW==";
const CNPJ      = "62391927000157";
const INSCRICAO = "13788";
const DATA      = new Date().toISOString().slice(0, 10);

function computeIntegridade(rpsXml: string): string {
  let cleaned = rpsXml.replace(/[^\x20-\x7E]+/g, "");
  cleaned = cleaned.replace(/[ ]+/g, "");
  return createHash("sha512").update(cleaned + TOKEN, "utf8").digest("hex");
}

function buildCabecalho(): string {
  return `<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.04">
    <versaoDados>2.04</versaoDados>
</cabecalho>`;
}

function buildTomador(): string {
  if (MODO_TOMADOR === "sem-tomador") return "";

  if (MODO_TOMADOR === "consumidor") {
    return `\t\t\t<TomadorServico>
\t\t\t\t<RazaoSocial>CONSUMIDOR FINAL</RazaoSocial>
\t\t\t</TomadorServico>`;
  }

  // cpf — mesmo do teste original que funcionou
  return `\t\t\t<TomadorServico>
\t\t\t\t<IdentificacaoTomador>
\t\t\t\t\t<CpfCnpj>
\t\t\t\t\t\t<Cpf>46705076801</Cpf>
\t\t\t\t\t</CpfCnpj>
\t\t\t\t</IdentificacaoTomador>
\t\t\t\t<RazaoSocial>jose dos santos junior</RazaoSocial>
\t\t\t\t<Endereco>
\t\t\t\t\t<Endereco>Rua Dr. Carvalho</Endereco>
\t\t\t\t\t<Numero>2</Numero>
\t\t\t\t\t<Bairro>Centro</Bairro>
\t\t\t\t\t<CodigoMunicipio>3520400</CodigoMunicipio>
\t\t\t\t\t<Uf>SP</Uf>
\t\t\t\t\t<Cep>11630000</Cep>
\t\t\t\t</Endereco>
\t\t\t</TomadorServico>`;
}

function buildDados(numero: number, serie: string): string {
  const tomador = buildTomador();
  const tomadorLine = tomador ? "\n" + tomador : "";

  const rpsXml = `
\t<Rps>
\t\t<InfDeclaracaoPrestacaoServico Id="rps${numero}">
\t\t\t<Rps>
\t\t\t\t<IdentificacaoRps>
\t\t\t\t\t<Numero>${numero}</Numero>
\t\t\t\t\t<Serie>${serie}</Serie>
\t\t\t\t\t<Tipo>1</Tipo>
\t\t\t\t</IdentificacaoRps>
\t\t\t\t<DataEmissao>${DATA}</DataEmissao>
\t\t\t\t<Status>1</Status>
\t\t\t</Rps>
\t\t\t<Competencia>${DATA}</Competencia>
\t\t\t<Servico>
\t\t\t\t<Valores>
\t\t\t\t\t<ValorServicos>30.00</ValorServicos>
\t\t\t\t\t<ValorDeducoes>0.00</ValorDeducoes>
\t\t\t\t\t<ValorPis>0.00</ValorPis>
\t\t\t\t\t<ValorCofins>0.00</ValorCofins>
\t\t\t\t\t<ValorInss>0.00</ValorInss>
\t\t\t\t\t<ValorIr>0.00</ValorIr>
\t\t\t\t\t<ValorCsll>0.00</ValorCsll>
\t\t\t\t\t<ValorCbs>0.27</ValorCbs>
\t\t\t\t\t<AliquotaCbs>0.90</AliquotaCbs>
\t\t\t\t\t<ValorIbs>0.03</ValorIbs>
\t\t\t\t\t<AliquotaIbs>0.10</AliquotaIbs>
\t\t\t\t\t<OutrasRetencoes>0.00</OutrasRetencoes>
\t\t\t\t\t<Aliquota>3.73</Aliquota>
\t\t\t\t\t<DescontoIncondicionado>0.00</DescontoIncondicionado>
\t\t\t\t\t<DescontoCondicionado>0.00</DescontoCondicionado>
\t\t\t\t</Valores>
\t\t\t\t<IssRetido>2</IssRetido>
\t\t\t\t<ResponsavelRetencao>1</ResponsavelRetencao>
\t\t\t\t<ItemListaServico>24.01</ItemListaServico>
\t\t\t\t<CodigoTributacaoNacional>240101</CodigoTributacaoNacional>
\t\t\t\t<Discriminacao>TESTE MODO ${MODO_TOMADOR.toUpperCase()} RPS ${numero}</Discriminacao>
\t\t\t\t<CodigoMunicipio>3520400</CodigoMunicipio>
\t\t\t</Servico>
\t\t\t<Prestador>
\t\t\t\t<CpfCnpj>
\t\t\t\t\t<Cnpj>${CNPJ}</Cnpj>
\t\t\t\t</CpfCnpj>
\t\t\t\t<InscricaoMunicipal>${INSCRICAO}</InscricaoMunicipal>
\t\t\t</Prestador>${tomadorLine}
\t\t</InfDeclaracaoPrestacaoServico>
\t</Rps>`;

  const integridade = computeIntegridade(rpsXml);
  console.log(`Hash: ${integridade}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  ${rpsXml}
  <Integridade>${integridade}</Integridade>
</GerarNfseEnvio>`;
}

async function getProximoRps(): Promise<{ numero: number; serie: string }> {
  try {
    const url = `${AUX_URL}?Metodo=info_nfse&Token=${TOKEN}&CpfCnpjPrestador=${CNPJ}`;
    const resp = await axios.get(url, { timeout: 10_000 });
    const data = (resp.data?.data ?? resp.data) as Record<string, unknown>;
    const numero = Number(data.ProximoRPS ?? data.proximoRPS ?? 1);
    const serie  = String(data.SerieRPS ?? data.serieRPS ?? "RPS");
    console.log(`ProximoRPS=${numero} SerieRPS=${serie}`);
    return { numero, serie };
  } catch (err) {
    console.warn("Falha API Auxiliar, usando RPS=1/RPS:", err instanceof Error ? err.message : err);
    return { numero: 1, serie: "RPS" };
  }
}

async function main() {
  console.log(`=== Teste NFS-e — modo: ${MODO_TOMADOR} ===`);

  const { numero, serie } = await getProximoRps();
  const cabecalho = buildCabecalho();
  const dados     = buildDados(numero, serie);

  const client = await soap.createClientAsync(WSDL_URL);
  client.setEndpoint(ENDPOINT);
  client.addSoapHeader(
    { "iibr:cnpjRemetente": CNPJ, "iibr:token": TOKEN },
    "", "iibr", "http://rps.iibr.com.br/",
  );

  try {
    await new Promise<void>((resolve, reject) => {
      (client as any).GerarNfse(
        { nfseCabecMsg: cabecalho, nfseDadosMsg: dados },
        (err: any, _res: any, rawResponse: string) => {
          if (err) {
            console.error("Status HTTP:", err?.response?.status);
            console.error("Corpo:", err?.response?.data ?? err?.message);
            reject(err);
          } else {
            console.log("\n--- Resposta ---");
            console.log(rawResponse);
            resolve();
          }
        }
      );
    });
  } catch (err: any) {
    console.error("Erro:", err.message);
  }
}

main().catch(console.error);
