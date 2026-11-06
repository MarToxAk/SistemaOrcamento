# Fase 43 - Introspeccao do Athos (somente leitura) - RESULTADOS

**Como usar:** rode `43-INTROSPECCAO-ATHOS.sql` no psql do Athos (somente SELECT, dentro de BEGIN READ ONLY) e cole a saida de cada query abaixo, no lugar do marcador entre colchetes de cada secao. Nao cole nomes, CPF/CNPJ, telefones ou e-mails de clientes.

**Quem consome:** plano 43-02 (formula de encargos, colunas de `conf_financeiro`, tamanhos de texto, cuidados de constraint e trigger) e plano 43-04 (estorno, `cliente_cartao_preferencial`). O plano 43-02 so avanca para a implementacao quando nenhum marcador de pendencia (texto entre colchetes com a palavra PENDENTE seguida de hifen) restar no arquivo.

**RESOLUCAO DO CHECKPOINT (plano 43-02, Task 1):** o usuario decidiu que NADA deve ser consultado no banco do Athos, nem em modo somente leitura. As secoes Q1 a Q13 ficam, portanto, sem resultados (NAO-COLETADO). A unica evidencia disponivel sao 2 casos capturados anteriormente (pktmon / relato do usuario), ambos com 10 dias de atraso:

| principal | atraso | juros | multa | valorpago |
|-----------|--------|-------|-------|-----------|
| 457,00 | 10 | 1,51 | 9,14 | 467,65 |
| 252,93 | 10 | 0,83 | 5,06 | 258,82 |

Quando o usuario puder coletar os dados, rodar `43-INTROSPECCAO-ATHOS.sql` e substituir os marcadores NAO-COLETADO abaixo; revalidar a formula de `athos-baixa-encargos.util.ts` com a Q4/Q5 reais.

## Q1 - Colunas das tabelas
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q2 - Constraints
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q3a - Triggers
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q3b - Rules
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q4 - conf_financeiro
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q5 - Casos dourados com atraso (ate 40 linhas)
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q6 - Casos em dia
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q7 - livro_registro_io de recebimentos
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q8 - Titulos negativos ja baixados
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q9 - statusconta e baixas parciais
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q10 - Constantes (livro 2, funcionarios 1 e 3, forma 10)
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q11 - Nome do cliente 2641 (qual coluna gera o texto do livro)
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q12 - Privilegios do usuario da API
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

## Q13 - cliente_cartao_preferencial
[NAO-COLETADO: o usuario proibiu qualquer conexao ao Athos real, inclusive consultas somente leitura]

---

## Decisoes derivadas (plano 43-02, SEM dados reais do Athos)

| Item | Decisao | Evidencia |
|------|---------|-----------|
| Coluna do percentual de multa em conf_financeiro | DESCONHECIDA. A multa NAO e lida do banco: percentual configuravel por `ATHOS_BAIXA_MULTA_PERCENTUAL` (padrao 2, constante `PERCENTUAL_MULTA_PADRAO`). 2% do principal reproduz 9,14 e 5,06 (meio para cima). | 2 casos capturados |
| Coluna da taxa de juros ao mes | `taxajurosmes` (da referencia pktmon; nao confirmada em Q4). Unidade presumida em percentual (1 = 1%). | 43-REFERENCIA-SQL-ATHOS.md |
| Coluna de carencia de dias para cobrar juros | `carenciadiascobrancajuros` (da referencia; nao confirmada em Q4) | 43-REFERENCIA-SQL-ATHOS.md |
| Formula de juros validada (variante e arredondamento) | PARCIAL. Adotada: dias = atraso inteiro; taxa diaria = taxajurosmes/30 arredondada a 3 casas (% ao dia); juros = principal x taxa diaria x dias, arredondado meio para cima em centavos. Reproduz os 2 casos com taxajurosmes = 1 (ou 0,99), carencia 0. Descartadas: taxa diaria sem arredondar (1,52 / 0,84), truncamento (1,50), arredondar para cima (0,84), base 365/12 (1,50), base 30,4 (1,50). Com 2 casos a formula e sub-determinada: o valor real de taxajurosmes e a unidade NAO foram confirmados. | 2 casos; testes em `athos-baixa-encargos.util.test.ts` |
| Multa incide dentro da carencia? | DESCONHECIDO. Atraso > 0 e <= carencia nunca foi observado: nao se calcula, rejeita com ATRASO_REQUER_ENCARGOS (baixa manual). | sem dado |
| Tamanho maximo de livro_registro_io.descricao | NAO COLETADO. Mantido o limite provisorio de 100 caracteres do plano 43-01 (erro 22001 vira TEXTO_LONGO). | Q1 nao coletada |
| Tamanho maximo de log.mensagem | NAO COLETADO. Mantido o limite provisorio de 255. | Q1 nao coletada |
| Colunas NOT NULL sem default que a baixa nao preenche | NAO COLETADO. A baixa preenche as mesmas colunas do SQL capturado. | Q1 nao coletada |
| CHECK/UNIQUE/trigger/rule que afetam a baixa | NAO COLETADO | Q2, Q3a, Q3b nao coletadas |
| Coluna do nome do cliente usada no texto do livro | NAO COLETADO. Mantido COALESCE(cliente_fisico.nome, cliente_juridico.nomefantasia, razaosocial) do plano 43-01. | Q11 nao coletada |
| Titulo negativo: como o Athos grava a baixa | DESCONHECIDO. Titulo com valor zero ou negativo (abatimento) e rejeitado com TITULO_NAO_POSITIVO sem escrever. DECISAO PENDENTE DO USUARIO: se quer baixa automatica desses titulos, e preciso observar como o Athos grava (Q8). | Q8 nao coletada |
| Baixa parcial existe no historico? | NAO COLETADO (baixa parcial segue fora de escopo, ver CONTEXT) | Q9 nao coletada |
| Privilegios faltantes para o usuario da API | NAO COLETADO. Ver GRANT na mensagem PERMISSAO_NEGADA. | Q12 nao coletada |
| Athos grava cliente_cartao_preferencial na baixa? | NAO COLETADO (a referencia so cita essa tabela no estorno) | Q13 nao coletada |
