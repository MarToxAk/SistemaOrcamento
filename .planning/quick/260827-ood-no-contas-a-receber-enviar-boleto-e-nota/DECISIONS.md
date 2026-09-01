# Decisões travadas (do usuário) — 2026-08-27 / atualizado 2026-08-28

Task: No **contas a receber**, ação "Enviar e-mail" que manda ao cliente, em **um e-mail só**, os documentos em anexo + verificação de leitura.

## Escopo final (confirmado 2026-08-28)

### Anexos do e-mail
| Documento | Formato | Origem |
|---|---|---|
| Boleto | PDF | EFI — `CobrancaService.downloadBoletoPdf(cobrancaBoletoId)` (já existe) |
| NFS-e (serviço) | **PDF DANFSe** | `CobrancaService.baixarDanfsePdf(nfseEmitidaId)` (já existe nesta branch) |
| NF-e (produto) | **XML cru** (arquivo `.xml`) | coluna `nota.xml` do banco Athos |

### Seleção automática dos documentos (8a)
Pelos títulos do boleto:
- NFS-e: via `titulo.nfseAtivo?.nfseEmitidaId` (já disponível na página).
- NF-e: os títulos de contas a receber vêm de `venda` no Athos; `nota` liga a `venda` via `venda_nota`. Buscar as NF-e das vendas por trás dos títulos daquele boleto. Só notas autorizadas (`nfechaveacesso IS NOT NULL`), canceladas já são filtradas pela query. Anexar como `NF-e-{numero}.xml`, content-type `application/xml`.
- Novo método `AthosService.buscarNotasFiscaisXmlPorTitulos(...)` (ou por idvenda/idcliente) fazendo `SELECT n.numero, n.xml FROM nota n JOIN venda_nota vn ... WHERE ... AND n.xml IS NOT NULL AND n.nfechaveacesso IS NOT NULL AND COALESCE(n.cancelada,false)=false`.

### Verificação de leitura (3d)
- Pixel 1x1 (`GET /cobranca/email/:token/pixel.gif`, `@Public()`) grava `abertoEm` na 1ª carga.
- Link "Confirmar recebimento" (`GET /cobranca/email/:token/confirmar`, `@Public()`) grava `confirmadoEm` e mostra página HTML mínima "Recebimento confirmado".
- Token opaco por envio (`randomBytes(24)` = 48 hex). Página de confirmação idêntica mesmo com token inválido (não enumerar).
- Model Prisma `CobrancaEmailEnvio` + migration SQL à mão (`20260827120000_add_cobranca_email_envio`): token, idclienteAthos, destinatario, assunto, status `enviado|aberto|confirmado`, `cobrancaBoletoId Int?` (FK `ON DELETE SET NULL`), `nfseEmitidaIds Int[]`, `nfeNumeros String[]` (ou `Int[]`), timestamps `enviadoEm/abertoEm/confirmadoEm/criadoEm/atualizadoEm`.

### Corpo do e-mail
- Assunto: `Boleto e nota fiscal — {EMPRESA_NOME}`.
- HTML simples (1 coluna) + versão texto puro: saudação com **nome do cliente** (buscar sempre do Athos, mesmo quando o destinatário é digitado), lista dos anexos, botão verde "Confirmar recebimento" → `confirmUrl`, fallback em texto com a URL, `<img>` 1x1 no fim.
- Rodapé: `EMPRESA_NOME` / `EMPRESA_TELEFONES` / `EMPRESA_EMAIL` (env vars existentes; linha some se vazias).
- Nome do remetente é institucional (vem de `SMTP_FROM`), não pessoal.

### Transporte (2a)
- `nodemailer` + Gmail SMTP com **App Password**. Env vars: `SMTP_HOST` (smtp.gmail.com), `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS` (app password), `SMTP_FROM` (`"Financeiro Bom Custo Papelaria & Gráfica <financeiro@bomcustoilhabela.com.br>"`).
- **Usuário já preencheu as `SMTP_*` no `.env` local.** Adicionar placeholders vazios em `deploy/stack.env.example` e passthrough `VAR: ${VAR}` no `environment:` do backend nos dois composes (`docker-compose.vps.yml`, `docker-compose.box.vps.yml`).
- `SMTP_USER` = mesmo endereço do `<...>` do `SMTP_FROM` (Gmail não deixa "enviar em nome de" outro).

### UI (frontend)
- Botão **"E-mail"** (ícone envelope) no cabeçalho de cada grupo de boleto em `contas-receber/[idcliente]/page.tsx`, ao lado de "PDF / Verificar / Cancelar".
- Modal com estados `confirm | loading | success | error`: destinatário editável (pré-preenchido de `emailcobrancacliente`/`emailcliente` do Athos), texto "Serão anexados: boleto (PDF) + N NFS-e (PDF) + M NF-e (XML)", botão "Enviar e-mail".
- `success`: "E-mail enviado para {destinatário}" + aviso curto de que a confirmação de leitura depende do cliente abrir a imagem/clicar no link.
- Rota proxy nova `api/cobranca/email/enviar/route.ts` (espelha `boleto/route.ts`, payload explícito).

### Base / branch (1a)
Trabalhar na branch atual `fix/orcamento-total-desconto-zerado` (já contém a infra de NFS-e das PRs #54/#56). NÃO criar branch, NÃO forkar da `main` (revertida ao estado do PR #53). NÃO tocar `main` nem a PR #56. `init.quick` retornou `branch_name: null`.

## Fora de escopo (explícito)

- DANFE renderizado da NF-e, parser de NF-e, `bwip-js`, código de barras, Puppeteer para NF-e.
- Qualquer botão avulso em tela ("Ver DANFE", "Baixar XML") — o **único** botão é o "Confirmar recebimento" dentro do e-mail.
- Fila/retry de envios falhos, webhooks de bounce/entrega, unsubscribe, seleção manual de quais documentos anexar, i18n do corpo, NFC-e modelo 65.
- Não trocar Gmail por serviço transacional. Segredos nunca commitados (`.env`, `deploy/stack.env` já no `.gitignore`; `.example` só placeholders).

## Notas de confiabilidade (documentar no PLAN)

- Pixel de rastreamento é sinal fraco (Gmail faz proxy/cache de imagens). O link de confirmação é o sinal forte.
- Gmail SMTP tem limite (~500/dia) — suficiente pro volume atual, não é envio em massa.
- Dev sem nginx: `APP_BASE_URL=http://localhost:4000` pra os links de pixel/confirmação resolverem direto no backend.
