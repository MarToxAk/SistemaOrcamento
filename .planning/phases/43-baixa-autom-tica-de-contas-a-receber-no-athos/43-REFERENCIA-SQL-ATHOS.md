# Athos — Baixa e Estorno de Contas a Receber (SQL capturado via pktmon, 2026-11-06)

Observado, não lido do código (Athos.exe Clarion 6/UPX). Sem BEGIN/COMMIT visível: reproduzir em UMA transação. Testar primeiro em cópia do banco. ids (idFormaPagamento=10, idlivroregistro=2, idfuncionariousuario=3) são desta instalação; confirmar nas tabelas.

## Baixa (por título) — ex.: título 34366-1, idcontareceber 1363, R$ 29,00
```sql
insert into conta_recebida(idcontareceber, valorpago, valortroco, datapagamento, horapagamento,
  juros, desconto, atraso, idfuncionariousuario, idFormaPagamento, multa, idcondicaopagamento)
values (1363, 29, 0, '2026-11-06 00:00:00'::timestamp, cast(current_time(0) as time),
  0, 0, 0, 3, 10, 0, NULL) returning idcontarecebida;

insert into livro_registro_io (idlivroregistro, idfuncionario, datalancamento, horalancamento,
  descricao, valorentrada, tipopagamento, idContaRecebida)
values (2, 3, '2026-11-06'::date, '10:11:20',
  'Rec. Titulo 34366-1 - Cliente: COLEGIO OBJETIVO', 29, '', <idcontarecebida>);

update conta_receber set statusconta = 'REC' where idcontareceber = 1363;
update boleto set statusBoleto = 'REC' where idContaReceber = 1363;  -- UPDATE 0 se não houver boleto
update cliente set aviso1 = false, aviso2 = false, aviso3 = false where idcliente = 2641; -- fim do lote por cliente
```
Descrição do livro: `Rec. Titulo <numerotitulo> - Cliente: <nome>`.

## Data retroativa / encargos
datapagamento e datalancamento = data informada. Ex.: principal 457,00 -> valorpago 467.65, juros 1.51, multa 9.14, atraso 10. Multa ~ 2% do principal; juros pró-rata/dia com conf_financeiro.taxajurosmes; carência em carenciadiascobrancajuros. Log extra:
```sql
insert into log(idfuncionariousuario, data, hora, mensagem)
values(3, current_date, cast(current_time(0) as time),
 'Baixou a conta com ID: 1302 com a data retroativa. Data atual: 06/11/2026 Data Informada: 05/11/2026');
```

## Estorno ("Voltar Contas Recebidas") — ex.: título 1302, recebimento 1294
```sql
delete from livro_registro_io where idcontarecebida = 1294;
delete from caixa_entrada where idcontarecebida = 1294;
delete from caixa_movimento_recebimento where idcontareceber = 1302;
delete from conta_recebida where idcontareceber = 1302;
delete from cliente_cartao_preferencial where descricaolancamento like '%BAIXA CONTA RECEBER%1302%';
update conta_receber set statusconta = 'AVC' where idcontareceber = 1302; -- Athos recalcula VEN se vencida
insert into log (idfuncionariousuario, mensagem, data, hora)
values (3, 'Voltou a conta recebida: 1302 Valor: R$ 457,00 Valor Pago: R$ 457,00', current_date, cast(current_time(0) as time));
```
Estorno NÃO reverte boleto.statusBoleto nem cliente.aviso*.

## Cuidados
1. Transação única + RETURNING para o id de conta_recebida.
2. Validar: título existe, statusconta <> 'REC', valor pago compatível com principal + encargos.
3. Boleto: ligação conta_receber_boleto (idboleto <-> idcontareceber); marcar boleto.statusBoleto='REC'.
4. Gravar log e livro_registro_io para o caixa bater.
5. Sem backup/cópia não rodar em produção; Athos não faz rollback por comando.
6. Conexão sem SSL: só pela rede privada (Tailscale).
Tabelas: conta_receber (VEN/AVC/REC), conta_recebida, livro_registro_io, caixa_entrada, caixa_movimento_recebimento, boleto, cliente_cartao_preferencial, cliente, log, monitoramento, conf_financeiro, acesso_usuario.
