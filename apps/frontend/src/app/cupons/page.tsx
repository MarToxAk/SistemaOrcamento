"use client";

import { Suspense } from "react";

import AdminShell from "../contas-receber/admin-shell";
import RecursosBootstrap from "../contas-receber/_shared/recursos-bootstrap";
import CuponsManager from "./cupons-manager";

/**
 * Fase 52 (plano 52-10): página /cupons do balcão (D-17/UI-D12).
 *
 * Sem senha: é a tela do funcionário/atendente no balcão. AdminShell, com o gerenciador (busca,
 * detalhe, resgate em dois passos e lista recente) dentro de Suspense porque `?status=` é lido
 * com `useSearchParams`.
 */
export default function CuponsPage() {
  return (
    <>
      <RecursosBootstrap />
      <AdminShell
        activeHref="/cupons"
        title="Cupons"
        subtitle="Confira e dê baixa nos cupons de desconto no balcão"
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
          <CuponsManager />
        </Suspense>
      </AdminShell>
    </>
  );
}
