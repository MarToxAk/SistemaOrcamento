"use client";

import PasswordGate from "@/components/password-gate";
import AdminShell from "../../contas-receber/admin-shell";
import RecursosBootstrap from "../../contas-receber/_shared/recursos-bootstrap";
import DadosBancariosForm from "./dados-bancarios-form";

/**
 * Fase 55: dados bancarios impressos no PDF da proposta comercial (D-18).
 * Ficam SO no banco do Sistema (o repositorio e publico) e sao editados aqui, sem UPDATE manual.
 */
export default function ConfiguracaoPropostasPage() {
  return (
    <PasswordGate
      title="Dados bancários das propostas"
      description="Esta área altera os dados bancários impressos nas propostas comerciais. Digite a senha de configurações para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/configuracoes/propostas"
        title="Dados bancários das propostas"
        subtitle="Banco, agência e conta impressos no PDF da proposta comercial"
      >
        <DadosBancariosForm />
      </AdminShell>
    </PasswordGate>
  );
}
