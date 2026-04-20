
import Script from "next/script";

const EXEMPLOS = [
  {
    numero: 1012,
    cliente: "Maria Souza",
    data: "2024-04-01",
    vendedor: "João Silva",
    total: 350.5,
    status: "Pendente"
  },
  {
    numero: 1011,
    cliente: "Empresa XPTO",
    data: "2024-03-28",
    vendedor: "Ana Paula",
    total: 1200,
    status: "Aprovado"
  },
  {
    numero: 1010,
    cliente: "Carlos Lima",
    data: "2024-03-25",
    vendedor: "João Silva",
    total: 89.9,
    status: "Recusado"
  }
];

export default function OrcamentoListaPage() {
  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
      <div className="container my-5">
        <div className="orcamento-header d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 rounded-top" style={{background: "linear-gradient(135deg,#c5f2e8 0%,#cbe1f9 25%,#e7d8f9 50%,#f9e7f5 75%,#f0cacb 100%)", color: "#222"}}>
          <div className="d-flex align-items-center">
            <img src="/media/logo_new.svg" alt="Logo Bom Custo" className="me-3" style={{maxWidth:180, maxHeight:120, background: "#fff", borderRadius:8, padding:4}} />
            <div>
              <h3 className="mb-0">Bom Custo Papelaria & Gráfica Rápida LTDA</h3>
              <div className="small">CNPJ: 62.391.927/0001-57</div>
              <div className="small">Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê</div>
              <div className="small">Ilhabela - SP, CEP: 11633-078</div>
              <div className="small">
                Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405<br />
                E-mail: orcamento@bomcustoilhabela.com.br
              </div>
            </div>
          </div>
          <div className="text-end">
            <h5 className="mb-1">Lista de Orçamentos</h5>
          </div>
        </div>
        <div className="orcamento-section bg-white rounded-bottom shadow-sm p-4">
          <div className="table-responsive mb-4">
            <table className="table orcamento-list-table align-middle">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Vendedor</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {EXEMPLOS.map((orc) => (
                  <tr key={orc.numero}>
                    <td>{orc.numero}</td>
                    <td>{orc.cliente}</td>
                    <td>{new Date(orc.data).toLocaleDateString("pt-BR")}</td>
                    <td>{orc.vendedor}</td>
                    <td>{orc.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td><span className={
                      orc.status === "Pendente" ? "status-pendente" :
                      orc.status === "Aprovado" ? "status-aprovado" :
                      orc.status === "Recusado" ? "status-recusado" : ""
                    }>{orc.status}</span></td>
                    <td>
                      <div className="acoes-lista">
                        <a href="#" className="btn btn-sm btn-outline-primary" title="Visualizar"><i className="bi bi-eye"></i></a>
                        <a href="#" className="btn btn-sm btn-outline-secondary" title="Editar"><i className="bi bi-pencil"></i></a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end">
            <a href="#" className="btn btn-add-orcamento" style={{fontSize:"1.15rem",padding:"0.7rem 2.2rem",fontWeight:600,backgroundColor:"#7dc8aa",color:"#fff",border:"none",borderRadius:6}}>
              <i className="bi bi-plus-circle me-2"></i>Adicionar Orçamento
            </a>
          </div>
        </div>
      </div>
      <style>{`
        body { background: #f9f7ed; font-size: 1.18rem; }
        .status-pendente { color: #f39c12; font-weight: 600; }
        .status-aprovado { color: #27ae60; font-weight: 600; }
        .status-recusado { color: #ee3637; font-weight: 600; }
        .acoes-lista { display: flex; gap: 0.5rem; }
        .orcamento-header { border-radius: 8px 8px 0 0; }
        .orcamento-section { border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .orcamento-list-table th, .orcamento-list-table td { vertical-align: middle; white-space: normal; word-break: break-word; font-size: 1.15rem; }
        .orcamento-list-table th { background: #f9e7f5; color: #222; border-bottom: 2px solid rgba(0,0,0,0.04); }
        .btn-add-orcamento:hover { background-color: #6ab594 !important; color: #fff !important; }
        @media (max-width: 576px) {
          .orcamento-header { padding: 0.75rem !important; }
          .orcamento-section { padding: 1rem !important; }
          .orcamento-list-table th, .orcamento-list-table td { font-size: 0.98rem !important; }
          .btn-add-orcamento { font-size: 1rem !important; padding: 0.6rem 1.2rem !important; }
        }
      `}</style>
    </>
  );
}
