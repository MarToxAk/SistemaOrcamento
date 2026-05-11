Definição da Arquitetura e Regras de Negócio

1. Lógica de Mensageria (Baseada no bridge.js)

O sistema deve implementar um cliente Postgres persistente que:

Executa LISTEN n8n_channel.

Ao receber notification, busca o último registro em relacao_orcamento_venda.

Mudança: Em vez de enviar para n8n via axios, processa internamente:

Busca numeroordem na tabela venda.

Atualiza venda.observacao para "Pagamento feito no caixa".

Notifica o Front-end via WebSocket ou API interna.

2. Endpoints da API Athos (/api/athos)

GET /contas-pagar

Listagem com filtros dataInicio e dataFinal.

Normalização de campos para o padrão JSON da aplicação.

POST /contas-pagar

Criação de novos registros financeiros.

Retorna o idcontapagar gerado.

POST /contas-pagar/:id/anexo

Upload de Arquivo:

Destino: \\192.168.3.203\html\Anexo\contapagar\{idcontapagar}\.

Deve criar a pasta caso não exista.

Registro no Banco: Criar entrada na tabela anexo com o path gerado.

3. Requisitos de Infraestrutura

O backend deve ter permissões de rede (SMB) para o IP 192.168.3.203.

Autenticação via ATHOS_API_TOKEN nos heade