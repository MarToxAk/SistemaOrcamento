import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Proposta, PropostaItem } from "@prisma/client";

import { AthosService, ClientePropostaDetalhe } from "../integrations/athos/athos.service";
import {
  CalcOrcamentoError,
  centavosParaTexto,
  milliParaTexto,
  paraCentavos,
  paraMilli,
} from "../integrations/athos/athos-orcamento-calc.util";
import { AthosOrcamentoService } from "../integrations/athos/athos-orcamento.service";
import { PrismaService } from "../database/prisma.service";
import {
  AddItemPropostaDto,
  AplicarPercentualDto,
  CreatePropostaDto,
  ListarPropostasQueryDto,
  UpdateItemPropostaDto,
  UpdatePropostaDto,
} from "./dto/propostas.dto";
import { PropostaError } from "./propostas.errors";
import {
  CalcPropostaError,
  MAX_LINHAS_PROPOSTA,
  calcularItemProposta,
  calcularLinhasProposta,
  calcularMargem,
  parsePercentualMilli,
  parsePrecoDigitadoCentavos,
  AjustePreco,
} from "./propostas-calc.util";

// ---------------------------------------------------------------------------
// Contrato de resposta (consumido pelo frontend, planos 55-09/55-10). Dinheiro sempre como texto decimal.
// ---------------------------------------------------------------------------

export interface PropostaItemDetalhe {
  id: string;
  sequencia: number;
  idproduto: number;
  nomeAthos: string;
  nome: string;
  descricaoCurta: string | null;
  unidade: string | null;
  permiteFracionar: boolean;
  /** "2.000" */
  quantidade: string;
  /** "3.456" (snapshot do precovendaproduto) */
  precoBase: string;
  ajuste: { tipo: "PERCENTUAL" | "VALOR"; valor: string } | null;
  /** "3.85" */
  precoUnitario: string;
  /** "7.70" */
  totalLinha: string;
  /** "1.283" */
  custoUnitario: string;
  /** "66.675" (percentual com 3 casas, pode ser negativo) */
  margemPercentual: string;
  abaixoDoCusto: boolean;
}

export interface PropostaDetalhe {
  id: string;
  status: string;
  idclienteAthos: number | null;
  cliente: Record<string, unknown> | null;
  clienteOverride: Record<string, unknown> | null;
  numeroProcesso: string | null;
  setorResponsavel: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  validadeDias: number;
  prazoEntregaDias: number;
  observacao: string | null;
  assinante: { nome: string; cargo: string | null; cpf: string | null } | null;
  /** "123.45" */
  total: string;
  idorcamentoAthos: number | null;
  senhaBalcao: number | null;
  athosData: string | null;
  athosHora: string | null;
  pdfDisponivel: boolean;
  duplicadaDeId: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
  enviadaEm: Date | null;
  fechadaEm: Date | null;
  canceladaEm: Date | null;
  itens: PropostaItemDetalhe[];
}

export type PropostaComItens = Proposta & { itens: PropostaItem[] };

/** Linha da listagem: sem itens, custo ou margem. */
export interface PropostaResumo {
  id: string;
  status: string;
  idclienteAthos: number | null;
  /** razaoSocial (ou nomeFantasia) do snapshot do cliente. */
  clienteNome: string | null;
  numeroProcesso: string | null;
  /** "123.45" */
  total: string;
  quantidadeItens: number;
  idorcamentoAthos: number | null;
  senhaBalcao: number | null;
  pdfDisponivel: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
  enviadaEm: Date | null;
  fechadaEm: Date | null;
  canceladaEm: Date | null;
}

export interface PropostaListagem {
  itens: PropostaResumo[];
  total: number;
  pagina: number;
  tamanho: number;
}

export interface AssinanteRecente {
  nome: string;
  cargo: string | null;
  cpf: string | null;
}

const TAMANHO_PADRAO = 20;
const TAMANHO_MAXIMO = 100;
const ASSINANTES_MAX = 10;
const ASSINANTES_CONSULTA = 50;
const INT4_MAX = 2147483647;

// ---------------------------------------------------------------------------
// Conversoes Decimal -> texto (o Prisma devolve Decimal; o fake de teste devolve texto ou numero)
// ---------------------------------------------------------------------------

