"use client";

import { useEffect, useState } from "react";
import type { DadosCliente, HistoricoCliente, TituloReceber } from "./compartilhado";

/** Carrega dados cadastrais, titulos enriquecidos (NF, boleto, NFS-e em uso) e historico do cliente. */
export function useDadosCliente(idcliente: string) {
  const [dadosCliente, setDadosCliente] = useState<DadosCliente | null>(null);
  const [titulos, setTitulos] = useState<TituloReceber[]>([]);
  const [loadingCliente, setLoadingCliente] = useState(true);
  const [loadingTitulos, setLoadingTitulos] = useState(true);
  const [erroCliente, setErroCliente] = useState("");
  const [erroTitulos, setErroTitulos] = useState("");
  const [historico, setHistorico] = useState<HistoricoCliente | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [erroHistorico, setErroHistorico] = useState("");

  // Refetch key for triggering title list reload
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    // Fetch dados cadastrais do cliente
    fetch(`/api/athos/contas-receber/cliente/${idcliente}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar dados do cliente.");
        const data = (await res.json()) as DadosCliente;
        setDadosCliente(data);
      })
      .catch(() => setErroCliente("Erro ao carregar dados do cliente."))
      .finally(() => setLoadingCliente(false));

    // Fetch títulos do cliente + verificação de NF em paralelo
    fetch(`/api/athos/contas-receber/cliente/${idcliente}/titulos`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar títulos.");
        const data = (await res.json()) as TituloReceber[];
        // Verificar NF para cada título
        const ids = data.map((t) => t.idcontareceber);
        if (ids.length > 0) {
          try {
            const nfRes = await fetch(`/api/athos/contas-receber/cliente/${idcliente}/nf-status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idcontasReceber: ids }),
              cache: "no-store",
            });
            if (nfRes.ok) {
              const nfData = (await nfRes.json()) as Array<{ idcontareceber: number; tipoNf: string | null; numeroNf: string | null }>;
              const nfMap = new Map(nfData.map((n) => [n.idcontareceber, { tipoNf: n.tipoNf, numeroNf: n.numeroNf }]));
              // Verificar boletos ativos para os mesmos títulos
                let boletoMap = new Map<number, NonNullable<TituloReceber["boletoAtivo"]>>();
                try {
                  const boletoRes = await fetch("/api/cobranca/boleto/titulos-em-uso", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idcontasReceber: ids }),
                    cache: "no-store",
                  });
                  if (boletoRes.ok) {
                    const boletoData = (await boletoRes.json()) as Array<
                      { idcontareceber: number } & NonNullable<TituloReceber["boletoAtivo"]>
                    >;
                    boletoMap = new Map(
                      boletoData.map((b) => [
                        b.idcontareceber,
                        {
                          cobrancaId: b.cobrancaId,
                          status: b.status,
                          linkBoleto: b.linkBoleto,
                          nomeArquivo: b.nomeArquivo,
                          expireAt: b.expireAt ?? null,
                          dataPagamento: b.dataPagamento ?? null,
                          ultimoEmail: b.ultimoEmail ?? null,
                        },
                      ]),
                    );
                  }
                } catch { /* silently ignore */ }

                // Verificar NFS-e emitidas no nosso banco para os mesmos títulos
                let nfseMap = new Map<number, { nfseEmitidaId: number; numeroNfse: string | null; linkNfse?: string | null }>();
                try {
                  const nfseRes = await fetch("/api/cobranca/nfse/titulos-em-uso", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idcontasReceber: ids }),
                    cache: "no-store",
                  });
                  if (nfseRes.ok) {
                    const nfseData = (await nfseRes.json()) as Array<{ idcontareceber: number; nfseEmitidaId: number; numeroNfse: string | null; linkNfse?: string | null }>;
                    nfseMap = new Map(nfseData.map((n) => [n.idcontareceber, { nfseEmitidaId: n.nfseEmitidaId, numeroNfse: n.numeroNfse, linkNfse: n.linkNfse }]));
                  }
                } catch { /* silently ignore */ }

                setTitulos(data.map((t) => {
                  const nf = nfMap.get(t.idcontareceber);
                  const nfseAtivo = nfseMap.get(t.idcontareceber) ?? null;
                  // Se houver NFS-e no nosso banco E NF-e/Athos, mostrar ambos combinados
                  let tipoNf: string | null = null;
                  let numeroNf: string | null = null;
                  if (nfseAtivo && nf?.tipoNf) {
                    tipoNf = `${nf.tipoNf} / NFS-e`;
                    const nums: string[] = [];
                    if (nf.numeroNf) nums.push(nf.numeroNf);
                    if (nfseAtivo.numeroNfse) nums.push(nfseAtivo.numeroNfse);
                    numeroNf = nums.length > 0 ? nums.join(", ") : null;
                  } else if (nfseAtivo) {
                    tipoNf = "NFS-e";
                    numeroNf = nfseAtivo.numeroNfse ?? null;
                  } else {
                    tipoNf = nf?.tipoNf ?? null;
                    numeroNf = nf?.numeroNf ?? null;
                  }
                  return {
                    ...t,
                    tipoNf,
                    numeroNf,
                    boletoAtivo: boletoMap.get(t.idcontareceber) ?? null,
                    nfseAtivo,
                  };
                }));
              return;
            }
          } catch { /* silently ignore NF check errors */ }
        }
        setTitulos(data);
      })
      .catch(() => setErroTitulos("Erro ao carregar títulos."))
      .finally(() => setLoadingTitulos(false));

    // Fetch histórico de consumo do cliente (contas pagas, itens mais comprados, mês de maior gasto)
    setLoadingHistorico(true);
    fetch(`/api/athos/contas-receber/cliente/${idcliente}/historico`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar histórico.");
        const data = (await res.json()) as HistoricoCliente;
        setHistorico(data);
        setErroHistorico("");
      })
      .catch(() => setErroHistorico("Erro ao carregar histórico do cliente."))
      .finally(() => setLoadingHistorico(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idcliente, refetchKey]);

  /** Dispara nova carga; com `mostrarCarregando` volta a exibir o spinner de titulos. */
  function recarregar(mostrarCarregando: boolean = false) {
    if (mostrarCarregando) setLoadingTitulos(true);
    setRefetchKey((k) => k + 1);
  }

  return {
    dadosCliente,
    loadingCliente,
    erroCliente,
    titulos,
    loadingTitulos,
    erroTitulos,
    historico,
    loadingHistorico,
    erroHistorico,
    recarregar,
  };
}
