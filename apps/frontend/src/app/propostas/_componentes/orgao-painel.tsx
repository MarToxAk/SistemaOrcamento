"use client";

import { useEffect, useRef, useState } from "react";
import type { ClienteOverride, PropostaDetalhe } from "../_shared/tipos";
import { CampoTexto, IndicadorGravacao, useGravacao, type SalvarCabecalho } from "./campos-cabecalho";

interface OrgaoPainelProps {
  proposta: PropostaDetalhe;
  /** Verdadeiro fora de RASCUNHO (a pagina decide por `!podeEditar(status)`, D-08). */
  desabilitado: boolean;
  onSalvar: SalvarCabecalho;
}

type ChaveOverride = keyof ClienteOverride;

interface CampoOverride {
  chave: ChaveOverride;
  rotulo: string;
  maxLength: number;
  coluna: string;
}

const CAMPOS_OVERRIDE: CampoOverride[] = [
  { chave: "razaoSocial", rotulo: "Razão social", maxLength: 200, coluna: "col-md-8" },
  { chave: "documento", rotulo: "CPF/CNPJ", maxLength: 30, coluna: "col-md-4" },
  { chave: "logradouro", rotulo: "Logradouro", maxLength: 200, coluna: "col-md-6" },
  { chave: "numero", rotulo: "Número", maxLength: 30, coluna: "col-md-3" },
  { chave: "complemento", rotulo: "Complemento", maxLength: 100, coluna: "col-md-3" },
  { chave: "bairro", rotulo: "Bairro", maxLength: 100, coluna: "col-md-4" },
  { chave: "cidade", rotulo: "Cidade", maxLength: 100, coluna: "col-md-4" },
  { chave: "uf", rotulo: "UF", maxLength: 2, coluna: "col-md-2" },
  { chave: "cep", rotulo: "CEP", maxLength: 12, coluna: "col-md-2" },
];

/** Somente as chaves conhecidas com texto nao vazio; qualquer outra coisa do servidor e ignorada. */
function normalizarOverride(origem: unknown): ClienteOverride {
  const saida: ClienteOverride = {};
  if (origem === null || typeof origem !== "object") return saida;
  const bruto = origem as Record<string, unknown>;
  for (const { chave } of CAMPOS_OVERRIDE) {
    const valor = bruto[chave];
    if (typeof valor === "string" && valor.trim() !== "") saida[chave] = valor;
  }
  return saida;
}

