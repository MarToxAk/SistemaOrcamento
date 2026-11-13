"use client";

/** Estilos dos modais de boleto, NFS-e e e-mail (classes boleto-modal-*), movidos sem alteracao. */
export function EstilosModal() {
  return (
    <style>{`
        .boleto-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 1rem;
          animation: fadeIn 150ms ease-out;
        }
        .boleto-modal-card {
          width: min(520px, 100%);
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          animation: slideUp 150ms ease-out;
        }
        .boleto-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #ececec;
          background: #f9f7ed;
          border-radius: 10px 10px 0 0;
          flex-shrink: 0;
        }
        .boleto-modal-body {
          padding: 24px;
          flex: 1;
        }
        .boleto-modal-footer {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 16px 24px;
          border-top: 1px solid #ececec;
          flex-shrink: 0;
        }
        .boleto-linha-digitavel {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.85rem;
          background: #f5f5f5;
          border: 1px solid #ececec;
          border-radius: 6px;
          padding: 8px 12px;
          word-break: break-all;
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .nfse-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1051;
          padding: 1rem;
          animation: fadeIn 150ms ease-out;
        }
        .nfse-modal-card {
          width: min(520px, 100%);
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 18px 30px rgba(12, 27, 42, 0.15);
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          animation: slideUp 150ms ease-out;
        }
        .nfse-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #ececec;
          background: #f9f7ed;
          border-radius: 10px 10px 0 0;
          flex-shrink: 0;
        }
        .nfse-modal-body {
          padding: 24px;
          flex: 1;
        }
        .nfse-modal-footer {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 16px 24px;
          border-top: 1px solid #ececec;
          flex-shrink: 0;
        }
      `}</style>
  );
}

export default EstilosModal;
