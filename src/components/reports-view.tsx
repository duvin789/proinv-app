"use client";

import {
  ArrowRightIcon,
  ChartLineUpIcon,
  CoinsIcon,
  DownloadSimpleIcon,
  PackageIcon,
  ReceiptIcon,
  TrendUpIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import { useInventory } from "@/components/inventory-provider";
import { downloadCsv } from "@/lib/csv";
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  calculateWorkspaceMetrics,
  getStockStatus,
  productMargin,
} from "@/lib/inventory";

export function ReportsView() {
  const { workspace, openMovementDialog } = useInventory();
  const { products, categories, suppliers, movements, organization } =
    workspace;
  const canOperate = workspace.viewer.role !== "viewer";
  const activeProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  );
  const metrics = useMemo(
    () => calculateWorkspaceMetrics(workspace),
    [workspace],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );

  const categoryStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        id: string;
        name: string;
        color: string;
        products: number;
        units: number;
        costValue: number;
        saleValue: number;
      }
    >();
    for (const product of activeProducts) {
      const category = categoryMap.get(product.categoryId || "");
      const id = category?.id || "uncategorized";
      const current = stats.get(id) || {
        id,
        name: category?.name || "Sin categoría",
        color: category?.color || "#87958f",
        products: 0,
        units: 0,
        costValue: 0,
        saleValue: 0,
      };
      current.products += 1;
      current.units += product.currentStock;
      current.costValue += product.currentStock * product.averageCost;
      current.saleValue += product.currentStock * product.salePrice;
      stats.set(id, current);
    }
    return Array.from(stats.values()).toSorted(
      (a, b) => b.costValue - a.costValue,
    );
  }, [activeProducts, categoryMap]);

  const productSales = useMemo(() => {
    const stats = new Map<
      string,
      { quantity: number; revenue: number; profit: number }
    >();
    for (const movement of movements) {
      if (movement.type !== "sale") continue;
      const current = stats.get(movement.productId) || {
        quantity: 0,
        revenue: 0,
        profit: 0,
      };
      current.quantity += movement.quantity;
      current.revenue += movement.revenue;
      current.profit += movement.grossProfit;
      stats.set(movement.productId, current);
    }
    return activeProducts
      .map((product) => ({
        product,
        ...(stats.get(product.id) || {
          quantity: 0,
          revenue: 0,
          profit: 0,
        }),
      }))
      .filter((item) => item.quantity > 0)
      .toSorted((a, b) => b.profit - a.profit);
  }, [activeProducts, movements]);

  const replenishment = useMemo(() => {
    return activeProducts
      .filter((product) => getStockStatus(product) !== "healthy")
      .map((product) => {
        const suggestedQuantity = Math.max(
          product.minStock * 2 - product.currentStock,
          product.minStock - product.currentStock,
          0,
        );
        return {
          product,
          suggestedQuantity,
          estimatedCost: suggestedQuantity * product.purchasePrice,
        };
      })
      .toSorted((a, b) => b.estimatedCost - a.estimatedCost);
  }, [activeProducts]);

  const replenishmentCost = replenishment.reduce(
    (sum, item) => sum + item.estimatedCost,
    0,
  );
  const taxRate = organization.taxRate;
  const includedTax =
    taxRate > 0
      ? metrics.salesRevenue -
        metrics.salesRevenue / (1 + taxRate / 100)
      : 0;
  const realizedMargin =
    metrics.salesRevenue > 0
      ? (metrics.realizedProfit / metrics.salesRevenue) * 100
      : 0;
  const maxCategoryValue = Math.max(
    1,
    ...categoryStats.map((item) => item.costValue),
  );

  function exportFullReport() {
    downloadCsv(
      `reporte-inventario-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Producto",
        "Proveedor",
        "Categoría",
        "Stock",
        "Stock mínimo",
        "Costo promedio",
        "Precio de venta",
        "Valor a costo",
        "Venta potencial",
        "Ganancia potencial",
        "Margen bruto %",
        "Estado",
      ],
      activeProducts.map((product) => [
        product.name,
        supplierMap.get(product.supplierId || "")?.name || "Sin proveedor",
        categoryMap.get(product.categoryId || "")?.name || "Sin categoría",
        product.currentStock,
        product.minStock,
        product.averageCost,
        product.salePrice,
        (product.currentStock * product.averageCost).toFixed(2),
        (product.currentStock * product.salePrice).toFixed(2),
        (
          product.currentStock *
          (product.salePrice - product.averageCost)
        ).toFixed(2),
        productMargin(product).toFixed(2),
        getStockStatus(product),
      ]),
    );
  }

  return (
    <div className="page-stack">
      <section className="report-hero">
        <div className="report-hero-copy">
          <span>Valor contable actual</span>
          <strong>
            {formatCurrency(
              metrics.inventoryValue,
              organization.currency,
              organization.locale,
            )}
          </strong>
          <p>
            Si vendieras todo al precio registrado, la ganancia bruta potencial
            sería{" "}
            <b>
              {formatCurrency(
                metrics.projectedProfit,
                organization.currency,
                organization.locale,
              )}
            </b>
            .
          </p>
        </div>
        <div className="report-hero-formula">
          <div>
            <span>Venta potencial</span>
            <strong>
              {formatCompactCurrency(
                metrics.potentialRevenue,
                organization.currency,
                organization.locale,
              )}
            </strong>
          </div>
          <ArrowRightIcon size={22} weight="bold" />
          <div>
            <span>Menos costo</span>
            <strong>
              {formatCompactCurrency(
                metrics.inventoryValue,
                organization.currency,
                organization.locale,
              )}
            </strong>
          </div>
          <ArrowRightIcon size={22} weight="bold" />
          <div className="formula-result">
            <span>Ganancia</span>
            <strong>
              {formatCompactCurrency(
                metrics.projectedProfit,
                organization.currency,
                organization.locale,
              )}
            </strong>
          </div>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={exportFullReport}
        >
          <DownloadSimpleIcon size={18} weight="bold" />
          Descargar inventario
        </button>
      </section>

      <section className="report-kpis">
        <article>
          <span className="report-kpi-icon">
            <TrendUpIcon size={22} weight="duotone" />
          </span>
          <div>
            <span>Ganancia realizada</span>
            <strong>
              {formatCurrency(
                metrics.realizedProfit,
                organization.currency,
                organization.locale,
              )}
            </strong>
            <small>{formatPercent(realizedMargin)} de margen en ventas</small>
          </div>
        </article>
        <article>
          <span className="report-kpi-icon">
            <ReceiptIcon size={22} weight="duotone" />
          </span>
          <div>
            <span>Impuesto incluido estimado</span>
            <strong>
              {formatCurrency(
                includedTax,
                organization.currency,
                organization.locale,
              )}
            </strong>
            <small>Tasa configurada: {formatPercent(taxRate)}</small>
          </div>
        </article>
        <article>
          <span className="report-kpi-icon">
            <WarningIcon size={22} weight="duotone" />
          </span>
          <div>
            <span>Reposición sugerida</span>
            <strong>
              {formatCurrency(
                replenishmentCost,
                organization.currency,
                organization.locale,
              )}
            </strong>
            <small>{replenishment.length} productos requieren compra</small>
          </div>
        </article>
        <article>
          <span className="report-kpi-icon">
            <PackageIcon size={22} weight="duotone" />
          </span>
          <div>
            <span>Unidades disponibles</span>
            <strong>{formatNumber(metrics.units)}</strong>
            <small>En {metrics.productCount} productos activos</small>
          </div>
        </article>
      </section>

      <section className="reports-grid">
        <article className="panel category-report-panel">
          <div className="panel-heading">
            <div>
              <h2>Valorización por categoría</h2>
              <p>Costo almacenado y venta potencial por familia.</p>
            </div>
            <CoinsIcon size={22} weight="duotone" />
          </div>
          <div className="report-category-list">
            {categoryStats.map((category) => (
              <div key={category.id} className="report-category-row">
                <div className="report-category-heading">
                  <span
                    className="category-swatch"
                    style={{ backgroundColor: category.color }}
                  />
                  <div>
                    <strong>{category.name}</strong>
                    <span>
                      {category.products} productos,{" "}
                      {formatNumber(category.units)} unidades
                    </span>
                  </div>
                  <strong>
                    {formatCurrency(
                      category.costValue,
                      organization.currency,
                      organization.locale,
                    )}
                  </strong>
                </div>
                <div className="category-bar-track">
                  <div
                    className="category-bar-fill"
                    style={{
                      width: `${Math.max(4, (category.costValue / maxCategoryValue) * 100)}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </div>
                <div className="report-category-caption">
                  <span>Venta potencial</span>
                  <strong>
                    {formatCurrency(
                      category.saleValue,
                      organization.currency,
                      organization.locale,
                    )}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel profitability-panel">
          <div className="panel-heading">
            <div>
              <h2>Rentabilidad realizada</h2>
              <p>Productos que ya generaron ganancia en el historial visible.</p>
            </div>
            <ChartLineUpIcon size={22} weight="duotone" />
          </div>
          {productSales.length > 0 ? (
            <div className="profit-list">
              {productSales.slice(0, 7).map((item, index) => (
                <div className="profit-row" key={item.product.id}>
                  <span className="profit-rank">{index + 1}</span>
                  <div>
                    <strong>{item.product.name}</strong>
                    <span>
                      {formatNumber(item.quantity)} {item.product.unit} vendidas
                    </span>
                  </div>
                  <div>
                    <strong>
                      {formatCurrency(
                        item.profit,
                        organization.currency,
                        organization.locale,
                      )}
                    </strong>
                    <span>
                      {formatPercent(
                        item.revenue > 0
                          ? (item.profit / item.revenue) * 100
                          : 0,
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty">
              <ChartLineUpIcon size={32} weight="duotone" />
              <strong>Aún no hay ventas</strong>
              <p>Registra ventas para calcular la ganancia realizada.</p>
            </div>
          )}
        </article>
      </section>

      <section className="panel replenishment-panel">
        <div className="panel-heading replenishment-heading">
          <div>
            <h2>Plan sugerido de reposición</h2>
            <p>
              Cantidades para recuperar aproximadamente el doble del stock
              mínimo.
            </p>
          </div>
          {replenishment.length > 0 ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                openMovementDialog(replenishment[0]?.product)
              }
              disabled={!canOperate}
            >
              Registrar primera compra
            </button>
          ) : null}
        </div>
        {replenishment.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="align-right">Stock actual</th>
                  <th className="align-right">Mínimo</th>
                  <th className="align-right">Compra sugerida</th>
                  <th className="align-right">Costo estimado</th>
                </tr>
              </thead>
              <tbody>
                {replenishment.map((item) => (
                  <tr key={item.product.id}>
                    <td>
                      <div className="table-product">
                        <span className="product-monogram" aria-hidden="true">
                          {item.product.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{item.product.name}</strong>
                          <span>
                            {supplierMap.get(item.product.supplierId || "")
                              ?.name || "Sin proveedor"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="align-right table-number">
                      {formatNumber(item.product.currentStock)}{" "}
                      {item.product.unit}
                    </td>
                    <td className="align-right table-number">
                      {formatNumber(item.product.minStock)}
                    </td>
                    <td className="align-right table-number">
                      <strong>
                        {formatNumber(item.suggestedQuantity)}{" "}
                        {item.product.unit}
                      </strong>
                    </td>
                    <td className="align-right table-number">
                      {formatCurrency(
                        item.estimatedCost,
                        organization.currency,
                        organization.locale,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <PackageIcon size={32} weight="duotone" />
            <strong>No se requieren compras inmediatas</strong>
            <p>Todos los productos activos superan su stock mínimo.</p>
          </div>
        )}
      </section>

      <div className="report-note">
        <ReceiptIcon size={20} weight="duotone" />
        <p>
          Las cifras son operativas y dependen de los movimientos registrados.
          El impuesto mostrado es una estimación sobre ventas con precio
          incluido; valida el tratamiento fiscal con tu contador.
        </p>
      </div>
    </div>
  );
}
