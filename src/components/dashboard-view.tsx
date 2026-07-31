"use client";

import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ChartDonutIcon,
  CoinsIcon,
  PackageIcon,
  ShoppingCartIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo } from "react";

import { useInventory } from "@/components/inventory-provider";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  calculateWorkspaceMetrics,
  getStockStatus,
  isIncomingMovement,
  movementShortLabels,
} from "@/lib/inventory";

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function DashboardView() {
  const { workspace, openMovementDialog, openProductDialog } = useInventory();
  const { organization, products, categories, movements } = workspace;
  const canOperate = workspace.viewer.role !== "viewer";
  const metrics = useMemo(
    () => calculateWorkspaceMetrics(workspace),
    [workspace],
  );
  const activeProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const lowStockProducts = useMemo(
    () =>
      activeProducts
        .filter((product) => getStockStatus(product) !== "healthy")
        .toSorted((a, b) => a.currentStock - b.currentStock)
        .slice(0, 5),
    [activeProducts],
  );

  const categoryStats = useMemo(() => {
    const totals = new Map<
      string,
      { name: string; color: string; units: number; value: number }
    >();
    for (const category of categories) {
      totals.set(category.id, {
        name: category.name,
        color: category.color,
        units: 0,
        value: 0,
      });
    }
    for (const product of activeProducts) {
      const id = product.categoryId || "uncategorized";
      const current = totals.get(id) || {
        name: "Sin categoría",
        color: "#87958f",
        units: 0,
        value: 0,
      };
      current.units += product.currentStock;
      current.value += product.currentStock * product.averageCost;
      totals.set(id, current);
    }
    return Array.from(totals.values())
      .filter((item) => item.units > 0)
      .toSorted((a, b) => b.value - a.value);
  }, [activeProducts, categories]);

  const weeklyMovement = useMemo(() => {
    const newestMovementDate =
      movements.length > 0
        ? new Date(movements[0].occurredAt)
        : new Date();
    newestMovementDate.setHours(12, 0, 0, 0);
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(newestMovementDate);
      date.setDate(date.getDate() - (6 - index));
      return {
        key: dateKey(date),
        label: new Intl.DateTimeFormat(organization.locale, {
          weekday: "short",
        })
          .format(date)
          .replace(".", ""),
        entries: 0,
        exits: 0,
      };
    });
    const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const movement of movements) {
      const bucket = bucketMap.get(dateKey(new Date(movement.occurredAt)));
      if (!bucket) continue;
      if (isIncomingMovement(movement.type)) {
        bucket.entries += movement.quantity;
      } else {
        bucket.exits += movement.quantity;
      }
    }
    return buckets;
  }, [movements, organization.locale]);

  const maxWeeklyQuantity = Math.max(
    1,
    ...weeklyMovement.flatMap((day) => [day.entries, day.exits]),
  );
  const healthyCount = activeProducts.filter(
    (product) => getStockStatus(product) === "healthy",
  ).length;
  const healthPercent =
    activeProducts.length > 0
      ? Math.round((healthyCount / activeProducts.length) * 100)
      : 100;
  const maxCategoryValue = Math.max(
    1,
    ...categoryStats.map((category) => category.value),
  );

  return (
    <div className="page-stack">
      <section className="metric-band" aria-label="Indicadores principales">
        <div className="metric-primary">
          <div className="metric-icon">
            <CoinsIcon size={24} weight="duotone" />
          </div>
          <div>
            <span>Valor actual del inventario</span>
            <strong>
              {formatCurrency(
                metrics.inventoryValue,
                organization.currency,
                organization.locale,
              )}
            </strong>
            <small>
              Costo promedio por existencias disponibles
            </small>
          </div>
        </div>
        <div className="metric-cell">
          <span>Productos activos</span>
          <strong>{formatNumber(metrics.productCount)}</strong>
          <small>{formatNumber(metrics.units)} unidades en stock</small>
        </div>
        <div className="metric-cell">
          <span>Venta potencial</span>
          <strong>
            {formatCompactCurrency(
              metrics.potentialRevenue,
              organization.currency,
              organization.locale,
            )}
          </strong>
          <small>Al precio registrado actualmente</small>
        </div>
        <div className="metric-cell metric-alert-cell">
          <span>Requieren atención</span>
          <strong>{metrics.lowStock + metrics.outOfStock}</strong>
          <small>
            {metrics.outOfStock} agotados, {metrics.lowStock} con stock bajo
          </small>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-primary">
        <article className="panel movement-chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Ritmo de inventario</h2>
              <p>Unidades que entraron y salieron durante los últimos 7 días con actividad.</p>
            </div>
            <div className="chart-legend" aria-label="Leyenda">
              <span>
                <i className="legend-in" /> Entradas
              </span>
              <span>
                <i className="legend-out" /> Salidas
              </span>
            </div>
          </div>
          <div className="bar-chart" aria-label="Gráfico de entradas y salidas">
            {weeklyMovement.map((day) => (
              <div className="bar-chart-column" key={day.key}>
                <div className="bar-chart-bars">
                  <div
                    className="bar bar-in"
                    style={{
                      height: `${Math.max(4, (day.entries / maxWeeklyQuantity) * 100)}%`,
                    }}
                    title={`${formatNumber(day.entries)} entradas`}
                  />
                  <div
                    className="bar bar-out"
                    style={{
                      height: `${Math.max(4, (day.exits / maxWeeklyQuantity) * 100)}%`,
                    }}
                    title={`${formatNumber(day.exits)} salidas`}
                  />
                </div>
                <span>{day.label}</span>
              </div>
            ))}
          </div>
          <div className="chart-summary">
            <div>
              <span>Ventas registradas</span>
              <strong>
                {formatCurrency(
                  metrics.salesRevenue,
                  organization.currency,
                  organization.locale,
                )}
              </strong>
            </div>
            <div>
              <span>Ganancia bruta realizada</span>
              <strong>
                {formatCurrency(
                  metrics.realizedProfit,
                  organization.currency,
                  organization.locale,
                )}
              </strong>
            </div>
            <Link href="/reportes" className="text-link">
              Ver reporte
              <ArrowRightIcon size={16} weight="bold" />
            </Link>
          </div>
        </article>

        <article className="panel stock-health-panel">
          <div className="panel-heading">
            <div>
              <h2>Salud del stock</h2>
              <p>Productos por encima de su nivel mínimo.</p>
            </div>
            <ChartDonutIcon size={22} weight="duotone" />
          </div>
          <div className="health-visual">
            <div
              className="health-ring"
              style={{ "--health": `${healthPercent * 3.6}deg` } as React.CSSProperties}
              role="img"
              aria-label={`${healthPercent}% del catálogo con stock saludable`}
            >
              <div>
                <strong>{healthPercent}%</strong>
                <span>saludable</span>
              </div>
            </div>
            <div className="health-breakdown">
              <div>
                <span>En nivel normal</span>
                <strong>{healthyCount}</strong>
              </div>
              <div>
                <span>Stock bajo</span>
                <strong>{metrics.lowStock}</strong>
              </div>
              <div>
                <span>Agotados</span>
                <strong>{metrics.outOfStock}</strong>
              </div>
            </div>
          </div>
          <button
            className="button button-secondary button-full"
            type="button"
            onClick={() => openMovementDialog()}
            disabled={!canOperate}
          >
            Registrar reposición
          </button>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <article className="panel alerts-panel">
          <div className="panel-heading">
            <div>
              <h2>Alertas de reposición</h2>
              <p>Prioridad calculada por stock actual y mínimo.</p>
            </div>
            <WarningIcon size={22} weight="duotone" />
          </div>
          {lowStockProducts.length > 0 ? (
            <div className="alert-list">
              {lowStockProducts.map((product) => {
                const status = getStockStatus(product);
                return (
                  <button
                    type="button"
                    className="alert-row"
                    key={product.id}
                    onClick={() => openMovementDialog(product)}
                    disabled={!canOperate}
                  >
                    <span
                      className={`product-monogram status-${status}`}
                      aria-hidden="true"
                    >
                      {product.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="alert-row-name">
                      <strong>{product.name}</strong>
                      <small>
                        {categoryMap.get(product.categoryId || "")?.name ||
                          "Sin categoría"}
                      </small>
                    </span>
                    <span className="alert-row-stock">
                      <strong>
                        {formatNumber(product.currentStock)} {product.unit}
                      </strong>
                      <small>Mínimo {formatNumber(product.minStock)}</small>
                    </span>
                    <ArrowRightIcon size={17} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact-empty">
              <PackageIcon size={30} weight="duotone" />
              <strong>Todo el stock está en orden</strong>
              <p>No hay productos por debajo del mínimo configurado.</p>
            </div>
          )}
        </article>

        <article className="panel category-panel">
          <div className="panel-heading">
            <div>
              <h2>Valor por categoría</h2>
              <p>Distribución del capital almacenado.</p>
            </div>
          </div>
          <div className="category-bars">
            {categoryStats.slice(0, 5).map((category) => (
              <div className="category-bar-row" key={category.name}>
                <div className="category-bar-label">
                  <span
                    className="category-swatch"
                    style={{ backgroundColor: category.color }}
                  />
                  <span>{category.name}</span>
                  <strong>
                    {formatCompactCurrency(
                      category.value,
                      organization.currency,
                      organization.locale,
                    )}
                  </strong>
                </div>
                <div className="category-bar-track">
                  <div
                    className="category-bar-fill"
                    style={{
                      width: `${Math.max(5, (category.value / maxCategoryValue) * 100)}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="category-footer">
            <span>Ganancia potencial total</span>
            <strong>
              {formatCurrency(
                metrics.projectedProfit,
                organization.currency,
                organization.locale,
              )}
            </strong>
            <small>
              {formatPercent(
                metrics.potentialRevenue > 0
                  ? (metrics.projectedProfit / metrics.potentialRevenue) * 100
                  : 0,
                organization.locale,
              )}{" "}
              sobre la venta proyectada
            </small>
          </div>
        </article>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading recent-heading">
          <div>
            <h2>Movimientos recientes</h2>
            <p>Últimas operaciones registradas en todos los productos.</p>
          </div>
          <Link href="/movimientos" className="button button-secondary">
            Ver historial
          </Link>
        </div>
        {movements.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th className="align-right">Cantidad</th>
                  <th className="align-right">Stock final</th>
                  <th className="align-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 6).map((movement) => {
                  const product = products.find(
                    (item) => item.id === movement.productId,
                  );
                  const incoming = isIncomingMovement(movement.type);
                  const amount =
                    movement.type === "sale"
                      ? movement.revenue
                      : movement.totalCost;
                  return (
                    <tr key={movement.id}>
                      <td>
                        <div className="table-product">
                          <span className="product-monogram" aria-hidden="true">
                            {(product?.name || "PR")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div>
                            <strong>{product?.name || "Producto eliminado"}</strong>
                            <span>
                              {movement.reason ||
                                movement.note ||
                                "Sin motivo registrado"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
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
                      <td>
                        {formatDate(
                          movement.occurredAt,
                          organization.locale,
                          true,
                        )}
                      </td>
                      <td className="align-right table-number">
                        {incoming ? "+" : "-"}
                        {formatNumber(movement.quantity, organization.locale)}
                      </td>
                      <td className="align-right table-number">
                        {formatNumber(
                          movement.stockAfter,
                          organization.locale,
                        )}
                      </td>
                      <td className="align-right table-number">
                        {formatCurrency(
                          amount,
                          organization.currency,
                          organization.locale,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <ShoppingCartIcon size={36} weight="duotone" />
            <strong>Aún no hay movimientos</strong>
            <p>Crea un producto o registra una compra para comenzar.</p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => openProductDialog()}
              disabled={!canOperate}
            >
              Crear producto
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
