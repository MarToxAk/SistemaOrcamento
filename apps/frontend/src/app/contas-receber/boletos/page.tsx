"use client";

import PasswordGate from "@/components/password-gate";
import AdminShell from "../admin-shell";
import BoletosConsolidados from "../_componentes/boletos-consolidados";
import RecursosBootstrap from "../_shared/recursos-bootstrap";

export default function BoletosPage() {
  return (
    <PasswordGate
      title="Boletos"
      description="Esta area exibe dados financeiros de clientes. Digite a senha de configuracoes para continuar."
    >
      <RecursosBootstrap />
      <AdminShell
        activeHref="/contas-receber/boletos"
        title="Boletos"
        subtitle="Boletos consolidados de todos os clientes"
      >
        <BoletosConsolidados />
      </AdminShell>
    </PasswordGate>
  );
}
