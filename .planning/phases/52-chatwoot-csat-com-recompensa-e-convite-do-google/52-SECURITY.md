---
phase: "52"
slug: "chatwoot-csat-com-recompensa-e-convite-do-google"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-22"
---

# Phase 52 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time across all 12 plans (`<threat_model>` blocks): 84 rows, 73 unique IDs (T-52-SC repeats in every plan).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cliente WhatsApp → rota pública `/pesquisa/[token]` | Token de 48 hex na URL, sem autenticação | Token opaco, nota 1–5, comentário livre (≤500) |
| Rota pública → backend | Proxy Next `/[token]/responder` com chave interna server-side | Token, nota, comentário, IP real (`x-client-ip` só com `x-internal-api-key` válida) |
| Backend → Chatwoot (dois provedores) | API HTTP com token por empresa (Bom Custo e Box) | Mensagens, etiquetas, atributos do contato, CSAT nativo |
| Chatwoot → backend (webhook SAIR) | `POST /api/integrations/chatwoot/pesquisa/webhook` público, HMAC obrigatório | Telefone do remetente, corpo bruto assinado |
| Admin (sessão) → API admin | `AdminOnly` + `requireAdminSession` nos proxies do Next | Config, resultados, cupons, revogação |
| Deploy → runtime | Envs por empresa em `deploy/*.yml` e `stack.env` | Segredos de webhook, limites de custo, kill-switch |
| Banco próprio → retenção | Job diário anonimiza PII > 12 meses | Telefone, conversationId, contactId, conversationUuid, customerId, comentário |

---

## Threat Register

