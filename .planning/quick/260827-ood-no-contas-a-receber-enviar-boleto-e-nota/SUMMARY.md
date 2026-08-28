---
quick_id: 260827-ood-no-contas-a-receber-enviar-boleto-e-nota
title: "Contas a receber - enviar boleto (PDF) + NFS-e (PDF DANFSe) + NF-e (XML cru) num e-mail so, com verificacao de leitura"
branch: fix/orcamento-total-desconto-zerado
status: complete
date: 2026-08-28
tasks_total: 7
tasks_completed: 7
commits: [2b63a46, 1ca4fa8, 65c2723, bcfff9c, 2eb5728, 149c312, 6bba324]
---

# Quick task 260827-ood - Summary

Acao "E-mail" no cabecalho de cada grupo de boleto em contas-receber/[idcliente]. Um unico e-mail
(nodemailer + Gmail SMTP / App Password) anexa: boleto PDF (downloadBoletoPdf), NFS-e PDF DANFSe
(baixarDanfsePdf) e NF-e de produto como XML cru (nota.xml do Athos, application/xml, sem
DANFE/parser/barcode). Cada envio grava CobrancaEmailEnvio com token opaco (randomBytes(24) = 48 hex),
pixel 1x1 (abertoEm) e link "Confirmar recebimento" (confirmadoEm).

Todo o trabalho na branch fix/orcamento-total-desconto-zerado. main e PR #56 intocadas. Nenhum push.

## Por task

- Task 1 (2b63a46): schema.prisma - model CobrancaEmailEnvio (token unique, status default "enviado",
  nfseEmitidaIds Int[], nfeNumeros String[], cobrancaBoletoId Int? onDelete SetNull, timestamps) +
  back-relation emailEnvios em CobrancaBoleto. migration.sql a mao em
  20260827120000_add_cobranca_email_envio/ (FK ON DELETE SET NULL ON UPDATE CASCADE).
- Task 2 (1ca4fa8): deploy/stack.env.example - bloco SMTP_HOST=smtp.gmail.com / SMTP_PORT=465 /
  SMTP_USER= / SMTP_PASS= / SMTP_FROM (endereco de exemplo, sem segredo real).
  docker-compose.vps.yml e docker-compose.box.vps.yml - 5 linhas SMTP passthrough VAR: dollar-VAR no
  environment do backend. frontend intocado.
- Task 3 (65c2723): AthosService.buscarNotasFiscaisXmlPorTitulos(idcontasReceber): read-only, []
  se vazio sem conexao, getPool() + client.release() no finally, query ancorada em conta_receber
  (JOIN venda_nota/nota, ANY($1)), filtros n.xml IS NOT NULL / n.nfechaveacesso IS NOT NULL /
  COALESCE(n.cancelada,false)=false, dedup por numero no JS, catch -> logger.warn + return [].
- Task 4 (bcfff9c): npm install nodemailer + -D @types/nodemailer no backend. email-envio.service.ts
  novo: buildTransport() (SMTP vars obrigatorias, secure=port===465); enviarBoletoENotas (exige boleto
  OU nfse; sempre busca cliente Athos p/ saudacao; destinatario informado ou
  emailcobrancacliente||emailcliente com regex; anexa boleto PDF + NFS-e PDF (ids unicos) +
  NF-e-NUMERO.xml application/xml via cobrancaBoleto.titulos[].idcontareceber ->
  buscarNotasFiscaisXmlPorTitulos; token randomBytes(24); URLs de APP_BASE_URL sem barra final;
  assunto "Boleto e nota fiscal - EMPRESA_NOME"; html 1 coluna + text puro, saudacao pelo nome
  Athos, frase "boleto (PDF) + N NFS-e (PDF) + M NF-e (XML)", botao verde -> confirmUrl, fallback
  textual, rodape EMPRESA_NOME/TELEFONES/EMAIL, img pixel; sendMail e SO ENTAO
  cobrancaEmailEnvio.create(status "enviado"); falha sendMail -> 500 sem row; retorna
  id/token/destinatario/status/anexos); registrarAbertura (grava abertoEm + status "aberto" so
  1x, SEMPRE retorna gif 1x1, erros engolidos com warn); registrarConfirmacao (confirmadoEm senao now,
  status "confirmado", abertoEm senao now; token desconhecido -> found:false sem throw).
  cobranca.module.ts: EmailEnvioService nos providers.
