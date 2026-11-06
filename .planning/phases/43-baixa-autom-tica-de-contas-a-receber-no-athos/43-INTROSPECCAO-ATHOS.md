# Fase 43 - Introspeccao do Athos (somente leitura) - RESULTADOS

**Como usar:** rode `43-INTROSPECCAO-ATHOS.sql` no psql do Athos (somente SELECT, dentro de BEGIN READ ONLY) e cole a saida de cada query abaixo, no lugar do marcador entre colchetes de cada secao. Nao cole nomes, CPF/CNPJ, telefones ou e-mails de clientes.

**Quem consome:** plano 43-02 (formula de encargos, colunas de `conf_financeiro`, tamanhos de texto, cuidados de constraint e trigger) e plano 43-04 (estorno, `cliente_cartao_preferencial`). O plano 43-02 so avanca para a implementacao quando nenhum marcador de pendencia (texto entre colchetes com a palavra PENDENTE seguida de hifen) restar no arquivo.

## Q1 - Colunas das tabelas
[PENDENTE-USUARIO]

## Q2 - Constraints
[PENDENTE-USUARIO]

## Q3a - Triggers
[PENDENTE-USUARIO]

## Q3b - Rules
[PENDENTE-USUARIO]

## Q4 - conf_financeiro
[PENDENTE-USUARIO]

## Q5 - Casos dourados com atraso (ate 40 linhas)
[PENDENTE-USUARIO]

## Q6 - Casos em dia
[PENDENTE-USUARIO]

## Q7 - livro_registro_io de recebimentos
[PENDENTE-USUARIO]

## Q8 - Titulos negativos ja baixados
[PENDENTE-USUARIO]

## Q9 - statusconta e baixas parciais
[PENDENTE-USUARIO]

## Q10 - Constantes (livro 2, funcionarios 1 e 3, forma 10)
[PENDENTE-USUARIO]

## Q11 - Nome do cliente 2641 (qual coluna gera o texto do livro)
[PENDENTE-USUARIO]

## Q12 - Privilegios do usuario da API
[PENDENTE-USUARIO]

## Q13 - cliente_cartao_preferencial
[PENDENTE-USUARIO]

---

## Decisoes derivadas (preenchido pelo executor do plano 43-02 apos receber os resultados)

| Item | Decisao | Evidencia |
|------|---------|-----------|
| Coluna do percentual de multa em conf_financeiro | [PENDENTE-DECISAO] | Q4 |
| Coluna da taxa de juros ao mes | `taxajurosmes` (confirmar) | Q4 |
| Coluna de carencia de dias para cobrar juros | `carenciadiascobrancajuros` (confirmar) | Q4 |
| Formula de juros validada (variante e arredondamento) | [PENDENTE-DECISAO] | Q5 contra Q4 |
| Multa incide dentro da carencia? | [PENDENTE-DECISAO] | Q5 |
| Tamanho maximo de livro_registro_io.descricao | [PENDENTE-DECISAO] | Q1 |
| Tamanho maximo de log.mensagem | [PENDENTE-DECISAO] | Q1 |
| Colunas NOT NULL sem default que a baixa nao preenche | [PENDENTE-DECISAO] | Q1 |
| CHECK/UNIQUE/trigger/rule que afetam a baixa | [PENDENTE-DECISAO] | Q2, Q3a, Q3b |
| Coluna do nome do cliente usada no texto do livro | [PENDENTE-DECISAO] | Q11 |
| Titulo negativo: como o Athos grava a baixa | [PENDENTE-DECISAO] | Q8 |
| Baixa parcial existe no historico? | [PENDENTE-DECISAO] | Q9 |
| Privilegios faltantes para o usuario da API | [PENDENTE-DECISAO] | Q12 |
| Athos grava cliente_cartao_preferencial na baixa? | [PENDENTE-DECISAO] | Q13 |
