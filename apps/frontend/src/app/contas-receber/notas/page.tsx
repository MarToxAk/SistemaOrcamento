"use client";

import { Suspense } from "react";
import PasswordGate from "@/components/password-gate";
import AdminShell from "../admin-shell";
import NotasFiscais from "../_componentes/notas-fiscais";
import RecursosBootstrap from "../_shared/recursos-bootstrap";

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
          <NotasFiscais />
        </Suspense>
      </AdminShell>
    </PasswordGate>
  );
}