- Task 5 (2eb5728): dto/enviar-email-cobranca.dto.ts novo (EnviarEmailCobrancaDto, class-validator,
  idclienteAthos obrigatorio, resto IsOptional). cobranca.controller.ts: injeta EmailEnvioService;
  Post("email/enviar") autenticado -> enviarBoletoENotas; Public Get("email/:token/pixel.gif") ->
  gif image/gif no-store Content-Length res.end; Public Get("email/:token/confirmar") -> HTML
  "Recebimento confirmado" (identica com token inexistente). email/enviar antes dos :token.
- Task 6 (149c312): email-envio.service.test.ts novo, jest.mock("nodemailer"),
  Object.create(prototype) + deps. 7 casos: 5 anexos + filenames NF-e-440/441.xml + contentType +
  html com baseURL/token/img/nome Athos + create com status/token 48hex/nfeNumeros/nfseEmitidaIds;
  fallback emailcobrancacliente; BadRequest sem e-mail; BadRequest sem documento; sem NF-e ->
  nfeNumeros []; registrarAbertura (grava 1x, gif 43 bytes, 2a chamada nao regrava);
  registrarConfirmacao (row existente vs token desconhecido).
- Task 7 (6bba324): api/cobranca/email/enviar/route.ts novo (proxy espelhando boleto/route.ts,
  payload explicito). contas-receber/[idcliente]/page.tsx: estados emailModalState/emailCtx/
  emailDestinatario/emailResult/emailErro; abreEmailModal(boleto,tsBoleto) deriva nfseEmitidaIds
  (Set de nfseAtivo.nfseEmitidaId) e nfeCount (Set por numeroNf de titulos com
  tipoNf.includes NF-e), pre-preenche destinatario de dadosCliente; confirmarEnviarEmail POST
  /api/cobranca/email/enviar; botao btn-outline-success "E-mail" (bi bi-envelope) no div
  "ms-auto d-flex gap-2" do header do grupo; modal 4 estados reutilizando boleto-modal-*; success
  lista emailResult.anexos + aviso do pixel. Secao notasFiscaisAthos NAO tocada.

## Acceptance checks - PASSARAM

- npx prisma validate (via dotenv -e ../../.env) -> schema is valid
- npx prisma migrate deploy -> 20260827120000_add_cobranca_email_envio aplicada (bomcusto11 @ 72.60.253.108:5435)
- npx prisma generate -> client regenerado
- npx prisma migrate status -> Database schema is up to date
- node -e cobrancaEmailEnvio.findMany take:0 -> ok
- git status Task 1 -> schema.prisma modificado + pasta migration nova
- grep -c "^SMTP_" deploy/stack.env.example -> 5
- grep -E "^SMTP_(USER|PASS)=$" -> 2
- grep -c SMTP_PASS passthrough em vps.yml / box.vps.yml -> 1 / 1
- grep -rIn "SMTP_PASS=.+" deploy/stack.env.example -> sem match (nenhum segredo real)
- npx tsc -p tsconfig.build.json --noEmit (apos Tasks 3,4,5) -> sem erros
- grep buscarNotasFiscaisXmlPorTitulos athos.service.ts -> assinatura + query + release() + catch/warn/return[]
- grep -c "COALESCE(n.cancelada, false) = false" athos.service.ts -> 5 -> 6 (+1)
- node -e nodemailer && @types/nodemailer -> exit 0
- grep -c EmailEnvioService cobranca.module.ts -> 2
- grep buscarNotasFiscaisXmlPorTitulos / contentType application/xml / NF-e- em email-envio.service.ts -> 3 presentes
- grep -c "@Public()" cobranca.controller.ts -> 1 -> 3 (+2)
- npx jest src/modules/cobranca/email-envio.service.test.ts -> 7 passed
- npm test (suite completa) -> 28 suites / 397 tests passed, sem regressao
- cd apps/frontend && npm run build -> compila sem erro; rotas /api/cobranca/email/enviar e /contas-receber/[idcliente] listadas
- git grep "cobranca/email/enviar" apps/frontend/src -> page.tsx + api/cobranca/email/enviar/route.ts
- git grep "bi-envelope" [idcliente]/page.tsx -> 1 match (botao E-mail)

