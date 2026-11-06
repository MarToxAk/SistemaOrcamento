-- =====================================================================================
-- Fase 43 - INTROSPECCAO DO ATHOS (SOMENTE LEITURA)
-- Rodar no psql conectado ao banco do Athos (PostgreSQL 9.0.5), preferencialmente com o
-- MESMO usuario configurado em ATHOS_PG_USER do backend (a Q12 mede os privilegios dele).
--
-- REGRAS:
--   1. Este arquivo so contem SELECT. NAO rode nada que escreva no Athos.
--   2. Rode dentro de transacao somente leitura (primeira e ultima linha abaixo). Se algum
--      comando falhar, rode ROLLBACK; e continue na query seguinte.
--   3. Cole a SAIDA de cada query na secao correspondente de 43-INTROSPECCAO-ATHOS.md.
--   4. Nao cole nomes, CPF/CNPJ, telefones ou e-mails de clientes. Ids e valores bastam.
--   5. Compativel com PostgreSQL 9.0.5: sem pg_sequence_last_value, sem jsonb, sem
--      information_schema.triggers.action_timing (ver memory/athos_postgres_9_0_5.md).
-- =====================================================================================

BEGIN READ ONLY;

-- ---- Q1. Colunas das tabelas envolvidas (tipos, tamanhos, nulabilidade, defaults) ----
SELECT table_name, ordinal_position, column_name, data_type, character_maximum_length,
       numeric_precision, numeric_scale, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('conta_receber', 'conta_recebida', 'livro_registro_io', 'livro_registro',
                      'boleto', 'cliente', 'log', 'conf_financeiro', 'caixa_entrada',
                      'caixa_movimento_recebimento', 'cliente_cartao_preferencial',
                      'funcionario_usuario')
 ORDER BY table_name, ordinal_position;

-- ---- Q2. Constraints (PK, FK, UNIQUE, CHECK) ----
SELECT c.conrelid::regclass AS tabela, c.conname, c.contype, pg_get_constraintdef(c.oid) AS definicao
  FROM pg_constraint c
 WHERE c.conrelid::regclass::text IN ('conta_receber', 'conta_recebida', 'livro_registro_io', 'boleto',
                                      'cliente', 'log', 'caixa_entrada', 'caixa_movimento_recebimento',
                                      'cliente_cartao_preferencial')
 ORDER BY 1, 3, 2;

-- ---- Q3a. Triggers (exclui os triggers internos de FK) ----
SELECT t.tgrelid::regclass AS tabela, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definicao
  FROM pg_trigger t
 WHERE t.tgrelid::regclass::text IN ('conta_receber', 'conta_recebida', 'livro_registro_io', 'boleto',
                                     'cliente', 'log', 'caixa_entrada', 'caixa_movimento_recebimento',
                                     'cliente_cartao_preferencial')
   AND t.tgname NOT LIKE 'RI\_ConstraintTrigger%'
 ORDER BY 1, 2;

-- ---- Q3b. Rules ----
SELECT tablename, rulename, definition
  FROM pg_rules
 WHERE schemaname = 'public'
   AND tablename IN ('conta_receber', 'conta_recebida', 'livro_registro_io', 'boleto', 'cliente', 'log');

-- ---- Q4. Configuracao financeira (juros, multa, carencia) ----
SELECT * FROM conf_financeiro;

-- ---- Q5. Casos dourados de pagamento COM atraso (calculados pelo proprio Athos) ----
SELECT rec.idcontarecebida, cr.idcontareceber, cr.valor AS principal,
       to_char(cr.datavencimento, 'YYYY-MM-DD') AS vencimento,
       to_char(rec.datapagamento, 'YYYY-MM-DD') AS pagamento,
       rec.atraso, rec.juros, rec.multa, rec.desconto, rec.valorpago, rec.valortroco, rec.idformapagamento
  FROM conta_recebida rec
  JOIN conta_receber cr ON cr.idcontareceber = rec.idcontareceber
 WHERE rec.atraso > 0
 ORDER BY rec.idcontarecebida DESC
 LIMIT 40;

