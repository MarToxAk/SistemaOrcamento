# Guia Completo de Replicação - PDF BACK

## 1) Objetivo

Este documento descreve, de ponta a ponta, como replicar o projeto de geração de orçamento em PDF com Node.js, Handlebars, Puppeteer e MinIO/S3.

Você terá:
- Mesmo fluxo de geração de PDF do projeto atual.
- Mesma estrutura de dados para preencher o template.
- API para retornar PDF direto e API para salvar em MinIO.
- Padrão para migrar com segurança para outros projetos.

## 2) Análise do Projeto Atual

## 2.1 Fluxo funcional implementado

Fluxo atual:
1. Recebe dados de orçamento.
2. Lê template HTML em templates/orcamento.html.
3. Compila HTML com Handlebars.
4. Gera PDF com Puppeteer.
5. Retorna PDF em resposta HTTP ou envia para bucket MinIO/S3.

## 2.2 Arquivos e função de cada um

- src/generateOrcamentoPDF.js
  - Função principal reutilizável.
  - Renderiza HTML, gera PDF e faz upload para S3 compatível (MinIO via aws-sdk).

- src/apiTeste.js
  - API Express de teste.
  - Gera PDF e retorna no corpo da resposta (application/pdf).

- src/apiTesteMinio.js
  - API Express de teste.
  - Gera PDF, envia para MinIO e também retorna o arquivo PDF.

- src/testGenerate.js
  - Script local para validar geração e upload sem subir API.

- templates/orcamento.html
  - Template visual do orçamento com placeholders Handlebars.

- package.json
  - Dependências do projeto e script de teste.

## 2.3 Dependências identificadas

- express
- handlebars
- puppeteer
- aws-sdk
- minio

Observação: o projeto usa duas estratégias de upload para MinIO:
- aws-sdk com endpoint S3 compatível (em src/generateOrcamentoPDF.js)
- client oficial minio (em src/apiTesteMinio.js)

## 2.4 Pontos de atenção encontrados na análise

1. Credenciais e endpoint estão hardcoded no código.
2. Há risco de erro no catch de src/apiTesteMinio.js porque fileName é usado fora do escopo onde foi declarado.
3. Em templates/orcamento.html existe um trecho de markup HTML dentro da tag style, o que pode quebrar CSS ou causar comportamento inconsistente.
4. README está com encoding incomum e conteúdo mínimo.

## 3) Estrutura recomendada para replicar em outro projeto

Use esta estrutura base:

- src/
  - services/
    - pdfService.js
    - storageService.js
  - templates/
    - orcamento.html
  - routes/
    - orcamento.routes.js
  - app.js
  - server.js
- tests/
  - testGenerate.js
- .env
- .env.example
- package.json
- README.md
- GUIA_REPLICACAO_PDF_BACK.md

Se quiser manter exatamente como está hoje, você também pode usar:
- src/generateOrcamentoPDF.js
- src/apiTeste.js
- src/apiTesteMinio.js
- src/testGenerate.js
- templates/orcamento.html

## 4) Setup completo (replicação)

## 4.1 Pré-requisitos

- Node.js 18 ou superior.
- Acesso ao MinIO ou S3 compatível.
- Bucket criado (exemplo: orcamento).

## 4.2 Inicialização

1. Copie a estrutura do projeto.
2. Instale dependências com npm install.
3. Crie arquivo .env com credenciais.
4. Suba a API com node src/apiTeste.js ou node src/apiTesteMinio.js.
5. Teste a rota GET /api/teste-pdf.

## 4.3 Variáveis de ambiente (fortemente recomendado)

Exemplo de .env.example:

MINIO_ENDPOINT=minio.seudominio.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=SEU_ACCESS_KEY
MINIO_SECRET_KEY=SUA_SECRET_KEY
MINIO_BUCKET=orcamento
PUBLIC_BASE_URL=https://minio.seudominio.com
PORT=3000

Para aws-sdk (S3 compatível), também pode usar:

S3_ENDPOINT=https://minio.seudominio.com
S3_ACCESS_KEY=SEU_ACCESS_KEY
S3_SECRET_KEY=SUA_SECRET_KEY
S3_BUCKET=orcamento
S3_FORCE_PATH_STYLE=true
S3_SIGNATURE_VERSION=v4

## 5) Contrato de dados do orçamento

Estrutura mínima esperada para renderizar o template atual:

