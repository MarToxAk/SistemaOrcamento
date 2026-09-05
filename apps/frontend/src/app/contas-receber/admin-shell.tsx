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
      `}</style>
    </div>
  );
}
