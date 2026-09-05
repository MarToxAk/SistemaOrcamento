"use client";

import { useState, type ReactNode } from "react";
import { useEmpresa } from "@/lib/empresa";

export interface PaNavItem {
  href: string;
  label: string;
  icon: string;
}

export const PA_NAV_ITEMS: PaNavItem[] = [
  { href: "/contas-receber", label: "Contas a Receber", icon: "cash-coin" },
  { href: "/orcamento", label: "Orçamentos", icon: "file-earmark-text" },
  { href: "/status", label: "Produção", icon: "kanban" },
  { href: "/configuracoes/templates", label: "Configurações", icon: "gear" },
];

interface AdminShellProps {
  activeHref: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AdminShell({ activeHref, title, subtitle, actions, children }: AdminShellProps) {
  const { EMPRESA_NOME, EMPRESA_LOGO_URL } = useEmpresa();
  const [sidebarAberta, setSidebarAberta] = useState(false);

  return (
    <div className="pa-shell">
      <aside className={`pa-sidebar${sidebarAberta ? " pa-sidebar-aberta" : ""}`}>
        <div className="pa-brand">
          {EMPRESA_LOGO_URL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={EMPRESA_LOGO_URL} alt={EMPRESA_NOME} className="pa-brand-logo" />
          ) : (
            <span className="pa-brand-fallback">
              <i className="bi bi-building" />
            </span>
          )}
          <span className="pa-brand-nome text-truncate">{EMPRESA_NOME}</span>
        </div>
        <div className="pa-nav-label">Navegação</div>
        <nav className="pa-nav">
          {PA_NAV_ITEMS.map((item) => {
            const ativo = item.href === activeHref;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`pa-nav-item${ativo ? " pa-nav-item-active" : ""}`}
                aria-current={ativo ? "page" : undefined}
              >
                <i className={`bi bi-${item.icon}`} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      {sidebarAberta && <div className="pa-backdrop" onClick={() => setSidebarAberta(false)} />}

      <div className="pa-main">
        <header className="pa-topbar">
          <button
            type="button"
            className="pa-hamburger"
            onClick={() => setSidebarAberta((v) => !v)}
            aria-label="Alternar menu de navegação"
          >
            <i className="bi bi-list" />
          </button>
          <div className="pa-topbar-titles">
            <h1 className="pa-topbar-title">{title}</h1>
            {subtitle && <span className="pa-topbar-subtitle">{subtitle}</span>}
          </div>
          <div className="pa-topbar-actions">{actions}</div>
        </header>
        <main className="pa-content">{children}</main>
      </div>

      <style>{`
        :root {
          --pa-sidebar-bg: #1b2431;
          --pa-sidebar-bg-hover: #26313f;
          --pa-sidebar-text: #a9b4c4;
          --pa-sidebar-text-active: #ffffff;
          --pa-accent: #3d42df;
          --pa-accent-soft: #eceefe;
          --pa-bg: #f4f6fa;
          --pa-surface: #ffffff;
          --pa-border: #e6e9f0;
          --pa-text: #1f2a37;
          --pa-text-muted: #6b7a90;
          --pa-success: #1eb564;
          --pa-warning: #f7a600;
          --pa-orange: #fd7e14;
          --pa-danger-soft: #ff6b6b;
          --pa-danger: #e5484d;
        }
        body { background: var(--pa-bg); color: var(--pa-text); font-size: 1rem; }
        .pa-shell { display: flex; min-height: 100vh; }
        .pa-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 250px;
          background: var(--pa-sidebar-bg);
          display: flex;
          flex-direction: column;
          z-index: 1040;
          transition: transform 0.2s ease;
        }
        .pa-brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .pa-brand-logo {
          max-width: 36px;
          max-height: 36px;
          border-radius: 6px;
          background: #fff;
          padding: 2px;
          object-fit: contain;
        }
        .pa-brand-fallback {
          width: 36px;
          height: 36px;
          border-radius: 6px;
          background: var(--pa-sidebar-bg-hover);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--pa-sidebar-text-active);
          flex-shrink: 0;
        }
        .pa-brand-nome {
          color: var(--pa-sidebar-text-active);
          font-weight: 600;
          min-width: 0;
        }
        .pa-nav-label {
          padding: 1rem 1rem 0.4rem;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--pa-sidebar-text);
          opacity: 0.7;
        }
        .pa-nav {
          display: flex;
          flex-direction: column;
          padding: 0 0.5rem;
          gap: 0.15rem;
        }
        .pa-nav-item {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          padding: 0.55rem 0.75rem;
          border-radius: 6px;
          color: var(--pa-sidebar-text);
          text-decoration: none;
          border-left: 3px solid transparent;
          font-size: 0.9rem;
        }
        .pa-nav-item:hover {
          background: var(--pa-sidebar-bg-hover);
          color: var(--pa-sidebar-text-active);
        }
        .pa-nav-item-active {
          background: var(--pa-sidebar-bg-hover);
          color: var(--pa-sidebar-text-active);
          border-left-color: var(--pa-accent);
        }
        .pa-main {
          flex: 1;
          margin-left: 250px;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        .pa-topbar {
          position: sticky;
          top: 0;
          z-index: 1030;
          height: 60px;
          background: var(--pa-surface);
          border-bottom: 1px solid var(--pa-border);
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0 1.25rem;
        }
        .pa-hamburger {
          display: none;
          border: none;
          background: transparent;
          font-size: 1.25rem;
          color: var(--pa-text);
        }
        .pa-topbar-titles {
          display: flex;
          flex-direction: column;
          margin-right: auto;
          min-width: 0;
        }
        .pa-topbar-title {
          font-size: 1.05rem;
          font-weight: 700;
          margin: 0;
          color: var(--pa-text);
        }
        .pa-topbar-subtitle {
          font-size: 0.78rem;
          color: var(--pa-text-muted);
        }
        .pa-topbar-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .pa-content {
          padding: 1.5rem;
          flex: 1;
        }
        .pa-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 20, 30, 0.5);
          z-index: 1035;
        }
        @media (max-width: 992px) {
          .pa-sidebar {
            transform: translateX(-100%);
          }
          .pa-sidebar.pa-sidebar-aberta {
            transform: translateX(0);
          }
          .pa-main {
            margin-left: 0;
          }
          .pa-hamburger {
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
        }

        .pa-card {
          background: var(--pa-surface);
          border: 1px solid var(--pa-border);
          border-radius: 10px;
          box-shadow: 0 1px 3px rgba(16, 24, 40, .06);
          margin-bottom: 1.5rem;
        }
        .pa-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.9rem 1.1rem;
          border-bottom: 1px solid var(--pa-border);
        }
        .pa-card-header-count { color: var(--pa-text-muted); font-size: 0.85rem; margin-left: 0.4rem; }
        .pa-card-body { padding: 1.1rem; }
        .pa-card-body-scroll { max-height: 320px; overflow-y: auto; }
        .pa-card-body-flush { padding: 0; }

        .pa-icon-btn {
          border: 1px solid var(--pa-border);
          background: var(--pa-surface);
          color: var(--pa-text-muted);
          border-radius: 6px;
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .pa-icon-btn:hover { background: var(--pa-bg); }
        .pa-icon-muted { color: var(--pa-text-muted); }

        .pa-empty {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 8px;
          background: var(--pa-bg);
          color: var(--pa-text);
        }
        .pa-empty-erro { color: var(--pa-danger); }

        .pa-id-badge {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          background: var(--pa-bg);
          color: var(--pa-text-muted);
          margin-right: 0.4rem;
        }

        .pa-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .pa-table thead th {
          position: sticky;
          top: 0;
          background: var(--pa-surface);
          color: var(--pa-text-muted);
          text-align: left;
          font-weight: 600;
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 0.65rem 1rem;
          border-bottom: 1px solid var(--pa-border);
          white-space: nowrap;
          z-index: 1;
        }
        .pa-table tbody td {
          padding: 0.65rem 1rem;
          border-bottom: 1px solid var(--pa-border);
          vertical-align: middle;
        }
        .pa-table tbody tr:last-child td { border-bottom: none; }
        .pa-table tbody tr:hover { background: var(--pa-bg); }
        .pa-td-cliente { max-width: 260px; }
        .pa-td-cliente .text-truncate { display: inline-block; max-width: 180px; vertical-align: middle; }

        .pa-th-sort {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          text-transform: inherit;
          letter-spacing: inherit;
          color: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }
        .pa-th-sort:hover { color: var(--pa-accent); }

        .pa-pill {
          display: inline-block;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          font-size: 0.74rem;
          font-weight: 600;
        }
        .pa-pill-success { background: rgba(30, 181, 100, 0.14); color: var(--pa-success); }
        .pa-pill-warning { background: rgba(247, 166, 0, 0.16); color: #8a5a00; }
        .pa-pill-secondary { background: var(--pa-bg); color: var(--pa-text-muted); }
        .pa-pill-danger { background: rgba(229, 72, 77, 0.14); color: var(--pa-danger); }

        .pa-row-critico td:first-child { border-left: 4px solid var(--pa-danger); }
        .pa-row-critico { background: rgba(229, 72, 77, 0.05); }

        .pa-link-btn {
          display: inline-block;
          padding: 0.25rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--pa-accent);
          color: var(--pa-accent);
          font-size: 0.8rem;
          text-decoration: none;
        }
        .pa-link-btn:hover { background: var(--pa-accent); color: #fff; }

        .pa-seg { display: inline-flex; border: 1px solid var(--pa-border); border-radius: 8px; overflow: hidden; }
        .pa-seg-btn {
          background: var(--pa-surface);
          color: var(--pa-text-muted);
          border: none;
          border-right: 1px solid var(--pa-border);
          padding: 0.35rem 0.7rem;
          font-size: 0.8rem;
        }
        .pa-seg-btn:last-child { border-right: none; }
        .pa-seg-btn:hover { background: var(--pa-bg); }
        .pa-seg-btn-active { background: var(--pa-accent); color: #fff; }

        .pa-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .pa-stat { display: flex; align-items: flex-start; gap: 0.85rem; padding: 1.1rem; }
        .pa-stat-icon {
          width: 44px;
          height: 44px;
          min-width: 44px;
          border-radius: 10px;
          background: var(--pa-accent-soft);
          color: var(--pa-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.15rem;
        }
        .pa-stat-body { min-width: 0; }
        .pa-stat-label { color: var(--pa-text-muted); font-size: 0.82rem; margin-bottom: 0.15rem; }
        .pa-stat-value { font-weight: 700; margin: 0; font-size: 1.3rem; }
        .pa-stat-value-accent { color: var(--pa-accent); }
        .pa-stat-value-danger { color: var(--pa-danger); }
        .pa-stat-value-success { color: var(--pa-success); }
        .pa-stat-value-text { color: var(--pa-text); }

        .pa-aging-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
        .pa-aging-card { padding: 0.85rem 1rem; border-left: 4px solid transparent; }
        .pa-aging-1 { border-left-color: var(--pa-warning); }
        .pa-aging-2 { border-left-color: var(--pa-orange); }
        .pa-aging-3 { border-left-color: var(--pa-danger-soft); }
        .pa-aging-4 { border-left-color: var(--pa-danger); }

        .pa-vencer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
        .pa-vencer-card { padding: 0.85rem 1rem; }

        .pa-progress { height: 6px; border-radius: 4px; background: var(--pa-bg); overflow: hidden; }
        .pa-progress-bar { height: 100%; border-radius: 4px; }
        .pa-progress-bar-success { background: var(--pa-success); }
        .pa-progress-bar-warning { background: var(--pa-warning); }
        .pa-progress-bar-danger { background: var(--pa-danger); }

        .bg-orange { background-color: #fd7e14 !important; }
        .bg-danger-soft { background-color: #ff6b6b !important; }

        .pa-actionbar {
          position: sticky;
          bottom: 0;
          background: var(--pa-surface);
          border-top: 1px solid var(--pa-border);
          padding: 12px 16px;
          z-index: 20;
        }
        .pa-btn-accent {
          background: var(--pa-accent);
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 0.4rem 0.9rem;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .pa-btn-accent:hover { opacity: 0.9; color: #fff; }
        .pa-btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 992px) {
          .pa-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .pa-aging-grid { grid-template-columns: repeat(2, 1fr); }
          .pa-vencer-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
