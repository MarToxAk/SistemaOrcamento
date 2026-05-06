require('dotenv').config();
const { Client } = require('pg');
const axios = require('axios');

const PG_CONNECTION_STRING = process.env.DATABASE_URL;
const N8N_WEBHOOK_URL = process.env. N8N_WEBHOOK_URL;
const LISTEN_CHANNEL = 'n8n_channel';

const client = new Client({
  connectionString: PG_CONNECTION_STRING,
});

async function startBridge() {
  try {
    await client.connect();
    console.log(`🔌 Conectado ao Postgres.  Escutando canal: ${LISTEN_CHANNEL}`);

    await client.query(`LISTEN ${LISTEN_CHANNEL}`);

    client.on('notification', async (msg) => {
      console.log('🔔 Notificação recebida:', msg. payload);

      try {
        const result = await client.query(
          'SELECT * FROM relacao_orcamento_venda ORDER BY idrelataocaorcamentovenda DESC LIMIT 1'
        );

        const record = result. rows[0];

        if (! record) {
          console.log('⚠️ Nenhum registro encontrado');
          return;
        }

        await axios.post(N8N_WEBHOOK_URL, {
          event: 'postgres_notification',
          table: 'relacao_orcamento_venda',
          operation: msg.payload,
          data: record,
          timestamp: new Date().toISOString()
        });

        console.log('✅ Enviado para n8n com sucesso:', record);

      } catch (err) {
        console.error('❌ Erro ao processar notificação:', err.message);
      }
    });

    client.on('error', (err) => {
      console. error('❌ Erro na conexão do Postgres:', err);
      process.exit(1);
    });

    setInterval(() => {
      client.query('SELECT 1').catch(err => {
        console.error('Erro no keep-alive:', err. message);
      });
    }, 60000);

  } catch (err) {
    console.error('❌ Erro ao iniciar a bridge:', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n👋 Encerrando bridge...');
  await client.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Encerrando bridge...');
  await client.end();
  process.exit(0);
});

startBridge();
