"use client";

import {
  ArrowsDownUpIcon,
  BellSimpleIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  GearSixIcon,
  HouseLineIcon,
  InfoIcon,
  ListIcon,
  MoonIcon,
  PackageIcon,
  PlusIcon,
  SignOutIcon,
  SunIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { signOutAction } from "@/app/actions/auth";
import { useInventory } from "@/components/inventory-provider";
import {
  applyPreferences,
  preferencesChangedEvent,
  readPreferences,
  savePreferences,
  type AppPreferences,
} from "@/lib/preferences";

const ProductDialog = dynamic(() =>
  import("@/components/product-dialog").then((module) => module.ProductDialog),
);
const MovementDialog = dynamic(() =>
  import("@/components/movement-dialog").then(
    (module) => module.MovementDialog,
  ),
);

const navItems = [
  {
    href: "/dashboard",
    label: "Resumen",
    icon: HouseLineIcon,
  },
  {
    href: "/productos",
    label: "Productos",
    icon: PackageIcon,
  },
  {
    href: "/movimientos",
    label: "Movimientos",
    icon: ArrowsDownUpIcon,
  },
  {
    href: "/reportes",
    label: "Reportes",
    icon: ChartLineUpIcon,
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: GearSixIcon,
  },
];

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Resumen de inventario",
    subtitle: "Todo lo importante, calculado al momento.",
  },
  "/productos": {
    title: "Productos",
    subtitle: "Catálogo, costos, precios y existencias.",
  },
  "/movimientos": {
    title: "Movimientos",
    subtitle: "Entradas, salidas y ajustes con trazabilidad.",
  },
  "/reportes": {
    title: "Reportes",
    subtitle: "Valorización, rentabilidad y salud del stock.",
  },
  "/configuracion": {
    title: "Configuración",
    subtitle: "Empresa, categorías, proveedores y conexión.",
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    workspace,
    toast,
    dismissToast,
    productDialog,
    movementDialog,
    openProductDialog,
    openMovementDialog,
  } = useInventory();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferences, setPreferences] = useState<AppPreferences>({
    theme: "system",
    density: "comfortable",
    stockAlerts: true,
  });
  const page = pageTitles[pathname] || pageTitles["/dashboard"];
  const canOperate = workspace.viewer.role !== "viewer";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = readPreferences();
      applyPreferences(next);
      setPreferences(next);
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );
    };
    const frame = window.requestAnimationFrame(sync);
    media.addEventListener("change", sync);
    window.addEventListener(preferencesChangedEvent, sync);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", sync);
      window.removeEventListener(preferencesChangedEvent, sync);
    };
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    const nextPreferences: AppPreferences = {
      ...preferences,
      theme: nextTheme,
    };
    setPreferences(nextPreferences);
    savePreferences(nextPreferences);
  }

  return (
    <div className="app-frame">
      <div
        className={`sidebar-scrim ${sidebarOpen ? "is-visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Link
            href="/dashboard"
            className="brand-lockup"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="brand-logo-shell">
              <Image
                src="/kadmiel-logo.png"
                alt=""
                width={482}
                height={452}
                sizes="42px"
              />
            </span>
            <span>
              <strong>Kadmiel</strong>
              <small>Multimuebles · Inventario</small>
            </span>
          </Link>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <XIcon size={20} weight="bold" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          <span className="sidebar-nav-label">Operación</span>
          {navItems.slice(0, 4).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <span className="sidebar-nav-label sidebar-nav-label-spaced">
            Administración
          </span>
          {navItems.slice(4).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">
            {workspace.viewer.initials}
          </span>
          <div>
            <strong>{workspace.viewer.fullName}</strong>
            <span>{workspace.organization.name}</span>
          </div>
          <form action={signOutAction}>
            <button
              className="icon-button"
              type="submit"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <SignOutIcon size={19} />
            </button>
          </form>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="icon-button mobile-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <ListIcon size={22} weight="bold" />
            </button>
            <div>
              <h1>{page.title}</h1>
              <p>{page.subtitle}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              onClick={toggleTheme}
              aria-label={
                theme === "light" ? "Activar tema oscuro" : "Activar tema claro"
              }
              title={
                theme === "light" ? "Activar tema oscuro" : "Activar tema claro"
              }
            >
              {theme === "light" ? (
                <MoonIcon size={20} />
              ) : (
                <SunIcon size={20} />
              )}
            </button>
            <Link
              href="/productos"
              className="icon-button notification-button"
              aria-label="Ver alertas de stock"
              title="Ver alertas de stock"
            >
              <BellSimpleIcon size={20} />
              {preferences.stockAlerts && workspace.products.some(
                (product) =>
                  product.active && product.currentStock <= product.minStock,
              ) ? (
                <span className="notification-dot" />
              ) : null}
            </Link>
            <button
              type="button"
              className="button button-secondary topbar-movement"
              onClick={() => openMovementDialog()}
              disabled={!canOperate}
              title={!canOperate ? "Tu rol es de solo consulta" : undefined}
            >
              <ArrowsDownUpIcon size={18} weight="bold" />
              <span>Movimiento</span>
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => openProductDialog()}
              disabled={!canOperate}
              title={!canOperate ? "Tu rol es de solo consulta" : undefined}
            >
              <PlusIcon size={18} weight="bold" />
              <span>Nuevo producto</span>
            </button>
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>

      {productDialog.open ? (
        <ProductDialog key={productDialog.product?.id || "new-product"} />
      ) : null}
      {movementDialog.open ? (
        <MovementDialog
          key={
            movementDialog.movement?.id ||
            movementDialog.product?.id ||
            "new-movement"
          }
        />
      ) : null}

      {toast ? (
        <div
          className={`toast toast-${toast.tone}`}
          role="status"
          aria-live="polite"
        >
          <div className="toast-icon" aria-hidden="true">
            {toast.tone === "success" ? (
              <CheckCircleIcon size={21} weight="fill" />
            ) : toast.tone === "error" ? (
              <WarningCircleIcon size={21} weight="fill" />
            ) : (
              <InfoIcon size={21} weight="fill" />
            )}
          </div>
          <div>
            <strong>{toast.title}</strong>
            {toast.description ? <p>{toast.description}</p> : null}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={dismissToast}
            aria-label="Cerrar mensaje"
          >
            <XIcon size={18} weight="bold" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