/** Sugestao do snapshot do Athos para cada campo sobrescrevivel (exibida como dica, nunca gravada sozinha). */
function sugestaoDoAthos(proposta: PropostaDetalhe, chave: ChaveOverride): string | undefined {
  const cliente = proposta.cliente;
  if (!cliente) return undefined;
  const valor = chave === "razaoSocial" ? cliente.razaoSocial : chave === "documento" ? cliente.documento : cliente.endereco?.[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
}

/**
 * Dados de orgao publico (todos opcionais, D-16) e sobrescritas de cliente usadas so no PDF. O Athos continua a
 * fonte da razao social, do documento e do endereco; a sobrescrita vale apenas para a proposta.
 */
export default function OrgaoPainel({ proposta, desabilitado, onSalvar }: OrgaoPainelProps) {
  const { estado, erro, salvar } = useGravacao(onSalvar);
  const [aberto, setAberto] = useState(false);

  // O servidor troca TODO o objeto de sobrescritas a cada PATCH: a base da mesclagem e o ultimo estado enviado
  // (ref), nao a tela, para que duas edicoes seguidas nao percam a primeira.
  const overrideServidor = proposta.clienteOverride;
  const overrideAtual = useRef<ClienteOverride>(normalizarOverride(overrideServidor));
  useEffect(() => {
    overrideAtual.current = normalizarOverride(overrideServidor);
  }, [overrideServidor]);

  const temOverride = Object.keys(normalizarOverride(overrideServidor)).length > 0;

  async function gravarOverride(proximo: ClienteOverride) {
    const anterior = overrideAtual.current;
    overrideAtual.current = proximo;
    const mensagem = await salvar({ clienteOverride: Object.keys(proximo).length > 0 ? proximo : null });
    if (mensagem) overrideAtual.current = anterior;
  }

  function alterarCampoOverride(chave: ChaveOverride, novo: string) {
    const proximo = { ...overrideAtual.current };
    if (novo === "") delete proximo[chave];
    else proximo[chave] = novo;
    void gravarOverride(proximo);
  }

  const emailSugerido = proposta.contatoEmail ? null : (proposta.cliente?.email ?? null);
  const telefoneSugerido = proposta.contatoTelefone ? null : (proposta.cliente?.telefone ?? null);

  return (
    <div className="pa-card mb-3">
      <div className="pa-card-header">
        <span className="fw-semibold">Dados do órgão</span>
        <IndicadorGravacao estado={estado} erro={erro} />
      </div>
      <div className="pa-card-body">
        <div className="row g-3">
          <div className="col-md-6">
            <CampoTexto
              rotulo="Nº do processo, pregão ou dispensa"
              valor={proposta.numeroProcesso}
              maxLength={100}
              desabilitado={desabilitado}
              onConfirmar={(novo) => void salvar({ numeroProcesso: novo === "" ? null : novo })}
            />
          </div>
          <div className="col-md-6">
            <CampoTexto
              rotulo="Setor ou responsável no órgão"
              valor={proposta.setorResponsavel}
              maxLength={200}
              desabilitado={desabilitado}
              onConfirmar={(novo) => void salvar({ setorResponsavel: novo === "" ? null : novo })}
            />
          </div>
          <div className="col-md-6">
            <CampoTexto
              rotulo="E-mail de contato"
              tipo="email"
              valor={proposta.contatoEmail}
              maxLength={200}
              desabilitado={desabilitado}
              onConfirmar={(novo) => void salvar({ contatoEmail: novo === "" ? null : novo })}
            />
            {!desabilitado && emailSugerido ? (
              <button
                type="button"
                className="btn btn-sm btn-link px-0"
                onClick={() => void salvar({ contatoEmail: emailSugerido })}
              >
                Usar o e-mail do Athos: {emailSugerido}
              </button>
            ) : null}
          </div>
          <div className="col-md-6">
            <CampoTexto
              rotulo="Telefone de contato"
              tipo="tel"
              valor={proposta.contatoTelefone}
              maxLength={50}
              desabilitado={desabilitado}
              onConfirmar={(novo) => void salvar({ contatoTelefone: novo === "" ? null : novo })}
            />
            {!desabilitado && telefoneSugerido ? (
              <button
                type="button"
                className="btn btn-sm btn-link px-0"
                onClick={() => void salvar({ contatoTelefone: telefoneSugerido })}
              >
                Usar o telefone do Athos: {telefoneSugerido}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 border-top pt-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
          >
            <i className={`bi ${aberto ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />
            Sobrescrever dados no PDF
            {temOverride ? <span className="badge bg-warning text-dark ms-2">em uso</span> : null}
          </button>

          {aberto ? (
            <div className="mt-3">
              <div className="small text-muted mb-2">
                Vale somente para o PDF desta proposta; o cadastro do Athos não é alterado. Campo em branco usa o
                dado do Athos.
              </div>
              <div className="row g-3">
                {CAMPOS_OVERRIDE.map((campo) => (
                  <div key={campo.chave} className={campo.coluna}>
                    <CampoTexto
                      rotulo={campo.rotulo}
                      valor={overrideServidor?.[campo.chave] ?? null}
                      maxLength={campo.maxLength}
                      desabilitado={desabilitado}
                      placeholder={sugestaoDoAthos(proposta, campo.chave)}
                      transformar={campo.chave === "uf" ? (t) => t.toUpperCase() : undefined}
                      onConfirmar={(novo) => alterarCampoOverride(campo.chave, novo)}
                    />
                  </div>
                ))}
              </div>
              {!desabilitado && temOverride ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger mt-3"
                  disabled={estado === "salvando"}
                  onClick={() => void gravarOverride({})}
                >
                  Limpar sobrescritas
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
