/**
 * Contexto e formatacao do PDF institucional da proposta comercial (Fase 55, D-17..D-22, D-25).
 *
 * Modulo PURO: sem Nest, sem Prisma e sem I/O. Todo texto de valor (moeda, quantidade, datas,
 * documentos) e formatado AQUI, em TypeScript deterministico (sem Intl), antes do template: o template
 * Handlebars so imprime o que recebe, sem nenhum helper.
 *
 * O contexto e montado por LISTA BRANCA de campos (D-12): custo, preco base, ajuste, margem e o nome
 * original do Athos nao sao lidos nem copiados, mesmo que o objeto recebido os carregue (uma linha do
 * Prisma traz todos eles).
 */

import { paraCentavos, paraMilli } from "../integrations/athos/athos-orcamento-calc.util";
import { calcularLinhasProposta } from "./propostas-calc.util";

export const NAO_INFORMADO = "Não informado";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Decimal do Prisma (toString), texto ou numero. */
export type DecimalLike = string | number | { toString(): string };

/** Somente os campos que o PDF pode ler de um item (lista branca, D-12). */
export interface PropostaItemParaPdf {
  sequencia?: number;
  idproduto: number;
  nome: string;
  descricaoCurta?: string | null;
  unidade?: string | null;
  quantidade: DecimalLike;
  precoUnitario: DecimalLike;
}

/** Somente os campos que o PDF pode ler da proposta (aceita a linha do Prisma com itens). */
export interface PropostaParaPdf {
  idorcamentoAthos?: number | null;
  athosData?: string | null;
  athosHora?: string | null;
  clienteSnapshot?: unknown;
  clienteOverride?: unknown;
  numeroProcesso?: string | null;
  setorResponsavel?: string | null;
  contatoEmail?: string | null;
  contatoTelefone?: string | null;
  validadeDias: number;
  prazoEntregaDias: number;
  observacao?: string | null;
  assinanteNome?: string | null;
  assinanteCargo?: string | null;
  assinanteCpf?: string | null;
  itens: PropostaItemParaPdf[];
}

export interface BancoPdf {
  bancoNome: string;
  agencia: string;
  conta: string;
  titular: string;
  documentoTitular: string;
}

export interface EmpresaPdf {
  nome: string;
  cnpj: string;
  endereco: string;
  /** Logo ja resolvido para data URI (a rede do render e bloqueada). */
  logoDataUri?: string;
  telefones?: string;
  email?: string;
}

export interface EntradaContextoProposta {
  proposta: PropostaParaPdf;
  empresa: EmpresaPdf;
  banco: BancoPdf;
  previa: boolean;
  /** "YYYY-MM-DD"; usado como data de emissao da previa. Padrao: hoje (UTC). */
  hoje?: string;
}

