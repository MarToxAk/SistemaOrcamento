---
name: NFS-e iiBrasil - Documentação de Integração
description: Regras críticas, erros resolvidos e template XML validado para emissão de NFS-e via SOAP no provedor iiBrasil (Ilhabela-SP). Não alterar lógica de hash, alíquotas ou tags IBS/CBS.
type: reference
---
# Integração NFS-e SOAP - iiBrasil (Ilhabela)

**Ambiente:** Produção | **Padrão:** ABRASF modificado (iiBrasil) | **Município:** Ilhabela-SP (IBGE: `3520400`)

## Credenciais / URLs

- **WSDL:** `https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps?wsdl`
- **Endpoint SOAP:** `https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps`
- **API Auxiliar (ProximoRPS):** `https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS?Metodo=info_nfse&Token=...&CpfCnpjPrestador=...`
- **CNPJ Prestador:** `62391927000157` | **Inscrição Municipal:** `13788`
- **Token:** via `.env` `NFSE_TOKEN` — passado em `iibr:token` no header SOAP E concatenado no hash

## Regras Críticas (NÃO ALTERAR)

### Hash de Integridade
```typescript
function computeIntegridade(rpsXml: string, token: string): string {
  let cleaned = rpsXml.replace(/[^\x20-\x7E]+/g, ""); // remove não imprimíveis e newlines
  cleaned = cleaned.replace(/[ ]+/g, "");               // remove espaços
  return createHash("sha512").update(cleaned + token, "utf8").digest("hex");
}
```
- Hash da tag `<Rps>...</Rps>` limpa + token
- Resultado vai em `<Integridade>` dentro de `<GerarNfseEnvio>`

### Alíquotas (formato obrigatório)
- ISS: `<Aliquota>3.73</Aliquota>` (NÃO `0.0373`)
- CBS: `<AliquotaCbs>0.90</AliquotaCbs>` (NÃO `0.009`)
- IBS: `<AliquotaIbs>0.10</AliquotaIbs>` (NÃO `0.001`)

### Impostos da Reforma Tributária 2026 (obrigatórios)
```xml
<ValorCbs>${(valor * 0.009).toFixed(2)}</ValorCbs>
<AliquotaCbs>0.90</AliquotaCbs>
<ValorIbs>${(valor * 0.001).toFixed(2)}</ValorIbs>
<AliquotaIbs>0.10</AliquotaIbs>
```

### TomadorServico — Regras validadas em produção (RPS #1 e #2 emitidos)
- **CPF** (com ou sem endereço) → funciona ✅
- **CNPJ + endereço** → funciona ✅
- **Apenas `<RazaoSocial>` sem `<IdentificacaoTomador>`** → HTTP 500 ❌
- **Omitir TomadorServico completamente** → HTTP 500 ❌
- **Conclusão:** `<IdentificacaoTomador>` com CPF ou CNPJ é **obrigatório**. Sem documento → lançar erro 400 ao usuário.

## Serviços Vinculados ao CNPJ

| ItemListaServico | CodigoTributacaoNacional | Descrição | Alíquota ISS |
|---|---|---|---|
| `24.01` | `240101` | Confecção de carimbos, placas, sinalização | 3.73% |
| `24.01` | `240102` | Gravação de objetos e joias | 3.73% |
| `13.05` | `130501` | Composição gráfica e matrizes | 3.73% |
| `14.08` | `140801` | Encadernação e acabamento | 3.73% |

## Erros Resolvidos

| Código | Causa | Solução |
|---|---|---|
| E165 | Alíquota inválida | Usar `3.73` e não `0.0373` |
| ECBS02 | CBS inválido | Formato `0.90` + tag `<AliquotaCbs>` |
| EIBS02 | IBS inválido | Formato `0.10` + tag `<AliquotaIbs>` |
| EI87/EI88 | Código tributação nacional inválido | Usar 6 dígitos ex: `240101` |
| EI29 | Prestador não vinculado ao subitem | Usar apenas serviços da tabela acima |
| E58 | Município não corresponde ao CEP | Fallback automático via ViaCEP: em E288/E58 o backend consulta `https://viacep.com.br/ws/{cep}/json/`, usa o campo `ibge` e re-tenta a emissão uma única vez; `cliente_endereco.codigocidade` do Athos não é confiável |
| E288 | Código do município do tomador não vinculado à UF informada | Fallback automático via ViaCEP: em E288/E58 o backend consulta `https://viacep.com.br/ws/{cep}/json/`, usa o campo `ibge` e re-tenta a emissão uma única vez; `cliente_endereco.codigocidade` do Athos não é confiável |
| E90 | Número RPS inválido | Usar `ProximoRPS` da API Auxiliar |
| HTTP 500 (sem corpo) | TomadorServico sem `<IdentificacaoTomador>` ou omitido | CPF ou CNPJ é obrigatório — sem documento lançar erro 400 ao usuário |

