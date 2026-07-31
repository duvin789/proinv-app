"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import {
  useDeferredValue,
  useMemo,
  useState,
} from "react";

import { useInventory } from "@/components/inventory-provider";
import { downloadCsv } from "@/lib/csv";
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
import type { InventoryMovement, MovementType } from "@/lib/types";

type MovementFilter =
  | "all"
  | "purchase"
  | "sale"
  | "adjustments"
  | "returns";

const pageSize = 12;

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
  const { workspace, openMovementDialog } = useInventory();
  const { movements, products, warehouses, organization } = workspace;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<MovementFilter>("all");
  const [page, setPage] = useState(1);
  const canOperate = workspace.viewer.role !== "viewer";

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const warehouseMap = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );

  const filteredMovements = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("es");
    return movements.filter((movement) => {
      const product = productMap.get(movement.productId);
      const matchesSearch =
        !normalizedQuery ||
        product?.name.toLocaleLowerCase("es").includes(normalizedQuery) ||
        product?.sku.toLocaleLowerCase("es").includes(normalizedQuery) ||
        movement.reference
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

  function exportMovements() {
    downloadCsv(
      `movimientos-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Fecha",
        "Producto",
        "SKU",
        "Tipo",
        "Cantidad",
        "Stock anterior",
        "Stock final",
        "Costo unitario",
        "Precio vendido",
        "Costo total",
        "Ingreso",
        "Ganancia bruta",
        "Referencia",
        "Nota",
      ],
      filteredMovements.map((movement) => {
        const product = productMap.get(movement.productId);
        return [
          movement.occurredAt,
          product?.name || "Producto eliminado",
          product?.sku || "",
          movementLabels[movement.type],
          movement.quantity,
          movement.stockBefore,
          movement.stockAfter,
          movement.unitCost,
          movement.saleUnitPrice || "",
          movement.totalCost,
          movement.revenue,
          movement.grossProfit,
          movement.reference || "",
          movement.note || "",
        ];
      }),
    );
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
            placeholder="Buscar producto, referencia o nota"
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
          Exportar
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
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Movimiento</th>
                    <th>Almacén</th>
                    <th>Referencia</th>
                    <th className="align-right">Cantidad</th>
                    <th className="align-right">Stock</th>
                    <th className="align-right">Importe</th>
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
                      productSku={
                        productMap.get(movement.productId)?.sku || "Sin SKU"
                      }
                      warehouseName={
                        warehouseMap.get(movement.warehouseId)?.name ||
                        "Sin almacén"
                      }
                      currency={organization.currency}
                      locale={organization.locale}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Mostrando {(safePage - 1) * pageSize + 1}-
                {Math.min(safePage * pageSize, filteredMovements.length)} de{" "}
                {filteredMovements.length}
              </span>
              <div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label="Página anterior"
                >
                  <CaretLeftIcon size={18} weight="bold" />
                </button>
                <span>
                  {safePage} / {pageCount}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                  disabled={safePage === pageCount}
                  aria-label="Página siguiente"
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
    </div>
  );
}

function MovementRow({
  movement,
  productName,
  productSku,
  warehouseName,
  currency,
  locale,
}: {
  movement: InventoryMovement;
  productName: string;
  productSku: string;
  warehouseName: string;
  currency: string;
  locale: string;
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
      <td>
        <div className="table-product compact-product">
          <span className="product-monogram" aria-hidden="true">
            {productName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{productName}</strong>
            <span>{productSku}</span>
          </div>
        </div>
      </td>
      <td data-label="Movimiento">
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
      </td>
      <td data-label="Almacén">{warehouseName}</td>
      <td data-label="Referencia">
        <div className="reference-cell">
          <strong>{movement.reference || "Sin referencia"}</strong>
          {movement.note ? <span>{movement.note}</span> : null}
        </div>
      </td>
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
    </tr>
  );
}