-- ---- Q6. Casos de pagamento EM DIA (confirmam encargos zero) ----
SELECT rec.idcontarecebida, cr.valor AS principal,
       to_char(cr.datavencimento, 'YYYY-MM-DD') AS vencimento,
       to_char(rec.datapagamento, 'YYYY-MM-DD') AS pagamento,
       rec.atraso, rec.juros, rec.multa, rec.valorpago
  FROM conta_recebida rec
  JOIN conta_receber cr ON cr.idcontareceber = rec.idcontareceber
 WHERE rec.atraso = 0
 ORDER BY rec.idcontarecebida DESC
 LIMIT 10;

-- ---- Q7. Como o Athos grava o livro_registro_io de um recebimento ----
SELECT l.idlivroregistro, l.idfuncionario, to_char(l.datalancamento, 'YYYY-MM-DD') AS datalancamento,
       l.horalancamento, l.descricao, l.valorentrada, l.tipopagamento, l.idcontarecebida
  FROM livro_registro_io l
 WHERE l.idcontarecebida IS NOT NULL
 ORDER BY l.idcontarecebida DESC
 LIMIT 10;

-- ---- Q8. Titulos de valor negativo ja baixados (como o Athos grava) ----
SELECT cr.idcontareceber, cr.valor, rec.valorpago, rec.juros, rec.multa, l.valorentrada
  FROM conta_receber cr
  JOIN conta_recebida rec ON rec.idcontareceber = cr.idcontareceber
  LEFT JOIN livro_registro_io l ON l.idcontarecebida = rec.idcontarecebida
 WHERE cr.valor < 0
 ORDER BY rec.idcontarecebida DESC
 LIMIT 10;

-- ---- Q9. Distribuicao de statusconta (padding do tipo char) e baixas parciais ----
SELECT TRIM(statusconta) AS status, length(statusconta) AS tamanho_bruto, count(*) AS qtd
  FROM conta_receber
 GROUP BY 1, 2
 ORDER BY 1, 2;

SELECT idcontareceber, count(*) AS recebimentos
  FROM conta_recebida
 GROUP BY idcontareceber
HAVING count(*) > 1
 ORDER BY 2 DESC
 LIMIT 10;

-- ---- Q10. Constantes da Fase 43: livro 2, funcionarios 1 e 3, forma de pagamento 10 ----
SELECT * FROM livro_registro WHERE idlivroregistro = 2;
SELECT idfuncionariousuario FROM funcionario_usuario WHERE idfuncionariousuario IN (1, 3);
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND (table_name LIKE '%forma%pag%' OR table_name LIKE '%formapag%');
-- Depois de descobrir a tabela de formas de pagamento, rode (troque <tabela>):
--   SELECT * FROM <tabela> WHERE idformapagamento = 10;

-- ---- Q11. Qual coluna do cliente produz o texto do livro (exemplo capturado: cliente 2641) ----
SELECT c.idcliente, cf.nome AS fisico_nome, cj.nomefantasia, cj.razaosocial
  FROM cliente c
  LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
  LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
 WHERE c.idcliente = 2641;

-- ---- Q12. Privilegios do usuario atual (rodar com o usuario de ATHOS_PG_USER) ----
SELECT t AS tabela,
       has_table_privilege(current_user, t, 'SELECT') AS pode_select,
       has_table_privilege(current_user, t, 'INSERT') AS pode_insert,
       has_table_privilege(current_user, t, 'UPDATE') AS pode_update,
       has_table_privilege(current_user, t, 'DELETE') AS pode_delete
  FROM unnest(ARRAY['conta_receber', 'conta_recebida', 'livro_registro_io', 'boleto', 'cliente', 'log',
                    'caixa_entrada', 'caixa_movimento_recebimento', 'cliente_cartao_preferencial']) AS t;

SELECT c.relname AS sequencia, has_sequence_privilege(current_user, c.oid, 'USAGE') AS pode_usar
  FROM pg_class c
 WHERE c.relkind = 'S'
   AND (c.relname LIKE 'conta\_recebida%' OR c.relname LIKE 'livro\_registro\_io%' OR c.relname LIKE 'log\_%');

-- ---- Q13. Cartao preferencial: o Athos grava linha em uma baixa? (so descricoes, sem dados pessoais) ----
SELECT descricaolancamento
  FROM cliente_cartao_preferencial
 WHERE descricaolancamento LIKE '%BAIXA CONTA RECEBER%'
 ORDER BY 1 DESC
 LIMIT 5;

ROLLBACK;
