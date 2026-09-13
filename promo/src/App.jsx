import { useState, useEffect } from "react";

const IG_URL = "https://www.instagram.com/bomcustopapelaria/";

const IMG = {
  BG: "/img/bg.png",
  LOGO: "/img/logo.png",
  SUN: "/img/sun.png",
  CLOUD1: "/img/cloud1.png",
  CLOUD2: "/img/cloud2.png",
  PINWHEEL: "/img/pinwheel.png",
  BOAT: "/img/boat.png",
  RAINBOW: "/img/rainbow.png",
  BIKE: "/img/bike.png",
};

const CUPOM_REGEX = /^\d{1,10}$/;

const MENSAGENS_CAMPO = {
  cupom: "Cupom invalido.",
  nome: "Nome invalido. Use entre 2 e 80 caracteres.",
  telefone: "Telefone invalido. Informe DDD + numero (10 ou 11 digitos).",
  nfce: "Numero da NFC-e invalido.",
};

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const cupomBruto = params.get("id") || params.get("cupom") || "";
  const cupomValido = CUPOM_REGEX.test(cupomBruto) && Number(cupomBruto) !== 0;
  const cupomId = cupomValido ? cupomBruto.padStart(5, "0") : cupomBruto;

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nfce, setNfce] = useState("");
  const [showRegras, setShowRegras] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.background = "#A8EEC1";
  }, []);

  const handleSubmit = async () => {
    if (!cupomValido) { setError("Cupom nao identificado. Acesse pela leitura do QR code do seu cupom."); return; }
    if (!nome.trim()) { setError("Preencha seu nome"); return; }
    if (!telefone.trim()) { setError("Preencha seu telefone"); return; }
    setError("");
    setEnviando(true);
    try {
      const resposta = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cupom: cupomId,
          nome: nome.trim(),
          telefone: telefone.trim(),
          nfce: nfce.trim(),
        }),
      });
      if (resposta.status === 201) {
        setShowRegras(true);
      } else if (resposta.status === 409) {
        setError("Este cupom ja foi cadastrado.");
      } else if (resposta.status === 400) {
        const corpo = await resposta.json().catch(() => ({}));
        setError(MENSAGENS_CAMPO[corpo.campo] || "Dados invalidos. Confira o formulario.");
      } else if (resposta.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos.");
      } else {
        setError("Nao foi possivel enviar. Tente novamente.");
      }
    } catch {
      setError("Nao foi possivel enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const irParaInstagram = () => {
    window.location.href = IG_URL;
  };

  const REGRAS = [
    "Compras no Débito, Crédito, Dinheiro ou Pix",
    "Preencha o cupom Físico e Digital",
    "Curta a publicação",
    "Siga nossa página",
  ];
  const REGRAS_CORES = ["#F76B4A", "#4AB8F7", "#9B4FE0", "#F7C948"];

  return (
    <div style={st.page}>
      <div style={st.content}>
        {/* Decorações flutuantes de fundo */}
        <img src={IMG.SUN} alt="" style={st.decoSun} />
        <img src={IMG.CLOUD1} alt="" style={st.decoCloud1} />
        <img src={IMG.CLOUD2} alt="" style={st.decoCloud2} />
        <img src={IMG.BOAT} alt="" style={st.decoBoat} />
        <img src={IMG.PINWHEEL} alt="" style={st.decoPinwheel} />

        {/* Topo */}
        <div style={st.topRow}>
          <img src={IMG.LOGO} alt="Bom Custo" style={st.logo} />
        </div>

        <div style={st.sorteioRow}>
            {"SORTEIO".split("").map((ch, i) => (
              <span key={i} style={{
                ...st.sorteioLetter,
                color: ["#4A6CF7","#9B4FE0","#F76B4A","#F7C948","#4AB8F7","#9B4FE0","#F7943D"][i],
                transform: `rotate(${(i - 3) * 2.5}deg) translateY(${i % 2 === 0 ? 0 : -3}px)`,
              }}>{ch}</span>
            ))}
          </div>

        <div style={st.diaCriancas}>Dia das Crianças</div>
        <div style={st.dataBadge}>12 de Outubro</div>

        <div style={st.banner}>
          <div style={st.bannerLine1}>A cada R$ 50,00 em compras</div>
          <div style={st.bannerLine2}>VOCÊ JÁ CONCORRE!</div>
        </div>

        <div style={st.prizeCard}>
          <div style={st.prizeLabel}>PRÊMIO</div>
          <div style={st.prizeTitle}>Bicicleta BMX Aro 20</div>
          <div style={st.prizeSub}>Pro-X Série 1 V-Brake</div>
          <img src={IMG.BIKE} alt="Bicicleta BMX" style={st.prizeImg} />
        </div>

        {/* Card */}
        <div style={st.card}>
          <img src={IMG.RAINBOW} alt="" style={st.rainbowCorner} />
          <div style={st.cupomLabel}>Seu Cupom</div>
          <div style={st.cupomBox}>
            <span style={st.cupomNum}>{cupomValido ? cupomId : "—"}</span>
          </div>

          {!cupomValido && (
            <div style={st.error}>Cupom nao identificado. Acesse pela leitura do QR code do seu cupom.</div>
          )}

          <div style={st.fieldLabel}>Nome</div>
          <input type="text" value={nome} onChange={e => { setNome(e.target.value); setError(""); }}
            placeholder="Seu nome completo" style={st.input} />

          <div style={st.fieldLabel}>Telefone</div>
          <input type="tel" value={telefone} onChange={e => { setTelefone(e.target.value); setError(""); }}
            placeholder="(00) 00000-0000" style={st.input} />

          <div style={st.fieldLabel}>NFC-e n°</div>
          <input type="text" value={nfce} onChange={e => { setNfce(e.target.value); setError(""); }}
            placeholder="Número da nota fiscal" style={st.input} />

          {error && <div style={st.error}>{error}</div>}

          <button onClick={handleSubmit} disabled={enviando || !cupomValido} style={st.submitBtn}>Enviar</button>
        </div>

        {/* fim */}
      </div>

      {/* Popup de Regras */}
      {showRegras && (
        <div style={st.overlay}>
          <div style={st.popup}>
            <img src={IMG.RAINBOW} alt="" style={st.popupRainbow} />
            <div style={st.popupCheck}>✅</div>
            <div style={st.popupTitle}>Cadastro realizado!</div>
            <div style={st.popupCupom}>Cupom {cupomId}</div>

            <div style={st.popupRegrasTitle}>Regras</div>
            {REGRAS.map((r, i) => (
              <div key={i} style={st.regraRow}>
                <span style={{ ...st.regraNum, background: REGRAS_CORES[i] }}>{i + 1}</span>
                <span style={st.regraText}>{r}</span>
              </div>
            ))}

            <button onClick={irParaInstagram} style={st.igBtnFull}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="#fff" strokeWidth="2"/>
                <circle cx="12" cy="12" r="5" stroke="#fff" strokeWidth="2"/>
                <circle cx="17.5" cy="6.5" r="1.5" fill="#fff"/>
              </svg>
              Ir para o Instagram
            </button>
            <div style={st.popupHint}>Guarde seu cupom impresso!</div>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  page: {
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100dvh",
    fontFamily: "'Segoe UI', -apple-system, system-ui, sans-serif",
    background: `#A8EEC1 url(${IMG.BG}) repeat`,
    backgroundSize: "380px auto",
    position: "relative",
    overflow: "hidden",
  },
  content: {
    position: "relative",
    padding: "20px 20px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    zIndex: 1,
  },
  topRow: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  logo: { width: 92, height: "auto" },
  sorteioRow: {
    display: "flex",
    justifyContent: "center",
    gap: 1,
    marginBottom: 14,
  },
  sorteioLetter: {
    fontSize: 40,
    fontWeight: 900,
    display: "inline-block",
    fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive",
    WebkitTextStroke: "2px rgba(255,255,255,0.5)",
    textShadow: "2px 3px 0 rgba(0,0,0,.15)",
  },
  diaCriancas: {
    fontSize: 17,
    fontWeight: 700,
    color: "#1a5c3a",
    marginTop: -8,
    marginBottom: 8,
  },
  dataBadge: {
    display: "inline-block",
    background: "#5F27CD",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    padding: "5px 18px",
    borderRadius: 20,
    marginBottom: 14,
  },
  banner: {
    width: "100%",
    background: "linear-gradient(135deg, #FF7A59, #FF3D5A)",
    borderRadius: 16,
    padding: "14px 16px",
    textAlign: "center",
    boxShadow: "0 4px 16px rgba(255,61,90,.3)",
    boxSizing: "border-box",
    marginBottom: 14,
  },
  bannerLine1: {
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
  },
  bannerLine2: {
    fontSize: 21,
    fontWeight: 900,
    color: "#fff",
    letterSpacing: 0.5,
  },
  prizeCard: {
    width: "100%",
    background: "rgba(255,255,255,.95)",
    borderRadius: 18,
    padding: "16px 18px 12px",
    textAlign: "center",
    boxShadow: "0 4px 20px rgba(0,0,0,.08)",
    boxSizing: "border-box",
    marginBottom: 16,
  },
  prizeLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#FF9F43",
    textTransform: "uppercase",
    letterSpacing: 3,
    marginBottom: 4,
  },
  prizeTitle: {
    fontSize: 21,
    fontWeight: 900,
    color: "#2d3436",
  },
  prizeSub: {
    fontSize: 14,
    color: "#636e72",
    fontWeight: 600,
  },
  rainbowCorner: {
    position: "absolute",
    top: -18,
    left: -14,
    width: 90,
    height: "auto",
    zIndex: 2,
    opacity: 0.95,
  },
  prizeImg: {
    width: 140,
    height: "auto",
    marginTop: 4,
    display: "block",
    marginLeft: "auto",
    marginRight: "auto",
  },
  decoSun: {
    position: "absolute",
    width: 60,
    top: 8,
    left: 10,
    opacity: 0.9,
    zIndex: 0,
  },
  decoCloud1: {
    position: "absolute",
    width: 70,
    top: 0,
    right: -10,
    opacity: 0.85,
    zIndex: 0,
  },
  decoCloud2: {
    position: "absolute",
    width: 60,
    top: 130,
    left: -14,
    opacity: 0.8,
    zIndex: 0,
  },
  decoBoat: {
    position: "absolute",
    width: 56,
    top: 150,
    right: 6,
    opacity: 0.9,
    zIndex: 0,
  },
  decoPinwheel: {
    position: "absolute",
    width: 44,
    top: 260,
    right: -6,
    opacity: 0.9,
    zIndex: 0,
  },
  card: {
    width: "100%",
    background: "rgba(255,255,255,.95)",
    borderRadius: 24,
    padding: "22px 22px 18px",
    boxSizing: "border-box",
    boxShadow: "0 6px 28px rgba(0,0,0,.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
  },
  cupomLabel: {
    fontSize: 18,
    fontWeight: 800,
    color: "#2d3436",
    textAlign: "center",
  },
  cupomBox: {
    border: "3px dashed #E8443A",
    borderRadius: 14,
    padding: "12px 36px",
    margin: "8px 0 14px",
  },
  cupomNum: {
    fontSize: 50,
    fontWeight: 900,
    fontFamily: "'Courier New', monospace",
    color: "#2d3436",
    letterSpacing: 6,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: 800,
    color: "#2d3436",
    alignSelf: "flex-start",
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 16,
    border: "2.5px dashed #E8443A",
    borderRadius: 12,
    outline: "none",
    background: "#f5f5f5",
    color: "#2d3436",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  error: {
    color: "#E8443A",
    fontSize: 13,
    fontWeight: 600,
    marginTop: 6,
  },
  submitBtn: {
    width: "65%",
    padding: "16px 0",
    fontSize: 22,
    fontWeight: 800,
    color: "#fff",
    background: "#E8443A",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    marginTop: 18,
    boxShadow: "0 4px 16px rgba(232,68,58,.35)",
    letterSpacing: 1,
  },
  igBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    padding: "16px 0",
    borderRadius: 14,
    textDecoration: "none",
    boxSizing: "border-box",
  },
  bottomDeco: {
    width: "100%",
    position: "relative",
    height: 170,
    marginTop: 12,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 100,
    boxSizing: "border-box",
  },
  popup: {
    position: "relative",
    width: "100%",
    maxWidth: 360,
    background: "#fff",
    borderRadius: 24,
    padding: "28px 24px 22px",
    boxShadow: "0 12px 40px rgba(0,0,0,.3)",
    textAlign: "center",
    boxSizing: "border-box",
    animation: "none",
  },
  popupRainbow: {
    position: "absolute",
    top: -22,
    right: -10,
    width: 90,
    height: "auto",
  },
  popupCheck: {
    fontSize: 44,
    marginBottom: 4,
  },
  popupTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: "#1a5c3a",
  },
  popupCupom: {
    fontSize: 15,
    fontWeight: 700,
    color: "#636e72",
    marginBottom: 16,
    fontFamily: "'Courier New', monospace",
    letterSpacing: 1,
  },
  popupRegrasTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: "#2d3436",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12,
  },
  regraRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    textAlign: "left",
  },
  regraNum: {
    minWidth: 28,
    height: 28,
    borderRadius: "50%",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  regraText: {
    fontSize: 14,
    color: "#2d3436",
    fontWeight: 600,
    lineHeight: 1.3,
  },
  igBtnFull: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    padding: "16px 0",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    marginTop: 16,
    boxSizing: "border-box",
  },
  popupHint: {
    fontSize: 12,
    color: "#636e72",
    fontWeight: 500,
    marginTop: 10,
  },
  bikeImg: {
    width: 170,
    height: "auto",
    position: "absolute",
    left: -8,
    bottom: 0,
    zIndex: 2,
    filter: "drop-shadow(0 8px 10px rgba(0,0,0,.15))",
  },
  rainbowImg: {
    width: 170,
    height: "auto",
    position: "absolute",
    right: -8,
    bottom: 20,
    zIndex: 1,
    opacity: 0.95,
  },
};
