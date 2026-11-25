/**
 * Reconciliacao dos orcamentos gravados como parciais pelo webhook antigo da EFI (fase 54, D-14).
 *
 * O webhook anterior ignorava o desconto de PIX a vista (5% acima de R$ 150,00): o orcamento #26809
 * (total 173,00, pago 164,35) ficou PAGAMENTO_PARCIAL com paymentDiscount 0. Este script grava o
 * desconto, o valor pago, pendingTotal 0, paymentConfirmedAt e, quando o status atual e
 * PAGAMENTO_PARCIAL, o novo status APROVADO.
 *
 * Execucao:
 *   npx ts-node --project apps/backend/tsconfig.json apps/backend/scripts/reconciliar-pagamentos-pix.ts [--aplicar] [--quote ID] [--limite N] [--ajuda]
 *
 * Seguranca:
 * - DRY-RUN e o padrao: so le o banco e imprime o plano. Escreve somente com --aplicar.
 * - Imprime host/nome do banco alvo (sem usuario nem senha) antes de qualquer consulta.
 * - Cada orcamento e atualizado numa transacao propria, de forma condicional (paymentDiscount ainda
 *   zero e status inalterado), entao rodar duas vezes nao duplica nada.
 * - NAO notifica o cliente, NAO chama o Chatwoot e NAO usa o QuotesService: as etiquetas do
 *   Chatwoot dos orcamentos com status alterado precisam ser conferidas manualmente.
 * - A execucao em producao depende de aprovacao explicita do usuario (checkpoint do plano 54-12).
 */

import { PrismaClient } from "@prisma/client";
import {
  AUTOR_RECONCILIACAO,
  PlanoReconciliacao,
  QuoteReconciliacao,
  interpretarArgumentos,
  planejarReconciliacao,
} from "../src/modules/quotes/quote-payment-reconciliation.util";

const ESPERA_APLICAR_MS = 5000;

const USO = `Uso:
  npx ts-node --project apps/backend/tsconfig.json apps/backend/scripts/reconciliar-pagamentos-pix.ts [opcoes]

Opcoes:
  --aplicar      Grava as alteracoes. Sem esta flag o script roda em DRY-RUN (so le e imprime o plano).
  --quote ID     Restringe a um orcamento (numero externo, numero interno ou id).
  --limite N     Maximo de orcamentos analisados (padrao 500).
  --ajuda        Mostra este texto e sai, sem conectar ao banco.

O script nao notifica o cliente nem chama o Chatwoot. Confira as etiquetas dos orcamentos listados ao final.`;

type LinhaAlterada = { numero: string; statusAnterior: string; statusNovo: string };

