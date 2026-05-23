// pdf-tweaks.jsx — Tweaks panel for Orcamento PDF.html
// Moved out of inline <script> to avoid a race with tweaks-panel.jsx loading.

const { useEffect } = React;

const LOGO_VARIANTS = {
  primary:  { label: 'Completo (com lema)',   src: 'assets/logo-primary.png'  },
  wordmark: { label: 'Sem contorno (vetor)',  src: 'assets/logo-wordmark.svg' },
  mono:     { label: 'Mono (preto e branco)', src: 'assets/logo-mono.svg'     },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "logoSize": 120,
  "logoVariant": "primary",
  "stripHeight": 32,
  "showStripTop": true,
  "showStripBottom": true,
  "badgeColor": "#ee3537",
  "totalsBg": "#0b1220",
  "totalsAccent": "#FAED23"
}/*EDITMODE-END*/;

function PdfTweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--logo-size',     t.logoSize + 'px');
    root.style.setProperty('--strip-h',       t.stripHeight + 'mm');
    root.style.setProperty('--badge-color',   t.badgeColor);
    root.style.setProperty('--totals-bg',     t.totalsBg);
    root.style.setProperty('--totals-accent', t.totalsAccent);

    const logoEl = document.querySelector('.doc-header__logo');
    if (logoEl) logoEl.src = LOGO_VARIANTS[t.logoVariant]?.src || LOGO_VARIANTS.primary.src;

    const topEl = document.querySelector('.pencils-top');
    const botEl = document.querySelector('.pencils-bottom');
    if (topEl) topEl.style.display = t.showStripTop    ? '' : 'none';
    if (botEl) botEl.style.display = t.showStripBottom ? '' : 'none';
  }, [t]);

  return (
    <TweaksPanel title="Tweaks · PDF">
      <TweakSection label="Logo" />
      <TweakSelect
        label="Variação"
        value={t.logoVariant}
        options={Object.entries(LOGO_VARIANTS).map(([v, m]) => ({ value: v, label: m.label }))}
        onChange={(v) => setTweak('logoVariant', v)}
      />
      <TweakSlider
        label="Tamanho"
        value={t.logoSize} min={60} max={180} step={2} unit="px"
        onChange={(v) => setTweak('logoSize', v)}
      />

      <TweakSection label="Faixa de lápis" />
      <TweakSlider
        label="Altura"
        value={t.stripHeight} min={10} max={40} step={1} unit="mm"
        onChange={(v) => setTweak('stripHeight', v)}
      />
      <TweakToggle
        label="Mostrar topo"
        value={t.showStripTop}
        onChange={(v) => setTweak('showStripTop', v)}
      />
      <TweakToggle
        label="Mostrar rodapé"
        value={t.showStripBottom}
        onChange={(v) => setTweak('showStripBottom', v)}
      />

      <TweakSection label="Cores" />
      <TweakColor
        label="Badge do nº"
        value={t.badgeColor}
        options={['#ee3537', '#0e6d73', '#0F7949', '#3b82f6', '#0b1220']}
        onChange={(v) => setTweak('badgeColor', v)}
      />
      <TweakColor
        label="Caixa de totais"
        value={t.totalsBg}
        options={['#0b1220', '#0e6d73', '#0F7949', '#bf4d28', '#ee3537']}
        onChange={(v) => setTweak('totalsBg', v)}
      />
      <TweakColor
        label="Destaque do total"
        value={t.totalsAccent}
        options={['#FAED23', '#ffffff', '#22c55e', '#fd7e14']}
        onChange={(v) => setTweak('totalsAccent', v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<PdfTweaksApp />);