const dec = (v: unknown): string => String(v ?? "0");

function milliDe(v: unknown): bigint {
  return paraMilli(dec(v));
}

function centavosDe(v: unknown): bigint {
  return paraCentavos(dec(v));
}

/** Ajuste guardado no item (tipo e valor em texto canonico) ou null quando nao ha ajuste. */
function ajusteArmazenado(item: PropostaItem): { tipo: "PERCENTUAL" | "VALOR"; valor: string } | null {
  if (item.ajusteTipo !== "PERCENTUAL" && item.ajusteTipo !== "VALOR") return null;
  if (item.ajusteValor === null || item.ajusteValor === undefined) return null;
  const valor =
    item.ajusteTipo === "PERCENTUAL"
      ? milliParaTexto(parsePercentualMilli(dec(item.ajusteValor)))
      : centavosParaTexto(centavosDe(item.ajusteValor));
  return { tipo: item.ajusteTipo, valor };
}

function itemParaDetalhe(item: PropostaItem): PropostaItemDetalhe {
  const precoCentavos = centavosDe(item.precoUnitario);
  const custoMilli = milliDe(item.custoUnitario);
  const { margemMilli, abaixoDoCusto } = calcularMargem({ precoCentavos, custoMilli });
  return {
    id: item.id,
    sequencia: item.sequencia,
    idproduto: item.idproduto,
    nomeAthos: item.nomeAthos,
    nome: item.nome,
    descricaoCurta: item.descricaoCurta ?? null,
    unidade: item.unidade ?? null,
    permiteFracionar: item.permiteFracionar,
    quantidade: milliParaTexto(milliDe(item.quantidade)),
    precoBase: milliParaTexto(milliDe(item.precoBase)),
    ajuste: ajusteArmazenado(item),
    precoUnitario: centavosParaTexto(precoCentavos),
    totalLinha: centavosParaTexto(centavosDe(item.totalLinha)),
    custoUnitario: milliParaTexto(custoMilli),
    margemPercentual: milliParaTexto(margemMilli),
    abaixoDoCusto,
  };
}

/** Monta a resposta administrativa da proposta (com custo e margem por item). Nunca expoe pdfSnapshot. */
export function montarDetalhe(p: PropostaComItens): PropostaDetalhe {
  const itens = [...p.itens].sort((a, b) => a.sequencia - b.sequencia).map(itemParaDetalhe);
  return {
    id: p.id,
    status: p.status,
    idclienteAthos: p.idclienteAthos ?? null,
    cliente: (p.clienteSnapshot as Record<string, unknown> | null) ?? null,
    clienteOverride: (p.clienteOverride as Record<string, unknown> | null) ?? null,
    numeroProcesso: p.numeroProcesso ?? null,
    setorResponsavel: p.setorResponsavel ?? null,
    contatoEmail: p.contatoEmail ?? null,
    contatoTelefone: p.contatoTelefone ?? null,
    validadeDias: p.validadeDias,
    prazoEntregaDias: p.prazoEntregaDias,
    observacao: p.observacao ?? null,
    assinante: p.assinanteNome ? { nome: p.assinanteNome, cargo: p.assinanteCargo ?? null, cpf: p.assinanteCpf ?? null } : null,
    total: centavosParaTexto(centavosDe(p.totalValor)),
    idorcamentoAthos: p.idorcamentoAthos ?? null,
    senhaBalcao: p.senhaBalcao ?? null,
    athosData: p.athosData ?? null,
    athosHora: p.athosHora ?? null,
    pdfDisponivel: !!p.pdfObjectName,
    duplicadaDeId: p.duplicadaDeId ?? null,
    criadoEm: p.criadoEm,
    atualizadoEm: p.atualizadoEm,
    enviadaEm: p.enviadaEm ?? null,
    fechadaEm: p.fechadaEm ?? null,
    canceladaEm: p.canceladaEm ?? null,
    itens,
  };
}