Verificação completa por ameaça (arquivo:linha) no relatório do auditor de 2026-11-22. Resumo por severidade/disposição:

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-52-01 | Spoofing | Token da pesquisa na URL | medium | mitigate | `randomBytes(24)` hex 192 bits, `REGEX_TOKEN` antes de qualquer consulta, corpo genérico INDISPONIVEL | closed |
| T-52-02 | Tampering | Reuso do link para responder várias vezes | medium | mitigate | `updateMany` condicionado a `respondidaEm` nulo e `expiraEm` futuro; segunda resposta 409 | closed |
| T-52-03 | Information disclosure | Logs com token, telefone e texto | medium | mitigate | Log só `conversationId`/`pesquisaId`/motivo; telefone mascarado; teste afirma ausência | closed |
| T-52-04 | Denial of service | Rota pública sob limite global por IP compartilhado | medium | mitigate | `@SkipThrottle` na classe + limitador por IP real, por token e teto da rota | closed |
| T-52-05 | Tampering | `input_csat` sem `private: true` | high | mitigate | `private: true` e `content_type` fixos no método; criada só após o envio; teste de payload | closed |
| T-52-06 | Tampering | Corpo da resposta fora de faixa | medium | mitigate | DTO `IsInt Min 1 Max 5` + `MaxLength 500`, `forbidNonWhitelisted`; serviço revalida | closed |
| T-52-07 | Information disclosure | Estado RESPONDIDA revela que o token existe | low | accept | Documentado em Accepted Risks (token de 192 bits, sem dado pessoal) | closed |
| T-52-08 | Tampering | Migração aplicada em banco real por engano | high | mitigate | Migração aditiva/idempotente; verificação em Postgres descartável com trap de limpeza | closed |
| T-52-09 | Tampering | Injeção de HTML na página pública | medium | mitigate | Texto via React; sem `dangerouslySetInnerHTML` | closed |
| T-52-10 | Information disclosure | Token vazando por Referer/indexação | medium | mitigate | `referrer: no-referrer` + `robots: noindex` | closed |
| T-52-11 | Tampering | Link externo sem isolamento de janela | medium | mitigate | `rel="noopener noreferrer"` | closed |
| T-52-12 | Tampering | Script/CDN não íntegro | medium | mitigate | `integrity` sha384 + `crossOrigin`; sem script externo | closed |
| T-52-13 | Tampering | Proxy aceita campos extras | medium | mitigate | Só `nota`/`comentario`, faixas validadas | closed |
| T-52-14 | Information disclosure | Oráculo por diferença de estado | medium | mitigate | INDISPONIVEL único; respondida nunca reexibe cupom | closed |
| T-52-15 | Tampering | Config inconsistente aceita | low | accept | Documentado em Accepted Risks | closed |
| T-52-16 | Tampering | Config com limites inválidos | medium | mitigate | `validarConfig` com limites e bordas | closed |
| T-52-17 | Tampering | Link do Google para domínio arbitrário | high | mitigate | Allowlist de host exata + https, reaplicada ao salvar | closed |
| T-52-18 | Tampering | Placeholder desconhecido em texto | low | mitigate | Lista fechada de placeholders | closed |
| T-52-19 | Tampering | Cupom duplicado | medium | mitigate | `unique(pesquisaId)` na migração + idempotência | closed |
| T-52-20 | Information disclosure | Telefone exposto | medium | mitigate | `mascararTelefone` | closed |
| T-52-21 | Information disclosure | Token do Chatwoot em log de erro | medium | mitigate | Só `err.message` | closed |
| T-52-22 | Tampering | Etiquetas perdidas na substituição | medium | mitigate | GET → merge → POST | closed |
| T-52-24 | Tampering | Fechamento re-aplicado | medium | mitigate | Guarda FECHA por etiquetas | closed |
| T-52-25 | Tampering | Convite do Google cita cupom | high | mitigate | Validação recusa `{codigo}`/cupom; render só `link_google`/`nome_empresa` | closed |
| T-52-26 | Denial of service | Envio em massa / flood de convites | high | mitigate | Atraso 60–180s, janela 5min–3d, 6 tentativas | closed |
| T-52-27 | Repudiation | Evento de envio sem rastro | low | accept | Documentado em Accepted Risks | closed |
| T-52-28 | Tampering | Reenvio duplicado no ciclo | medium | mitigate | Um incremento por pesquisa por ciclo; trava advisory | closed |
| T-52-29 | Tampering | Envio após opt-out | high | mitigate | Supressão relida antes de cada envio | closed |
| T-52-30 | Elevation of privilege | Rotas admin sem guarda | high | mitigate | `@AdminOnly` nos 7 handlers | closed |
| T-52-31 | Information disclosure | Código de cupom enumerável | medium | mitigate | Busca por código exato; telefone sempre mascarado | closed |
| T-52-32 | Tampering | Input admin fora de formato | medium | mitigate | DTOs fechados; UUID validado antes do banco | closed |
| T-52-33 | Denial of service | Painel caro sob carga | medium | accept | Documentado em Accepted Risks | closed |
| T-52-34 | Tampering | Resgate duplo concorrente | high | mitigate | `pg_advisory_xact_lock`, gasto na transação, `updateMany` condicionado | closed |
| T-52-36 | Spoofing | Webhook forjado | high | mitigate | HMAC-SHA256 do corpo bruto, `timingSafeEqual`, 401 antes do banco | closed |
| T-52-37 | Repudiation | Replay do webhook | medium | mitigate | Janela de 300s + upsert idempotente | closed |
| T-52-38 | Denial of service | Flood no webhook | medium | mitigate | Throttle 600/min; ordem HMAC → filtro → upsert | closed |
| T-52-39 | Compliance | Retenção além do necessário | medium | mitigate | Job off por padrão; aviso de 12 meses | closed |
| T-52-40 | Information disclosure | Anonimização incompleta | medium | mitigate | `updateMany` só campos pessoais, sem delete | closed |
| T-52-41 | Denial of service | Job lento concorrente | low | mitigate | Trava advisory + guarda `running` | closed |
| T-52-42 | Tampering | Proxy admin repassa corpo inteiro | medium | mitigate | `requireAdminSession` + lista explícita de 20 chaves | closed |
| T-52-43 | Tampering | Bootstrap sem SRI nas telas admin | medium | mitigate | `integrity` sha384 + `crossOrigin` nos 3 recursos | closed |
| T-52-44 | Information disclosure | Segredo no browser | medium | mitigate | Chaves só server-side; sem `NEXT_PUBLIC_` | closed |
| T-52-45 | Tampering | Perda de alterações ao sair | low | mitigate | `beforeunload` quando dirty | closed |
| T-52-46 | Tampering | HTML bruto na prévia | medium | mitigate | Prévia como texto | closed |
| T-52-47 | Spoofing | Proxy de resultados sem sessão | medium | mitigate | `requireAdminSession` + `@AdminOnly` | closed |
| T-52-48 | Tampering | HTML bruto no painel | medium | mitigate | Comentário como texto | closed |
| T-52-49 | Information disclosure | Telefone no painel | medium | mitigate | Sempre mascarado; painel não exibe telefone | closed |
| T-52-50 | Tampering | Parâmetro de período/aba arbitrário | low | mitigate | Lista fechada; padrão fora da URL | closed |
| T-52-51 | Tampering | Resgate sem confirmação | medium | mitigate | Dois passos, ref `emEnvio`, recarga do servidor; 409 do backend | closed |
| T-52-52 | Tampering | Código de cupom malformado no proxy | medium | mitigate | Regex + `encodeURIComponent` + 404 local | closed |
| T-52-53 | Elevation of privilege | Proxies de cupom sem guarda | medium | mitigate | `requireAdminSession` nos 3 proxies + `@AdminOnly` | closed |
| T-52-54 | Information disclosure | Token/conversa expostos na tela | medium | mitigate | Só `telefoneMascarado`; serviço não expõe token | closed |
| T-52-55 | Repudiation | UI otimista mostrando resgate não confirmado | medium | mitigate | Só recarrega do servidor | closed |
| T-52-56 | Information disclosure | Segredo commitado no deploy | high | mitigate | `${VAR:-}` nos composes; chave vazia no exemplo; roteiro sem tokens | closed |
| T-52-57 | Tampering | Feature ligada por acidente | high | mitigate | `ativo:false` default, retenção off, roteiro de ativação/reversão | closed |
| T-52-58 | Tampering | CSAT nativo ligado na inbox | medium | mitigate | Conferência por leitura no roteiro; inbox do Box destacada | closed |
| T-52-59 | Tampering | Homologação tocando produção | high | mitigate | Só Chatwoot de teste; nada escreve no Athos | closed |
| T-52-60 | Tampering | Revogação em massa / irreversível | medium | mitigate | AdminOnly, uma por chamada, idempotente, não toca USADO/EXPIRADO | closed |
| T-52-61 | Information disclosure | Mensagem de erro detalhada na revogação | low | accept | Documentado em Accepted Risks | closed |
| T-52-62 | Tampering | Revogar sem confirmação | medium | mitigate | Confirmação inline única, ref `emEnvio`, UUID validado | closed |
| T-52-63 | Denial of service | Inundação com tokens bem formados | medium | mitigate | Limites por IP real e teto da rota antes do serviço | closed |
| T-52-64 | Spoofing | `x-client-ip` forjado | medium | mitigate | Só com `x-internal-api-key` (timingSafeEqual) e `net.isIP` | closed |
| T-52-65 | Tampering | CSAT nativo duplicando o link | medium | mitigate | `getInbox` antes da `input_csat`; NAO_APLICAVEL + warn | closed |
| T-52-66 | Repudiation | Dupla despedida | low | mitigate | Ordem envio → registro → gancho com try/catch próprios | closed |
| T-52-67 | Denial of service | Reenvio em loop | high | mitigate | Reserva `updateMany` antes do envio; confere mensagem existente | closed |
| T-52-68 | Tampering | `input_csat` duplicada | medium | mitigate | Lista interna reutiliza `input_csat`; lista indisponível não cria | closed |
| T-52-69 | Tampering | Cupom criado após revogação | medium | mitigate | Relê `revogadaEm` após `create` e cancela | closed |
| T-52-70 | Information disclosure | Token de admin em env | medium | mitigate | Nenhum `CHATWOOT_ADMIN`/admin token em env, compose ou código | closed |
| T-52-71 | Tampering | Rota pública interceptada pelo nginx | medium | mitigate | Proxy fora do prefixo `/api`; roteiro confere por curl | closed |
| T-52-72 | Information disclosure | Token de admin em shell/histórico | medium | mitigate | `read -rs` + `unset TOKEN_ADMIN` no roteiro | closed |
| T-52-73 | Tampering | Crons concorrentes | medium | mitigate | `pg_try_advisory_xact_lock` com chaves próprias | closed |
| T-52-74 | Compliance | PII residual no Chatwoot | medium | mitigate | Colunas nuláveis + NULL em todos os campos pessoais; risco do Chatwoot registrado | closed |
| T-52-SC | Tampering | Dependência nova sem gate | high | mitigate | Nenhum `package.json`/lock alterado nos 12 planos | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-52-01 | T-52-07 | O estado RESPONDIDA revela que o token existe, mas só para tokens válidos de 192 bits e o corpo não carrega dado pessoal. | Operador (plano 52-01) | 2026-11-22 |
| AR-52-02 | T-52-15 | Configuração inconsistente aceita pelo servidor não tem impacto de segurança — o operador é o único autor e a prévia expõe o texto final. | Operador (plano 52-03) | 2026-11-22 |
| AR-52-03 | T-52-27 | Evento de envio sem rastro completo no provedor: a trilha própria (`Pesquisa`/`PesquisaCupom`) cobre o necessário para auditoria interna. | Operador (plano 52-05) | 2026-11-22 |
| AR-52-04 | T-52-33 | Painel de resultados faz consultas agregadas; carga limitada ao uso interno autenticado (admin). | Operador (plano 52-07) | 2026-11-22 |
| AR-52-05 | T-52-61 | Mensagem de erro da revogação é detalhada, porém a rota é `AdminOnly` e não expõe PII. | Operador (plano 52-12) | 2026-11-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-22 | 84 | 84 | 0 | gsd-security-auditor (sonnet) |

### Notas do auditor

- **T-52-56:** os 13 gates grep de linha ancorada foram executados como critério de aceite da task do plano 52-11 (13/13 em `52-11-SUMMARY.md`), mas não ficaram persistidos como teste automatizado de regressão. A propriedade de segurança se sustenta: nenhum valor de segredo foi commitado.
- **T-52-42:** o plano cita "21 chaves"; a whitelist implementada tem 20 chaves, exatamente o conjunto completo de `ConfigEntrada` — nenhuma chave passa livre.
- **T-52-10:** o link `wa.me` da tela INDISPONIVEL não leva `rel`, mas o vetor de vazamento do token (Referer/indexação) é coberto por `referrer: no-referrer` + `robots: noindex`.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-22
