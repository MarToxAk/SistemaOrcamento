const { Client } = require("pg");

const timeoutMs = Number(process.env.WAIT_FOR_DB_TIMEOUT_MS || 120000);
const intervalMs = Number(process.env.WAIT_FOR_DB_INTERVAL_MS || 2000);
const databaseUrl = process.env.DATABASE_URL;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canConnect() {
  const client = new Client({
    connectionString: databaseUrl,
    statement_timeout: 5000,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  if (!databaseUrl) {
    console.error("DB_READINESS_FAILED: DATABASE_URL nao definida.");
    console.error("Acao recomendada: definir DATABASE_URL e reiniciar o container backend.");
    process.exit(1);
  }

  const start = Date.now();
  let lastError = "";

  while (Date.now() - start < timeoutMs) {
    try {
      await canConnect();
      console.log("DB_READY: PostgreSQL aceitou conexao.");
      return;
    } catch (error) {
      lastError = error && error.message ? error.message : String(error);
      console.log(`DB_WAITING: aguardando PostgreSQL... tentativa em ${intervalMs}ms`);
      await sleep(intervalMs);
    }
  }

  console.error("DB_READINESS_FAILED: timeout aguardando conexao com PostgreSQL.");
  console.error(`Detalhe tecnico: ${lastError}`);
  console.error("Acao recomendada: revisar DATABASE_URL, conectividade de rede e logs do servico postgres.");
  process.exit(1);
}

main().catch((error) => {
  const detail = error && error.message ? error.message : String(error);
  console.error("DB_READINESS_FAILED: erro nao tratado no readiness check.");
  console.error(`Detalhe tecnico: ${detail}`);
  console.error("Acao recomendada: revisar DATABASE_URL, conectividade de rede e logs do servico postgres.");
  process.exit(1);
});
