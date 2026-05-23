// app.jsx — App shell with Tweaks panel + theme application

const { useState, useEffect } = React;

const FONT_PRESETS = {
  'dm-serif': { label: 'DM Serif Display', stack: "'DM Serif Display', Georgia, serif" },
  'nunito':   { label: 'Nunito',           stack: "'Nunito', system-ui, sans-serif" },
  'mulish':   { label: 'Mulish',           stack: "'Mulish', system-ui, sans-serif" },
  'sofia-sc': { label: 'Sofia Sans Semi Condensed', stack: "'Sofia Sans Semi Condensed', system-ui, sans-serif" },
  'sofia':    { label: 'Sofia Sans',       stack: "'Sofia Sans', system-ui, sans-serif" },
};

// Theme presets — bulk-applied to ALL tweaks when a preset is picked.
const THEME_PRESETS = {
  atelier: {
    label: 'Atelier',
    sub: 'Papelaria de bairro · serif editorial',
    tweaks: {
      preset: 'atelier',
      accent: '#bf4d28',
      radius: 12,
      fontDisplay: 'dm-serif',
      fontBody: 'nunito',
      gradient: false,
    },
  },
  painel: {
    label: 'Painel',
    sub: 'Admin moderno · sans humanista',
    tweaks: {
      preset: 'painel',
      accent: '#0e6d73',
      radius: 10,
      fontDisplay: 'mulish',
      fontBody: 'mulish',
      gradient: false,
    },
  },
  carimbo: {
    label: 'Carimbo',
    sub: 'Gráfica artesanal · geométrico quente',
    tweaks: {
      preset: 'carimbo',
      accent: '#ee3537',
      radius: 6,
      fontDisplay: 'sofia-sc',
      fontBody: 'sofia',
      gradient: true,
    },
  },
};

const ACCENT_OPTIONS = [
  '#bf4d28',  // terracotta (Atelier default)
  '#0e6d73',  // deep teal (Painel default)
  '#ee3537',  // brand red (Carimbo default)
  '#0d6efd',  // bootstrap blue (legacy app)
  '#0F7949',  // brand forest green
  '#7c3aed',  // berry
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "preset": "painel",
  "accent": "#0e6d73",
  "radius": 10,
  "fontDisplay": "mulish",
  "fontBody": "mulish",
  "fontSize": 14,
  "density": "compact",
  "gradient": false,
  "dark": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState('quotes');   // sidebar nav id
  const [detailId, setDetailId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Build inline-style overrides on the root container
  const styleVars = {
    '--accent':       t.accent,
    '--radius':       t.radius + 'px',
    '--radius-sm':    Math.max(4, t.radius - 4) + 'px',
    '--font-display': FONT_PRESETS[t.fontDisplay]?.stack,
    '--font-body':    FONT_PRESETS[t.fontBody]?.stack,
    '--font-size':    t.fontSize + 'px',
  };

  const rootCls = [
    'bc2-app',
    `theme-${t.preset || 'atelier'}`,
    `density-${t.density || 'compact'}`,
    t.dark ? 'dark' : '',
    t.gradient ? 'show-gradient' : '',
  ].filter(Boolean).join(' ');

  const handleNavigate = (id) => {
    setView(id);
    setDetailId(null);
    setCreating(false);
  };
  const handleOpenDetail = (id) => { setDetailId(id); setCreating(false); };
  const handleNew = () => { setCreating(true); setDetailId(null); };
  const handleSubmit = () => { setCreating(false); };

  // Which sidebar id reflects current state?
  const navActive = creating ? 'quotes' : detailId ? 'quotes' : view;

  return (
    <div className={rootCls} style={styleVars}>
      <Sidebar activeView={navActive} onNavigate={handleNavigate} />
      <main className="bc2-main">
        {creating && (
          <FormView
            onCancel={() => setCreating(false)}
            onSubmit={handleSubmit}
          />
        )}
        {!creating && detailId && (
          <DetailView quoteId={detailId} onBack={() => setDetailId(null)} />
        )}
        {!creating && !detailId && view === 'board' && (
          <KanbanView onOpenDetail={handleOpenDetail} />
        )}
        {!creating && !detailId && view !== 'board' && (
          <ListView onOpenDetail={handleOpenDetail} onNew={handleNew} />
        )}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Preset" />
        <div className="bc2-preset-row">
          {Object.entries(THEME_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              className={`bc2-preset ${t.preset === key ? 'is-on' : ''}`}
              onClick={() => setTweak(p.tweaks)}
            >
              <b>{p.label}</b>
              <span>{p.sub}</span>
            </button>
          ))}
        </div>

        <TweakSection label="Tipografia" />
        <TweakSelect
          label="Display"
          value={t.fontDisplay}
          options={Object.entries(FONT_PRESETS).map(([v, p]) => ({ value: v, label: p.label }))}
          onChange={(v) => setTweak('fontDisplay', v)}
        />
        <TweakSelect
          label="Texto corrido"
          value={t.fontBody}
          options={Object.entries(FONT_PRESETS).map(([v, p]) => ({ value: v, label: p.label }))}
          onChange={(v) => setTweak('fontBody', v)}
        />
        <TweakSlider
          label="Tamanho base"
          value={t.fontSize} min={12} max={17} step={1} unit="px"
          onChange={(v) => setTweak('fontSize', v)}
        />

        <TweakSection label="Layout" />
        <TweakRadio
          label="Densidade"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakSlider
          label="Raio dos cantos"
          value={t.radius} min={0} max={20} step={1} unit="px"
          onChange={(v) => setTweak('radius', v)}
        />

        <TweakSection label="Cor & modo" />
        <TweakColor
          label="Acento"
          value={t.accent}
          options={ACCENT_OPTIONS}
          onChange={(v) => setTweak('accent', v)}
        />
        <TweakToggle
          label="Modo escuro"
          value={t.dark}
          onChange={(v) => setTweak('dark', v)}
        />
      </TweaksPanel>

      <style>{`
        .bc2-preset-row { display: grid; grid-template-columns: 1fr; gap: 4px; }
        .bc2-preset {
          text-align: left; cursor: pointer;
          background: rgba(255,255,255,.5);
          border: 1px solid rgba(0,0,0,.06);
          border-radius: 8px; padding: 8px 10px;
          display: flex; flex-direction: column; gap: 1px;
        }
        .bc2-preset b { font-size: 11.5px; color: #29261b; }
        .bc2-preset span { font-size: 10px; color: rgba(41,38,27,.55); }
        .bc2-preset:hover { background: rgba(255,255,255,.85); }
        .bc2-preset.is-on { background: #29261b; border-color: #29261b; }
        .bc2-preset.is-on b { color: #fff; }
        .bc2-preset.is-on span { color: rgba(255,255,255,.7); }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
