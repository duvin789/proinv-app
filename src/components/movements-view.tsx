"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useInventory } from "@/components/inventory-provider";
import { Modal } from "@/components/ui/modal";
import {
  buildMovementWorkbookRows,
  downloadTableWorkbook,
  movementWorkbookHeaders,
} from "@/lib/excel";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/format";
import {
  isIncomingMovement,
  movementLabels,
  movementShortLabels,
} from "@/lib/inventory";
import {
  defaultPreferences,
  movementPageSizeOptions,
  preferencesChangedEvent,
  readPreferences,
  savePreferences,
  type AppPreferences,
  type MovementPageSize,
} from "@/lib/preferences";
import type { InventoryMovement, MovementType } from "@/lib/types";

type MovementFilter =
  | "all"
  | "purchase"
  | "sale"
  | "adjustments"
  | "returns";

function matchesType(type: MovementType, filter: MovementFilter) {
  if (filter === "all") return true;
  if (filter === "adjustments") {
    return type === "adjustment_in" || type === "adjustment_out";
  }
  if (filter === "returns") {
    return type === "return_in" || type === "return_out";
  }
  return type === filter;
}

export function MovementsView() {
  const {
    workspace,
    isMutating,
    openMovementDialog,
    openMovementEditDialog,
    deleteMovement,
  } = useInventory();
  const { movements, products, warehouses, organization } = workspace;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<MovementFilter>("all");
  const [page, setPage] = useState(1);
  const [preferences, setPreferences] = useState<AppPreferences>(() => ({
    ...defaultPreferences,
  }));
  const [detailMovementId, setDetailMovementId] = useState<string | null>(null);
  const [deletingMovementId, setDeletingMovementId] = useState<string | null>(
    null,
  );
  const canOperate = workspace.viewer.role !== "viewer";
  const canManage =
    workspace.viewer.role === "owner" || workspace.viewer.role === "admin";
  const pageSize = preferences.movementsPageSize;

  useEffect(() => {
    const syncPreferences = () => setPreferences(readPreferences());
    const frame = window.requestAnimationFrame(syncPreferences);
    window.addEventListener(preferencesChangedEvent, syncPreferences);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(preferencesChangedEvent, syncPreferences);
    };
  }, []);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const warehouseMap = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );
  const productsWithTransfers = useMemo(
    () =>
      new Set(
        movements
          .filter(
            (movement) =>
              movement.type === "transfer_in" ||
              movement.type === "transfer_out",
          )
          .map((movement) => movement.productId),
      ),
    [movements],
  );
  const detailMovement = detailMovementId
    ? movements.find((movement) => movement.id === detailMovementId) || null
    : null;

  const filteredMovements = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("es");
    return movements.filter((movement) => {
      const product = productMap.get(movement.productId);
      const matchesSearch =
        !normalizedQuery ||
        product?.name.toLocaleLowerCase("es").includes(normalizedQuery) ||
        movement.reason
          ?.toLocaleLowerCase("es")
          .includes(normalizedQuery) ||
        movement.note?.toLocaleLowerCase("es").includes(normalizedQuery);
      return matchesSearch && matchesType(movement.type, filter);
    });
  }, [deferredQuery, filter, movements, productMap]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredMovements.length / pageSize),
  );
  const safePage = Math.min(page, pageCount);
  const paginatedMovements = filteredMovements.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const totals = useMemo(() => {
    return movements.reduce(
      (result, movement) => {
        if (isIncomingMovement(movement.type)) {
          result.incomingUnits += movement.quantity;
        } else {
          result.outgoingUnits += movement.quantity;
        }
        if (movement.type === "purchase") {
          result.purchases += movement.totalCost;
        }
        if (movement.type === "sale") {
          result.sales += movement.revenue;
          result.profit += movement.grossProfit;
        }
        return result;
      },
      {
        incomingUnits: 0,
        outgoingUnits: 0,
        purchases: 0,
        sales: 0,
        profit: 0,
      },
    );
  }, [movements]);

  function changePageSize(nextPageSize: MovementPageSize) {
    setPage(1);
    savePreferences({
      ...readPreferences(),
      movementsPageSize: nextPageSize,
    });
  }

  async function exportMovements() {
    await downloadTableWorkbook(
      `movimientos-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Movimientos",
      [...movementWorkbookHeaders],
      buildMovementWorkbookRows(
        filteredMovements,
        products,
        warehouses,
      ),
    );
  }

  function editMovement(movement: InventoryMovement) {
    setDetailMovementId(null);
    openMovementEditDialog(movement);
  }

  async function removeMovement(movement: InventoryMovement) {
    const productName =
      productMap.get(movement.productId)?.name || "Producto eliminado";
    const confirmed = window.confirm(
      `¿Eliminar el movimiento de ${productName}? El stock, los costos y los movimientos posteriores se recalcularán automáticamente.`,
    );
    if (!confirmed) return;

    setDeletingMovementId(movement.id);
    try {
      const result = await deleteMovement(movement.id);
      if (result.ok) setDetailMovementId(null);
    } finally {
      setDeletingMovementId(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="mini-metrics movement-mini-metrics">
        <div>
          <span className="mini-metric-icon metric-incoming">
            <ArrowUpIcon size={18} weight="bold" />
          </span>
          <span>
            Unidades recibidas
            <strong>{formatNumber(totals.incomingUnits)}</strong>
          </span>
        </div>
        <div>
          <span className="mini-metric-icon metric-outgoing">
            <ArrowDownIcon size={18} weight="bold" />
          </span>
          <span>
            Unidades despachadas
            <strong>{formatNumber(totals.outgoingUnits)}</strong>
          </span>
        </div>
        <div>
          <span>
            Compras registradas
            <strong>
              {formatCurrency(
                totals.purchases,
                organization.currency,
                organization.locale,
              )}
            </strong>
          </span>
        </div>
        <div>
          <span>
            Ventas registradas
            <strong>
              {formatCurrency(
                totals.sales,
                organization.currency,
                organization.locale,
              )}
            </strong>
          </span>
        </div>
        <div>
          <span>
            Ganancia bruta
            <strong>
              {formatCurrency(
                totals.profit,
                organization.currency,
                organization.locale,
              )}
            </strong>
          </span>
        </div>
      </section>

      <section className="page-toolbar">
        <div className="search-field">
          <MagnifyingGlassIcon size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar producto, motivo u observación"
            aria-label="Buscar movimientos"
          />
        </div>
        <select
          className="toolbar-select"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as MovementFilter);
            setPage(1);
          }}
          aria-label="Filtrar movimientos"
        >
          <option value="all">Todos los movimientos</option>
          <option value="purchase">Compras</option>
          <option value="sale">Ventas</option>
          <option value="adjustments">Ajustes</option>
          <option value="returns">Devoluciones</option>
        </select>
        <button
          type="button"
          className="button button-secondary"
          onClick={exportMovements}
          disabled={filteredMovements.length === 0}
        >
          <DownloadSimpleIcon size={18} weight="bold" />
          Exportar Excel
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => openMovementDialog()}
          disabled={!canOperate}
          title={!canOperate ? "Tu rol es de solo consulta" : undefined}
        >
          <PlusIcon size={18} weight="bold" />
          Registrar
        </button>
      </section>

      <section className="panel table-panel">
        <div className="table-panel-heading">
          <div>
            <h2>Historial operativo</h2>
            <p>
              {filteredMovements.length}{" "}
              {filteredMovements.length === 1 ? "movimiento" : "movimientos"}
            </p>
          </div>
        </div>

        {paginatedMovements.length > 0 ? (
          <>
            <div className="data-table-wrap movements-table-wrap">
              <table className="data-table movements-table">
                <caption className="sr-only">
                  Historial de movimientos de inventario
                </caption>
                <thead className="movements-table-head">
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Operación y motivo</th>
                    <th scope="col">Almacén</th>
                    <th scope="col" className="align-right">Cantidad</th>
                    <th scope="col" className="align-right">Stock</th>
                    <th scope="col" className="align-right">Importe</th>
                    <th scope="col" className="align-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMovements.map((movement) => (
                    <MovementRow
                      key={movement.id}
                      movement={movement}
                      productName={
                        productMap.get(movement.productId)?.name ||
                        "Producto eliminado"
                      }
                      productUnit={
                        productMap.get(movement.productId)?.unit ||
                        "Sin unidad"
                      }
                      warehouseName={
                        warehouseMap.get(movement.warehouseId)?.name ||
                        "Sin almacén"
                      }
                      currency={organization.currency}
                      locale={organization.locale}
                      canManage={canManage}
                      isProtected={productsWithTransfers.has(
                        movement.productId,
                      )}
                      isMutating={isMutating}
                      isDeleting={deletingMovementId === movement.id}
                      onView={() => setDetailMovementId(movement.id)}
                      onEdit={() => editMovement(movement)}
                      onDelete={() => removeMovement(movement)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <div className="pagination-meta">
                <span>
                  Mostrando {(safePage - 1) * pageSize + 1}-
                  {Math.min(safePage * pageSize, filteredMovements.length)} de{" "}
                  {filteredMovements.length}
                </span>
                <label className="pagination-size-control">
                  <span>Por página</span>
                  <select
                    value={pageSize}
                    onChange={(event) =>
                      changePageSize(
                        Number(event.target.value) as MovementPageSize,
                      )
                    }
                    aria-label="Movimientos por página"
                  >
                    {movementPageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label="Página anterior"
                  title="Página anterior"
                >
                  <CaretLeftIcon size={18} weight="bold" />
                </button>
                <span className="pagination-page-indicator">
                  {safePage} / {pageCount}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                  disabled={safePage === pageCount}
                  aria-label="Página siguiente"
                  title="Página siguiente"
                >
                  <CaretRightIcon size={18} weight="bold" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <ArrowsDownUpIcon size={40} weight="duotone" />
            <strong>No hay movimientos para mostrar</strong>
            <p>Cambia los filtros o registra una nueva operación.</p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => openMovementDialog()}
              disabled={!canOperate}
            >
              Registrar movimiento
            </button>
          </div>
        )}
      </section>

      {detailMovement ? (
        <MovementDetailsModal
          movement={detailMovement}
          productName={
            productMap.get(detailMovement.productId)?.name ||
            "Producto eliminado"
          }
          productUnit={
            productMap.get(detailMovement.productId)?.unit || "Sin unidad"
          }
          warehouseName={
            warehouseMap.get(detailMovement.warehouseId)?.name ||
            "Sin almacén"
          }
          currency={organization.currency}
          locale={organization.locale}
          canManage={canManage}
          isProtected={productsWithTransfers.has(detailMovement.productId)}
          isMutating={isMutating}
          isDeleting={deletingMovementId === detailMovement.id}
          onClose={() => setDetailMovementId(null)}
          onEdit={() => editMovement(detailMovement)}
          onDelete={() => removeMovement(detailMovement)}
        />
      ) : null}
    </div>
  );
}

function MovementRow({
  movement,
  productName,
  productUnit,
  warehouseName,
  currency,
  locale,
  canManage,
  isProtected,
  isMutating,
  isDeleting,
  onView,
  onEdit,
  onDelete,
}: {
  movement: InventoryMovement;
  productName: string;
  productUnit: string;
  warehouseName: string;
  currency: string;
  locale: string;
  canManage: boolean;
  isProtected: boolean;
  isMutating: boolean;
  isDeleting: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const incoming = isIncomingMovement(movement.type);
  const amount =
    movement.type === "sale" ? movement.revenue : movement.totalCost;

  return (
    <tr>
      <td data-label="Fecha">
        <div className="table-date">
          <strong>{formatDate(movement.occurredAt, locale)}</strong>
          <span>
            {new Intl.DateTimeFormat(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(movement.occurredAt))}
          </span>
        </div>
      </td>
      <td data-label="Producto">
        <div className="table-product compact-product">
          <span className="product-monogram" aria-hidden="true">
            {productName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{productName}</strong>
            <span>{productUnit}</span>
          </div>
        </div>
      </td>
      <td data-label="Operación y motivo">
        <div className="movement-operation-cell">
          <span
            className={`movement-badge ${incoming ? "movement-in" : "movement-out"}`}
          >
            {incoming ? (
              <ArrowUpIcon size={14} weight="bold" />
            ) : (
              <ArrowDownIcon size={14} weight="bold" />
            )}
            {movementShortLabels[movement.type]}
          </span>
          <div className="reason-cell">
            <strong>{movement.reason || "Sin motivo"}</strong>
            {movement.note ? <span>{movement.note}</span> : null}
          </div>
        </div>
      </td>
      <td data-label="Almacén">{warehouseName}</td>
      <td className="align-right table-number" data-label="Cantidad">
        {incoming ? "+" : "-"}
        {formatNumber(movement.quantity, locale)}
      </td>
      <td className="align-right table-number" data-label="Stock final">
        {formatNumber(movement.stockAfter, locale)}
      </td>
      <td className="align-right table-number" data-label="Importe">
        <strong>{formatCurrency(amount, currency, locale)}</strong>
        {movement.type === "sale" ? (
          <span className="profit-caption">
            +{formatCurrency(movement.grossProfit, currency, locale)}
          </span>
        ) : null}
      </td>
      <td className="align-right" data-label="Acciones">
        <div className="table-actions movement-row-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onView}
            aria-label={`Ver movimiento de ${productName}`}
            title="Ver detalle"
          >
            <EyeIcon size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onEdit}
            disabled={!canManage || isProtected || isMutating}
            aria-label={`Editar movimiento de ${productName}`}
            title={
              !canManage
                ? "Solo administradores"
                : isProtected
                  ? "Protegido por traslados entre almacenes"
                  : "Editar y recalcular"
            }
          >
            <PencilSimpleIcon size={17} />
          </button>
          <button
            type="button"
            className="icon-button danger-icon-button"
            onClick={onDelete}
            disabled={!canManage || isProtected || isMutating}
            aria-label={`Eliminar movimiento de ${productName}`}
            title={
              !canManage
                ? "Solo administradores"
                : isProtected
                  ? "Protegido por traslados entre almacenes"
                  : "Eliminar y recalcular"
            }
            aria-busy={isDeleting}
          >
            <TrashIcon size={17} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MovementDetailsModal({
  movement,
  productName,
  productUnit,
  warehouseName,
  currency,
  locale,
  canManage,
  isProtected,
  isMutating,
  isDeleting,
  onClose,
  onEdit,
  onDelete,
}: {
  movement: InventoryMovement;
  productName: string;
  productUnit: string;
  warehouseName: string;
  currency: string;
  locale: string;
  canManage: boolean;
  isProtected: boolean;
  isMutating: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const incoming = isIncomingMovement(movement.type);
  const occurredAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(movement.occurredAt));

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalle del movimiento"
      description={occurredAt}
      size="md"
    >
      <div className="movement-detail-body">
        <div className="movement-detail-heading">
          <span className="product-monogram" aria-hidden="true">
            {productName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{productName}</strong>
            <span>{warehouseName}</span>
          </div>
          <span
            className={`movement-badge ${incoming ? "movement-in" : "movement-out"}`}
          >
            {incoming ? (
              <ArrowUpIcon size={14} weight="bold" />
            ) : (
              <ArrowDownIcon size={14} weight="bold" />
            )}
            {movementLabels[movement.type]}
          </span>
        </div>

        <dl className="movement-detail-grid">
          <div>
            <dt>Cantidad</dt>
            <dd>
              {incoming ? "+" : "-"}
              {formatNumber(movement.quantity, locale)} {productUnit}
            </dd>
          </div>
          <div>
            <dt>Recorrido del stock</dt>
            <dd>
              {formatNumber(movement.stockBefore, locale)} →{" "}
              {formatNumber(movement.stockAfter, locale)} {productUnit}
            </dd>
          </div>
          <div>
            <dt>Costo unitario</dt>
            <dd>
              {formatCurrency(movement.unitCost, currency, locale)}
            </dd>
          </div>
          <div>
            <dt>Costo total</dt>
            <dd>
              {formatCurrency(movement.totalCost, currency, locale)}
            </dd>
          </div>
          {movement.type === "sale" ? (
            <>
              <div>
                <dt>Precio vendido</dt>
                <dd>
                  {formatCurrency(
                    movement.saleUnitPrice || 0,
                    currency,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>Ingreso</dt>
                <dd>{formatCurrency(movement.revenue, currency, locale)}</dd>
              </div>
              <div>
                <dt>Ganancia bruta</dt>
                <dd className="movement-detail-profit">
                  {formatCurrency(movement.grossProfit, currency, locale)}
                </dd>
              </div>
            </>
          ) : null}
          <div>
            <dt>Motivo</dt>
            <dd>{movement.reason || "Sin motivo"}</dd>
          </div>
        </dl>

        <div className="movement-detail-note">
          <span>Observación</span>
          <p>{movement.note || "Sin observaciones adicionales."}</p>
        </div>

        {isProtected ? (
          <p className="movement-protected-note">
            Este producto tiene traslados entre almacenes. La edición y la
            eliminación están protegidas para conservar su trazabilidad.
          </p>
        ) : null}
      </div>

      <footer className="modal-footer">
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
        >
          Cerrar
        </button>
        {canManage ? (
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={onEdit}
              disabled={isProtected || isMutating}
            >
              <PencilSimpleIcon size={17} />
              Editar
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={onDelete}
              disabled={isProtected || isMutating}
            >
              <TrashIcon size={17} />
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </button>
          </>
        ) : null}
      </footer>
    </Modal>
  );
}
