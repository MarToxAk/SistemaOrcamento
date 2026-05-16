#!/usr/bin/env node
/**
 * Reconcilia pagamentos no caixa Athos para todos os orçamentos PENDENTE/ENVIADO.
 * Uso: node scripts/reconcile-caixa.mjs [--dry-run] [--url http://localhost:4000]
 *
 * O script chama GET /quotes/:id para cada orçamento Athos (com externalQuoteId),
 * o que dispara conciliarViaCaixaAthos internamente no backend, atualizando o status
 * e enviando mensagem ao cliente quando pagamento no caixa for detectado.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// --- Config via args ou .env ---
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const urlArg = args.find((a) => a.startsWith("--url="))?.replace("--url=", "");

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const lines = readFileSync(envPath, "utf8").split("\n");
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const BASE_URL = urlArg ?? process.env.BACKEND_URL ?? env.BACKEND_URL ?? "http://localhost:4000/api";
const API_KEY = process.env.INTERNAL_API_KEY ?? env.INTERNAL_API_KEY ?? "";
const HEADERS = { "x-internal-api-key": API_KEY, "Content-Type": "application/json" };

// --- Helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiFetch(path, opts = {}, retries = 3) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS, ...opts });
  if (res.status === 429 && retries > 0) {
    process.stdout.write(`[429 aguardando 65s...] `);
    await sleep(65_000);
    return apiFetch(path, opts, retries - 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} em ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function listQuotesByStatus(status, skip = 0, take = 100) {
  const data = await apiFetch(`/quotes?status=${status}&skip=${skip}&take=${take}`);
  return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
}

async function getQuoteById(id) {
  return apiFetch(`/quotes/${encodeURIComponent(id)}`);
}

// --- Main ---
async function run() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Reconciliação de Pagamentos no Caixa Athos");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  Backend: ${BASE_URL}`);
  if (DRY_RUN) console.log("  ⚠️  MODO DRY-RUN — nenhuma ação será executada");
  console.log("");

  if (!API_KEY) {
    console.error("❌ INTERNAL_API_KEY não encontrada. Defina no .env ou variável de ambiente.");
    process.exit(1);
  }

  // 1. Coletar todos os orçamentos PENDENTE e ENVIADO
  const toCheck = [];
  for (const status of ["PENDENTE", "ENVIADO"]) {
    let skip = 0;
    let page;
    do {
      page = await listQuotesByStatus(status, skip, 100);
      for (const q of page) {
        const externalId = q.body?.idorcamento;
        const internalId = q.body?.idorcamento_interno ?? q.internalNumber;
        if (!externalId) continue; // só orçamentos vinculados ao Athos
        toCheck.push({
          dbId: q.id,
          externalId,
          internalId,
          status,
          cliente: q.body?.cliente?.nome ?? "—",
          total: q.body?.totais?.valor ?? 0,
          orderNumber: q.orderNumber ?? null,
        });
      }
      skip += page.length;
    } while (page.length === 100);
  }

  if (toCheck.length === 0) {
    console.log("✅ Nenhum orçamento Athos em PENDENTE ou ENVIADO encontrado.");
    return;
  }

  console.log(`📋 ${toCheck.length} orçamento(s) Athos para verificar:\n`);
  console.log(
    "  Nº Athos  | Interno | Status   | Cliente                    | Total"
  );
  console.log(
    "  ──────────|─────────|──────────|────────────────────────────|──────────"
  );
  for (const q of toCheck) {
    const nome = (q.cliente ?? "").slice(0, 26).padEnd(26);
    const total = Number(q.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).padStart(10);
    console.log(
      `  #${String(q.externalId).padEnd(9)}| #${String(q.internalId ?? "?").padEnd(6)}| ${q.status.padEnd(8)} | ${nome} | ${total}`
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("⚠️  Dry-run ativo — nada foi executado. Remova --dry-run para reconciliar.");
    return;
  }

  // 2. Disparar reconciliação para cada um (GET /quotes/:id → conciliarViaCaixaAthos)
  console.log("🔄 Iniciando reconciliação...\n");
  const results = [];

  for (const q of toCheck) {
    process.stdout.write(`  #${q.externalId} [${q.status}] ${(q.cliente ?? "").slice(0, 24).padEnd(24)} → `);
    try {
      const updated = await getQuoteById(String(q.externalId));
      // conciliarViaCaixaAthos roda async em background; esperamos 800ms e checamos de novo
      await sleep(800);
      const checked = await getQuoteById(String(q.externalId));

      const newStatus = checked.statusKey ?? checked.status ?? "?";
      const orderNum = checked.orderNumber ?? null;
      const paid = Boolean(checked.paidInCashier || orderNum);

      if (paid) {
        console.log(`✅ PAGO NO CAIXA — Pedido #${orderNum ?? "?"} | Status: ${newStatus}`);
        results.push({ ...q, result: "paid", newStatus, orderNum });
      } else if (newStatus !== q.status) {
        console.log(`🔄 Status alterado: ${q.status} → ${newStatus}`);
        results.push({ ...q, result: "changed", newStatus });
      } else {
        console.log(`⏳ Não pago no caixa | Status: ${newStatus}`);
        results.push({ ...q, result: "unpaid", newStatus });
      }
    } catch (err) {
      console.log(`❌ Erro: ${err.message}`);
      results.push({ ...q, result: "error", error: err.message });
    }

    await sleep(1200); // throttle entre chamadas (max 60 req/min, 2 req/quote = ~2.4s/quote)
  }

  // 3. Resumo final
  const paid = results.filter((r) => r.result === "paid");
  const changed = results.filter((r) => r.result === "changed");
  const unpaid = results.filter((r) => r.result === "unpaid");
  const errors = results.filter((r) => r.result === "error");

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Resultado");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  ✅ Pagos no caixa atualizados: ${paid.length}`);
  console.log(`  🔄 Status alterados (outro motivo): ${changed.length}`);
  console.log(`  ⏳ Não pagos no caixa: ${unpaid.length}`);
  console.log(`  ❌ Erros: ${errors.length}`);

  if (paid.length > 0) {
    console.log("\n  Orçamentos marcados como pagos no caixa:");
    for (const r of paid) {
      console.log(`    #${r.externalId} — ${r.cliente} | Pedido #${r.orderNum ?? "?"} | ${r.newStatus}`);
    }
  }

  if (errors.length > 0) {
    console.log("\n  Erros:");
    for (const r of errors) {
      console.log(`    #${r.externalId} — ${r.error}`);
    }
  }

  console.log("");
}

run().catch((err) => {
  console.error("\n❌ Erro fatal:", err.message);
  process.exit(1);
});
