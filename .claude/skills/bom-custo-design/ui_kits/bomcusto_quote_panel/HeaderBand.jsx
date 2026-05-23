// HeaderBand.jsx — the pastel gradient header used on every internal screen
const HeaderBand = ({ rightTitle = "Lista de Orçamentos", rightSub = null }) => {
  return (
    <div className="bc-header">
      <img
        src="../../assets/logo-primary.png"
        alt="Logo Bom Custo"
        className="bc-header__logo"
      />
      <div className="bc-header__info">
        <h3>Bom Custo Papelaria &amp; Gráfica Rápida LTDA</h3>
        <div className="bc-header__meta">CNPJ: 62.391.927/0001-57</div>
        <div className="bc-header__meta">Rua Olímpio Leite da Silva, 39 - Loja 07, Perequê</div>
        <div className="bc-header__meta">Ilhabela - SP, CEP: 11633-078</div>
        <div className="bc-header__meta">
          Telefones: (12) 99648-4918 / (12) 3896-1474 / (12) 99678-2405
          <br />
          E-mail: orcamento@bomcustoilhabela.com.br
        </div>
      </div>
      <div className="bc-header__right">
        <h5>{rightTitle}</h5>
        {rightSub && <div className="bc-header__sub">{rightSub}</div>}
      </div>
    </div>
  );
};

window.HeaderBand = HeaderBand;
