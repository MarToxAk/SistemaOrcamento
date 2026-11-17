"use client";

import { useEffect, useRef, useState } from "react";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../../contas-receber/admin-shell";
import RecursosBootstrap from "../../contas-receber/_shared/recursos-bootstrap";

interface RespostaEncargos {
  taxaJurosMes: number;
  multaPercentual: number;
  atualizadoEm: string | null;
  padroes: { taxaJurosMes: number; multaPercentual: number };
  tetos: { taxaJurosMes: number; multaPercentual: number };
}

const MSG_SESSAO = "Sessão expirada. Recarregue a página e digite a senha.";

/** Aceita virgula ou ponto como separador decimal; devolve NaN para vazio ou texto invalido. */
function lerNumero(texto: string): number {
  const t = texto.trim().replace(",", ".");
  if (!/^-?\d*\.?\d*$/.test(t)) return Number.NaN;
  return t === "" ? Number.NaN : Number(t);
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function Formulario() {
  const [dados, setDados] = useState<RespostaEncargos | null>(null);
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const emEnvio = useRef(false);

  function aplicar(r: RespostaEncargos) {
    setDados(r);
    setJuros(String(r.taxaJurosMes).replace(".", ","));
    setMulta(String(r.multaPercentual).replace(".", ","));
  }

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/cobranca-encargos", { cache: "no-store" });
        if (cancelado) return;
        if (res.status === 401) {
          setErro(MSG_SESSAO);
          return;
        }
        const json = (await res.json().catch(() => ({}))) as RespostaEncargos & { error?: string };
        if (!res.ok) {
          setErro(json.error ?? "Não foi possível carregar as taxas.");
          return;
        }
        aplicar(json);
      } catch {
        if (!cancelado) setErro("Falha ao conectar no backend.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const tetoJuros = dados?.tetos.taxaJurosMes ?? 1;
  const tetoMulta = dados?.tetos.multaPercentual ?? 2;
  const jurosNum = lerNumero(juros);
  const multaNum = lerNumero(multa);
  const erroJuros =
    !Number.isFinite(jurosNum)
      ? "Informe um número."
      : jurosNum < 0
        ? "Não pode ser negativo."
        : jurosNum > tetoJuros
          ? `Máximo de ${String(tetoJuros).replace(".", ",")}% ao mês.`
          : "";
  const erroMulta =
    !Number.isFinite(multaNum)
      ? "Informe um número."
      : multaNum < 0
        ? "Não pode ser negativo."
        : multaNum > tetoMulta
          ? `Máximo de ${String(tetoMulta).replace(".", ",")}%.`
          : "";
  const bloqueado = carregando || salvando || !dados || Boolean(erroJuros) || Boolean(erroMulta);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado || emEnvio.current) return;
    emEnvio.current = true;
    setErro("");
    setOk("");
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/cobranca-encargos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxaJurosMes: jurosNum, multaPercentual: multaNum }),
      });
      if (res.status === 401) {
        setErro(MSG_SESSAO);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as RespostaEncargos & {
        error?: string;
        message?: string | string[];
      };
      if (!res.ok) {
        const msg = Array.isArray(json.message) ? json.message.join(" ") : json.message;
        setErro(msg ?? json.error ?? "Não foi possível salvar as taxas.");
        return;
      }
      aplicar(json);
      setOk("Taxas salvas.");
    } catch {
      setErro("Falha ao conectar no backend.");
    } finally {
      emEnvio.current = false;
      setSalvando(false);
    }
  }

  return (
    <div className="pa-card">
      <div className="pa-card-header">
        <span>Taxas padrão do boleto atualizado</span>
      </div>
      <div className="pa-card-body">
        <p className="text-muted">
          Estes valores são o padrão na geração do boleto atualizado: juros pro rata por dia (taxa mensal dividida por
          30) sobre o valor original e multa fixa sobre o valor original. Também valem como juros e multa da EFI se o
          cliente atrasar de novo.
        </p>
        <form onSubmit={salvar} style={{ maxWidth: 420 }}>
          <div className="mb-3">
            <label htmlFor="enc-juros" className="form-label">
              Juros (% ao mês)
            </label>
            <input
              id="enc-juros"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={`form-control${erroJuros ? " is-invalid" : ""}`}
              value={juros}
              onChange={(ev) => {
                setJuros(ev.target.value);
                setOk("");
              }}
              disabled={carregando}
            />
            {erroJuros && <div className="invalid-feedback">{erroJuros}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="enc-multa" className="form-label">
              Multa (%)
            </label>
            <input
              id="enc-multa"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={`form-control${erroMulta ? " is-invalid" : ""}`}
              value={multa}
              onChange={(ev) => {
                setMulta(ev.target.value);
                setOk("");
              }}
              disabled={carregando}
            />
            {erroMulta && <div className="invalid-feedback">{erroMulta}</div>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={bloqueado}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </form>
        {ok && (
          <div className="alert alert-success mt-3" role="status">
            {ok}
          </div>
        )}
        {erro && (
          <div className="alert alert-danger mt-3" role="alert">
            {erro}
          </div>
        )}
        {dados?.atualizadoEm && (
          <p className="text-muted small mt-3 mb-1">Última alteração: {formatarDataHora(dados.atualizadoEm)}</p>
        )}
        <p className="text-muted small mb-0">
          Limites: juros até {String(tetoJuros).replace(".", ",")}% ao mês e multa até {String(tetoMulta).replace(".", ",")}%.
        </p>
      </div>
    </div>
  );
}

export default function ConfiguracaoCobrancaPage() {
  return (
    <PasswordGate
      title="Juros e multa"
      description="Esta área altera as taxas do boleto atualizado. Digite a senha de configurações para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/configuracoes/cobranca"
        title="Juros e multa"
        subtitle="Taxas padrão do boleto atualizado"
      >
        <Formulario />
      </AdminShell>
    </PasswordGate>
  );
}