export interface ContextoPropostaPdf {
  previa: boolean;
  /** idorcamento do Athos como texto; null na previa. */
  numero: string | null;
  dataEmissao: string;
  horaEmissao: string | null;
  validade: string;
  prazoEntrega: string;
  cliente: {
    razaoSocial: string;
    /** So quando preenchido e diferente da razao social. */
    nomeFantasia: string | null;
    rotuloDocumento: string;
    documento: string;
    logradouro: string;
    numero: string;
    /** Omitido quando vazio. */
    complemento: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  orgao: {
    numeroProcesso: string | null;
    setorResponsavel: string | null;
    contatoEmail: string | null;
    contatoTelefone: string | null;
    temDados: boolean;
  };
  itens: Array<{
    sequencia: number;
    codigo: string;
    nome: string;
    descricaoCurta: string | null;
    unidade: string;
    quantidade: string;
    valorUnitario: string;
    total: string;
  }>;
  totalGeral: string;
  observacao: string | null;
  banco: {
    bancoNome: string;
    agencia: string;
    conta: string;
    titular: string;
    documentoTitular: string;
  };
  assinante: { nome: string; cargo: string | null; cpf: string | null } | null;
  empresaNome: string;
  empresaCnpj: string;
  empresaEndereco: string;
  empresaTelefones: string | null;
  empresaEmail: string | null;
  empresaLogoUrl: string | null;
}

/**
 * Retrato do que o PDF OFICIAL usou na emissao (D-09, D-18). Capturado uma vez por
 * `PropostasPdfService.capturarSnapshot`, gravado na proposta no lancamento e usado por `gerarOficial`:
 * o mesmo proposta + snapshot produzem sempre o mesmo documento. `empresa.logoUrl` guarda o TEXTO da
 * configuracao (nunca o data URI, que e resolvido na hora do render).
 */
export type PdfSnapshotProposta = {
  versao: 1;
  banco: BancoPdf;
  empresa: {
    nome: string;
    cnpj: string;
    endereco: string;
    telefones?: string;
    email?: string;
    logoUrl?: string;
  };
  template: { origem: "BANCO" | "EMPACOTADO"; source: string };
};

// ---------------------------------------------------------------------------
// Formatadores pt-BR deterministicos (sem Intl)
// ---------------------------------------------------------------------------

function agruparMilhares(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 123456n -> "R$ 1.234,56" */
export function formatarBRL(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const inteiro = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}R$ ${agruparMilhares(inteiro)},${frac}`;
}

/** 2000n -> "2"; 2500n -> "2,5"; 1234567n -> "1.234,567". Zeros finais removidos. */
export function formatarQuantidade(qMilli: bigint): string {
  const negativo = qMilli < 0n;
  const abs = negativo ? -qMilli : qMilli;
  const inteiro = agruparMilhares((abs / 1000n).toString());
  const frac = (abs % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negativo ? "-" : ""}${inteiro}${frac ? `,${frac}` : ""}`;
}

const DATA_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-12-31" -> "31/12/2026". Valor fora do formato volta como veio. */
export function formatarDataBR(iso: string): string {
  const m = DATA_ISO_RE.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Soma dias a uma data "YYYY-MM-DD" por aritmetica UTC (virada de mes e de ano corretas). */
export function somarDias(iso: string, dias: number): string {
  const m = DATA_ISO_RE.exec(iso);
  if (!m) throw new Error(`Data invalida: "${iso}".`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias));
  const ano = String(d.getUTCFullYear()).padStart(4, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** "CNPJ" (14 digitos), "CPF" (11 digitos) ou "CNPJ/CPF" para qualquer outro tamanho. */
export function tipoDocumento(digitos: string): "CNPJ" | "CPF" | "CNPJ/CPF" {
  const d = soDigitos(digitos);
  if (d.length === 14) return "CNPJ";
  if (d.length === 11) return "CPF";
  return "CNPJ/CPF";
}

/** 14 digitos como CNPJ, 11 como CPF, outro tamanho sem mascara (so os digitos). */
export function formatarDocumento(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return d;
}

function formatarCep(cep: string): string {
  const d = soDigitos(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep.trim();
}

function formatarDias(n: number): string {
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}

// ---------------------------------------------------------------------------
// Leitura segura de campos
// ---------------------------------------------------------------------------

function registro(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Texto aparado e nao vazio, ou null. */
function texto(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function decimalTexto(v: DecimalLike): string {
  return typeof v === "string" ? v : String(v);
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

function montarCliente(proposta: PropostaParaPdf): ContextoPropostaPdf["cliente"] {
  const snap = registro(proposta.clienteSnapshot);
  const snapEnd = registro(snap.endereco);
  const over = registro(proposta.clienteOverride);

  // O override (campos achatados, D-16) tem precedencia sobre o snapshot do Athos.
  const escolher = (chave: string, doSnapshot: unknown): string | null => texto(over[chave]) ?? texto(doSnapshot);

  const razaoSocial = escolher("razaoSocial", snap.razaoSocial);
  const fantasia = texto(snap.nomeFantasia);
  const docBruto = escolher("documento", snap.documento);
  const documento = docBruto ? formatarDocumento(docBruto) : null;
  const cep = escolher("cep", snapEnd.cep);

  return {
    razaoSocial: razaoSocial ?? NAO_INFORMADO,
    nomeFantasia: fantasia && razaoSocial && fantasia.toLowerCase() !== razaoSocial.toLowerCase() ? fantasia : null,
    rotuloDocumento: docBruto ? tipoDocumento(docBruto) : "CNPJ/CPF",
    documento: documento && documento !== "" ? documento : NAO_INFORMADO,
    logradouro: escolher("logradouro", snapEnd.logradouro) ?? NAO_INFORMADO,
    numero: escolher("numero", snapEnd.numero) ?? NAO_INFORMADO,
    complemento: escolher("complemento", snapEnd.complemento),
    bairro: escolher("bairro", snapEnd.bairro) ?? NAO_INFORMADO,
    cidade: escolher("cidade", snapEnd.cidade) ?? NAO_INFORMADO,
    uf: escolher("uf", snapEnd.uf) ?? NAO_INFORMADO,
    cep: cep ? formatarCep(cep) : NAO_INFORMADO,
  };
}

/**
 * Monta o contexto do template SOMENTE com a lista branca de campos. Total e linhas vem de
 * `calcularLinhasProposta` (mesma aritmetica do preco e do Athos), recalculados dos itens.
 */
export function montarContextoProposta(entrada: EntradaContextoProposta): ContextoPropostaPdf {
  const { proposta, empresa, banco, previa } = entrada;
  const hoje = entrada.hoje ?? new Date().toISOString().slice(0, 10);

  if (!previa && (proposta.idorcamentoAthos == null || !proposta.athosData)) {
    throw new Error("PDF oficial exige idorcamentoAthos e athosData (D-17).");
  }

  const dataEmissaoIso = previa ? hoje : (proposta.athosData as string);
  const horaBruta = previa ? null : texto(proposta.athosHora);
  const horaEmissao = horaBruta ? (/^\d{2}:\d{2}/.test(horaBruta) ? horaBruta.slice(0, 5) : horaBruta) : null;

  const ordenados = proposta.itens
    .map((item, indice) => ({ item, indice }))
    .sort((a, b) => (a.item.sequencia ?? a.indice) - (b.item.sequencia ?? b.indice) || a.indice - b.indice)
    .map((x) => x.item);

  const entradasCalc = ordenados.map((item) => ({
    qMilli: paraMilli(decimalTexto(item.quantidade)),
    precoCentavos: paraCentavos(decimalTexto(item.precoUnitario)),
  }));
  const totais = entradasCalc.length > 0 ? calcularLinhasProposta(entradasCalc) : null;

  const itens = ordenados.map((item, i) => ({
    sequencia: i + 1,
    codigo: String(item.idproduto),
    nome: item.nome,
    descricaoCurta: texto(item.descricaoCurta),
    unidade: texto(item.unidade) ?? "UN",
    quantidade: formatarQuantidade(entradasCalc[i].qMilli),
    valorUnitario: formatarBRL(entradasCalc[i].precoCentavos),
    total: formatarBRL((totais as NonNullable<typeof totais>).linhas[i].totalC),
  }));

  const numeroProcesso = texto(proposta.numeroProcesso);
  const setorResponsavel = texto(proposta.setorResponsavel);
  const contatoEmail = texto(proposta.contatoEmail);
  const contatoTelefone = texto(proposta.contatoTelefone);

  const assinanteNome = texto(proposta.assinanteNome);
  const assinanteCpf = texto(proposta.assinanteCpf);

  return {
    previa,
    numero: previa ? null : String(proposta.idorcamentoAthos),
    dataEmissao: formatarDataBR(dataEmissaoIso),
    horaEmissao,
    validade: `${formatarDias(proposta.validadeDias)} (até ${formatarDataBR(somarDias(dataEmissaoIso, proposta.validadeDias))})`,
    prazoEntrega: formatarDias(proposta.prazoEntregaDias),
    cliente: montarCliente(proposta),
    orgao: {
      numeroProcesso,
      setorResponsavel,
      contatoEmail,
      contatoTelefone,
      temDados: Boolean(numeroProcesso || setorResponsavel || contatoEmail || contatoTelefone),
    },
    itens,
    totalGeral: formatarBRL(totais ? totais.liquidoC : 0n),
    observacao: texto(proposta.observacao),
    banco: {
      bancoNome: banco.bancoNome,
      agencia: banco.agencia,
      conta: banco.conta,
      titular: banco.titular,
      documentoTitular: formatarDocumento(banco.documentoTitular) || banco.documentoTitular,
    },
    assinante: assinanteNome
      ? {
          nome: assinanteNome,
          cargo: texto(proposta.assinanteCargo),
          cpf: assinanteCpf ? formatarDocumento(assinanteCpf) || assinanteCpf : null,
        }
      : null,
    empresaNome: empresa.nome,
    empresaCnpj: empresa.cnpj,
    empresaEndereco: empresa.endereco,
    empresaTelefones: texto(empresa.telefones),
    empresaEmail: texto(empresa.email),
    empresaLogoUrl: empresa.logoDataUri ?? null,
  };
}

// ---------------------------------------------------------------------------
// Dados de exemplo (previa de template da galeria)
// ---------------------------------------------------------------------------

/**
 * Entrada de exemplo para a previa de template. Todos os dados sao FICTICIOS e marcados como exemplo;
 * e `previa: true`, entao o documento sai com a marca d'agua "PRÉVIA" e sem numero de proposta.
 */
export const PROPOSTA_MOCK: EntradaContextoProposta = {
  previa: true,
  hoje: "2026-01-15",
  proposta: {
    idorcamentoAthos: null,
    athosData: null,
    athosHora: null,
    clienteSnapshot: {
      razaoSocial: "ÓRGÃO PÚBLICO DE EXEMPLO",
      nomeFantasia: "Prefeitura de Exemplo",
      documento: "00000000000191",
      endereco: {
        logradouro: "Avenida Exemplo",
        numero: "100",
        complemento: "Sala 2",
        bairro: "Centro",
        cidade: "Cidade Exemplo",
        uf: "SP",
        cep: "11630000",
      },
    },
    clienteOverride: null,
    numeroProcesso: "Pregão 00/2026 (exemplo)",
    setorResponsavel: "Setor de Compras (exemplo)",
    contatoEmail: "compras@exemplo.gov.br",
    contatoTelefone: "(12) 3000-0000",
    validadeDias: 1,
    prazoEntregaDias: 15,
    observacao: "Observação de exemplo: entrega no almoxarifado, em horário comercial.",
    assinanteNome: "Nome do Assinante (exemplo)",
    assinanteCargo: "Cargo (exemplo)",
    assinanteCpf: "00000000191",
    itens: [
      {
        sequencia: 1,
        idproduto: 1001,
        nome: "Papel sulfite A4 75g (exemplo)",
        descricaoCurta: "Resma com 500 folhas",
        unidade: "RM",
        quantidade: "20",
        precoUnitario: "24.90",
      },
      {
        sequencia: 2,
        idproduto: 1002,
        nome: "Caneta esferográfica azul (exemplo)",
        descricaoCurta: null,
        unidade: "UN",
        quantidade: "150",
        precoUnitario: "1.85",
      },
      {
        sequencia: 3,
        idproduto: 1003,
        nome: "Fita adesiva transparente (exemplo)",
        descricaoCurta: "Rolo 12 mm x 30 m",
        unidade: "UN",
        quantidade: "2.5",
        precoUnitario: "3.20",
      },
    ],
  },
  empresa: {
    nome: "Empresa de Exemplo Ltda",
    cnpj: "00.000.000/0001-00",
    endereco: "Rua Exemplo, 1 - Centro - Cidade Exemplo/SP - CEP 00000-000",
    telefones: "(12) 3000-0000",
    email: "contato@exemplo.com.br",
  },
  banco: {
    bancoNome: "Banco de Exemplo",
    agencia: "0000",
    conta: "00000-0",
    titular: "Empresa de Exemplo Ltda",
    documentoTitular: "00000000000191",
  },
};
