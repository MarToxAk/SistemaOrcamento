---
name: nfse-nacional-sefin-integracao
description: Estado da implementação de emissão automática de NFS-e via API do Sistema Nacional (ADN/Sefin Nacional) — endpoints, layout da DPS calibrado em produção real, o que falta pra ir ao ar, e riscos conhecidos.
metadata:
  type: project
---

# NFS-e Nacional (ADN/Sefin Nacional) — emissão automática

**Status em 27/08/2026: implementado no código (backend + frontend). Certificado A1 real configurado e validado (mTLS + assinatura passam). BLOQUEADO por cadastro do governo até 01/09/2026 — ver abaixo.** Retomar em 01/09/2026.

## BLOQUEIO ATÉ 01/09/2026 (erro E0084)

Teste real em 27/08/2026 (local, contra produção `sefin.nfse.gov.br`) retornou **E0084**: "CNPJ do emitente prestador não possui estabelecimento ou domicílio em um município correspondente ao município emissor, na data de competência informada na DPS, conforme cadastros CNPJ e CNC NFS-e." A **mesma emissão pelo portal EmissorNacional também foi recusada**: "Na data de competência informada, o cadastro referente à inscrição 62391927000157 não foi encontrado ou não está habilitado para emissão de NFS-e, dentre os municípios conveniados ao Sistema Nacional da NFS-e. Por favor, informe outra data de competência."

Ou seja: **não é bug de código nem de certificado** (API e portal concordam). A habilitação do CNPJ 62391927000157 no Sistema Nacional via Ilhabela **só entra em vigor em 01/09/2026** (confirmado pelo usuário). Antes dessa data qualquer `dCompet` é rejeitado.

