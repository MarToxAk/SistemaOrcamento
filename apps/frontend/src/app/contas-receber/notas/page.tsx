"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../admin-shell";
import NotasFiscais from "../_componentes/notas-fiscais";
import { lerData, lerInteiroPositivo, lerOpcao, lerTexto } from "../_shared/filtros-url";
import RecursosBootstrap from "../_shared/recursos-bootstrap";
import { useFiltrosUrl } from "../_shared/use-filtros-url";

type TipoNota = "" | "nfse" | "nfe";
const TIPOS_NOTA: readonly TipoNota[] = ["", "nfse", "nfe"];

const OPCOES_TIPO: Array<{ valor: TipoNota; rotulo: string }> = [
  { valor: "", rotulo: "Todas" },
  { valor: "nfse", rotulo: "NFS-e" },
  { valor: "nfe", rotulo: "NF-e" },
];

/** Filtros (tipo, periodo, busca e pagina) ficam na URL; mudar qualquer filtro volta para a pagina 1 (D-04). */
function NotasComFiltros() {
  const { obter, definir } = useFiltrosUrl();
  const tipo = lerOpcao(obter("tipo"), TIPOS_NOTA, "");
  const de = lerData(obter("de"));
  const ate = lerData(obter("ate"));
  const busca = lerTexto(obter("busca"), 80);
  const pagina = lerInteiroPositivo(obter("pagina"), 1);

  // A busca e digitada localmente e gravada na URL com atraso, para nao perder letras a cada router.replace.
  const [buscaDigitada, setBuscaDigitada] = useState(busca);
  const buscaGravada = useRef(busca);
  const definirRef = useRef(definir);
  definirRef.current = definir;

  useEffect(() => {
    // Mudanca externa da URL (voltar do navegador, link colado): reflete no campo.
    if (busca !== buscaGravada.current) {
      buscaGravada.current = busca;
      setBuscaDigitada(busca);
    }
  }, [busca]);

  useEffect(() => {
    const alvo = lerTexto(buscaDigitada, 80);
    if (alvo === buscaGravada.current) return;
    const timer = setTimeout(() => {
      buscaGravada.current = alvo;
      definirRef.current({ busca: alvo || null, pagina: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  function limparFiltros() {
    buscaGravada.current = "";
    setBuscaDigitada("");
    definir({ tipo: null, de: null, ate: null, busca: null, pagina: null });
  }

  const temFiltro = tipo !== "" || de !== "" || ate !== "" || busca !== "" || buscaDigitada !== "";

  return (
    <>
      <div className="pa-card mb-3">
        <div className="pa-filtros">
          <div className="pa-filtro">
            <span className="pa-filtro-rotulo">Tipo</span>
            <div className="pa-seg">
              {OPCOES_TIPO.map((opt) => (
                <button
                  key={opt.valor || "todas"}
                  type="button"
                  className={`pa-seg-btn${tipo === opt.valor ? " pa-seg-btn-active" : ""}`}
                  onClick={() => definir({ tipo: opt.valor || null, pagina: null })}
                >
                  {opt.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="pa-filtro">
            <label className="pa-filtro-rotulo" htmlFor="filtro-notas-de">
              Emissão De
            </label>
            <input
              id="filtro-notas-de"
              type="date"
              className="form-control form-control-sm"
              value={de}
              onChange={(e) => definir({ de: lerData(e.target.value) || null, pagina: null })}
            />
          </div>
          <div className="pa-filtro">
            <label className="pa-filtro-rotulo" htmlFor="filtro-notas-ate">
              Até
            </label>
            <input
              id="filtro-notas-ate"
              type="date"
              className="form-control form-control-sm"
              value={ate}
              onChange={(e) => definir({ ate: lerData(e.target.value) || null, pagina: null })}
            />
          </div>
          <div className="pa-filtro pa-filtro-busca">
            <label className="pa-filtro-rotulo" htmlFor="filtro-notas-busca">
              Buscar Cliente ou Número
            </label>
            <input
              id="filtro-notas-busca"
              type="search"
              className="form-control form-control-sm"
              placeholder="Nome, número do cliente ou da nota"
              maxLength={80}
              value={buscaDigitada}
              onChange={(e) => setBuscaDigitada(e.target.value)}
            />
          </div>
          <div className="pa-filtro pa-filtro-limpar">
            <button
              type="button"
              className="pa-link-btn bg-transparent text-nowrap"
              onClick={limparFiltros}
              disabled={!temFiltro}
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      <NotasFiscais
        de={de || undefined}
        ate={ate || undefined}
        tipo={tipo}
        busca={busca}
        pagina={pagina}
        onMudarPagina={(nova) => definir({ pagina: nova > 1 ? String(nova) : null })}
      />

      <style>{`
        .pa-filtros {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.75rem 1rem;
          padding: 0.8rem 1.1rem;
        }
        .pa-filtro { display: flex; flex-direction: column; gap: 0.2rem; }
        .pa-filtro-rotulo { color: var(--pa-text-muted); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin: 0; }
        .pa-filtro-busca { flex: 1 1 14rem; min-width: 12rem; }
        .pa-filtro-limpar { margin-left: auto; }
      `}</style>
    </>
  );
}

export default function NotasPage() {
  return (
    <PasswordGate
      title="Notas Fiscais"
      description="Esta area exibe dados financeiros de clientes. Digite a senha de configuracoes para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/contas-receber/notas"
        title="Notas Fiscais"
        subtitle="NFS-e emitidas e NF-e dos boletos, em PDF e XML"
      >
        <Suspense
          fallback={
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
            </div>
          }
        >
          <NotasComFiltros />
        </Suspense>
      </AdminShell>
    </PasswordGate>
  );
}
