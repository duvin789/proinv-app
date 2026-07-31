"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { useInventory } from "@/components/inventory-provider";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/format";
import { isIncomingMovement, movementLabels } from "@/lib/inventory";
import type { MovementInput } from "@/lib/types";

const emptyForm = {
  productId: "",
  warehouseId: "",
  type: "purchase" as MovementInput["type"],
  quantity: "1",
  unitCost: "0",
  saleUnitPrice: "0",
  note: "",
  reason: "",
};

export function MovementDialog() {
  const {
    workspace,
    isMutating,
    movementDialog,
    closeMovementDialog,
    recordMovement,
  } = useInventory();
  const [form, setForm] = useState(() => {
    const product =
      movementDialog.product ||
      workspace.products.find((item) => item.active) ||
      null;
    return {
      ...emptyForm,
      productId: product?.id || "",
      warehouseId:
        workspace.warehouses.find((warehouse) => warehouse.isDefault)?.id ||
        workspace.warehouses[0]?.id ||
        "",
      unitCost: String(product?.purchasePrice || 0),
      saleUnitPrice: String(product?.salePrice || 0),
    };
  });
  const [error, setError] = useState("");

  const product = workspace.products.find(
    (item) => item.id === form.productId,
  );
  const incoming = isIncomingMovement(form.type);
  const quantity = Number(form.quantity) || 0;
  const projectedStock = product
    ? product.currentStock + (incoming ? quantity : -quantity)
    : 0;
  const unitAmount =
    form.type === "sale"
      ? Number(form.saleUnitPrice) || 0
      : Number(form.unitCost) || 0;

  const movementOptions = useMemo<
    Array<{ value: MovementInput["type"]; label: string }>
  >(
    () => [
      { value: "purchase", label: movementLabels.purchase },
      { value: "sale", label: movementLabels.sale },
      { value: "adjustment_in", label: movementLabels.adjustment_in },
      { value: "adjustment_out", label: movementLabels.adjustment_out },
      { value: "return_in", label: movementLabels.return_in },
      { value: "return_out", label: movementLabels.return_out },
    ],
    [],
  );

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectProduct(productId: string) {
    const selected = workspace.products.find((item) => item.id === productId);
    setForm((current) => ({
      ...current,
      productId,
      unitCost: String(selected?.purchasePrice || 0),
      saleUnitPrice: String(selected?.salePrice || 0),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!product) {
      setError("Selecciona un producto.");
      return;
    }
    if (quantity <= 0) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (!incoming && projectedStock < 0) {
      setError(
        `Stock insuficiente. Hay ${formatNumber(product.currentStock)} ${product.unit} disponibles.`,
      );
      return;
    }

    const result = await recordMovement({
      productId: form.productId,
      warehouseId: form.warehouseId,
      type: form.type,
      quantity,
      unitCost: Number(form.unitCost) || undefined,
      saleUnitPrice: Number(form.saleUnitPrice) || undefined,
      note: form.note || undefined,
      reason: form.reason || undefined,
    });

    if (result.ok) closeMovementDialog();
    else setError(result.message);
  }

  const currency = workspace.organization.currency;
  const locale = workspace.organization.locale;

  return (
    <Modal
      open={movementDialog.open}
      onClose={closeMovementDialog}
      title="Registrar movimiento"
      description="Indica qué ocurrió. El stock y los costos se ajustarán automáticamente."
      size="md"
    >
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-section">
          <div className="form-grid form-grid-2">
            <label className="field field-span-2">
              <span>Producto</span>
              <select
                value={form.productId}
                onChange={(event) => selectProduct(event.target.value)}
                required
                autoFocus
              >
                <option value="">Selecciona un producto</option>
                {workspace.products
                  .filter((item) => item.active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatNumber(item.currentStock)} {item.unit}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo de movimiento</span>
              <select
                value={form.type}
                onChange={(event) =>
                  updateField(
                    "type",
                    event.target.value as MovementInput["type"],
                  )
                }
              >
                {movementOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Almacén</span>
              <select
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
            <label className="field">
              <span>Cantidad</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={form.quantity}
                onChange={(event) =>
                  updateField("quantity", event.target.value)
                }
                required
              />
            </label>
            {form.type === "sale" ? (
              <label className="field">
                <span>Precio vendido por unidad</span>
                <div className="input-prefix">
                  <span>{currency}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.saleUnitPrice}
                    onChange={(event) =>
                      updateField("saleUnitPrice", event.target.value)
                    }
                    required
                  />
                </div>
              </label>
            ) : incoming ? (
              <label className="field">
                <span>Costo por unidad</span>
                <div className="input-prefix">
                  <span>{currency}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitCost}
                    onChange={(event) =>
                      updateField("unitCost", event.target.value)
                    }
                    required
                  />
                </div>
              </label>
            ) : (
              <div className="field">
                <span>Costo aplicado</span>
                <div className="read-only-field">
                  {formatCurrency(
                    product?.averageCost || 0,
                    currency,
                    locale,
                  )}
                </div>
              </div>
            )}
            <label className="field field-span-2">
              <span>Motivo</span>
              <input
                value={form.reason}
                onChange={(event) => updateField("reason", event.target.value)}
                placeholder="Ej. Compra de tela, uso en producción o merma"
                maxLength={80}
              />
            </label>
            <label className="field field-span-2">
              <span>Observación adicional</span>
              <textarea
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
                placeholder="Detalle adicional opcional"
                rows={2}
                maxLength={300}
              />
            </label>
          </div>
        </div>

        <div
          className={`movement-preview ${projectedStock < 0 ? "is-negative" : ""}`}
          aria-live="polite"
        >
          <div className="movement-direction">
            {incoming ? (
              <ArrowUpIcon size={20} weight="bold" />
            ) : (
              <ArrowDownIcon size={20} weight="bold" />
            )}
          </div>
          <div>
            <span>Stock actual</span>
            <strong>
              {formatNumber(product?.currentStock || 0, locale)}{" "}
              {product?.unit || ""}
            </strong>
          </div>
          <div className="movement-preview-separator" aria-hidden="true" />
          <div>
            <span>Stock resultante</span>
            <strong>
              {formatNumber(projectedStock, locale)} {product?.unit || ""}
            </strong>
          </div>
          <div>
            <span>Total del movimiento</span>
            <strong>
              {formatCurrency(quantity * unitAmount, currency, locale)}
            </strong>
          </div>
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
            onClick={closeMovementDialog}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isMutating || !product}
          >
            {isMutating ? "Registrando..." : "Registrar movimiento"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
