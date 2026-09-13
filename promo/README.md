# Sorteio Dia das Crianças — Bom Custo

Microsite standalone de captação de cupons para o sorteio do Dia das Crianças da
Bom Custo Papelaria & Gráfica Rápida. Servido em
**https://promocao.bomcustoilhabela.com.br/**.

Este serviço **não** compartilha banco com o app de orçamento e **não** lê nem
escreve nada no Athos (D-01, D-02). É um sub-projeto isolado dentro deste
repositório, com seu próprio banco SQLite e seu próprio deploy Docker.

## O que é

Um visitante lê o QR code impresso no cupom físico, abre
`https://promocao.bomcustoilhabela.com.br/?id=NNNN`, vê o número do seu cupom
na tela, preenche nome/telefone/NFC-e e envia. O cadastro fica gravado no banco
SQLite dedicado do sorteio, vinculado ao número do cupom. Um mesmo cupom só
pode ser cadastrado uma vez.

Os QR codes sequenciais e os cupons físicos impressos são gerados e
produzidos **fora deste sistema**, pelo usuário (D-04, D-05) — este projeto
não gera PDF nem imagem de QR code.

## Rodar localmente

Em dois terminais, na pasta `promo/`:

```bash
npm install

# terminal 1 — build + backend (serve o frontend + API na mesma porta)
npm run build
npm start

# terminal 2 — frontend com hot-reload, proxy /api -> localhost:3100
npm run dev
```

Abra `http://localhost:5173/?id=1234` (modo dev) ou
`http://localhost:3100/?id=1234` (modo produção local).

## Variáveis de ambiente

Ver `promo/.env.example` para a lista completa com comentários. Resumo:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | não (padrão 3100) | Porta em que o servidor escuta |
| `PROMO_DB_PATH` | não (padrão `./data/promo.db`) | Caminho do arquivo SQLite dedicado |
| `PROMO_ADMIN_TOKEN` | sim, para exportar CSV | Segredo exigido para baixar os cadastros. Gerar com `openssl rand -hex 24` |
| `TRUST_PROXY` | não (padrão desligado) | Ligar somente atrás de um proxy reverso confiável (nginx em produção) |

## QR code e cupom físico

A URL de cada cupom segue o formato:

```
https://promocao.bomcustoilhabela.com.br/?id=NNNN
```

onde `NNNN` é o número sequencial do cupom (também aceita `?cupom=NNNN`). A
geração dos QR codes e a impressão dos cupons físicos são responsabilidade do
usuário, fora deste sistema (D-04, D-05).

## Baixar a lista para o sorteio

O operador baixa todos os cadastros em CSV acessando:

```
https://promocao.bomcustoilhabela.com.br/api/cadastros.csv?token=SEU_PROMO_ADMIN_TOKEN
```

**Atenção:** essa URL contém o segredo `PROMO_ADMIN_TOKEN` no próprio link —
não compartilhe nem cole esse link em canais públicos (grupos, redes sociais).
Sem o token, a resposta é `401`. Se o servidor não tiver `PROMO_ADMIN_TOKEN`
configurado, a resposta é `503` (falha fechada — nunca libera a lista por
esquecimento de configuração).

O CSV é gerado com BOM UTF-8 (acentos corretos ao abrir no Excel em
português) e cada célula que começaria com `=`, `+`, `-` ou `@` é prefixada
por apóstrofo, para nunca ser interpretada como fórmula pela planilha.

## Subir e atualizar em produção

```bash
docker compose -f deploy/docker-compose.promo.yml up -d --build
```

Isso reconstrói a imagem e reinicia o container `promo-sorteio`, preservando
o banco (ver seção abaixo). Antes do primeiro deploy, crie
`deploy/promo.env` (não versionado) a partir de `promo/.env.example`, com o
`PROMO_ADMIN_TOKEN` real.

O DNS de `promocao.bomcustoilhabela.com.br` precisa apontar para a VPS, e o
certificado TLS é emitido com:

```bash
certbot --nginx -d promocao.bomcustoilhabela.com.br
```

## Onde o banco vive / backup

O banco SQLite vive no volume Docker nomeado `promo_data`, no arquivo
`/data/promo.db` dentro do container. Ele sobrevive a rebuilds da imagem
(`up -d --build`) porque o volume é nomeado, não anônimo.

