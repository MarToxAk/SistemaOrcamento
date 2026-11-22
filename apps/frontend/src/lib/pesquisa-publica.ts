// Fase 52 (plano 52-02): tipos, textos fixos e helpers puros da pesquisa publica.
// IMPORTANTE: este modulo e importado pelo Client Component (pesquisa-cliente.tsx) e pela
// pagina servidor. Por isso NAO pode importar nada de servidor (cliente HTTP do backend,
// process.env, node:*). So tipos, constantes e funcoes puras.

export type TextosPagina = {
  titulo: string;
  subtitulo: string;
  obrigadoSemRecompensa: string;
  googleTitulo: string;
  googleCorpo: string;
};

export type CupomPublico = {
  codigo: string;
  percentual: number;
  teto: number;
  compraMinima: number;
  validadeAte: string;
};

/** Espelho do contrato publico do backend (GET /pesquisa/publica/:token). */
export type PesquisaPublicaView =
  | { estado: "ABERTA"; variante: "ESTRELAS" | "CARINHAS"; textos: TextosPagina; corPrimaria: string; linkGoogle: string | null }
  | { estado: "RESPONDIDA"; textos: TextosPagina; corPrimaria: string; linkGoogle: string | null }
  | { estado: "INDISPONIVEL" };

/** Espelho do contrato publico do backend (POST /pesquisa/publica/:token/resposta). */
export type RespostaPublica = {
  estado: "RESPONDIDA";
  cupom: CupomPublico | null;
  textos: TextosPagina;
  corPrimaria: string;
  linkGoogle: string | null;
};

/** Estado resolvido no servidor e entregue ao Client Component. */
export type EstadoPagina =
  | { tipo: "ABERTA"; variante: "ESTRELAS" | "CARINHAS"; textos: TextosPagina; corPrimaria: string; linkGoogle: string | null }
  | { tipo: "RESPONDIDA"; textos: TextosPagina; corPrimaria: string; linkGoogle: string | null }
  | { tipo: "INDISPONIVEL" }
  | { tipo: "ERRO" };

export const ROTULOS_NOTA = ["Muito ruim", "Ruim", "Regular", "Bom", "Excelente"] as const;

/** Isolado em constante para revisao juridica (sem o aviso entre parenteses do UI-SPEC). */
export const TEXTO_LGPD =
  "Usamos sua resposta só para melhorar o atendimento. Guardamos por até 12 meses.";

export const TEXTO_OPT_OUT = "Não quer receber mais pesquisas? Responda SAIR no WhatsApp.";

export const TEXTO_NOTA_LEGAL_GOOGLE =
  "Deixar uma avaliação no Google é opcional e não altera seu cupom.";

const TEXTO_ERRO_REDE =
  "Não foi possível enviar sua avaliação. Verifique sua conexão e tente de novo. Sua resposta foi mantida.";
const TEXTO_ERRO_SERVIDOR =
  "Não foi possível registrar sua avaliação agora. Tente de novo em instantes.";

/** T-52-11: so renderiza o link do Google quando comeca com https://; qualquer outra coisa vira null. */
export function linkGoogleSeguro(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  return url.startsWith("https://") ? url : null;
}

/** Mensagem de erro do envio: "rede" usa o texto de conexao; qualquer status usa o texto de 5xx/429. */
export function mensagemErroEnvio(motivo: "rede" | number): string {
  if (motivo === "rede") return TEXTO_ERRO_REDE;
  return TEXTO_ERRO_SERVIDOR;
}
