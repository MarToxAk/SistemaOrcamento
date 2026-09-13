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

## Fora de escopo (deliberado)

- Painel web de administração — o export CSV cobre a necessidade do sorteio.
- Autenticação de operador com usuário/senha — o token único basta.
- Geração de QR code ou PDF de cupom (D-05).
- Qualquer leitura ou escrita no Athos (D-02) ou no banco do app de orçamento
  (D-01) — este serviço é 100% isolado.