// ---------------------------------------------------------------------------
// Helpers de validacao
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHAVES_OVERRIDE = ["razaoSocial", "documento", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"] as const;
const LIMITE_OVERRIDE = 200;

/** Calculo do util (plano 55-01) para erro HTTP legivel. */
function converterErroCalculo(err: unknown): never {
  if (err instanceof CalcPropostaError) {
    throw new PropostaError(err.codigo === "LIMITE_ITENS" ? "LIMITE_ITENS" : "VALOR_INVALIDO", err.message, 422);
  }
  if (err instanceof CalcOrcamentoError) {
    throw new PropostaError("VALOR_INVALIDO", err.message, 422);
  }
  throw err;
}

/** undefined = nao alterar; null ou texto vazio = limpar; texto = valor aparado. */
function textoOpcional(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function diasValidos(v: number | undefined, campo: string): number | undefined {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || v < 1 || v > 365) {
    throw new PropostaError("VALOR_INVALIDO", `${campo} deve ser um numero inteiro de 1 a 365.`, 422);
  }
  return v;
}

@Injectable()
export class PropostasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly athosOrcamento: AthosOrcamentoService,
    private readonly athos: AthosService,
  ) {}

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  private async carregar(id: string): Promise<PropostaComItens> {
    const proposta = await this.prisma.proposta.findUnique({ where: { id }, include: { itens: { orderBy: { sequencia: "asc" } } } });
    if (!proposta) {
      throw new PropostaError("PROPOSTA_NAO_ENCONTRADA", "Proposta nao encontrada.", 404);
    }
    return proposta as PropostaComItens;
  }

  /** Carrega para edicao: so RASCUNHO e editavel (D-08, T-55-22). */
  private async carregarEditavel(id: string): Promise<PropostaComItens> {
    const proposta = await this.carregar(id);
    if (proposta.status !== "RASCUNHO") {
      throw new PropostaError(
        "PROPOSTA_NAO_EDITAVEL",
        "Esta proposta nao esta mais em rascunho e nao pode ser alterada. Duplique a proposta para criar uma nova versao editavel.",
        409,
      );
    }
    return proposta;
  }

  async obter(id: string): Promise<PropostaDetalhe> {
    return montarDetalhe(await this.carregar(id));
  }

  // -------------------------------------------------------------------------
  // Cabecalho
  // -------------------------------------------------------------------------

  /**
   * Converte o DTO de cabecalho em dados do Prisma. undefined = nao alterar. Cliente do Athos: busca o
   * cadastro e grava o snapshot (D-14, D-25); cliente inexistente = 422 e nada e gravado.
   */
  private async montarDadosCabecalho(dto: CreatePropostaDto): Promise<Prisma.PropostaUncheckedCreateInput> {
    const dados: Prisma.PropostaUncheckedCreateInput = {};

    if (dto.idclienteAthos !== undefined) {
      if (dto.idclienteAthos === null) {
        dados.idclienteAthos = null;
        dados.clienteSnapshot = Prisma.DbNull;
      } else {
        const cliente: ClientePropostaDetalhe | null = await this.athos.buscarClienteParaProposta(dto.idclienteAthos);
        if (!cliente) {
          throw new PropostaError("CLIENTE_INEXISTENTE", "Cliente nao encontrado no Athos.", 422);
        }
        dados.idclienteAthos = dto.idclienteAthos;
        dados.clienteSnapshot = cliente as unknown as Prisma.InputJsonValue;
      }
    }

    const numeroProcesso = textoOpcional(dto.numeroProcesso);
    if (numeroProcesso !== undefined) dados.numeroProcesso = numeroProcesso;
    const setorResponsavel = textoOpcional(dto.setorResponsavel);
    if (setorResponsavel !== undefined) dados.setorResponsavel = setorResponsavel;
    const contatoTelefone = textoOpcional(dto.contatoTelefone);
    if (contatoTelefone !== undefined) dados.contatoTelefone = contatoTelefone;
    const observacao = textoOpcional(dto.observacao);
    if (observacao !== undefined) dados.observacao = observacao;

    const contatoEmail = textoOpcional(dto.contatoEmail);
    if (contatoEmail !== undefined) {
      if (contatoEmail !== null && !EMAIL_RE.test(contatoEmail)) {
        throw new PropostaError("VALOR_INVALIDO", "E-mail de contato invalido.", 422);
      }
      dados.contatoEmail = contatoEmail;
    }

    const validadeDias = diasValidos(dto.validadeDias, "Validade");
    if (validadeDias !== undefined) dados.validadeDias = validadeDias;
    const prazoEntregaDias = diasValidos(dto.prazoEntregaDias, "Prazo de entrega");
    if (prazoEntregaDias !== undefined) dados.prazoEntregaDias = prazoEntregaDias;

    if (dto.clienteOverride !== undefined) {
      const override: Record<string, string> = {};
      if (dto.clienteOverride !== null) {
        const origem = dto.clienteOverride as unknown as Record<string, unknown>;
        for (const chave of CHAVES_OVERRIDE) {
          const valor = origem[chave];
          if (typeof valor !== "string") continue;
          const t = valor.trim().slice(0, LIMITE_OVERRIDE);
          if (t !== "") override[chave] = t;
        }
      }
      dados.clienteOverride = Object.keys(override).length > 0 ? override : Prisma.DbNull;
    }

    return dados;
  }

  async criarRascunho(dto: CreatePropostaDto): Promise<PropostaDetalhe> {
    const dados = await this.montarDadosCabecalho(dto ?? {});
    const criada = await this.prisma.proposta.create({ data: dados, include: { itens: true } });
    return montarDetalhe(criada as PropostaComItens);
  }

  // -------------------------------------------------------------------------
  // Itens
  // -------------------------------------------------------------------------

  /** Total da proposta em centavos a partir dos itens gravados (zero itens = 0). */
  private totalCentavos(itens: Array<{ quantidade: unknown; precoUnitario: unknown }>): bigint {
    if (itens.length === 0) return 0n;
    try {
      return calcularLinhasProposta(
        itens.map((i) => ({ qMilli: milliDe(i.quantidade), precoCentavos: centavosDe(i.precoUnitario) })),
      ).brutoC;
    } catch (err) {
      return converterErroCalculo(err);
    }
  }

  async adicionarItem(id: string, dto: AddItemPropostaDto): Promise<PropostaDetalhe> {
    const proposta = await this.carregarEditavel(id);
    if (proposta.itens.length >= MAX_LINHAS_PROPOSTA) {
      throw new PropostaError("LIMITE_ITENS", `A proposta aceita no maximo ${MAX_LINHAS_PROPOSTA} itens.`, 422);
    }

    // Todo item existe no Athos (D-05): inexistente, inativo ou sem preco e recusado.
    const produto = await this.athosOrcamento.obterProdutoProposta(dto.idproduto);
    if (!produto) {
      throw new PropostaError("PRODUTO_INEXISTENTE", "Produto nao encontrado ou inativo no Athos.", 422);
    }
    let precoBaseMilli = 0n;
    if (produto.preco !== null && produto.preco !== undefined) {
      try {
        precoBaseMilli = paraMilli(produto.preco);
      } catch {
        precoBaseMilli = 0n;
      }
    }
    if (precoBaseMilli <= 0n) {
      throw new PropostaError("PRECO_INDISPONIVEL", "O produto esta sem preco de venda no Athos e nao pode ser adicionado.", 422);
    }

    let qMilli: bigint;
    let custoMilli: bigint;
    let calculo: ReturnType<typeof calcularItemProposta>;
    try {
      qMilli = paraMilli(dto.quantidade);
      custoMilli = paraMilli(produto.custoUnitario ?? "0");
      if (!produto.permiteFracionar && qMilli % 1000n !== 0n) {
        throw new PropostaError("QUANTIDADE_FRACIONADA", "Este produto so permite quantidade inteira.", 422);
      }
      calculo = calcularItemProposta({ precoBaseMilli, ajuste: null, qMilli, custoMilli });
    } catch (err) {
      if (err instanceof PropostaError) throw err;
      return converterErroCalculo(err);
    }

    const sequencia = proposta.itens.reduce((max, i) => Math.max(max, i.sequencia), 0) + 1;
    const total = this.totalCentavos([
      ...proposta.itens,
      { quantidade: milliParaTexto(qMilli), precoUnitario: centavosParaTexto(calculo.precoCentavos) },
    ]);

    await this.prisma.$transaction([
      this.prisma.propostaItem.create({
        data: {
          propostaId: id,
          sequencia,
          idproduto: produto.idproduto,
          nomeAthos: produto.descricao,
          nome: produto.descricao.slice(0, 200),
          descricaoCurta: produto.descricaoCurta ?? null,
          unidade: produto.unidade ?? null,
          permiteFracionar: produto.permiteFracionar,
          quantidade: milliParaTexto(qMilli),
          precoBase: milliParaTexto(precoBaseMilli),
          precoUnitario: centavosParaTexto(calculo.precoCentavos),
          totalLinha: centavosParaTexto(calculo.totalC),
          custoUnitario: milliParaTexto(custoMilli),
        },
      }),
      this.prisma.proposta.update({ where: { id }, data: { totalValor: centavosParaTexto(total) } }),
    ]);

    return this.obter(id);
  }
  /** Item da proposta em RASCUNHO; item de outra proposta (ou inexistente) responde 404. */
  private async carregarItemEditavel(id: string, itemId: string): Promise<{ proposta: PropostaComItens; item: PropostaItem }> {
    const proposta = await this.carregarEditavel(id);
    const item = proposta.itens.find((i) => i.id === itemId);
    if (!item) {
      throw new PropostaError("PROPOSTA_NAO_ENCONTRADA", "Item nao encontrado nesta proposta.", 404);
    }
    return { proposta, item };
  }

  /**
   * Converte o ajuste do DTO na entrada do calculo e nos valores a gravar. NENHUM limpa o ajuste.
   * PERCENTUAL: porcentagem sobre o preco base; VALOR: novo preco unitario final em reais (D-02a).
   */
  private resolverAjuste(entrada: { tipo: "PERCENTUAL" | "VALOR" | "NENHUM"; valor?: number | null }): {
    ajuste: AjustePreco | null;
    tipo: string | null;
    valor: string | null;
  } {
    if (entrada.tipo === "NENHUM") return { ajuste: null, tipo: null, valor: null };
    if (entrada.valor === undefined || entrada.valor === null) {
      throw new PropostaError("VALOR_INVALIDO", "Informe o valor do ajuste.", 422);
    }
    try {
      const valor =
        entrada.tipo === "PERCENTUAL"
          ? milliParaTexto(parsePercentualMilli(entrada.valor))
          : centavosParaTexto(parsePrecoDigitadoCentavos(entrada.valor));
      return { ajuste: { tipo: entrada.tipo, valor }, tipo: entrada.tipo, valor };
    } catch (err) {
      return converterErroCalculo(err);
    }
  }

  /** Recalcula SEMPRE no servidor a partir do snapshot do preco base e do custo (D-09, T-55-20). */
  private recalcularItem(item: PropostaItem, qMilli: bigint, ajuste: AjustePreco | null) {
    try {
      return calcularItemProposta({
        precoBaseMilli: milliDe(item.precoBase),
        ajuste,
        qMilli,
        custoMilli: milliDe(item.custoUnitario),
      });
    } catch (err) {
      return converterErroCalculo(err);
    }
  }

  async atualizarItem(id: string, itemId: string, dto: UpdateItemPropostaDto): Promise<PropostaDetalhe> {
    const { proposta, item } = await this.carregarItemEditavel(id, itemId);
    const dados: Record<string, unknown> = {};

    let qMilli = milliDe(item.quantidade);
    if (dto.quantidade !== undefined) {
      try {
        qMilli = paraMilli(dto.quantidade);
      } catch (err) {
        return converterErroCalculo(err);
      }
      if (!item.permiteFracionar && qMilli % 1000n !== 0n) {
        throw new PropostaError("QUANTIDADE_FRACIONADA", "Este produto so permite quantidade inteira.", 422);
      }
      dados.quantidade = milliParaTexto(qMilli);
    }

    if (dto.nome !== undefined) {
      const nome = dto.nome.trim();
      if (nome.length < 1 || nome.length > 200) {
        throw new PropostaError("VALOR_INVALIDO", "O nome do item deve ter de 1 a 200 caracteres.", 422);
      }
      dados.nome = nome;
    }

    if (dto.descricaoCurta !== undefined) {
      const descricao = textoOpcional(dto.descricaoCurta);
      if (descricao && descricao.length > 300) {
        throw new PropostaError("VALOR_INVALIDO", "A descricao curta aceita no maximo 300 caracteres.", 422);
      }
      dados.descricaoCurta = descricao;
    }

    let ajuste: AjustePreco | null = ajusteArmazenado(item);
    if (dto.ajuste !== undefined) {
      const resolvido = this.resolverAjuste(dto.ajuste);
      ajuste = resolvido.ajuste;
      dados.ajusteTipo = resolvido.tipo;
      dados.ajusteValor = resolvido.valor;
    }

    const calculo = this.recalcularItem(item, qMilli, ajuste);
    const precoUnitario = centavosParaTexto(calculo.precoCentavos);
    dados.precoUnitario = precoUnitario;
    dados.totalLinha = centavosParaTexto(calculo.totalC);

    const total = this.totalCentavos(
      proposta.itens.map((i) => (i.id === item.id ? { quantidade: milliParaTexto(qMilli), precoUnitario } : i)),
    );

    await this.prisma.$transaction([
      this.prisma.propostaItem.update({ where: { id: item.id }, data: dados }),
      this.prisma.proposta.update({ where: { id }, data: { totalValor: centavosParaTexto(total) } }),
    ]);
    return this.obter(id);
  }

  async removerItem(id: string, itemId: string): Promise<PropostaDetalhe> {
    const { proposta, item } = await this.carregarItemEditavel(id, itemId);
    const restantes = proposta.itens.filter((i) => i.id !== item.id).sort((a, b) => a.sequencia - b.sequencia);
    const renumeracao = restantes.flatMap((i, idx) =>
      i.sequencia === idx + 1 ? [] : [this.prisma.propostaItem.update({ where: { id: i.id }, data: { sequencia: idx + 1 } })],
    );
    const total = this.totalCentavos(restantes);

    await this.prisma.$transaction([
      this.prisma.propostaItem.delete({ where: { id: item.id } }),
      ...renumeracao,
      this.prisma.proposta.update({ where: { id }, data: { totalValor: centavosParaTexto(total) } }),
    ]);
    return this.obter(id);
  }

  /** Aplica a mesma porcentagem ao preco base de cada item, substituindo ajustes individuais; 0 limpa (D-11). */
  async aplicarPercentualEmTodos(id: string, dto: AplicarPercentualDto): Promise<PropostaDetalhe> {
    const proposta = await this.carregarEditavel(id);
    let pctMilli: bigint;
    try {
      pctMilli = parsePercentualMilli(dto.percentual);
    } catch (err) {
      return converterErroCalculo(err);
    }
    const limpar = pctMilli === 0n;
    const valor = milliParaTexto(pctMilli);
    const ajuste: AjustePreco | null = limpar ? null : { tipo: "PERCENTUAL", valor };

    const atualizados = proposta.itens.map((item) => {
      const calculo = this.recalcularItem(item, milliDe(item.quantidade), ajuste);
      return { item, precoUnitario: centavosParaTexto(calculo.precoCentavos), totalLinha: centavosParaTexto(calculo.totalC) };
    });
    const total = this.totalCentavos(atualizados.map((a) => ({ quantidade: a.item.quantidade, precoUnitario: a.precoUnitario })));

    await this.prisma.$transaction([
      ...atualizados.map((a) =>
        this.prisma.propostaItem.update({
          where: { id: a.item.id },
          data: {
            ajusteTipo: limpar ? null : "PERCENTUAL",
            ajusteValor: limpar ? null : valor,
            precoUnitario: a.precoUnitario,
            totalLinha: a.totalLinha,
          },
        }),
      ),
      this.prisma.proposta.update({ where: { id }, data: { totalValor: centavosParaTexto(total) } }),
    ]);
    return this.obter(id);
  }

  // -------------------------------------------------------------------------
  // Cabecalho (edicao), listagem e apoio
  // -------------------------------------------------------------------------

  async atualizarCabecalho(id: string, dto: UpdatePropostaDto): Promise<PropostaDetalhe> {
    await this.carregarEditavel(id);
    const dados = await this.montarDadosCabecalho(dto ?? {});
    if (Object.keys(dados).length > 0) {
      await this.prisma.proposta.update({ where: { id }, data: dados });
    }
    return this.obter(id);
  }

  async listar(query: ListarPropostasQueryDto): Promise<PropostaListagem> {
    const tamanho = Math.min(Math.max(Math.trunc(query.tamanho ?? TAMANHO_PADRAO), 1), TAMANHO_MAXIMO);
    const pagina = Math.max(Math.trunc(query.pagina ?? 1), 1);

    const where: Prisma.PropostaWhereInput = {};
    if (query.status) where.status = query.status;
    const q = query.q?.trim();
    if (q) {
      if (/^\d+$/.test(q) && Number(q) <= INT4_MAX) {
        where.idorcamentoAthos = Number(q);
      } else {
        // O filtro JSON do Prisma 5 (string_contains) nao tem `mode: "insensitive"`; a busca sem diferenciar
        // maiusculas usa ILIKE parametrizado (coringas de q escapados) e filtra a listagem pelos ids achados.
        const padrao = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
        const achadas = await this.prisma.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "Proposta" WHERE "clienteSnapshot"->>'razaoSocial' ILIKE ${padrao} OR "clienteSnapshot"->>'nomeFantasia' ILIKE ${padrao}`,
        );
        where.id = { in: achadas.map((a) => a.id) };
      }
    }

    const [linhas, total] = await Promise.all([
      this.prisma.proposta.findMany({
        where,
        orderBy: { atualizadoEm: "desc" },
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        include: { _count: { select: { itens: true } } },
      }),
      this.prisma.proposta.count({ where }),
    ]);

    return {
      itens: linhas.map((p) => {
        const snapshot = (p.clienteSnapshot as Record<string, unknown> | null) ?? null;
        const nome = snapshot?.razaoSocial ?? snapshot?.nomeFantasia;
        return {
          id: p.id,
          status: p.status,
          idclienteAthos: p.idclienteAthos ?? null,
          clienteNome: typeof nome === "string" ? nome : null,
          numeroProcesso: p.numeroProcesso ?? null,
          total: centavosParaTexto(centavosDe(p.totalValor)),
          quantidadeItens: p._count.itens,
          idorcamentoAthos: p.idorcamentoAthos ?? null,
          senhaBalcao: p.senhaBalcao ?? null,
          pdfDisponivel: !!p.pdfObjectName,
          criadoEm: p.criadoEm,
          atualizadoEm: p.atualizadoEm,
          enviadaEm: p.enviadaEm ?? null,
          fechadaEm: p.fechadaEm ?? null,
          canceladaEm: p.canceladaEm ?? null,
        };
      }),
      total,
      pagina,
      tamanho,
    };
  }

  /** Assinantes distintos (nome, cargo, cpf) das propostas mais recentes, para reuso (D-19). */
  async listarAssinantesRecentes(): Promise<AssinanteRecente[]> {
    const linhas = await this.prisma.proposta.findMany({
      where: { assinanteNome: { not: null } },
      orderBy: { atualizadoEm: "desc" },
      take: ASSINANTES_CONSULTA,
    });
    const vistos = new Set<string>();
    const saida: AssinanteRecente[] = [];
    for (const p of linhas) {
      if (!p.assinanteNome) continue;
      const chave = `${p.assinanteNome}|${p.assinanteCargo ?? ""}|${p.assinanteCpf ?? ""}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ nome: p.assinanteNome, cargo: p.assinanteCargo ?? null, cpf: p.assinanteCpf ?? null });
      if (saida.length >= ASSINANTES_MAX) break;
    }
    return saida;
  }

  /** Busca de produtos do Athos com custo (rota AdminOnly). */
  async buscarProdutos(q: string, limit?: number) {
    return this.athosOrcamento.buscarProdutosProposta(q, limit);
  }

  /** Cliente do Athos com razao social real e endereco por campo (rota AdminOnly). */
  async buscarCliente(idcliente: number): Promise<ClientePropostaDetalhe> {
    const cliente = await this.athos.buscarClienteParaProposta(idcliente);
    if (!cliente) {
      throw new PropostaError("CLIENTE_INEXISTENTE", "Cliente nao encontrado no Athos.", 404);
    }
    return cliente;
  }
}
