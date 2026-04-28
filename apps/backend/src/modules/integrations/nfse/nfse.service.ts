import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);

  private readonly CNPJ_PRESTADOR = "62391927000157";
  private readonly INSCRICAO_MUNICIPAL = "13788";
  private readonly CODIGO_MUNICIPIO = "3520400";
  private readonly ITEM_LISTA_SERVICO = "24.01";
  private readonly CODIGO_TRIBUTACAO = "240101";
  private readonly ALIQUOTA_ISS = "3.73";
  private readonly SERIE_RPS = "A";

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private isProduction(): boolean {
    return (this.config.get<string>("NODE_ENV") ?? "development") === "production";
  }

  private getToken(): string {
    return this.isProduction()
      ? (this.config.get<string>("NFSE_TOKEN") ?? "FT8HZYW6T6HQDCFRP+/2LLUOIPWAHYDUF5TCYUNRELW=")
      : "TLXX4JN38KXTRNSEAJYYEA==";
  }

  private getSoapUrl(): string {
    return this.isProduction()
      ? "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps"
      : "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/homologacao/rps";
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private buildCabecalho(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02"><versaoDados>2.02</versaoDados></cabecalho>`;
  }

  private buildRpsXml(input: {
    numero: number;
    dataEmissao: string;
    valorServicos: string;
    discriminacao: string;
    tomadorCnpj?: string;
    tomadorCpf?: string;
    tomadorNome?: string;
  }): string {
    const tomadorXml = input.tomadorCnpj || input.tomadorCpf
      ? `<Tomador>
        <IdentificacaoTomador>
          <CpfCnpj>
            ${input.tomadorCnpj ? `<Cnpj>${input.tomadorCnpj}</Cnpj>` : `<Cpf>${input.tomadorCpf}</Cpf>`}
          </CpfCnpj>
        </IdentificacaoTomador>
        ${input.tomadorNome ? `<RazaoSocial>${this.escapeXml(input.tomadorNome).slice(0, 115)}</RazaoSocial>` : ""}
      </Tomador>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <RPS>
    <InfDeclaracaoPrestacaoServico>
      <Rps>
        <IdentificacaoRps>
          <Numero>${input.numero}</Numero>
          <Serie>${this.SERIE_RPS}</Serie>
          <Tipo>1</Tipo>
        </IdentificacaoRps>
        <DataEmissao>${input.dataEmissao}</DataEmissao>
        <Status>1</Status>
      </Rps>
      <Competencia>${input.dataEmissao}</Competencia>
      <Servico>
        <Valores>
          <ValorServicos>${input.valorServicos}</ValorServicos>
          <IssRetido>2</IssRetido>
          <Aliquota>${this.ALIQUOTA_ISS}</Aliquota>
        </Valores>
        <ItemListaServico>${this.ITEM_LISTA_SERVICO}</ItemListaServico>
        <CodigoTributacaoMunicipio>${this.CODIGO_TRIBUTACAO}</CodigoTributacaoMunicipio>
        <Discriminacao>${this.escapeXml(input.discriminacao).slice(0, 2000)}</Discriminacao>
        <CodigoMunicipio>${this.CODIGO_MUNICIPIO}</CodigoMunicipio>
      </Servico>
      <Prestador>
        <CpfCnpj><Cnpj>${this.CNPJ_PRESTADOR}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${this.INSCRICAO_MUNICIPAL}</InscricaoMunicipal>
      </Prestador>
      ${tomadorXml}
      <OptanteSimplesNacional>2</OptanteSimplesNacional>
      <IncentivoFiscal>2</IncentivoFiscal>
    </InfDeclaracaoPrestacaoServico>
  </RPS>
</GerarNfseEnvio>`;
  }

  private buildSoapEnvelope(cabecalho: string, dados: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:e="http://rps.iibr.com.br/">
  <soapenv:Header>
    <e:cnpjRemetente>${this.CNPJ_PRESTADOR}</e:cnpjRemetente>
    <e:token>${this.getToken()}</e:token>
  </soapenv:Header>
  <soapenv:Body>
    <e:GerarNfse>
      <nfseCabecMsg><![CDATA[${cabecalho}]]></nfseCabecMsg>
      <nfseDadosMsg><![CDATA[${dados}]]></nfseDadosMsg>
    </e:GerarNfse>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private parseNumeroNfse(xml: string): string | null {
    const match = xml.match(/<Numero>(\d+)<\/Numero>/);
    return match?.[1] ?? null;
  }

  private parseCodigoVerificacao(xml: string): string | null {
    const match = xml.match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/);
    return match?.[1]?.trim() ?? null;
  }

  private parseErro(xml: string): string | null {
    // Tenta capturar mensagem de erro do padrão ABRASF
    const match = xml.match(/<Mensagem>([^<]+)<\/Mensagem>/) ?? xml.match(/<MensagemRetorno>([^<]+)<\/MensagemRetorno>/);
    return match?.[1]?.trim() ?? null;
  }

  async emitir(quoteId: string) {
    const quote = await (this.prisma as any).quote.findUnique({
      where: { id: quoteId },
      include: { customer: true, items: true },
    });

    if (!quote) throw new BadRequestException("Orçamento não encontrado");

    if (quote.status !== "APROVADO") {
      throw new BadRequestException("A NFS-e só pode ser emitida para orçamentos aprovados (pagos).");
    }

    if (quote.nfseNumero) {
      return {
        jaEmitida: true,
        numero: quote.nfseNumero,
        codigoVerificacao: quote.nfseCodigoVerificacao,
        emitidaEm: quote.nfseEmitidaEm,
      };
    }

    const dataEmissao = new Date().toISOString().slice(0, 10);
    const valorServicos = Number(quote.total).toFixed(2);

    const itensDesc = (quote.items ?? [])
      .map((item: any, i: number) =>
        `${i + 1}. ${item.shortDescription || item.description} (${Number(item.quantity)}x) - R$ ${Number(item.finalPrice).toFixed(2)}`)
      .join("; ");
    const discriminacao = itensDesc
      ? `Orcamento #${quote.internalNumber}: ${itensDesc}`
      : `Orcamento #${quote.internalNumber}`;

    // Resolve documento do tomador
    const doc = (quote.customer as any)?.document?.replace(/\D/g, "") ?? "";
    const tomadorCnpj = doc.length === 14 ? doc : undefined;
    const tomadorCpf = !tomadorCnpj && doc.length === 11 ? doc : undefined;
    const tomadorNome = quote.customer?.fullName ?? undefined;

    const cabecalho = this.buildCabecalho();
    const dados = this.buildRpsXml({
      numero: Number(quote.internalNumber),
      dataEmissao,
      valorServicos,
      discriminacao,
      tomadorCnpj,
      tomadorCpf,
      tomadorNome,
    });
    const envelope = this.buildSoapEnvelope(cabecalho, dados);

    this.logger.log(`Emitindo NFS-e para orçamento #${quote.internalNumber} (${this.isProduction() ? "produção" : "homologação"})`);

    let responseXml: string;
    try {
      const resp = await axios.post(this.getSoapUrl(), envelope, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "GerarNfse",
        },
        timeout: 30_000,
      });
      responseXml = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message;
      this.logger.error(`Falha SOAP NFS-e: ${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Falha na comunicação com o serviço NFS-e da prefeitura.");
    }

    this.logger.debug(`Resposta NFS-e: ${responseXml.slice(0, 500)}`);

    const erro = this.parseErro(responseXml);
    if (erro && !this.parseNumeroNfse(responseXml)) {
      throw new BadRequestException(`Erro na emissão da NFS-e: ${erro}`);
    }

    const numeroNfse = this.parseNumeroNfse(responseXml);
    const codigoVerificacao = this.parseCodigoVerificacao(responseXml);

    if (!numeroNfse) {
      this.logger.error(`NFS-e sem número. Response: ${responseXml}`);
      throw new InternalServerErrorException("NFS-e processada mas número não retornado. Verifique no painel da prefeitura.");
    }

    await (this.prisma as any).quote.update({
      where: { id: quoteId },
      data: {
        nfseNumero: numeroNfse,
        nfseCodigoVerificacao: codigoVerificacao ?? null,
        nfseEmitidaEm: new Date(),
      },
    });

    this.logger.log(`NFS-e #${numeroNfse} emitida para orçamento #${quote.internalNumber}`);

    return {
      jaEmitida: false,
      numero: numeroNfse,
      codigoVerificacao,
      emitidaEm: new Date().toISOString(),
    };
  }

  async consultar(quoteId: string) {
    const quote = await (this.prisma as any).quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new BadRequestException("Orçamento não encontrado");

    return {
      emitida: !!quote.nfseNumero,
      numero: quote.nfseNumero ?? null,
      codigoVerificacao: quote.nfseCodigoVerificacao ?? null,
      emitidaEm: quote.nfseEmitidaEm ?? null,
      podeEmitir: quote.status === "APROVADO" && !quote.nfseNumero,
    };
  }
}
