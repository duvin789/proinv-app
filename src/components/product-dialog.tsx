"use client";

import { CalculatorIcon, InfoIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { formatCurrency, formatPercent } from "@/lib/format";
import { useInventory } from "@/components/inventory-provider";
import { Modal } from "@/components/ui/modal";
import type { ProductInput, ProductUpdateInput } from "@/lib/types";

const emptyForm = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  categoryId: "",
  supplierId: "",
  warehouseId: "",
  unit: "unidad",
  purchasePrice: "0",
  salePrice: "0",
  initialStock: "0",
  minStock: "5",
};

export function ProductDialog() {
  const {
    workspace,
    isMutating,
    productDialog,
    closeProductDialog,
    createProduct,
    updateProduct,
  } = useInventory();
  const [form, setForm] = useState(() => {
    const product = productDialog.product;
    const warehouseId =
      workspace.warehouses.find((warehouse) => warehouse.isDefault)?.id ||
      workspace.warehouses[0]?.id ||
      "";

    return product
      ? {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode || "",
          description: product.description || "",
          categoryId: product.categoryId || "",
          supplierId: product.supplierId || "",
          warehouseId,
          unit: product.unit,
          purchasePrice: String(product.purchasePrice),
          salePrice: String(product.salePrice),
          initialStock: String(product.currentStock),
          minStock: String(product.minStock),
        }
      : { ...emptyForm, warehouseId };
  });
  const [error, setError] = useState("");
  const editingProduct = productDialog.product;

  const calculations = useMemo(() => {
    const purchasePrice = Number(form.purchasePrice) || 0;
    const salePrice = Number(form.salePrice) || 0;
    const initialStock = Number(form.initialStock) || 0;
    return {
      margin:
        salePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : 0,
      unitProfit: salePrice - purchasePrice,
      initialValue: initialStock * purchasePrice,
    };
  }, [form.initialStock, form.purchasePrice, form.salePrice]);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Ingresa el nombre del producto.");
      return;
    }
    if (!form.warehouseId) {
      setError("Selecciona un almacén.");
      return;
    }

    const numericValues = [
      Number(form.purchasePrice),
      Number(form.salePrice),
      Number(form.initialStock),
      Number(form.minStock),
    ];
    if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Los precios y las cantidades deben ser números positivos.");
      return;
    }

    const base = {
      name: form.name,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      description: form.description || undefined,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      unit: form.unit,
      purchasePrice: Number(form.purchasePrice),
      salePrice: Number(form.salePrice),
      minStock: Number(form.minStock),
    };

    const result = editingProduct
      ? await updateProduct({
          ...base,
          id: editingProduct.id,
          sku: form.sku,
        } satisfies ProductUpdateInput)
      : await createProduct({
          ...base,
          warehouseId: form.warehouseId,
          initialStock: Number(form.initialStock),
        } satisfies ProductInput);

    if (result.ok) closeProductDialog();
    else setError(result.message);
  }

  const currency = workspace.organization.currency;
  const locale = workspace.organization.locale;

  return (
    <Modal
      open={productDialog.open}
      onClose={closeProductDialog}
      title={editingProduct ? "Editar producto" : "Nuevo producto"}
      description={
        editingProduct
          ? "Actualiza los datos comerciales. El stock se modifica con movimientos."
          : "Completa lo esencial. PROInv hará los cálculos por ti."
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-section">
          <div className="form-section-heading">
            <h3>Identificación</h3>
            <p>El SKU se genera automáticamente si lo dejas vacío.</p>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field field-span-2">
              <span>Nombre del producto</span>
              <input
                name="name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Ej. Café molido 500 g"
                autoFocus
                required
                maxLength={140}
              />
            </label>
            <label className="field">
              <span>SKU</span>
              <input
                name="sku"
                value={form.sku}
                onChange={(event) => updateField("sku", event.target.value)}
                placeholder="Generación automática"
                required={Boolean(editingProduct)}
                maxLength={40}
              />
            </label>
            <label className="field">
              <span>Código de barras</span>
              <input
                name="barcode"
                value={form.barcode}
                onChange={(event) => updateField("barcode", event.target.value)}
                placeholder="Opcional"
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Categoría</span>
              <select
                name="categoryId"
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
              >
                <option value="">Sin categoría</option>
                {workspace.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Proveedor principal</span>
              <select
                name="supplierId"
                value={form.supplierId}
                onChange={(event) =>
                  updateField("supplierId", event.target.value)
                }
              >
                <option value="">Sin proveedor</option>
                {workspace.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-span-2">
              <span>Descripción</span>
              <textarea
                name="description"
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Detalles útiles para identificarlo"
                rows={2}
                maxLength={500}
              />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-heading">
            <h3>Precios y existencias</h3>
            <p>El margen y la valorización se actualizan al instante.</p>
          </div>
          <div className="form-grid form-grid-3">
            <label className="field">
              <span>Costo de compra</span>
              <div className="input-prefix">
                <span>{currency}</span>
                <input
                  name="purchasePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(event) =>
                    updateField("purchasePrice", event.target.value)
                  }
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Precio de venta</span>
              <div className="input-prefix">
                <span>{currency}</span>
                <input
                  name="salePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salePrice}
                  onChange={(event) =>
                    updateField("salePrice", event.target.value)
                  }
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Unidad de medida</span>
              <select
                name="unit"
                value={form.unit}
                onChange={(event) => updateField("unit", event.target.value)}
              >
                <option value="unidad">Unidad</option>
                <option value="caja">Caja</option>
                <option value="bolsa">Bolsa</option>
                <option value="paquete">Paquete</option>
                <option value="rollo">Rollo</option>
                <option value="kg">Kilogramo</option>
                <option value="litro">Litro</option>
              </select>
            </label>
            {!editingProduct ? (
              <label className="field">
                <span>Stock inicial</span>
                <input
                  name="initialStock"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.initialStock}
                  onChange={(event) =>
                    updateField("initialStock", event.target.value)
                  }
                  required
                />
              </label>
            ) : null}
            <label className="field">
              <span>Alerta de stock mínimo</span>
              <input
                name="minStock"
                type="number"
                min="0"
                step="0.001"
                value={form.minStock}
                onChange={(event) =>
                  updateField("minStock", event.target.value)
                }
                required
              />
            </label>
            {!editingProduct ? (
              <label className="field">
                <span>Almacén</span>
                <select
                  name="warehouseId"
                  value={form.warehouseId}
                  onChange={(event) =>
                    updateField("warehouseId", event.target.value)
                  }
                  required
                >
                  {workspace.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="calculation-preview" aria-live="polite">
          <div className="calculation-preview-icon">
            <CalculatorIcon size={22} weight="duotone" />
          </div>
          <div>
            <span>Ganancia por unidad</span>
            <strong>
              {formatCurrency(calculations.unitProfit, currency, locale)}
            </strong>
          </div>
          <div>
            <span>Margen bruto</span>
            <strong>{formatPercent(calculations.margin, locale)}</strong>
          </div>
          {!editingProduct ? (
            <div>
              <span>Valor inicial</span>
              <strong>
                {formatCurrency(calculations.initialValue, currency, locale)}
              </strong>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="form-error" role="alert">
            <InfoIcon size={18} weight="fill" />
            <span>{error}</span>
          </div>
        ) : null}

        <footer className="modal-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={closeProductDialog}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isMutating}
          >
            {isMutating
              ? "Guardando..."
              : editingProduct
                ? "Guardar cambios"
                : "Crear producto"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
