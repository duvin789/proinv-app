"use client";

import {
  ArchiveIcon,
  ArrowsDownUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
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
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  getStockStatus,
  productMargin,
} from "@/lib/inventory";
import type { Product } from "@/lib/types";

type StockFilter = "active" | "healthy" | "low" | "out" | "archived";
type SortOption = "name" | "stock_asc" | "stock_desc" | "value_desc";

const pageSize = 8;

const statusLabels = {
  healthy: "Disponible",
  low: "Stock bajo",
  out: "Agotado",
  inactive: "Archivado",
};

export function ProductsView() {
  const {
    workspace,
    isMutating,
    openProductDialog,
    openMovementDialog,
    archiveProduct,
    deleteProduct,
  } = useInventory();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [stockFilter, setStockFilter] = useState<StockFilter>("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState<SortOption>("name");
  const [page, setPage] = useState(1);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(
    null,
  );
  const { products, categories, suppliers, movements, organization } =
    workspace;
  const canOperate = workspace.viewer.role !== "viewer";
  const canManage =
    workspace.viewer.role === "owner" || workspace.viewer.role === "admin";

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const productsWithVisibleHistory = useMemo(
    () => new Set(movements.map((movement) => movement.productId)),
    [movements],
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("es");
    const result = products.filter((product) => {
      const status = getStockStatus(product);
      const matchesSearch =
        !normalizedQuery ||
        product.name.toLocaleLowerCase("es").includes(normalizedQuery) ||
        supplierMap
          .get(product.supplierId || "")
          ?.name.toLocaleLowerCase("es")
          .includes(normalizedQuery);
      const matchesCategory =
        categoryFilter === "all" || product.categoryId === categoryFilter;
      const matchesStock =
        stockFilter === "active"
          ? product.active
          : stockFilter === "archived"
            ? !product.active
            : status === stockFilter;
      return matchesSearch && matchesCategory && matchesStock;
    });

    return result.toSorted((a, b) => {
      if (sort === "stock_asc") return a.currentStock - b.currentStock;
      if (sort === "stock_desc") return b.currentStock - a.currentStock;
      if (sort === "value_desc") {
        return (
          b.currentStock * b.averageCost - a.currentStock * a.averageCost
        );
      }
      return a.name.localeCompare(b.name, "es");
    });
  }, [
    categoryFilter,
    deferredQuery,
    products,
    sort,
    stockFilter,
    supplierMap,
  ]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginatedProducts = filteredProducts.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function changeFilter(next: StockFilter) {
    setStockFilter(next);
    setPage(1);
  }

  function exportProducts() {
    downloadCsv(
      `inventario-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Producto",
        "Proveedor",
        "Categoría",
        "Stock",
        "Unidad",
        "Costo promedio",
        "Precio de venta",
        "Margen %",
        "Valor de inventario",
        "Estado",
      ],
      filteredProducts.map((product) => {
        const status = getStockStatus(product);
        return [
          product.name,
          supplierMap.get(product.supplierId || "")?.name || "Sin proveedor",
          categoryMap.get(product.categoryId || "")?.name || "Sin categoría",
          product.currentStock,
          product.unit,
          product.averageCost,
          product.salePrice,
          productMargin(product).toFixed(2),
          (product.currentStock * product.averageCost).toFixed(2),
          statusLabels[status],
        ];
      }),
    );
  }

  async function handleArchive(product: Product) {
    const confirmed = window.confirm(
      `¿Archivar "${product.name}"? El historial se conservará y el producto dejará de aparecer en la operación diaria.`,
    );
    if (confirmed) await archiveProduct(product.id);
  }

  async function handleDelete(product: Product) {
    if (Math.abs(product.currentStock) >= 0.0005) {
      window.alert(
        "No se puede eliminar porque todavía tiene stock. Registra primero la salida correspondiente.",
      );
      return;
    }
    if (productsWithVisibleHistory.has(product.id)) {
      window.alert(
        "No se puede eliminar porque tiene historial de movimientos. Debe permanecer archivado para conservar la trazabilidad.",
      );
      return;
    }

    const confirmation = window.prompt(
      `Esta acción eliminará definitivamente “${product.name}”. Escribe el nombre exacto del producto para confirmar.`,
    );
    if (confirmation?.trim() !== product.name.trim()) return;

    setDeletingProductId(product.id);
    try {
      await deleteProduct(product.id);
    } finally {
      setDeletingProductId(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-toolbar products-toolbar">
        <div className="search-field">
          <MagnifyingGlassIcon size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por producto o proveedor"
            aria-label="Buscar productos"
          />
        </div>
        <select
          className="toolbar-select"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por categoría"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          className="toolbar-select"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOption)}
          aria-label="Ordenar productos"
        >
          <option value="name">Orden: nombre</option>
          <option value="stock_asc">Menor stock primero</option>
          <option value="stock_desc">Mayor stock primero</option>
          <option value="value_desc">Mayor valor primero</option>
        </select>
        <button
          type="button"
          className="button button-secondary"
          onClick={exportProducts}
          disabled={filteredProducts.length === 0}
        >
          <DownloadSimpleIcon size={18} weight="bold" />
          Exportar
        </button>
      </section>

      <section className="filter-tabs" aria-label="Filtrar por estado">
        {(
          [
            ["active", "Activos"],
            ["healthy", "Disponibles"],
            ["low", "Stock bajo"],
            ["out", "Agotados"],
            ["archived", "Archivados"],
          ] as Array<[StockFilter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={stockFilter === value ? "is-active" : ""}
            onClick={() => changeFilter(value)}
          >
            {label}
            {value === "low" ? (
              <span>
                {
                  products.filter(
                    (product) => getStockStatus(product) === "low",
                  ).length
                }
              </span>
            ) : value === "out" ? (
              <span>
                {
                  products.filter(
                    (product) => getStockStatus(product) === "out",
                  ).length
                }
              </span>
            ) : null}
          </button>
        ))}
      </section>

      <section className="panel table-panel">
        <div className="table-panel-heading">
          <div>
            <h2>Catálogo</h2>
            <p>
              {filteredProducts.length}{" "}
              {filteredProducts.length === 1 ? "producto" : "productos"}
            </p>
          </div>
          <button
            type="button"
            className="button button-primary mobile-primary-action"
            onClick={() => openProductDialog()}
            disabled={!canOperate}
            title={!canOperate ? "Tu rol es de solo consulta" : undefined}
          >
            <PlusIcon size={18} weight="bold" />
            Nuevo
          </button>
        </div>

        {paginatedProducts.length > 0 ? (
          <>
            <div className="data-table-wrap products-table-wrap">
              <table className="data-table products-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="align-right">Stock</th>
                    <th className="align-right">Costo prom.</th>
                    <th className="align-right">Precio venta</th>
                    <th className="align-right">Margen</th>
                    <th className="align-right">Valor</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => {
                    const category = categoryMap.get(
                      product.categoryId || "",
                    );
                    const status = getStockStatus(product);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="table-product">
                            <span
                              className="product-monogram"
                              style={
                                category
                                  ? {
                                      color: category.color,
                                      backgroundColor: `${category.color}16`,
                                    }
                                  : undefined
                              }
                              aria-hidden="true"
                            >
                              {product.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <strong>{product.name}</strong>
                              <span>
                                {supplierMap.get(product.supplierId || "")
                                  ?.name || "Sin proveedor"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Categoría">
                          {category ? (
                            <span className="category-label">
                              <i
                                style={{ backgroundColor: category.color }}
                              />
                              {category.name}
                            </span>
                          ) : (
                            <span className="muted">Sin categoría</span>
                          )}
                        </td>
                        <td
                          className="align-right table-number"
                          data-label="Stock"
                        >
                          <strong>{formatNumber(product.currentStock)}</strong>{" "}
                          <span>{product.unit}</span>
                        </td>
                        <td
                          className="align-right table-number"
                          data-label="Costo promedio"
                        >
                          {formatCurrency(
                            product.averageCost,
                            organization.currency,
                            organization.locale,
                          )}
                        </td>
                        <td
                          className="align-right table-number"
                          data-label="Precio de venta"
                        >
                          {formatCurrency(
                            product.salePrice,
                            organization.currency,
                            organization.locale,
                          )}
                        </td>
                        <td
                          className="align-right table-number"
                          data-label="Margen"
                        >
                          {formatPercent(
                            productMargin(product),
                            organization.locale,
                          )}
                        </td>
                        <td
                          className="align-right table-number"
                          data-label="Valor"
                        >
                          {formatCurrency(
                            product.currentStock * product.averageCost,
                            organization.currency,
                            organization.locale,
                          )}
                        </td>
                        <td data-label="Estado">
                          <span className={`stock-badge stock-${status}`}>
                            {statusLabels[status]}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {product.active ? (
                              <button
                                type="button"
                                className="icon-button"
                              onClick={() => openMovementDialog(product)}
                                disabled={!canOperate || isMutating}
                                aria-label={`Registrar movimiento de ${product.name}`}
                                title="Registrar movimiento"
                              >
                                <ArrowsDownUpIcon size={18} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => openProductDialog(product)}
                              disabled={!canOperate || isMutating}
                              aria-label={`Editar ${product.name}`}
                              title="Editar"
                            >
                              <PencilSimpleIcon size={18} />
                            </button>
                            {product.active ? (
                              <button
                                type="button"
                                className="icon-button danger-icon-button"
                                onClick={() => handleArchive(product)}
                                disabled={!canOperate || isMutating}
                                aria-label={`Archivar ${product.name}`}
                                title="Archivar"
                              >
                                <ArchiveIcon size={18} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="icon-button danger-icon-button"
                                onClick={() => handleDelete(product)}
                                disabled={!canManage || isMutating}
                                aria-label={`Eliminar definitivamente ${product.name}`}
                                title={
                                  canManage
                                    ? "Eliminar definitivamente"
                                    : "Solo propietarios y administradores"
                                }
                                aria-busy={deletingProductId === product.id}
                              >
                                <TrashIcon size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Mostrando {(safePage - 1) * pageSize + 1}-
                {Math.min(safePage * pageSize, filteredProducts.length)} de{" "}
                {filteredProducts.length}
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
            <PackageIcon size={40} weight="duotone" />
            <strong>
              {query || categoryFilter !== "all"
                ? "No encontramos coincidencias"
                : "Tu catálogo está vacío"}
            </strong>
            <p>
              {query || categoryFilter !== "all"
                ? "Prueba con otra búsqueda o cambia los filtros."
                : "Registra el primer producto y los cálculos comenzarán automáticamente."}
            </p>
            {!query && categoryFilter === "all" ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => openProductDialog()}
              >
                Crear producto
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
