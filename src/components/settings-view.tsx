"use client";

import {
  BuildingsIcon,
  CheckCircleIcon,
  DatabaseIcon,
  MapPinIcon,
  PlusIcon,
  StorefrontIcon,
  TagIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

import { useInventory } from "@/components/inventory-provider";
import { formatNumber } from "@/lib/format";

const categoryColors = [
  "#39735f",
  "#5c6d91",
  "#a26743",
  "#856a91",
  "#9b5f62",
  "#547886",
];

export function SettingsView() {
  const {
    workspace,
    isMutating,
    updateOrganization,
    createCategory,
    createSupplier,
    resetDemo,
  } = useInventory();
  const { organization, categories, suppliers, warehouses, viewer } = workspace;
  const canManage = viewer.role === "owner" || viewer.role === "admin";
  const [companyForm, setCompanyForm] = useState({
    name: organization.name,
    taxId: organization.taxId || "",
    currency: organization.currency,
    taxRate: String(organization.taxRate),
    locale: organization.locale,
  });
  const [companyError, setCompanyError] = useState("");
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    color: categoryColors[0],
  });
  const [categoryError, setCategoryError] = useState("");
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
  });
  const [supplierError, setSupplierError] = useState("");

  async function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompanyError("");
    if (!companyForm.name.trim()) {
      setCompanyError("Ingresa el nombre de la empresa.");
      return;
    }
    const taxRate = Number(companyForm.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setCompanyError("La tasa debe estar entre 0 y 100.");
      return;
    }
    const result = await updateOrganization({
      name: companyForm.name,
      taxId: companyForm.taxId || undefined,
      currency: companyForm.currency,
      taxRate,
      locale: companyForm.locale,
    });
    if (!result.ok) setCompanyError(result.message);
  }

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoryError("");
    if (!categoryForm.name.trim()) {
      setCategoryError("Escribe el nombre de la categoría.");
      return;
    }
    const result = await createCategory(categoryForm);
    if (result.ok) {
      setCategoryForm({
        name: "",
        color:
          categoryColors[(categories.length + 1) % categoryColors.length],
      });
    } else {
      setCategoryError(result.message);
    }
  }

  async function addSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupplierError("");
    if (!supplierForm.name.trim()) {
      setSupplierError("Escribe el nombre del proveedor.");
      return;
    }
    const result = await createSupplier({
      name: supplierForm.name,
      contactName: supplierForm.contactName || undefined,
      email: supplierForm.email || undefined,
      phone: supplierForm.phone || undefined,
    });
    if (result.ok) {
      setSupplierForm({
        name: "",
        contactName: "",
        email: "",
        phone: "",
      });
    } else {
      setSupplierError(result.message);
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-index" aria-label="Secciones de configuración">
        <a href="#empresa">
          <BuildingsIcon size={18} />
          Empresa
        </a>
        <a href="#categorias">
          <TagIcon size={18} />
          Categorías
        </a>
        <a href="#proveedores">
          <UsersThreeIcon size={18} />
          Proveedores
        </a>
        <a href="#almacenes">
          <StorefrontIcon size={18} />
          Almacenes
        </a>
        <a href="#conexion">
          <DatabaseIcon size={18} />
          Conexión
        </a>
      </nav>

      <div className="settings-content">
        {!canManage ? (
          <div className="permission-note">
            <WarningIcon size={20} weight="duotone" />
            <p>
              Tu rol es de solo operación. Un propietario o administrador debe
              realizar los cambios de configuración.
            </p>
          </div>
        ) : null}

        <section id="empresa" className="panel settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <BuildingsIcon size={22} weight="duotone" />
            </div>
            <div>
              <h2>Datos de la empresa</h2>
              <p>
                Estos valores controlan la moneda, el formato y los cálculos de
                impuestos.
              </p>
            </div>
          </div>
          <form className="settings-form" onSubmit={saveCompany}>
            <div className="form-grid form-grid-2">
              <label className="field field-span-2">
                <span>Nombre comercial</span>
                <input
                  value={companyForm.name}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  disabled={!canManage}
                  maxLength={120}
                  required
                />
              </label>
              <label className="field">
                <span>RUC o identificación fiscal</span>
                <input
                  value={companyForm.taxId}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      taxId: event.target.value,
                    }))
                  }
                  disabled={!canManage}
                  placeholder="Opcional"
                  maxLength={30}
                />
              </label>
              <label className="field">
                <span>Moneda</span>
                <select
                  value={companyForm.currency}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                  disabled={!canManage}
                >
                  <option value="PEN">PEN - Sol peruano</option>
                  <option value="USD">USD - Dólar estadounidense</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="MXN">MXN - Peso mexicano</option>
                  <option value="COP">COP - Peso colombiano</option>
                  <option value="CLP">CLP - Peso chileno</option>
                </select>
              </label>
              <label className="field">
                <span>Tasa de impuesto</span>
                <div className="input-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={companyForm.taxRate}
                    onChange={(event) =>
                      setCompanyForm((current) => ({
                        ...current,
                        taxRate: event.target.value,
                      }))
                    }
                    disabled={!canManage}
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="field">
                <span>Formato regional</span>
                <select
                  value={companyForm.locale}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      locale: event.target.value,
                    }))
                  }
                  disabled={!canManage}
                >
                  <option value="es-PE">Español (Perú)</option>
                  <option value="es-MX">Español (México)</option>
                  <option value="es-CO">Español (Colombia)</option>
                  <option value="es-CL">Español (Chile)</option>
                  <option value="es-ES">Español (España)</option>
                </select>
              </label>
            </div>
            {companyError ? (
              <p className="inline-error" role="alert">
                {companyError}
              </p>
            ) : null}
            <div className="settings-form-footer">
              <button
                type="submit"
                className="button button-primary"
                disabled={!canManage || isMutating}
              >
                {isMutating ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </section>

        <section id="categorias" className="panel settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <TagIcon size={22} weight="duotone" />
            </div>
            <div>
              <h2>Categorías</h2>
              <p>Agrupan el catálogo y alimentan los reportes de valorización.</p>
            </div>
          </div>
          <div className="settings-list category-settings-list">
            {categories.map((category) => {
              const count = workspace.products.filter(
                (product) => product.categoryId === category.id,
              ).length;
              return (
                <div key={category.id}>
                  <span
                    className="category-color-large"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{category.name}</strong>
                    <span>
                      {count} {count === 1 ? "producto" : "productos"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <form className="inline-create-form" onSubmit={addCategory}>
            <label className="field">
              <span>Nueva categoría</span>
              <input
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ej. Accesorios"
                disabled={!canManage}
                maxLength={60}
              />
            </label>
            <label className="field color-field">
              <span>Color</span>
              <input
                type="color"
                value={categoryForm.color}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
                disabled={!canManage}
                aria-label="Color de categoría"
              />
            </label>
            <button
              type="submit"
              className="button button-secondary"
              disabled={!canManage || isMutating}
            >
              <PlusIcon size={18} weight="bold" />
              Agregar
            </button>
          </form>
          {categoryError ? (
            <p className="inline-error" role="alert">
              {categoryError}
            </p>
          ) : null}
        </section>

        <section id="proveedores" className="panel settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <UsersThreeIcon size={22} weight="duotone" />
            </div>
            <div>
              <h2>Proveedores</h2>
              <p>
                Mantén los contactos de compra junto al inventario.
              </p>
            </div>
          </div>
          <div className="settings-list supplier-settings-list">
            {suppliers.map((supplier) => (
              <div key={supplier.id}>
                <span className="supplier-avatar" aria-hidden="true">
                  {supplier.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{supplier.name}</strong>
                  <span>
                    {[supplier.contactName, supplier.email, supplier.phone]
                      .filter(Boolean)
                      .join(" / ") || "Sin datos de contacto"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <form className="supplier-create-form" onSubmit={addSupplier}>
            <div className="form-grid form-grid-2">
              <label className="field field-span-2">
                <span>Nombre del proveedor</span>
                <input
                  value={supplierForm.name}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Razón social o nombre comercial"
                  disabled={!canManage}
                  maxLength={120}
                />
              </label>
              <label className="field">
                <span>Persona de contacto</span>
                <input
                  value={supplierForm.contactName}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      contactName: event.target.value,
                    }))
                  }
                  placeholder="Opcional"
                  disabled={!canManage}
                  maxLength={120}
                />
              </label>
              <label className="field">
                <span>Teléfono</span>
                <input
                  value={supplierForm.phone}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="+51 999 999 999"
                  disabled={!canManage}
                  maxLength={40}
                />
              </label>
              <label className="field field-span-2">
                <span>Correo</span>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="ventas@proveedor.com"
                  disabled={!canManage}
                />
              </label>
            </div>
            {supplierError ? (
              <p className="inline-error" role="alert">
                {supplierError}
              </p>
            ) : null}
            <div className="settings-form-footer">
              <button
                type="submit"
                className="button button-secondary"
                disabled={!canManage || isMutating}
              >
                <PlusIcon size={18} weight="bold" />
                Agregar proveedor
              </button>
            </div>
          </form>
        </section>

        <section id="almacenes" className="panel settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <StorefrontIcon size={22} weight="duotone" />
            </div>
            <div>
              <h2>Almacenes</h2>
              <p>
                La base de datos admite existencias separadas por ubicación.
              </p>
            </div>
          </div>
          <div className="warehouse-list">
            {warehouses.map((warehouse) => (
              <div key={warehouse.id}>
                <span className="warehouse-icon" aria-hidden="true">
                  <MapPinIcon size={21} weight="duotone" />
                </span>
                <div>
                  <strong>{warehouse.name}</strong>
                  <span>{warehouse.location || "Ubicación no indicada"}</span>
                </div>
                {warehouse.isDefault ? (
                  <span className="default-badge">Predeterminado</span>
                ) : null}
              </div>
            ))}
          </div>
          <p className="settings-helper">
            El traslado entre almacenes está preparado en el esquema SQL. La
            gestión avanzada de ubicaciones puede habilitarse al conectar
            Supabase.
          </p>
        </section>

        <section id="conexion" className="panel settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <DatabaseIcon size={22} weight="duotone" />
            </div>
            <div>
              <h2>Conexión y almacenamiento</h2>
              <p>Estado actual del origen de datos de la aplicación.</p>
            </div>
          </div>
          <div
            className={`connection-card ${workspace.mode === "supabase" ? "is-connected" : ""}`}
          >
            <span className="connection-icon">
              {workspace.mode === "supabase" ? (
                <CheckCircleIcon size={27} weight="fill" />
              ) : (
                <DatabaseIcon size={27} weight="duotone" />
              )}
            </span>
            <div>
              <strong>
                {workspace.mode === "supabase"
                  ? "Supabase conectado"
                  : "Demostración local"}
              </strong>
              <p>
                {workspace.mode === "supabase"
                  ? "Los datos están protegidos por autenticación, roles y políticas RLS."
                  : "Los datos se conservan en localStorage. Configura las variables para trabajar en la nube."}
              </p>
            </div>
            <span className="connection-status">
              {workspace.mode === "supabase" ? "En línea" : "Local"}
            </span>
          </div>
          {workspace.mode === "demo" ? (
            <div className="connection-instructions">
              <strong>Para conectar Supabase</strong>
              <ol>
                <li>Ejecuta la migración incluida en la carpeta supabase.</li>
                <li>
                  Copia la URL y la clave pública en <code>.env.local</code>.
                </li>
                <li>Reinicia la aplicación y crea tu primera cuenta.</li>
              </ol>
              <button
                type="button"
                className="button button-danger"
                onClick={() => {
                  const confirmed = window.confirm(
                    "¿Restaurar los datos de demostración? Se perderán los cambios guardados en este navegador.",
                  );
                  if (confirmed) resetDemo();
                }}
              >
                Restaurar demostración
              </button>
            </div>
          ) : null}
        </section>

        <div className="settings-summary">
          <span>
            {formatNumber(workspace.products.length)} productos
          </span>
          <span>{formatNumber(categories.length)} categorías</span>
          <span>{formatNumber(suppliers.length)} proveedores</span>
          <span>{formatNumber(warehouses.length)} almacenes</span>
        </div>
      </div>
    </div>
  );
}