Ação: a partir de 01/09/2026, testar emissão de R$1,00 + cancelar. Se ainda der E0084, confirmar com a Prefeitura de Ilhabela a vigência do convênio e a habilitação do CNPJ para emissão via **API Sefin** (não só portal). Até lá, produção fica no fluxo de anexo manual do XML (PR #54 / commit `8a7f8eb`). O `dCompet` no `nfse-nacional-dps.util.ts` está fixo em "hoje" (`new Date()`); se precisar emitir competência retroativa dentro da janela, adicionar campo opcional `dataCompetencia` no DTO/builder.

## Contexto / Por quê

A emissão via SOAP com o provedor municipal iiBrasil foi descontinuada pela prefeitura de Ilhabela (ver [[nfse-iibrasil-integracao]]). Desde então a nota era emitida manualmente pelo portal `nfse.gov.br/EmissorNacional` e o XML assinado anexado ao sistema. Esta sessão implementou emissão automática direto pela API do governo (Sistema Nacional NFS-e / Sefin Nacional), reaproveitando o padrão de certificado mTLS já usado para a EFI.

## O que já existe (arquivos)

Backend (`apps/backend/src/modules/`):
- `integrations/nfse/nfse-nacional-dps.util.ts` — monta e assina a DPS (XMLDSig via `xml-crypto`)
- `integrations/nfse/nfse-nacional.service.ts` — cliente mTLS (axios + `https.Agent`), `emitir()` e `cancelar()`
- `integrations/nfse/danfse-xml-parser.util.ts` + `danfse-pdf.template.ts` + `danfse-pdf.service.ts` — geração local do PDF (DANFSe), pois a API do governo que gerava esse PDF foi **descontinuada em 03/08/2026** (NT 008/2026 — DANFSe 2.0); reaproveita o pipeline Handlebars+Puppeteer hardened já usado no PDF do orçamento (`QuotesPdfStorageService`)
- `integrations/nfse/dto/emitir-nfse-nacional.dto.ts` — DTO usado pelo endpoint de orçamento
- `cobranca/dto/emitir-nfse-cobranca.dto.ts` — DTO usado pelo endpoint de contas a receber
- Endpoints novos: `POST /quotes/:quoteId/nfse/emitir`, `GET /quotes/:quoteId/nfse/pdf`, `POST /cobranca/nfse/emitir`, `GET /cobranca/nfse/:id/pdf`, `GET /cobranca/nfse/tomador/:idclienteAthos`

Frontend:
- `apps/frontend/src/app/orcamento/[id]/page.tsx` — botão "Emitir NFS-e automaticamente" (form com serviço/valor/CPF-CNPJ/nome) + "Baixar PDF (DANFSe)"
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — modal de NFS-e com toggle "Anexar XML manual" / "Emitir automaticamente"; puxa CPF/CNPJ, nome e **endereço** do tomador automaticamente via `athosService.buscarClientePorId` (nunca digitado); mostra lista de itens de serviço (nome+quantidade+valor) e descrição pré-montada editável; checkbox opcional "Incluir IBS/CBS"
- Rotas de proxy novas em `apps/frontend/src/app/api/quotes/[id]/nfse/{emitir,pdf}` e `apps/frontend/src/app/api/cobranca/nfse/{emitir,tomador/[id],[id]/pdf}`

## Fatos validados contra a API real (não são achismo — testados em 26-27/08/2026)

- **Autenticação:** mTLS puro com o certificado A1 (não é bearer token). Endpoint de emissão: `POST https://sefin.nfse.gov.br/SefinNacional/nfse` em produção (`sefin.producaorestrita.nfse.gov.br` em homologação — mas homologação **não tem o convênio de Ilhabela cadastrado**, então testes reais só validam em produção).
- **Envelope:** `{"dpsXmlGZipB64": "<xml assinado, gzip, base64>"}`. Resposta 201 traz `chaveAcesso` + `nfseXmlGZipB64` (idem gzip+base64).
- **DPS versão 1.01**, mas **sem** o grupo `<IBSCBS>` — testado com sucesso (NFS-e real nº 2, chave `35204002262391927000157000000000000226086158788129`, emitida e cancelada logo em seguida por ser teste técnico de R$1,00). O grupo é opcional; quando incluído (checkbox no front), usa classificação fixa `CST 000 / cClassTrib 000001` (tributação integral) — **o emitente não escolhe uma alíquota**, quem calcula o valor do CBS/IBS é o próprio Sistema Nacional a partir da classificação declarada.
- **`cTribMun` NÃO deve ser enviado** para Ilhabela (o município não tem código próprio cadastrado) — enviar qualquer valor dá erro `E0314`. Isso foi descoberto comparando com um XML real emitido pelo portal do governo.
- **`dhEmi` precisa de margem de segurança** (5 min) por clock drift real entre o servidor e a API do governo — sem isso dá erro `E0008` (data de emissão no futuro).
- **Tabela de serviços validada** (CNAE → LC116 → cTribNac → NBS), cruzada com a planilha oficial da Receita (Anexo VIII):

  | Serviço | cTribNac | NBS |
  |---|---|---|
  | Composição gráfica / impressão | `130501` | `121012100` |
  | Encadernação e acabamento | `140801` | `121012200` |
  | Confecção de carimbos/sinalização | `240101` | `126060000` |

- **Cancelamento:** `POST /nfse/{chaveAcesso}/eventos`, evento `e101101`. **Atenção:** o `Id` do `infPedReg` mudou em 27/12/2025 — não inclui mais `nPedRegEvento` (era `PRE`+chave+tipoEvento+seq, agora é só `PRE`+chave(50)+tipoEvento(6), 59 dígitos). Muita documentação desatualizada por aí ainda mostra o formato antigo.

## Riscos conhecidos / pendências

1. **Certificado real extraído e posto em `deploy/stack.env` local (gitignored) em 27/08/2026.** A1 e-CNPJ `CN=BOM CUSTO…:62391927000157`, validade 31/07/2026→31/07/2027. `.pfx` de origem: `BOM CUSTO…(SENHA 12345678)(2).pfx` (senha `12345678`), extraído com o openssl do `Git/mingw64` (o de `Git/usr/bin` não carrega o provider legacy; o `.pfx` usa AES, então nem precisa de `-legacy`). `CERT_PEM`/`KEY_PEM` gravados em 1 linha com `\n` literal (o `loadPem` faz `replace(/\\n/g,"\n")`); round-trip validado com openssl (par cert+key bate, md5 `ba56dac2…`). Handshake mTLS contra `sefin.nfse.gov.br:443` aceito. **Falta o usuário colar o bloco (linhas 78–86 do stack.env) no editor de env da stack no Portainer de produção.** Os composes **não usam `env_file:`** — cada var é repassada explícita; as 5 `NFSE_NACIONAL_*` foram adicionadas no `environment:` do backend em `docker-compose.vps.yml` e `docker-compose.box.vps.yml` (commit pendente).
2. **`npm install` em produção** pra pegar a dependência nova `xml-crypto` — precisa de **build novo da imagem do backend**, não só redeploy.
3. **Endereço do tomador:** implementado buscando direto do Athos (`cliente_endereco`) no momento da emissão — mas o campo `codigocidade` dessa tabela **já foi identificado como não confiável** na integração antiga (iiBrasil tinha fallback via ViaCEP pra corrigir automaticamente quando a prefeitura rejeitava por incompatibilidade). Esse fallback **não foi recriado** na integração nova. Se aparecer erro de código de município do tomador, é isso — replicar a lógica de `enviarRpsComFallbackMunicipio` documentada em [[nfse-iibrasil-integracao]].
4. **Nada disso foi commitado ainda** (só está no working tree). Perguntar antes de commitar (não commitar sem pedido explícito).
5. Fluxo de orçamento (`/orcamento/[id]`) não tem a lista de itens nem o checkbox de IBS/CBS — só foi implementado no contas a receber até agora. O `Customer` do orçamento também não tem CPF/CNPJ/endereço cadastrado (schema não tem esses campos), então lá o tomador é sempre digitado manualmente.

## Como retomar

Perguntar ao usuário se quer: (a) recriar o fallback de ViaCEP pro código do município, (b) espelhar a lista de itens/IBS-CBS também no orçamento, (c) colocar o certificado real e testar em produção pra valer, (d) commitar o código.