Para fazer backup antes do sorteio (com o container rodando):

```bash
docker cp promo-sorteio:/data/promo.db ./backup-promo-$(date +%Y%m%d).db
```

## Integrações (validação de cupom fiscal + WhatsApp)

### Regra do sorteio

O cliente só consegue se cadastrar apresentando o número do **cupom fiscal
(COO)** de uma compra real: o servidor valida o COO contra a tabela `venda`
do Athos, exigindo uma venda **não cancelada** e de **no mínimo R$ 50,00**.
Cupom fiscal cancelado (`cupomcancelado`) também não vale.

### Caminho da validação

O microsite **nunca** acessa o Postgres do Athos diretamente. A validação
passa por uma chamada HTTP autenticada ao backend de orçamento (NestJS)
já existente:

```
POST /api/cadastro (promo)
  -> verificarCupomFiscal (promo/server/athos.js)
  -> GET {PROMO_ATHOS_BASE_URL}/athos/venda/verificar-cupom (backend NestJS)
  -> AthosService.verificarCupomFiscalSorteio
  -> SELECT na tabela venda do Athos
```

### Comportamento fail-closed

| Situação | Resposta | O que o operador vê |
|---|---|---|
| COO não bate nenhuma venda válida | `422 cupom_fiscal_invalido` | Mensagem pedindo para conferir o COO impresso no cupom |
| Backend indisponível, sem configuração, ou timeout | `503 validacao_indisponivel` | Mensagem pedindo para tentar novamente em alguns minutos |

Em ambos os casos, **nenhuma linha é gravada**. A decisão é deliberada
(D-03): se o backend de validação cair durante o sorteio, ninguém consegue
se cadastrar por alguns minutos — o inverso (aceitar sem validar) daria
prêmio a cupom fiscal inexistente, o que é pior.

### Variáveis novas (validação Athos)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PROMO_ATHOS_BASE_URL` | sim | URL base do backend NestJS, incluindo `/api` |
| `PROMO_ATHOS_API_TOKEN` | sim | Mesmo valor de `ATHOS_API_TOKEN` do backend |
| `PROMO_BACKEND_INTERNAL_API_KEY` | sim | Mesmo valor de `INTERNAL_API_KEY` do backend |
| `PROMO_ATHOS_TIMEOUT_MS` | não (padrão 5000) | Timeout da chamada de validação |

Grave os valores reais **somente** em `deploy/promo.env` (não versionado).

### Mensagem de WhatsApp (best-effort)

Ao aceitar um cadastro, o servidor dispara — de forma best-effort — uma
mensagem de confirmação via Evolution API para o telefone digitado, com o
cupom em 5 dígitos e as 4 regras do sorteio. Falha no envio (API fora,
número inválido, timeout de 5s) **nunca** desfaz o cadastro: a resposta
continua `201` e a linha permanece gravada, só o campo `whatsapp.enviado`
vem `false`.

### Descobrir o nome da instância do WhatsApp

A Evolution API espera o **nome** da instância no path da chamada de envio,
mas o identificador que aparece na URL do painel
(`/manager/instance/<uuid>/dashboard`) é o **UUID**, não o nome. Para
descobrir o nome correspondente:

```bash
curl -H "apikey: SEU_APIKEY" https://SEU_HOST/instance/fetchInstances
```

### Variáveis novas (WhatsApp)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PROMO_WHATSAPP_HOST` | não (sem ela, só não envia) | Raiz do host da instância Evolution (sem `/manager`, sem barra final) |
| `PROMO_WHATSAPP_INSTANCE` | não | Nome da instância (ver acima) |
| `PROMO_WHATSAPP_API_KEY` | não | apikey da instância |
| `PROMO_WHATSAPP_TIMEOUT_MS` | não (padrão 5000) | Timeout do envio |

Grave os valores reais **somente** em `deploy/promo.env` (não versionado).
Sem as 3 primeiras, o cadastro continua funcionando normalmente — só não
envia a mensagem.

## Fora de escopo (deliberado)

- Painel web de administração — o export CSV cobre a necessidade do sorteio.
- Autenticação de operador com usuário/senha — o token único basta.
- Geração de QR code ou PDF de cupom (D-05).
- Qualquer escrita no Athos, ou leitura fora do endpoint autenticado
  `GET /athos/venda/verificar-cupom` do backend (D-02).
