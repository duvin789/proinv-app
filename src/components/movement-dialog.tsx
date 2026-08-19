"use client";

import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowsLeftRightIcon,
  InfoIcon,
  PackageIcon,
  StorefrontIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { useInventory } from "@/components/inventory-provider";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/format";
import { isIncomingMovement, movementLabels } from "@/lib/inventory";
import type {
  MovementInput,
  MovementUpdateInput,
} from "@/lib/types";

type EditableMovementType = MovementUpdateInput["type"];

const emptyForm = {
  productId: "",
  warehouseId: "",
  type: "purchase" as EditableMovementType,
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
    transferStock,
    updateMovement,
  } = useInventory();
  const [form, setForm] = useState(() => {
    const movement = movementDialog.movement;
    const product = movement
      ? workspace.products.find((item) => item.id === movement.productId) || null
      : movementDialog.product ||
        workspace.products.find((item) => item.active) ||
        null;
    const editableType =
      movement &&
      movement.type !== "transfer_in" &&
      movement.type !== "transfer_out"
        ? movement.type
        : emptyForm.type;

    return {
      ...emptyForm,
      productId: product?.id || "",
      warehouseId:
        movement?.warehouseId ||
        workspace.warehouses.find((warehouse) => warehouse.isDefault)?.id ||
        workspace.warehouses[0]?.id ||
        "",
      type: editableType,
      quantity: movement ? String(movement.quantity) : emptyForm.quantity,
      unitCost: String(movement?.unitCost ?? product?.purchasePrice ?? 0),
      saleUnitPrice: String(
        movement?.saleUnitPrice ?? product?.salePrice ?? 0,
      ),
      note: movement?.note || "",
      reason: movement?.reason || "",
    };
  });
  const [error, setError] = useState("");

  const editingMovement = movementDialog.movement;
  const isEditing = Boolean(editingMovement);
  const product = workspace.products.find(
    (item) => item.id === form.productId,
  );
  const incoming = isIncomingMovement(form.type);
  const quantity = Number(form.quantity) || 0;
  const balanceMap = useMemo(
    () =>
      new Map(
        workspace.inventoryBalances.map((balance) => [
          `${balance.productId}:${balance.warehouseId}`,
          balance,
        ]),
      ),
    [workspace.inventoryBalances],
  );
  const warehouseMap = useMemo(
    () =>
      new Map(
        workspace.warehouses.map((warehouse) => [warehouse.id, warehouse]),
      ),
    [workspace.warehouses],
  );
  const selectedBalance = product
    ? balanceMap.get(`${product.id}:${form.warehouseId}`)
    : undefined;
  const baseStock =
    editingMovement?.stockBefore ?? selectedBalance?.currentStock ?? 0;
  const projectedStock = baseStock + (incoming ? quantity : -quantity);
  const shortfall = Math.max(0, quantity - baseStock);
  const needsStockHelp =
    !isEditing && !incoming && Boolean(product) && shortfall > 0;
  const selectedWarehouse = warehouseMap.get(form.warehouseId);
  const otherWarehouseAvailability = useMemo(() => {
    if (!product) return [];
    return workspace.warehouses
      .filter((warehouse) => warehouse.id !== form.warehouseId)
      .map((warehouse) => ({
        warehouse,
        stock:
          balanceMap.get(`${product.id}:${warehouse.id}`)?.currentStock ?? 0,
      }))
      .filter((availability) => availability.stock > 0)
      .toSorted((a, b) => b.stock - a.stock);
  }, [balanceMap, form.warehouseId, product, workspace.warehouses]);
  const substituteAvailability = useMemo(() => {
    if (!product) return [];

    return workspace.productSubstitutes.flatMap((relation) => {
      const substituteId =
        relation.productId === product.id
          ? relation.substituteProductId
          : relation.substituteProductId === product.id
            ? relation.productId
            : null;
      if (!substituteId) return [];
      const substitute = workspace.products.find(
        (item) =>
          item.id === substituteId &&
          item.active &&
          item.unit.trim().toLocaleLowerCase("es") ===
            product.unit.trim().toLocaleLowerCase("es"),
      );
      if (!substitute) return [];

      const availability = workspace.warehouses
        .map((warehouse) => ({
          warehouse,
          stock:
            balanceMap.get(`${substitute.id}:${warehouse.id}`)?.currentStock ??
            0,
        }))
        .filter((item) => item.stock > 0)
        .toSorted((a, b) => {
          const aFits = a.stock >= quantity ? 1 : 0;
          const bFits = b.stock >= quantity ? 1 : 0;
          if (aFits !== bFits) return bFits - aFits;
          if (a.warehouse.id === form.warehouseId) return -1;
          if (b.warehouse.id === form.warehouseId) return 1;
          return b.stock - a.stock;
        });
      const best = availability[0];
      if (!best) return [];
      return [{ relation, product: substitute, ...best }];
    });
  }, [
    balanceMap,
    form.warehouseId,
    product,
    quantity,
    workspace.productSubstitutes,
    workspace.products,
    workspace.warehouses,
  ]);
  const unitAmount =
    form.type === "sale"
      ? Number(form.saleUnitPrice) || 0
      : incoming
        ? Number(form.unitCost) || 0
        : editingMovement?.unitCost ??
          selectedBalance?.averageCost ??
          product?.averageCost ??
          0;

  const movementOptions = useMemo<
    Array<{ value: EditableMovementType; label: string }>
  >(
    () =>
      editingMovement?.type === "initial"
        ? [{ value: "initial", label: movementLabels.initial }]
        : [
            { value: "purchase", label: movementLabels.purchase },
            { value: "sale", label: movementLabels.sale },
            { value: "adjustment_in", label: movementLabels.adjustment_in },
            { value: "adjustment_out", label: movementLabels.adjustment_out },
            { value: "return_in", label: movementLabels.return_in },
            { value: "return_out", label: movementLabels.return_out },
          ],
    [editingMovement?.type],
  );
  const hasUnlistedReason =
    Boolean(form.reason) &&
    !workspace.movementReasons.some(
      (reason) =>
        reason.name.toLocaleLowerCase("es") ===
        form.reason.toLocaleLowerCase("es"),
    );

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectProduct(productId: string, warehouseId?: string) {
    const selected = workspace.products.find((item) => item.id === productId);
    setForm((current) => ({
      ...current,
      productId,
      warehouseId: warehouseId || current.warehouseId,
      unitCost: String(selected?.purchasePrice || 0),
      saleUnitPrice: String(selected?.salePrice || 0),
    }));
    setError("");
  }

  function selectWarehouse(warehouseId: string) {
    updateField("warehouseId", warehouseId);
    setError("");
  }

  async function moveStockHere(sourceWarehouseId: string, available: number) {
    if (!product || !selectedWarehouse || shortfall <= 0) return;
    const sourceWarehouse = warehouseMap.get(sourceWarehouseId);
    if (!sourceWarehouse) return;
    const quantityToMove = Math.min(shortfall, available);
    const confirmed = window.confirm(
      `¿Trasladar ${formatNumber(quantityToMove, locale)} ${product.unit} de “${product.name}” desde ${sourceWarehouse.name} hacia ${selectedWarehouse.name}?\n\nEl traslado se guardará de inmediato aunque después canceles este movimiento.`,
    );
    if (!confirmed) return;

    setError("");
    const result = await transferStock({
      productId: product.id,
      fromWarehouseId: sourceWarehouse.id,
      toWarehouseId: selectedWarehouse.id,
      quantity: quantityToMove,
      reason: "Reposición entre almacenes",
      note: "Traslado iniciado desde la asistencia de stock.",
    });
    if (!result.ok) setError(result.message);
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
        `Stock insuficiente. Hay ${formatNumber(baseStock)} ${product.unit} disponibles antes de este movimiento.`,
      );
      return;
    }

    const sharedValues = {
      type: form.type,
      quantity,
      unitCost: incoming ? Number(form.unitCost) : undefined,
      saleUnitPrice:
        form.type === "sale" ? Number(form.saleUnitPrice) : undefined,
      note: form.note || undefined,
      reason: form.reason || undefined,
    };

    const result = editingMovement
      ? await updateMovement({
          id: editingMovement.id,
          ...sharedValues,
        })
      : await recordMovement({
          productId: form.productId,
          warehouseId: form.warehouseId,
          ...sharedValues,
          type: sharedValues.type as MovementInput["type"],
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
      title={isEditing ? "Editar movimiento" : "Registrar movimiento"}
      description={
        isEditing
          ? "Al guardar, el stock, los costos y los importes posteriores se recalcularán automáticamente."
          : "Indica qué ocurrió. El stock y los costos se ajustarán automáticamente."
      }
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
                disabled={isEditing}
              >
                <option value="">Selecciona un producto</option>
                {workspace.products
                  .filter((item) => isEditing || item.active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatNumber(item.currentStock)} {item.unit}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field field-span-2">
              <span>Almacén</span>
              <select
                value={form.warehouseId}
                onChange={(event) => selectWarehouse(event.target.value)}
                required
                disabled={isEditing}
              >
                {workspace.warehouses.map((warehouse) => {
                  const warehouseStock = product
                    ? (balanceMap.get(`${product.id}:${warehouse.id}`)
                        ?.currentStock ?? 0)
                    : 0;
                  return (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                      {product
                        ? ` · ${formatNumber(warehouseStock, locale)} ${product.unit}`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <fieldset className="movement-operation-fieldset field-span-2">
              <legend>Operación</legend>
              <p>
                Elige qué pasó y el motivo que quedará en el historial.
              </p>
              <div className="movement-operation-grid">
                <label className="field">
                  <span>Tipo</span>
                  <select
                    value={form.type}
                    onChange={(event) =>
                      updateField(
                        "type",
                        event.target.value as EditableMovementType,
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
                  <span>Motivo</span>
                  <select
                    value={form.reason}
                    onChange={(event) =>
                      updateField("reason", event.target.value)
                    }
                  >
                    <option value="">Sin motivo</option>
                    {hasUnlistedReason ? (
                      <option value={form.reason}>
                        {form.reason} (histórico)
                      </option>
                    ) : null}
                    {workspace.movementReasons.map((reason) => (
                      <option key={reason.id} value={reason.name}>
                        {reason.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
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
                    editingMovement?.unitCost ??
                      selectedBalance?.averageCost ??
                      product?.averageCost ??
                      0,
                    currency,
                    locale,
                  )}
                </div>
              </div>
            )}
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

        {product && selectedWarehouse && !isEditing ? (
          <div className="stock-location-summary" aria-live="polite">
            <span className="stock-location-icon" aria-hidden="true">
              <StorefrontIcon size={19} weight="duotone" />
            </span>
            <span>
              <small>Disponible en {selectedWarehouse.name}</small>
              <strong>
                {formatNumber(baseStock, locale)} {product.unit}
              </strong>
            </span>
            <span className="stock-location-total">
              {formatNumber(product.currentStock, locale)} {product.unit} en
              toda la empresa
            </span>
          </div>
        ) : null}

        {needsStockHelp && product && selectedWarehouse ? (
          <section
            className="stock-assistant"
            aria-labelledby="stock-assistant-title"
          >
            <div className="stock-assistant-heading">
              <span aria-hidden="true">
                <InfoIcon size={20} weight="fill" />
              </span>
              <div>
                <strong id="stock-assistant-title">
                  Faltan {formatNumber(shortfall, locale)} {product.unit} en {" "}
                  {selectedWarehouse.name}
                </strong>
                <p>
                  Revisa primero el mismo producto en otros almacenes. Las
                  alternativas aparecen después y solo si fueron configuradas.
                </p>
              </div>
            </div>

            {otherWarehouseAvailability.length > 0 ? (
              <div className="stock-assistant-group">
                <div className="stock-assistant-group-title">
                  <StorefrontIcon size={17} weight="duotone" />
                  <strong>Mismo producto en otros almacenes</strong>
                </div>
                <div className="stock-assistant-list">
                  {otherWarehouseAvailability.map(({ warehouse, stock }) => (
                    <article key={warehouse.id} className="stock-assistant-row">
                      <div>
                        <strong>{warehouse.name}</strong>
                        <span>
                          {formatNumber(stock, locale)} {product.unit} disponibles
                        </span>
                      </div>
                      <div className="stock-assistant-actions">
                        {stock >= quantity ? (
                          <button
                            type="button"
                            className="button button-secondary stock-assistant-button"
                            onClick={() => selectWarehouse(warehouse.id)}
                            disabled={isMutating}
                            aria-label={`Usar ${warehouse.name} para este movimiento`}
                          >
                            Usar este almacén
                            <ArrowRightIcon size={15} weight="bold" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button button-secondary stock-assistant-button"
                          onClick={() => moveStockHere(warehouse.id, stock)}
                          disabled={isMutating}
                          aria-label={`Trasladar ${formatNumber(Math.min(shortfall, stock), locale)} ${product.unit} de ${warehouse.name} a ${selectedWarehouse.name}`}
                        >
                          <ArrowsLeftRightIcon size={15} weight="bold" />
                          Trasladar {formatNumber(Math.min(shortfall, stock), locale)}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {substituteAvailability.length > 0 ? (
              <div className="stock-assistant-group stock-assistant-substitutes">
                <div className="stock-assistant-group-title">
                  <PackageIcon size={17} weight="duotone" />
                  <strong>Sustitutos configurados</strong>
                </div>
                <div className="stock-assistant-list">
                  {substituteAvailability.map((alternative) => (
                    <article
                      key={alternative.relation.id}
                      className="stock-assistant-row"
                    >
                      <div>
                        <strong>{alternative.product.name}</strong>
                        <span>
                          {alternative.product.sku} · {alternative.warehouse.name}
                          {" · "}
                          {formatNumber(alternative.stock, locale)} {" "}
                          {alternative.product.unit}
                        </span>
                        {alternative.relation.note ? (
                          <small>{alternative.relation.note}</small>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="button button-secondary stock-assistant-button"
                        onClick={() =>
                          selectProduct(
                            alternative.product.id,
                            alternative.warehouse.id,
                          )
                        }
                        disabled={isMutating}
                        aria-label={`Usar ${alternative.product.name} de ${alternative.warehouse.name} como alternativa`}
                      >
                        Usar alternativa
                        <ArrowRightIcon size={15} weight="bold" />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {otherWarehouseAvailability.length === 0 &&
            substituteAvailability.length === 0 ? (
              <p className="stock-assistant-empty">
                No hay existencias en otros almacenes ni sustitutos configurados
                con stock. Registra una entrada o configura una alternativa.
              </p>
            ) : null}
          </section>
        ) : null}

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
            <span>
              {isEditing
                ? "Stock anterior"
                : `Stock en ${selectedWarehouse?.name || "el almacén"}`}
            </span>
            <strong>
              {formatNumber(baseStock, locale)}{" "}
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
            {isMutating
              ? isEditing
                ? "Recalculando..."
                : "Registrando..."
              : isEditing
                ? "Guardar y recalcular"
                : "Registrar movimiento"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
