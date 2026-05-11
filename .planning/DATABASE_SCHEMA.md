-- Table: venda

-- DROP TABLE venda;

CREATE TABLE venda
(
  idvenda serial NOT NULL,
  idterminal integer,
  idfuncionariousuario integer,
  idcliente integer,
  idorcamento integer,
  idresponsavelcancelamento integer,
  idnota integer,
  idcaixamovimento integer,
  coo character varying(10),
  ccf character varying(10),
  data dmdata,
  hora hora,
  valor monetario,
  desconto monetario,
  troco monetario,
  numeroordem character varying(5),
  cancelada boolean,
  observacao character varying(300),
  motivocancelamento descricao,
  numeroserieecf descricao_curta,
  crz descricao_curta,
  cro descricao_curta,
  valortotalizadorgeral numeric(20,4),
  idvendedor integer,
  obs character varying(2000),
  statusentrega boolean,
  statusromaneio boolean,
  descontors monetario,
  cupomcancelado boolean,
  idtransportadora integer,
  idclientecontato integer,
  sfsat integer,
  xml text,
  sfretorno text,
  xmlcan text,
  sfretornocan text,
  cpfcnpj character varying(14),
  sfnfce integer,
  ie character varying(20),
  chavenfce descricao_curta,
  protocolonfce descricao_curta,
  coocancelamento character varying(10),
  senhapdv character varying(11),
  dataenvioscanntech date,
  dataenviodiarioscanntech date,
  dataenviopromocaoscanntech date,
  sffacelec integer,
  quantidadepessoa integer,
  bscanntecherronoenvio boolean,
  emitidaemcontingencia boolean DEFAULT false,
  chavesat character varying(50),
  chavesatcan character varying(50),
  numeroseriesat character varying(50),
  cpfcnpjnomecliente character varying(100),
  idcentrodecusto integer,
  valoracrescimo monetario,
  coocomplementar character varying(10),
  xmlcomplementar text,
  sfretornocomplementar text,
  chavesatcomplementar character varying(50),
  transacaodyndo boolean DEFAULT false,
  idmesa character varying(200),
  idcomanda character varying(200),
  idenderecocliente integer,
  idenderecodestinatario integer,
  idclientedestinatario integer,
  transacaoalbert boolean DEFAULT false,
  idterminalsat integer,
  CONSTRAINT pk_venda PRIMARY KEY (idvenda),
  CONSTRAINT fk_venda_caixa_mov_caixa_mo FOREIGN KEY (idcaixamovimento)
      REFERENCES caixa_movimento (idcaixamovimento) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_venda_cliente_v_cliente FOREIGN KEY (idcliente)
      REFERENCES cliente (idcliente) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_venda_orcamento_orcament FOREIGN KEY (idorcamento)
      REFERENCES orcamento (idorcamento) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_venda_superviso_funciona FOREIGN KEY (idresponsavelcancelamento)
      REFERENCES funcionario_usuario (idfuncionariousuario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_venda_terminal__terminal FOREIGN KEY (idterminal)
      REFERENCES terminal (idterminal) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_venda_usuario_v_funciona FOREIGN KEY (idfuncionariousuario)
      REFERENCES funcionario_usuario (idfuncionariousuario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_venda_venda_not_nota FOREIGN KEY (idnota)
      REFERENCES nota (idnota) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT
)
WITH (
  OIDS=FALSE
);
ALTER TABLE venda
  OWNER TO postgres;
GRANT ALL ON TABLE venda TO postgres;
GRANT SELECT ON TABLE venda TO usuario_leitura;

-- Index: caixa_movimento_venda_fk

-- DROP INDEX caixa_movimento_venda_fk;

CREATE INDEX caixa_movimento_venda_fk
  ON venda
  USING btree
  (idcaixamovimento);

-- Index: cliente_venda_fk

-- DROP INDEX cliente_venda_fk;

CREATE INDEX cliente_venda_fk
  ON venda
  USING btree
  (idcliente);

-- Index: idxdatavenda

-- DROP INDEX idxdatavenda;

CREATE INDEX idxdatavenda
  ON venda
  USING btree
  (data);

-- Index: orcamento_venda_fk

-- DROP INDEX orcamento_venda_fk;

CREATE INDEX orcamento_venda_fk
  ON venda
  USING btree
  (idorcamento);

-- Index: supervisor_venda_fk

-- DROP INDEX supervisor_venda_fk;

CREATE INDEX supervisor_venda_fk
  ON venda
  USING btree
  (idresponsavelcancelamento);

-- Index: terminal_venda_fk

-- DROP INDEX terminal_venda_fk;

CREATE INDEX terminal_venda_fk
  ON venda
  USING btree
  (idterminal);

-- Index: usuario_venda_fk

-- DROP INDEX usuario_venda_fk;

CREATE INDEX usuario_venda_fk
  ON venda
  USING btree
  (idfuncionariousuario);

-- Index: venda_nota_fk

-- DROP INDEX venda_nota_fk;

CREATE INDEX venda_nota_fk
  ON venda
  USING btree
  (idnota);

-- Index: venda_pk

-- DROP INDEX venda_pk;

CREATE UNIQUE INDEX venda_pk
  ON venda
  USING btree
  (idvenda);


-- Rule: atualizardatahora ON venda

-- DROP RULE atualizardatahora ON venda;

CREATE OR REPLACE RULE atualizardatahora AS
    ON INSERT TO venda DO  UPDATE conf_inicial SET datahora = now();



-- Table: relacao_orcamento_venda

-- DROP TABLE relacao_orcamento_venda;

CREATE TABLE relacao_orcamento_venda
(
  idrelataocaorcamentovenda serial NOT NULL,
  idorcamento integer,
  idvenda integer,
  CONSTRAINT relacao_orcamento_venda_pkey PRIMARY KEY (idrelataocaorcamentovenda)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE relacao_orcamento_venda
  OWNER TO postgres;
GRANT ALL ON TABLE relacao_orcamento_venda TO postgres;
GRANT SELECT ON TABLE relacao_orcamento_venda TO usuario_leitura;

-- Trigger: trigger_relacao_orcamento_venda_notify on relacao_orcamento_venda

-- DROP TRIGGER trigger_relacao_orcamento_venda_notify ON relacao_orcamento_venda;

CREATE TRIGGER trigger_relacao_orcamento_venda_notify
  AFTER INSERT OR UPDATE
  ON relacao_orcamento_venda
  FOR EACH ROW
  EXECUTE PROCEDURE notify_n8n();



-- Table: cliente

-- DROP TABLE cliente;

CREATE TABLE cliente
(
  idcliente serial NOT NULL,
  idgrupocliente integer,
  datacadastro dmdata,
  statuscliente boolean,
  bloqueaprazo boolean,
  prazo integer,
  taxajuros monetario,
  emailcliente descricao_curta,
  limitecredito monetario,
  statusdecontrato boolean,
  idfuncionario integer,
  telefoneempresa telefone,
  idusuariocadastro integer,
  idusuarioalteracao integer,
  dataalteracao dmdata,
  suframa descricao_curta,
  horaultimaalteracao hora,
  aguardandoaprovacao boolean,
  aviso1 boolean,
  aviso2 boolean,
  aviso3 boolean,
  dddtelefoneempresa character varying(2),
  operadoratelefoneempresa character varying(50),
  numerocartaopreferencial descricao,
  clientepreferencial boolean,
  ultimoenviocartainadimplencia dmdata,
  idsetorcliente integer,
  tipoprazo integer,
  codigobanco integer,
  idclientecontrato integer,
  site descricao,
  obs1cliente descricao,
  obs2cliente descricao,
  obs3cliente descricao,
  obs4cliente descricao,
  obs5cliente descricao,
  obs6cliente descricao,
  dataultimainativacao dmdata,
  horaultimainativacao hora,
  dataafiliacao date,
  emailcobrancacliente descricao_curta,
  idclientevinculado integer,
  listaemail character varying(1000),
  sincronizado boolean DEFAULT false,
  descontomaximo numeric(5,2) DEFAULT NULL::numeric,
  idclienteindicador integer,
  comissaoindicacao monetario,
  datahoraindicacao timestamp without time zone,
  aviso4 boolean DEFAULT false,
  tipoempresa integer DEFAULT 1,
  idformapagamentopadrao integer,
  deliveryguid character varying(40),
  clientepreferencialutilizasenha boolean DEFAULT false,
  clientepreferencialsenhaoperacao character varying(50),
  boletodesconto boolean DEFAULT false,
  boletopercentual monetario DEFAULT 0,
  tipocartaopreferencial integer DEFAULT 0,
  selecionarcartaopreferencial boolean DEFAULT false,
  idcomanda integer,
  CONSTRAINT pk_cliente PRIMARY KEY (idcliente),
  CONSTRAINT fk_cliente_cliente_g_cliente_ FOREIGN KEY (idgrupocliente)
      REFERENCES cliente_grupo (idgrupocliente) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_cliente_funcionar_funciona FOREIGN KEY (idfuncionario)
      REFERENCES funcionario (idfuncionario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_id_setor_cliente FOREIGN KEY (idsetorcliente)
      REFERENCES setorcliente (idsetorcliente) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT
)
WITH (
  OIDS=FALSE
);
ALTER TABLE cliente
  OWNER TO postgres;
GRANT ALL ON TABLE cliente TO postgres;
GRANT SELECT ON TABLE cliente TO usuario_leitura;

-- Index: cliente_grupo_cliente_fk

-- DROP INDEX cliente_grupo_cliente_fk;

CREATE INDEX cliente_grupo_cliente_fk
  ON cliente
  USING btree
  (idgrupocliente);

-- Index: cliente_pk

-- DROP INDEX cliente_pk;

CREATE UNIQUE INDEX cliente_pk
  ON cliente
  USING btree
  (idcliente);

-- Index: funcionario_cliente_carteira_fk

-- DROP INDEX funcionario_cliente_carteira_fk;

CREATE INDEX funcionario_cliente_carteira_fk
  ON cliente
  USING btree
  (idfuncionario);


-- Trigger: tg_alterarcliente on cliente

-- DROP TRIGGER tg_alterarcliente ON cliente;

CREATE TRIGGER tg_alterarcliente
  BEFORE INSERT OR UPDATE
  ON cliente
  FOR EACH ROW
  EXECUTE PROCEDURE alterarcliente();



-- Table: cliente_juridico

-- DROP TABLE cliente_juridico;

CREATE TABLE cliente_juridico
(
  idclientejuridico serial NOT NULL,
  idcliente integer NOT NULL,
  razaosocial descricao,
  nomefantasia descricao,
  ie ie,
  cnpj cnpj,
  ruc descricao_curta,
  idcnae integer,
  im descricao_curta,
  responsavel_nome descricao,
  responsavel_dddcelular character varying(2),
  responsavel_celular character varying(20),
  responsavel_operadoracelular character varying(50),
  responsavel_email descricao_curta,
  responsavel_nascimento date,
  responsavel_cpf character varying(11),
  responsavel_rg character varying(30),
  datainicioatividade date,
  ultimaalteracao timestamp without time zone DEFAULT now(),
  sincronizado boolean DEFAULT false,
  CONSTRAINT pk_cliente_juridico PRIMARY KEY (idcliente, idclientejuridico),
  CONSTRAINT fk_cliente__cliente_c_cliente FOREIGN KEY (idcliente)
      REFERENCES cliente (idcliente) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT
)
WITH (
  OIDS=FALSE
);
ALTER TABLE cliente_juridico
  OWNER TO postgres;
GRANT ALL ON TABLE cliente_juridico TO postgres;
GRANT SELECT ON TABLE cliente_juridico TO usuario_leitura;

-- Index: cliente_cliente_juridico_fk

-- DROP INDEX cliente_cliente_juridico_fk;

CREATE INDEX cliente_cliente_juridico_fk
  ON cliente_juridico
  USING btree
  (idcliente);

-- Index: cliente_juridico_pk

-- DROP INDEX cliente_juridico_pk;

CREATE UNIQUE INDEX cliente_juridico_pk
  ON cliente_juridico
  USING btree
  (idcliente, idclientejuridico);


-- Trigger: tg_alterarclientejuridico on cliente_juridico

-- DROP TRIGGER tg_alterarclientejuridico ON cliente_juridico;

CREATE TRIGGER tg_alterarclientejuridico
  BEFORE INSERT OR UPDATE
  ON cliente_juridico
  FOR EACH ROW
  EXECUTE PROCEDURE alterarclientejuridico();



-- Table: cliente_fisico

-- DROP TABLE cliente_fisico;

CREATE TABLE cliente_fisico
(
  idclientefisico serial NOT NULL,
  idcliente integer NOT NULL,
  nome descricao,
  datanascimento dmdata,
  rg rg,
  cpf cpf,
  estadocivil character(1),
  sexo character(1),
  orgaoemissorrg descricao_curta,
  ufemissorrg uf,
  dataemissaorg dmdata,
  ultimaalteracao timestamp without time zone DEFAULT now(),
  sincronizado boolean DEFAULT false,
  CONSTRAINT pk_cliente_fisico PRIMARY KEY (idcliente, idclientefisico),
  CONSTRAINT fk_cliente__cliente_c_cliente FOREIGN KEY (idcliente)
      REFERENCES cliente (idcliente) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ckc_estadocivil_cliente_ CHECK (estadocivil IS NULL OR (estadocivil = ANY (ARRAY['s'::bpchar, 'c'::bpchar, 'o'::bpchar]))),
  CONSTRAINT ckc_sexo_cliente_ CHECK (sexo IS NULL OR (sexo = ANY (ARRAY['m'::bpchar, 'f'::bpchar])))
)
WITH (
  OIDS=FALSE
);
ALTER TABLE cliente_fisico
  OWNER TO postgres;
GRANT ALL ON TABLE cliente_fisico TO postgres;
GRANT SELECT ON TABLE cliente_fisico TO usuario_leitura;

-- Index: cliente_cliente_fisico_fk

-- DROP INDEX cliente_cliente_fisico_fk;

CREATE INDEX cliente_cliente_fisico_fk
  ON cliente_fisico
  USING btree
  (idcliente);

-- Index: cliente_fisico_pk

-- DROP INDEX cliente_fisico_pk;

CREATE UNIQUE INDEX cliente_fisico_pk
  ON cliente_fisico
  USING btree
  (idcliente, idclientefisico);


-- Trigger: tg_alterarclientefisico on cliente_fisico

-- DROP TRIGGER tg_alterarclientefisico ON cliente_fisico;

CREATE TRIGGER tg_alterarclientefisico
  BEFORE INSERT OR UPDATE
  ON cliente_fisico
  FOR EACH ROW
  EXECUTE PROCEDURE alterarclientefisico();



-- Table: orcamento

-- DROP TABLE orcamento;

CREATE TABLE orcamento
(
  idorcamento serial NOT NULL,
  idcliente integer,
  idfuncionariousuario integer,
  idterminal integer,
  dataorcamento dmdata,
  hora hora,
  validadeorcamento dmdata,
  valor monetariobig,
  desconto monetariobig,
  statusorcamento boolean,
  idvendedor integer,
  statusmobile integer,
  dataentrega dmdata,
  obs character varying(2000),
  descontors monetariobig,
  cancelado boolean,
  statusromaneio boolean,
  idtransportadora integer,
  senhabalcao serial NOT NULL,
  statusimpressao boolean DEFAULT false,
  idenderecocliente integer,
  idenderecodestinatario integer,
  idclientedestinatario integer,
  valoracrescimo monetario DEFAULT 0,
  CONSTRAINT pk_orcamento PRIMARY KEY (idorcamento),
  CONSTRAINT fk_orcament_cliente_o_cliente FOREIGN KEY (idcliente)
      REFERENCES cliente (idcliente) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_orcament_funcionar_funciona FOREIGN KEY (idfuncionariousuario)
      REFERENCES funcionario_usuario (idfuncionariousuario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_orcament_terminal__terminal FOREIGN KEY (idterminal)
      REFERENCES terminal (idterminal) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT
)
WITH (
  OIDS=FALSE
);
ALTER TABLE orcamento
  OWNER TO postgres;
GRANT ALL ON TABLE orcamento TO postgres;
GRANT SELECT ON TABLE orcamento TO usuario_leitura;

-- Index: cliente_orcamento_fk

-- DROP INDEX cliente_orcamento_fk;

CREATE INDEX cliente_orcamento_fk
  ON orcamento
  USING btree
  (idcliente);

-- Index: funcionario_usuario_orcamento_f

-- DROP INDEX funcionario_usuario_orcamento_f;

CREATE INDEX funcionario_usuario_orcamento_f
  ON orcamento
  USING btree
  (idfuncionariousuario);

-- Index: orcamento_pk

-- DROP INDEX orcamento_pk;

CREATE UNIQUE INDEX orcamento_pk
  ON orcamento
  USING btree
  (idorcamento);

-- Index: terminal_orcamento_fk

-- DROP INDEX terminal_orcamento_fk;

CREATE INDEX terminal_orcamento_fk
  ON orcamento
  USING btree
  (idterminal);


-- Rule: atualizardatahorainsert ON orcamento

-- DROP RULE atualizardatahorainsert ON orcamento;

CREATE OR REPLACE RULE atualizardatahorainsert AS
    ON INSERT TO orcamento DO  UPDATE conf_inicial SET datahora = now();

-- Rule: atualizardatahoraupdate ON orcamento

-- DROP RULE atualizardatahoraupdate ON orcamento;

CREATE OR REPLACE RULE atualizardatahoraupdate AS
    ON UPDATE TO orcamento DO  UPDATE conf_inicial SET datahora = now();


-- Table: produto

-- DROP TABLE produto;

CREATE TABLE produto
(
  idproduto serial NOT NULL,
  iddepartamento integer,
  idsetor integer,
  idgrupo integer,
  idsubgrupo integer,
  idlinha integer,
  idfornecedor integer,
  idunidade integer,
  iddeposito integer,
  idmarca integer,
  idusuariocadastro integer,
  idusuarioalteracao integer,
  imagem foto,
  codigobarra1 character varying(20),
  codigobarra2 character varying(20),
  descricaoproduto descricao,
  descricaocurta character varying(40),
  referencia descricao_curta,
  statusproduto boolean,
  controlaestoque boolean,
  vendeproduto boolean,
  usagrade boolean,
  usacontroleserie boolean,
  usaprodutocomposto boolean,
  valorvenda1 monetario,
  margemvenda1 monetario,
  valorvenda2 monetario,
  margemvenda2 monetario,
  valorvenda3 monetario,
  margemvenda3 monetario,
  valorvendapromocao monetario,
  margemvendapromocao monetario,
  icms character varying(5),
  ipi numeric(6,2),
  frete monetario,
  imposto monetario,
  outroimposto monetario,
  tributacao character varying(2),
  origem integer,
  valorcustocaixa monetario,
  quantidadecaixa quantidade,
  valorcustounitario monetario,
  custorealcaixa monetario,
  custorealunitario monetario,
  descontomaximo numeric(5,2),
  comissaovenda numeric(5,2) DEFAULT 0,
  estoquemaximo quantidade,
  estoqueminimo quantidade,
  pesobruto numeric(7,3),
  pesoliquido numeric(7,3),
  pesanabalanca boolean,
  pesaporquilo boolean,
  validadeproduto integer,
  datacadastro dmdata,
  dataultimaentrada dmdata,
  dataultimaalteracao dmdata,
  dataultimavenda dmdata,
  informacaoadicional character varying(600),
  localproduto descricao,
  usarpreco smallint,
  iniciopromocao dmdata,
  terminopromocao dmdata,
  estoqueloja quantidade,
  estoquedeposito quantidade,
  estoqueentregar quantidade,
  baixarestoque boolean,
  tipoproduto boolean,
  promocaostatus boolean,
  permitefracionar boolean DEFAULT true,
  precousado integer,
  ncm character varying(50),
  alterado boolean,
  codigocsosn character varying(5),
  utilizacodigomae boolean,
  codigomae integer,
  idprodutocaracteristica integer,
  utilizacaracteristica boolean,
  exportasite boolean,
  idcfopsaida character varying(4),
  idcfopsaidaiterestadual character varying(4),
  porcreducao quantidade,
  tipoitem character varying(2),
  piscst character varying(2),
  pisaliquota monetario,
  cofinscst character varying(2),
  cofinsaliquota monetario,
  iva monetario,
  horaultimaalteracao hora,
  ipisaida monetario,
  horaultimavenda hora,
  lancacardapio boolean,
  idprodutocardapiocategoria integer,
  idprodutocardapiosetor integer,
  tempopreparocardapio integer,
  valorst numeric(19,4),
  naoabaterconsumacao boolean,
  anoinicio integer,
  anofim integer,
  codigoanp character varying(15),
  dataatencao date,
  ncmex character varying(10),
  ncmtipo integer,
  contacontabil character varying(15),
  valorimpostorenda monetario,
  cfopsat character varying(4),
  utilizagrade boolean DEFAULT false,
  referenciagrade character varying(100),
  cest character varying(7),
  cadastradoscanntech boolean DEFAULT false,
  dataenvioscanntech dmdata,
  horaenvioscanntech hora,
  unidadeporcaixa numeric,
  utilizaplanofaixaetaria boolean,
  idprodutogenero integer,
  idreceita integer,
  utilizainfonutricionais boolean,
  codigoenquadramentoipi character varying(3),
  utilizareducaoicms boolean DEFAULT false,
  nutricionalporcao quantidade,
  nutricionalorigem descricao,
  nutricionalpesoliquido quantidade,
  codigoservico character varying(8),
  codigoatividadeservico character varying(10),
  aliquotaiss real,
  margemperda monetario DEFAULT 0,
  sincronizado boolean DEFAULT false,
  ultimaalteracao timestamp without time zone DEFAULT now(),
  icmsnfe character varying(5),
  origemnfe integer,
  codigocsosnnfe character varying(5),
  tributacaonfe character varying(2),
  piscstnfe character varying(2),
  pisaliquotanfe monetario,
  cofinscstnfe character varying(2),
  cofinsaliquotanfe monetario,
  largura numeric(10,2),
  altura numeric(10,2),
  profundidade numeric(10,2),
  larguraembalagem numeric(10,2),
  alturaembalagem numeric(10,2),
  profundidadeembalagem numeric(10,2),
  pesoembalagem numeric(10,2),
  utilizafcp boolean DEFAULT false,
  codigoselocontroleipi character varying(60),
  imagemproduto bytea,
  cfoptroca character varying(4),
  enviaremailvendaprazo boolean DEFAULT false,
  original descricao,
  idunidadetrib integer,
  ipicst character varying(2),
  desoneradoaliquota monetariobig,
  desoneradomotivo integer,
  codigobeneficiofiscal character varying(20),
  desoneradoaliquotanfe monetariobig,
  desoneradomotivonfe integer,
  codigobeneficiofiscalnfe character varying(20),
  porcreducaosimples quantidade,
  porcreducaolucro quantidade,
  tributacaonfesimples character varying(2),
  tributacaonfelucro character varying(2),
  comissaovenda2 numeric(5,2) DEFAULT 0,
  comissaovenda3 numeric(5,2) DEFAULT 0,
  codigonaturezareceita character varying(3),
  margemliquidavenda1 numeric(9,3),
  margemliquidavenda2 numeric(9,3),
  margemliquidavenda3 numeric(9,3),
  vbcstret monetariobig,
  pbio numeric(9,3),
  porig numeric(19,3),
  cuforigen character varying(2),
  indimport integer,
  utilizalocalizacao boolean DEFAULT false,
  nutricionalunidade character varying(2),
  atacadostatus1 boolean DEFAULT false,
  valorvendaatacado1 monetario,
  margemvendaatacado1 monetario,
  quantidadeatacado1 quantidade,
  comissaoatacado1 numeric(5,2) DEFAULT 0,
  inicioatacado1 dmdata,
  terminoatacado1 dmdata,
  atacadostatus2 boolean DEFAULT false,
  valorvendaatacado2 monetario,
  margemvendaatacado2 monetario,
  quantidadeatacado2 quantidade,
  comissaoatacado2 numeric(5,2) DEFAULT 0,
  inicioatacado2 dmdata,
  terminoatacado2 dmdata,
  st_modalidade integer DEFAULT 3,
  modalidade integer DEFAULT 3,
  margemliquidavenda4 numeric(9,3),
  margemliquidavenda5 numeric(9,3),
  margemliquidavenda6 numeric(9,3),
  valorvenda4 monetario,
  margemvenda4 monetario,
  valorvenda5 monetario,
  margemvenda5 monetario,
  valorvenda6 monetario,
  margemvenda6 monetario,
  comissaovenda4 numeric(5,2) DEFAULT 0,
  comissaovenda5 numeric(5,2) DEFAULT 0,
  comissaovenda6 numeric(5,2) DEFAULT 0,
  percentualglp numeric(7,3) DEFAULT 0,
  percentualglpnatural numeric(7,3) DEFAULT 0,
  percentualglpnaturalimportado numeric(7,3) DEFAULT 0,
  usacomandaautomatica boolean DEFAULT false,
  cstibscbs character varying(4),
  cclasstribibscbs character varying(7),
  ibsaliquota monetario DEFAULT 0,
  cbsaliquota monetario DEFAULT 0,
  utilizareducaoibscbs boolean DEFAULT false,
  porcreducaoibs integer DEFAULT 0,
  porcreducaocbs integer DEFAULT 0,
  nfsenbs character varying(10),
  nfseindopnbs character varying(7),
  nfsecclasstribnbs character varying(7),
  nfseibsaliquota monetario DEFAULT 0,
  nfsecbsaliquota monetario DEFAULT 0,
  nfsebeneficio character varying(10),
  CONSTRAINT pk_produto PRIMARY KEY (idproduto),
  CONSTRAINT fk_produto_csosn_pro_csosn FOREIGN KEY (codigocsosn)
      REFERENCES csosn (codigocsosn) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_depoisito_deposito FOREIGN KEY (iddeposito)
      REFERENCES deposito_loja (iddeposito) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_fornecedo_forneced FOREIGN KEY (idfornecedor)
      REFERENCES fornecedor (idfornecedor) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_funcionar_funciona FOREIGN KEY (idusuarioalteracao)
      REFERENCES funcionario_usuario (idfuncionariousuario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_c_produto_ FOREIGN KEY (idprodutocaracteristica)
      REFERENCES produto_caracteristica (idprodutocaracteristica) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_d_produto_ FOREIGN KEY (iddepartamento)
      REFERENCES produto_departamento (iddepartamento) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_g_produto_ FOREIGN KEY (idgrupo)
      REFERENCES produto_grupo (idgrupo) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_l_produto_ FOREIGN KEY (idlinha)
      REFERENCES produto_linha (idlinha) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_m_produto_ FOREIGN KEY (idmarca)
      REFERENCES produto_marca (idmarca) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_s_produto_ FOREIGN KEY (idsubgrupo)
      REFERENCES produto_subgrupo (idsubgrupo) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_s_produto_2 FOREIGN KEY (idsetor)
      REFERENCES produto_setor (idsetor) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_produto_u_produto_ FOREIGN KEY (idunidade)
      REFERENCES produto_unidade (idunidade) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_produto_relations_funciona FOREIGN KEY (idusuariocadastro)
      REFERENCES funcionario_usuario (idfuncionariousuario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ckc_descontomaximo_produto CHECK (descontomaximo IS NULL OR descontomaximo >= 0::numeric AND descontomaximo <= 100::numeric)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE produto
  OWNER TO postgres;
GRANT ALL ON TABLE produto TO postgres;
GRANT SELECT ON TABLE produto TO usuario_leitura;

-- Index: depoisito_loja_produto_fk

-- DROP INDEX depoisito_loja_produto_fk;

CREATE INDEX depoisito_loja_produto_fk
  ON produto
  USING btree
  (iddeposito);

-- Index: fornecedor_produto_fk

-- DROP INDEX fornecedor_produto_fk;

CREATE INDEX fornecedor_produto_fk
  ON produto
  USING btree
  (idfornecedor);

-- Index: funcionario_usuario_produto_fk

-- DROP INDEX funcionario_usuario_produto_fk;

CREATE INDEX funcionario_usuario_produto_fk
  ON produto
  USING btree
  (idusuarioalteracao);

-- Index: produto_caracteristica_produto_

-- DROP INDEX produto_caracteristica_produto_;

CREATE INDEX produto_caracteristica_produto_
  ON produto
  USING btree
  (idprodutocaracteristica);

-- Index: produto_departamento_fk

-- DROP INDEX produto_departamento_fk;

CREATE INDEX produto_departamento_fk
  ON produto
  USING btree
  (iddepartamento);

-- Index: produto_grupo_produto_fk

-- DROP INDEX produto_grupo_produto_fk;

CREATE INDEX produto_grupo_produto_fk
  ON produto
  USING btree
  (idgrupo);

-- Index: produto_linha_produto_fk

-- DROP INDEX produto_linha_produto_fk;

CREATE INDEX produto_linha_produto_fk
  ON produto
  USING btree
  (idlinha);

-- Index: produto_marca_produto_fk

-- DROP INDEX produto_marca_produto_fk;

CREATE INDEX produto_marca_produto_fk
  ON produto
  USING btree
  (idmarca);

-- Index: produto_pk

-- DROP INDEX produto_pk;

CREATE UNIQUE INDEX produto_pk
  ON produto
  USING btree
  (idproduto);

-- Index: produto_setor_fk

-- DROP INDEX produto_setor_fk;

CREATE INDEX produto_setor_fk
  ON produto
  USING btree
  (idsetor);

-- Index: produto_subgrupo_fk

-- DROP INDEX produto_subgrupo_fk;

CREATE INDEX produto_subgrupo_fk
  ON produto
  USING btree
  (idsubgrupo);

-- Index: produto_unidade_produto_fk

-- DROP INDEX produto_unidade_produto_fk;

CREATE INDEX produto_unidade_produto_fk
  ON produto
  USING btree
  (idunidade);

-- Index: relationship_92_fk

-- DROP INDEX relationship_92_fk;

CREATE INDEX relationship_92_fk
  ON produto
  USING btree
  (idusuariocadastro);


-- Rule: atualizardatahorainsert ON produto

-- DROP RULE atualizardatahorainsert ON produto;

CREATE OR REPLACE RULE atualizardatahorainsert AS
    ON INSERT TO produto DO  UPDATE conf_inicial SET datahora = now();

-- Rule: atualizardatahoraupdate ON produto

-- DROP RULE atualizardatahoraupdate ON produto;

CREATE OR REPLACE RULE atualizardatahoraupdate AS
    ON UPDATE TO produto DO  UPDATE conf_inicial SET datahora = now();


-- Trigger: tg_alterarproduto on produto

-- DROP TRIGGER tg_alterarproduto ON produto;

CREATE TRIGGER tg_alterarproduto
  BEFORE INSERT OR UPDATE
  ON produto
  FOR EACH ROW
  EXECUTE PROCEDURE alterarproduto();



Esquema do Banco de Dados - Athos Empresarial

Este documento serve como referência de contexto para o GSD sobre a estrutura de tabelas do PostgreSQL.

1. Fluxo de Vendas e Caixa

Tabelas usadas para monitorar vendas e confirmar pagamentos via terminal de caixa.

Tabela: venda

Armazena os dados principais da venda/pedido.

idvenda: Primary Key.

numeroordem: Número visual do pedido (ex: "0005").

observacao: Campo para registrar "Pagamento feito no caixa".

valor: Valor total da venda.

Tabela: relacao_orcamento_venda

Tabela de ligação que dispara notificações via trigger.

idrelataocaorcamentovenda: Primary Key.

idvenda: Foreign Key para venda.idvenda.

idorcamento: ID do orçamento original.

2. Fluxo Financeiro e Documentos

Tabelas para gestão de contas a pagar e anexos físicos.

Tabela: conta_pagar

idcontapagar: Primary Key.

numerodocumento: Identificador do documento/nota.

descricaoconta: Detalhes do pagamento.

datavencimento: Data de vencimento.

valorconta: Valor original.

valorpago: Valor efetivamente pago.

Tabela: anexo

Armazena o caminho dos arquivos físicos (boletos/comprovantes).

idanexo: Primary Key.

idcontapagar: Foreign Key para conta_pagar.idcontapagar.

caminhoanexo: Path UNC completo (ex: \\192.168.3.203\html\Anexo\contapagar\ID\arquivo.png).

arquivo: Nome do arquivo com extensão.

idfuncionario: Quem realizou o upload.

3. Triggers e Notificações

Canal de Escuta: n8n_channel.

Trigger: trigger_relacao_orcamento_venda_notify dispara AFTER INSERT OR UPDATE em relacao_orcamento_venda.



-- Table: conta_pagar

-- DROP TABLE conta_pagar;

CREATE TABLE conta_pagar
(
  idcontapagar serial NOT NULL,
  idtipoconta integer,
  idgrupoconta integer,
  idsubgrupoconta integer,
  idconta integer,
  idcentrocusto integer,
  numerodocumento descricao,
  descricaoconta descricao,
  dataemissao dmdata,
  datavencimento dmdata,
  valorconta monetario,
  observacao descricao,
  statusconta character varying(3),
  valorpago monetario,
  jurosconta monetario,
  competenciames character varying(2),
  competenciaano character varying(4),
  desconto numeric(9,3),
  datapagamento date,
  idfuncionario integer,
  datalancamento dmdata,
  enviaalerta boolean,
  idnivel5 integer,
  idfornecedor integer,
  multaconta monetario,
  idorigempagamento integer,
  ultimaalteracao timestamp without time zone DEFAULT now(),
  sincronizado boolean DEFAULT false,
  historicocontabil character varying(100),
  agruparconta boolean DEFAULT false,
  idloja integer,
  idbudget integer,
  recorrenciafornecedor boolean NOT NULL DEFAULT true,
  exibemsgrecorrencia boolean NOT NULL DEFAULT true,
  numeronota descricao_curta,
  CONSTRAINT pk_conta_pagar PRIMARY KEY (idcontapagar),
  CONSTRAINT fk_conta_pa_centro_cu_centro_c FOREIGN KEY (idcentrocusto)
      REFERENCES centro_custo (idcentrocusto) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_conta_pa_conta_con_conta FOREIGN KEY (idconta)
      REFERENCES conta (idconta) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_conta_pa_funcionar_funciona FOREIGN KEY (idfuncionario)
      REFERENCES funcionario (idfuncionario) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_conta_pa_grupo_con_grupo_co FOREIGN KEY (idgrupoconta)
      REFERENCES grupo_conta (idgrupoconta) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_conta_pa_subgrupo__subgrupo FOREIGN KEY (idsubgrupoconta)
      REFERENCES subgrupo_conta (idsubgrupoconta) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_conta_pa_tipo_cont_tipo_con FOREIGN KEY (idtipoconta)
      REFERENCES tipo_conta (idtipoconta) MATCH SIMPLE
      ON UPDATE RESTRICT ON DELETE RESTRICT
)
WITH (
  OIDS=FALSE
);
ALTER TABLE conta_pagar
  OWNER TO postgres;
GRANT ALL ON TABLE conta_pagar TO postgres;
GRANT SELECT ON TABLE conta_pagar TO usuario_leitura;

-- Index: centro_custo_conta_pagar_fk

-- DROP INDEX centro_custo_conta_pagar_fk;

CREATE INDEX centro_custo_conta_pagar_fk
  ON conta_pagar
  USING btree
  (idcentrocusto);

-- Index: conta_conta_pagar_fk

-- DROP INDEX conta_conta_pagar_fk;

CREATE INDEX conta_conta_pagar_fk
  ON conta_pagar
  USING btree
  (idconta);

-- Index: conta_pagar_pk

-- DROP INDEX conta_pagar_pk;

CREATE UNIQUE INDEX conta_pagar_pk
  ON conta_pagar
  USING btree
  (idcontapagar);

-- Index: funcionario_conta_pagar_fk

-- DROP INDEX funcionario_conta_pagar_fk;

CREATE INDEX funcionario_conta_pagar_fk
  ON conta_pagar
  USING btree
  (idfuncionario);

-- Index: grupo_conta_conta_pagar_fk

-- DROP INDEX grupo_conta_conta_pagar_fk;

CREATE INDEX grupo_conta_conta_pagar_fk
  ON conta_pagar
  USING btree
  (idgrupoconta);

-- Index: subgrupo_conta_conta_pagar_fk

-- DROP INDEX subgrupo_conta_conta_pagar_fk;

CREATE INDEX subgrupo_conta_conta_pagar_fk
  ON conta_pagar
  USING btree
  (idsubgrupoconta);

-- Index: tipo_conta_conta_pagar_fk

-- DROP INDEX tipo_conta_conta_pagar_fk;

CREATE INDEX tipo_conta_conta_pagar_fk
  ON conta_pagar
  USING btree
  (idtipoconta);


-- Trigger: tg_alterarcontapagar on conta_pagar

-- DROP TRIGGER tg_alterarcontapagar ON conta_pagar;

CREATE TRIGGER tg_alterarcontapagar
  BEFORE INSERT OR UPDATE
  ON conta_pagar
  FOR EACH ROW
  EXECUTE PROCEDURE alterarcontapagar();



-- Table: anexo

-- DROP TABLE anexo;

CREATE TABLE anexo
(
  idfuncionario bigint NOT NULL,
  caminhoanexo character varying(255) NOT NULL,
  arquivo character varying(255) NOT NULL,
  idclientehistorico bigint NOT NULL,
  idcontapagar integer,
  idanexo serial NOT NULL,
  CONSTRAINT anexo_pkey PRIMARY KEY (idanexo)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE anexo
  OWNER TO postgres;
GRANT ALL ON TABLE anexo TO postgres;
GRANT SELECT ON TABLE anexo TO usuario_leitura;
