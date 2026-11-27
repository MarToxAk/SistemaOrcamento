"use client";

import { useState, type ReactNode } from "react";
import type { PropostaDetalhe } from "../_shared/tipos";
import TomadorAthosSearch, { type TomadorAthosCliente } from "../../orcamento/[id]/tomador-athos-search";
import { IndicadorGravacao, useGravacao, type SalvarCabecalho } from "./campos-cabecalho";

interface ClientePainelProps {
  proposta: PropostaDetalhe;
  /** Verdadeiro fora de RASCUNHO (a pagina decide por `!podeEditar(status)`, D-08). */
  desabilitado: boolean;
  onSalvar: SalvarCabecalho;
}

/** CPF (11 digitos) ou CNPJ (14) formatado; outro tamanho volta como veio. */
function formatarDocumento(documento: string | null | undefined): string | null {
  if (!documento) return null;
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length === 11) return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digitos.length === 14) return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return documento;
}

function formatarCep(cep: string | null | undefined): string | null {
  if (!cep) return null;
  const digitos = cep.replace(/\D/g, "");
  return digitos.length === 8 ? digitos.replace(/(\d{5})(\d{3})/, "$1-$2") : cep;
}

/** Campo ausente aparece como "não informado" em estilo discreto, nunca com valor inventado (D-25). */
function Valor({ texto }: { texto: string | null | undefined }): ReactNode {
  const limpo = typeof texto === "string" ? texto.trim() : "";
  if (limpo === "") return <span className="text-muted fst-italic">não informado</span>;
  return <span>{limpo}</span>;
}

function Linha({ rotulo, texto, coluna = "col-md-4" }: { rotulo: string; texto: string | null | undefined; coluna?: string }) {
  return (
    <div className={coluna}>
      <div className="small text-muted">{rotulo}</div>
      <div>
        <Valor texto={texto} />
      </div>
    </div>
  );
}

/**
 * Cliente da proposta: busca no Athos (D-14), exibe o snapshot gravado pelo servidor com razao social real
 * (D-25) e permite trocar ou remover. Rascunho pode ficar sem cliente; gerar exige (D-15).
 */
export default function ClientePainel({ proposta, desabilitado, onSalvar }: ClientePainelProps) {
  const { estado, erro, salvar } = useGravacao(onSalvar);
  const [trocando, setTrocando] = useState(false);

  const cliente = proposta.cliente;
  const temCliente = proposta.idclienteAthos !== null;
  const endereco = cliente?.endereco ?? null;

  async function selecionar(escolhido: TomadorAthosCliente) {
    const mensagem = await salvar({ idclienteAthos: escolhido.idcliente });
    if (!mensagem) setTrocando(false);
  }

  async function remover() {
    if (!window.confirm("Remover o cliente desta proposta?")) return;
    const mensagem = await salvar({ idclienteAthos: null });
    if (!mensagem) setTrocando(false);
  }

  const mostrarBusca = !desabilitado && (!temCliente || trocando);

  return (
    <div className="pa-card mb-3">
      <div className="pa-card-header">
        <span className="fw-semibold">Cliente</span>
        <IndicadorGravacao estado={estado} erro={erro} />
      </div>
      <div className="pa-card-body">
        {mostrarBusca ? (
          <div className="mb-3">
            <TomadorAthosSearch onSelecionar={(c) => void selecionar(c)} disabled={estado === "salvando"} />
            <div className="small text-muted mt-2">
              Órgão não encontrado? Cadastre o cliente no Athos desktop e busque de novo: gerar a proposta exige
              cliente do Athos.
            </div>
            {trocando ? (
              <button type="button" className="btn btn-sm btn-link px-0" onClick={() => setTrocando(false)}>
                Manter o cliente atual
              </button>
            ) : null}
          </div>
        ) : null}

        {temCliente ? (
          <>
            <div className="row g-3">
              <Linha rotulo="Razão social" texto={cliente?.razaoSocial} coluna="col-md-6" />
              <Linha rotulo="Nome fantasia" texto={cliente?.nomeFantasia} coluna="col-md-6" />
              <Linha rotulo="CPF/CNPJ" texto={formatarDocumento(cliente?.documento)} />
              <Linha rotulo="E-mail" texto={cliente?.email} />
              <Linha rotulo="Telefone" texto={cliente?.telefone} />
              <Linha rotulo="Logradouro" texto={endereco?.logradouro} coluna="col-md-6" />
              <Linha rotulo="Número" texto={endereco?.numero} coluna="col-md-3" />
              <Linha rotulo="Complemento" texto={endereco?.complemento} coluna="col-md-3" />
              <Linha rotulo="Bairro" texto={endereco?.bairro} />
              <Linha rotulo="Cidade" texto={endereco?.cidade} />
              <Linha rotulo="UF" texto={endereco?.uf} coluna="col-md-2" />
              <Linha rotulo="CEP" texto={formatarCep(endereco?.cep)} coluna="col-md-2" />
            </div>
            <div className="small text-muted mt-2">Cliente do Athos nº {proposta.idclienteAthos}</div>
            {!desabilitado && !trocando ? (
              <div className="d-flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={estado === "salvando"}
                  onClick={() => setTrocando(true)}
                >
                  Trocar cliente
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={estado === "salvando"}
                  onClick={() => void remover()}
                >
                  Remover cliente
                </button>
              </div>
            ) : null}
          </>
        ) : desabilitado ? (
          <div className="text-muted">Sem cliente.</div>
        ) : null}
      </div>
    </div>
  );
}