/** Host e nome do banco de DATABASE_URL, sem usuario nem senha. */
function descreverBancoAlvo(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nao definida.");
  try {
    const analisada = new URL(url);
    const nome = analisada.pathname.replace(/^\//, "") || "(sem nome)";
    return `${analisada.host || "(sem host)"}/${nome}`;
  } catch {
    return "(DATABASE_URL em formato nao reconhecido)";
  }
}

function filtroDoQuote(identificador: string) {
  if (/^\d+$/.test(identificador)) {
    return {
      OR: [
        { externalQuoteId: BigInt(identificador) },
        // Int de 32 bits do Postgres; numeros maiores so podem ser externalQuoteId.
        ...(Number(identificador) <= 2147483647 ? [{ internalNumber: Number(identificador) }] : []),
      ],
    };
  }
  return { id: identificador };
}

function numeroDoQuote(quote: { externalQuoteId: bigint | null; internalNumber: number }): string {
  return quote.externalQuoteId !== null ? String(quote.externalQuoteId) : `interno-${quote.internalNumber}`;
}

function formatarReais(valor: unknown): string {
  const numero = Number(String(valor));
  return Number.isFinite(numero) ? numero.toFixed(2) : String(valor);
}

async function aplicarPlano(
  prisma: PrismaClient,
  quote: { id: string; status: string },
  plano: PlanoReconciliacao,
): Promise<"APLICADO" | "ALTERADO_POR_OUTRO_PROCESSO"> {
  return prisma.$transaction(async (tx) => {
    // Condicional: so grava se ninguem reconciliou nem mudou o status desde a leitura.
    const atualizados = await tx.quote.updateMany({
      where: { id: quote.id, paymentDiscount: 0, status: quote.status as any },
      data: {
        paymentDiscount: plano.paymentDiscount.toFixed(2),
        paymentAmount: plano.paymentAmount.toFixed(2),
        pendingTotal: plano.pendingTotal.toFixed(2),
        paymentConfirmedAt: plano.paymentConfirmedAt,
        ...(plano.novoStatus ? { status: plano.novoStatus } : {}),
        updatedAt: new Date(),
      },
    });
    if (atualizados.count !== 1) return "ALTERADO_POR_OUTRO_PROCESSO" as const;

    if (plano.transacoesParaPago.length > 0) {
      await tx.paymentTransaction.updateMany({
        where: { id: { in: plano.transacoesParaPago }, status: "PARTIAL" },
        data: { status: "PAID" },
      });
    }

    if (plano.novoStatus && plano.novoStatus !== quote.status) {
      await tx.quoteStatusHistory.create({
        data: {
          quoteId: quote.id,
          oldStatus: quote.status as any,
          newStatus: plano.novoStatus,
          changedByName: AUTOR_RECONCILIACAO,
        },
      });
    }
    return "APLICADO" as const;
  });
}

async function main(): Promise<void> {
  const argumentos = interpretarArgumentos(process.argv.slice(2));

  if (argumentos.erro) {
    console.error(`Erro: ${argumentos.erro}\n`);
    console.error(USO);
    process.exitCode = 1;
    return;
  }
  if (argumentos.ajuda) {
    console.log(USO);
    return;
  }

  // A conexao so e criada depois de validar os argumentos e descartar --ajuda.
  const alvo = descreverBancoAlvo();
  console.log(`Modo: ${argumentos.aplicar ? "APLICAR (GRAVA NO BANCO)" : "DRY-RUN (somente leitura)"}`);
  console.log(`Banco alvo: ${alvo}`);

  if (argumentos.aplicar) {
    console.log("\n*** ATENCAO: as alteracoes serao GRAVADAS em ~5 segundos. Ctrl+C para cancelar. ***\n");
    await new Promise((resolve) => setTimeout(resolve, ESPERA_APLICAR_MS));
  }

  const prisma = new PrismaClient();
  try {
    const candidatos = await prisma.quote.findMany({
      where: argumentos.quote
        ? filtroDoQuote(argumentos.quote)
        : { paymentExternalId: { not: null }, paymentDiscount: 0, paidTotal: { gt: 0 } },
      include: { paymentTransactions: true },
      orderBy: { createdAt: "asc" },
      take: argumentos.limite,
    });

    console.log(`Orcamentos analisados: ${candidatos.length}\n`);

    const ignoradosPorMotivo = new Map<string, number>();
    const alterados: LinhaAlterada[] = [];
    let elegiveis = 0;
    let aplicados = 0;
    let falhas = 0;

    for (const quote of candidatos) {
      const numero = numeroDoQuote(quote);
      const resultado = planejarReconciliacao(quote as unknown as QuoteReconciliacao);

      if (!resultado.elegivel) {
        ignoradosPorMotivo.set(resultado.motivo, (ignoradosPorMotivo.get(resultado.motivo) ?? 0) + 1);
        console.log(`#${numero} IGNORADO (${resultado.motivo}) total=${formatarReais(quote.total)} pago=${formatarReais(quote.paidTotal)} status=${quote.status}`);
        continue;
      }

      elegiveis += 1;
      const { plano } = resultado;
      const statusNovo = plano.novoStatus ?? quote.status;
      console.log(
        `#${numero} ELEGIVEL total=${formatarReais(quote.total)} pago=${formatarReais(quote.paidTotal)} ` +
          `desconto=${plano.paymentDiscount.toFixed(2)} status=${quote.status} -> ${statusNovo} ` +
          `transacoes->PAID=${plano.transacoesParaPago.length}`,
      );

      if (!argumentos.aplicar) continue;

      try {
        const situacao = await aplicarPlano(prisma, quote, plano);
        if (situacao === "ALTERADO_POR_OUTRO_PROCESSO") {
          console.log(`  #${numero} PULADO: alterado por outro processo desde a leitura.`);
          continue;
        }
        aplicados += 1;
        console.log(`  #${numero} APLICADO.`);
        if (plano.novoStatus && plano.novoStatus !== quote.status) {
          alterados.push({ numero, statusAnterior: quote.status, statusNovo: plano.novoStatus });
        }
      } catch (erro) {
        falhas += 1;
        console.error(`  #${numero} FALHA: ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }

    console.log("\nResumo");
    console.log(`  Elegiveis: ${elegiveis}`);
    for (const [motivo, quantidade] of ignoradosPorMotivo) {
      console.log(`  Ignorados (${motivo}): ${quantidade}`);
    }
    if (argumentos.aplicar) {
      console.log(`  Aplicados: ${aplicados}`);
      console.log(`  Falhas: ${falhas}`);
      if (alterados.length > 0) {
        console.log("\nOrcamentos com status alterado (confira as etiquetas do Chatwoot manualmente; este script nao as sincroniza):");
        for (const linha of alterados) {
          console.log(`  #${linha.numero}: ${linha.statusAnterior} -> ${linha.statusNovo}`);
        }
      }
      if (falhas > 0) process.exitCode = 1;
    } else {
      console.log("  DRY-RUN: nada foi gravado. Use --aplicar para gravar.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
});
