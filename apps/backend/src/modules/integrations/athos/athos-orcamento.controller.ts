import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { THROTTLE_SENSITIVE } from "../../security/throttle.config";
import { AthosOrcamentoIdempotenciaService, ResultadoComReplay } from "./athos-orcamento-idempotencia.service";
import { AthosOrcamentoService } from "./athos-orcamento.service";
import { CreateAthosOrcamentoDto } from "./dto/create-athos-orcamento.dto";

/**
 * Orcamentos criados por agentes de IA no Athos (Fase 44).
 *
 * Sem @Public(): o guard global InternalAuthGuard (header x-internal-api-key) protege a rota.
 * Rotas estaticas devem ser declaradas ANTES de qualquer rota parametrica (:id) em 44-04.
 */
@ApiTags("Athos - Orcamentos IA")
@ApiSecurity("InternalApiKey")
@Controller("athos/orcamentos")
export class AthosOrcamentoController {
  constructor(
    private readonly athosOrcamentoService: AthosOrcamentoService,
    private readonly idempotencia: AthosOrcamentoIdempotenciaService,
  ) {}

  @Post()
  @Throttle({ default: THROTTLE_SENSITIVE })
  @ApiOperation({
    summary: "Criar orcamento no Athos (aparece no Balcao)",
    description:
      "Cria, em uma unica transacao, um orcamento aberto no Athos com os itens pelo preco de venda atual do " +
      "Athos e uma linha de pagamento PIX. Retorna o numero (idorcamento) e a senha do Balcao (senhabalcao). " +
      "Requer ATHOS_ORCAMENTO_ESCRITA=true no servidor; caso contrario responde 503 ESCRITA_DESABILITADA. " +
      "Erros trazem { codigo, mensagem, detalhes? } legiveis por IA.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description:
      "Chave de idempotencia (8 a 128 caracteres: letras, numeros, . _ : -). Repetir a chamada com a mesma chave e o " +
      "mesmo corpo devolve o orcamento ja criado (mesmo idorcamento e senhabalcao, replay: true) sem criar outro. " +
      "Mesma chave com corpo diferente responde 409 IDEMPOTENCY_KEY_REUTILIZADA; chave ainda em processamento " +
      "responde 409 IDEMPOTENCY_EM_PROCESSAMENTO; formato invalido responde 400 IDEMPOTENCY_KEY_INVALIDA. " +
      "Simulacoes nao consomem a chave.",
  })
  @ApiBody({ type: CreateAthosOrcamentoDto })
  @ApiCreatedResponse({ description: "Orcamento criado: idorcamento, senhabalcao, totais, itens e pagamento." })
  async criar(
    @Body() dto: CreateAthosOrcamentoDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<ResultadoComReplay> {
    return this.idempotencia.executar(idempotencyKey, dto, (opts) =>
      this.athosOrcamentoService.criarOrcamento(dto, opts),
    );
  }
}
