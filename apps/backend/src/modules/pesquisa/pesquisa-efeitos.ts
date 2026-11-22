/**
 * Fase 52 (plano 52-05): funcoes puras dos efeitos da resposta no Chatwoot e das mensagens de WhatsApp.
 *
 * Sem Nest, sem Prisma e sem rede. Regras:
 * - D-12: a nota privada resume nota, variante, comentario e cupom (nunca telefone nem token).
 * - D-13: os atributos do contato usam chaves snake_case e a data no fuso de America/Sao_Paulo.
 * - D-14: nota 1 ou 2 recebe `csat-baixo` alem de `avaliou`; 3 a 5 so `avaliou`.
 * - D-21/D-22: as variaveis das mensagens deixam `codigo` vazio quando nao ha cupom; a mensagem do
 *   cupom nao carrega link e a do convite so usa `link_google` e `nome_empresa`.
 */
import { ETIQUETA_AVALIOU, ETIQUETA_CSAT_BAIXO } from "../integrations/chatwoot/chatwoot-etiquetas";
import { formatarDataBR, formatarPercentual, formatarReais } from "./pesquisa-regras";

export type CupomDaNota = { codigo: string; percentual: number; teto: number; validadeAte: Date };

export type CupomDaMensagem = CupomDaNota & { compraMinima: number };

export type ConfigDaMensagem = {
  percentualDesconto: number;
  tetoDesconto: number;
  compraMinima: number;
  validadeCupomDias: number;
};

/** D-14: nota 1 ou 2 e csat-baixo; 3 a 5 apenas avaliou (a etiqueta antiga e removida pela mescla). */
export function etiquetasDaPesquisa(nota: number): string[] {
  return nota <= 2 ? [ETIQUETA_AVALIOU, ETIQUETA_CSAT_BAIXO] : [ETIQUETA_AVALIOU];
}

/** D-13: "AAAA-MM-DD" no fuso de Sao Paulo (en-CA ja devolve nesse formato). */
export function dataISOSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

/**
 * D-12: nota privada da conversa. Varias linhas curtas, sem emoji, sem telefone e sem token; o
 * comentario livre do cliente entra como registro interno do atendimento (T-52-27, aceito).
 */
export function montarNotaPrivada(dados: {
  nota: number;
  variante: string;
  comentario: string | null;
  cupom: CupomDaNota | null;
}): string {
  const comentario = dados.comentario?.trim() ? dados.comentario.trim() : "sem comentário";
  const linhas = [
    "Pesquisa de satisfação respondida.",
    `nota ${dados.nota} de 5 (variante ${dados.variante}).`,
    `Comentário do cliente: ${comentario}`,
  ];
  if (dados.cupom) {
    linhas.push(
      `Cupom ${dados.cupom.codigo}: ${formatarPercentual(dados.cupom.percentual)} de desconto, ` +
        `teto de ${formatarReais(dados.cupom.teto)}, válido até ${formatarDataBR(dados.cupom.validadeAte)}.`,
    );
  } else {
    linhas.push("Cupom: nenhum cupom foi emitido para esta resposta.");
  }
  return linhas.join("\n");
}

/** D-13: atributos customizados do contato; sem cupom as duas chaves do cupom ficam vazias. */
export function montarAtributosContato(dados: {
  nota: number;
  respondidaEm: Date;
  cupom: { codigo: string; validadeAte: Date } | null;
}): Record<string, string | number> {
  return {
    ultima_nota_csat: dados.nota,
    data_ultima_avaliacao: dataISOSaoPaulo(dados.respondidaEm),
    cupom_ativo: dados.cupom?.codigo ?? "",
    cupom_validade: dados.cupom ? dataISOSaoPaulo(dados.cupom.validadeAte) : "",
  };
}

/**
 * D-21/D-22: variaveis das mensagens de WhatsApp. Sem cupom `codigo` fica vazio e os numeros vem da
 * config (o convite so usa `link_google` e `nome_empresa`, nunca variavel do cupom).
 */
export function montarVariaveisMensagem(dados: {
  linkGoogle: string | null;
  cupom: CupomDaMensagem | null;
  empresaNome: string;
  cfg: ConfigDaMensagem;
}): Record<string, string> {
  const validade = dados.cupom
    ? dados.cupom.validadeAte
    : new Date(Date.now() + dados.cfg.validadeCupomDias * 86_400_000);
  return {
    link_google: dados.linkGoogle ?? "",
    codigo: dados.cupom?.codigo ?? "",
    percentual: formatarPercentual(dados.cupom?.percentual ?? dados.cfg.percentualDesconto),
    teto: formatarReais(dados.cupom?.teto ?? dados.cfg.tetoDesconto),
    compra_minima: formatarReais(dados.cupom?.compraMinima ?? dados.cfg.compraMinima),
    validade: formatarDataBR(validade),
    nome_empresa: dados.empresaNome,
  };
}