## Verificacao manual pendente (precisa de backend + DB + Gmail rodando)

1. POST autenticado:
   curl -s -o /dev/null -w "%{http_code}" -X POST localhost:4000/api/cobranca/email/enviar
   -H "x-internal-api-key: INTERNAL_API_KEY" -H "content-type: application/json"
   -d idclienteAthos+cobrancaBoletoId   -> 200 + 1 row nova em CobrancaEmailEnvio
2. Pixel publico:
   curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}"
   localhost:4000/api/cobranca/email/TOKEN/pixel.gif    -> 200 image/gif 43
3. Confirmacao publica:
   curl -s -o /dev/null -w "%{http_code} %{content_type}"
   localhost:4000/api/cobranca/email/TOKEN/confirmar     -> 200 text/html; charset=utf-8
4. Transicao de status:
   psql DATABASE_URL -c SELECT id,status,abertoEm,confirmadoEm,nfeNumeros FROM CobrancaEmailEnvio ORDER BY id DESC LIMIT 1
   enviado -> aberto (apos pixel) -> confirmado (apos confirmar)
5. Envio real ponta-a-ponta pela UI (npm run dev, APP_BASE_URL=http://localhost:4000 no apps/backend/.env):
   /contas-receber/IDCLIENTE de cliente com boleto emitido + NFS-e anexada + NF-e Athos -> botao
   "E-mail" -> ajustar destinatario -> "Enviar e-mail" -> sucesso com lista de anexos. Caixa de
   entrada: 1 e-mail com boleto .pdf, NFSe-N.pdf e NF-e-N.xml (XML cru, nao PDF); saudacao pelo
   nome do cliente; botao verde + pixel invisivel.

Obs: apps/backend/.env nao existe neste ambiente; SMTP vars e APP_BASE_URL vivem no .env da raiz
(usado via dotenv -e ../../.env para o Prisma). O envio real depende do usuario ter SMTP vars +
APP_BASE_URL no .env do backend em runtime.

## Desvios do PLAN.md

1. GIF 1x1 de 43 bytes (Tasks 4/6). A string base64 do PLAN
   (R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7) decodifica para 42 bytes, mas todos
   os criterios de aceite exigem 43 (size_download=43, "Buffer de 43 bytes"). Troquei pela variante
   canonica do GIF89a transparente R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==
   (43 bytes, verificado com Node). Constante GIF_1X1_BASE64 com comentario. Sem outro impacto.
2. Prisma exige DATABASE_URL (Task 1). Nao ha apps/backend/.env; o .env da raiz tem DATABASE_URL.
   Comandos Prisma rodados via npx dotenv -e ../../.env -- prisma ... (dotenv-cli ja e devDependency
   do backend). Nenhuma mudanca de codigo.
3. Icone do titulo do modal (Task 7): para manter git grep bi-envelope com exatamente 1 match (o
   botao, como pede o aceite), o titulo do modal usa bi bi-send em vez de bi bi-envelope. Cosmetico.
4. Versoes das libs (Task 4): npm install trouxe nodemailer 9.x e @types/nodemailer 8.x (latest);
   PLAN nao fixa versao. API usada (createTransport/sendMail/attachments) e estavel.

## Rollback

git revert dos 7 commits (2b63a46..6bba324); DROP TABLE CobrancaEmailEnvio; + remover
apps/backend/prisma/migrations/20260827120000_add_cobranca_email_envio/ e a back-relation
emailEnvios em CobrancaBoleto; npx prisma generate. As SMTP vars em branco sao inertes.
npm uninstall nodemailer @types/nodemailer no apps/backend se quiser reverter a dependencia.