### Fallback de CodigoMunicipio do tomador

- **Gatilho:** resposta da prefeitura com código de erro `E288` ou `E58`, ou mensagem casando `/municí?pio/i` e `/tomador/i` simultaneamente.
- **Fonte:** ViaCEP público (`https://viacep.com.br/ws/{cep}/json/`), sem autenticação, timeout de 5s. Nunca lança exceção — falha de rede/CEP inválido/`{erro:true}` retorna `null`.
- **Limite:** apenas UMA re-tentativa, reutilizando o MESMO número de RPS da primeira tentativa (o RPS rejeitado não é consumido pela prefeitura; `getInfoNfse()` não é chamado de novo).
- **Comportamento em falha:** se o ViaCEP estiver indisponível, o CEP for inválido, o código IBGE devolvido já for o mesmo cadastrado, ou a segunda tentativa também falhar, o erro ORIGINAL da prefeitura (primeira tentativa) é propagado ao usuário como `BadRequestException` — comportamento idêntico ao existente antes do fallback.
- **Caso de referência:** `idcliente=3485` (DP BARROS), CEP `05516030` → IBGE `3550308` (São Paulo capital); o cadastro no Athos tinha `codigocidade=4121208` (município do Paraná).
- **Escopo:** implementado no ponto único de envio `enviarRpsComFallbackMunicipio()`, usado por `emitir()` e `emitirParaContaReceber()`. Não altera `computeIntegridade`, alíquotas, tags IBS/CBS/NBS nem a UF enviada (divergência de UF é apenas logada para diagnóstico).

## Template XML Validado (usar template strings, NÃO xmlbuilder)

```typescript
const rpsXml = `
	<Rps>
		<InfDeclaracaoPrestacaoServico Id="rps${numero}">
			<Rps>
				<IdentificacaoRps>
					<Numero>${numero}</Numero>
					<Serie>RPS</Serie>
					<Tipo>1</Tipo>
				</IdentificacaoRps>
				<DataEmissao>${dataEmissao}</DataEmissao>
				<Status>1</Status>
			</Rps>
			<Competencia>${dataEmissao}</Competencia>
			<Servico>
				<Valores>
					<ValorServicos>${valor.toFixed(2)}</ValorServicos>
					<ValorCbs>${(valor*0.009).toFixed(2)}</ValorCbs>
					<AliquotaCbs>0.90</AliquotaCbs>
					<ValorIbs>${(valor*0.001).toFixed(2)}</ValorIbs>
					<AliquotaIbs>0.10</AliquotaIbs>
					<Aliquota>3.73</Aliquota>
				</Valores>
				<IssRetido>2</IssRetido>
				<ResponsavelRetencao>1</ResponsavelRetencao>
				<ItemListaServico>${itemLista}</ItemListaServico>
				<CodigoTributacaoNacional>${codigoNacional}</CodigoTributacaoNacional>
				<Discriminacao>${discriminacao}</Discriminacao>
				<CodigoMunicipio>3520400</CodigoMunicipio>
			</Servico>
			<Prestador>
				<CpfCnpj><Cnpj>${cnpj}</Cnpj></CpfCnpj>
				<InscricaoMunicipal>${im}</InscricaoMunicipal>
			</Prestador>
			${tomadorXml}
		</InfDeclaracaoPrestacaoServico>
	</Rps>`;

const integridade = computeIntegridade(rpsXml, token);

const dados = `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  ${rpsXml}
  <Integridade>${integridade}</Integridade>
</GerarNfseEnvio>`;
```

## Variáveis de Ambiente (.env)
```env
NFSE_TOKEN=...
NFSE_CNPJ_PRESTADOR=62391927000157
NFSE_INSCRICAO_MUNICIPAL=13788
NFSE_SOAP_URL=https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps
NFSE_AUX_URL=https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS
```