{
  "idorcamento": 13803,
  "dataorcamento": "30/03/2026",
  "cliente": {
    "nome": "Nome do Cliente",
    "telefone": "(00) 00000-0000",
    "email": "cliente@email.com"
  },
  "itens": [
    {
      "sequenciaitem": 1,
      "produto": {
        "descricaoproduto": "Produto",
        "descricaocurta": "Descrição curta"
      },
      "valoritem": "35,00",
      "quantidadeitem": 2,
      "orcamentovalorfinalitem": "70,00"
    }
  ],
  "carimbos": {
    "itens": [
      {
        "numero": 1,
        "carimbo": "CARIMBO",
        "descricao": "Texto do carimbo",
        "dimensoes": "47X18"
      }
    ]
  },
  "totais": {
    "valor": "130,00",
    "desconto": "",
    "valoracrescimo": ""
  },
  "observacoes": "Texto livre",
  "vendedorNome": "Nome Vendedor",
  "validade": "2 dias",
  "prazoEntrega": "03/04/2026",
  "condicaoPagamento": "À vista",
  "aceitarUrl": "https://...",
  "recusarUrl": "https://..."
}

## 6) Rotas recomendadas para replicação

## 6.1 Gerar PDF em memória e retornar no response

- Método: GET ou POST
- Caminho: /api/teste-pdf
- Resposta: application/pdf

Uso ideal: quando o consumidor quer baixar/visualizar imediatamente.

## 6.2 Gerar PDF e salvar no MinIO

- Método: GET ou POST
- Caminho: /api/teste-pdf
- Ação: upload no bucket
- Retorno: PDF e/ou URL pública

Uso ideal: quando precisa armazenar histórico e referenciar arquivo por link.

## 7) Padronização para produção

## 7.1 Segurança

1. Remover credenciais hardcoded.
2. Usar .env e segredo no provedor (Vault, Secrets Manager, etc.).
3. Revisar necessidade de ACL pública.
4. Se arquivo for sensível, preferir URL assinada com expiração.

## 7.2 Confiabilidade

1. Definir timeout de geração e upload.
2. Adicionar retry para upload.
3. Log estruturado por request id.
4. Validar payload antes de renderizar template.

## 7.3 Performance

1. Evitar abrir navegador novo para cada request em alto volume.
2. Usar pool/reuso de browser quando necessário.
3. Limitar concorrência para não saturar CPU/RAM.

## 8) Correções recomendadas antes de replicar

## 8.1 Corrigir escopo de fileName no fluxo MinIO

No fluxo atual, fileName pode ficar indisponível no catch. Defina a variável fora do bloco interno para evitar erro de referência.

## 8.2 Limpar CSS/template

Remover markup indevido dentro da tag style no template. Isso evita quebra de renderização.

## 8.3 Unificar estratégia de SDK de storage

Escolher uma única abordagem para produção:
- Opção A: aws-sdk (S3 compatível)
- Opção B: minio client oficial

Manter as duas aumenta custo de manutenção.

## 9) Checklist de replicação (copiar e executar)

1. Copiar estrutura de pastas.
2. Copiar template HTML.
3. Instalar dependências.
4. Configurar .env.
5. Testar geração local com script.
6. Testar rota de API retornando PDF.
7. Testar upload no bucket.
8. Validar URL de acesso ao arquivo.
9. Remover credenciais hardcoded.
10. Ajustar logs, timeout e tratamento de erro.

## 10) Comandos de execução

- Rodar teste local:
  - node src/testGenerate.js

- Rodar API de teste sem upload:
  - node src/apiTeste.js

- Rodar API de teste com upload no MinIO:
  - node src/apiTesteMinio.js

## 11) Critério de pronto para replicar em outros projetos

Seu clone está pronto quando:
1. Gera PDF idêntico ao layout esperado.
2. Template renderiza com dados reais sem quebrar.
3. Upload no bucket retorna sucesso.
4. URL abre o PDF final.
5. Não existem segredos no código-fonte.

## 12) Resumo executivo

O projeto já está funcional para geração e upload de PDFs. Para replicar com qualidade profissional em outros projetos, os pontos-chave são:
- Parametrizar configurações por ambiente.
- Corrigir pequenos riscos de robustez (escopo de variável e limpeza de template).
- Definir padrão único de integração com MinIO/S3.
- Formalizar validação de payload e observabilidade.

Com este guia, você consegue reproduzir o mesmo backend de PDF de forma consistente e escalável em novas aplicações.
