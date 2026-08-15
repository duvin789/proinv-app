import type { Worksheet } from "exceljs";

import type {
  InventoryBalance,
  InventoryImportRow,
  WorkspaceData,
} from "@/lib/types";
import {
  calculateWorkspaceMetrics,
  getStockStatus,
  movementLabels,
} from "@/lib/inventory";

const inventoryHeaders = [
  "NOMBRE DE INSUMO / PRODUCTO",
  "SKU",
  "CÓDIGO DE BARRAS",
  "CATEGORÍA",
  "PROVEEDOR",
  "DESCRIPCIÓN",
  "COSTO DE COMPRA",
  "PRECIO DE VENTA",
  "UNIDAD DE MEDIDA",
  "STOCK ACTUAL",
  "STOCK MÁXIMO",
  "STOCK MÍNIMO",
  "UBICACIÓN",
] as const;

export const movementWorkbookHeaders = [
  "FECHA",
  "PRODUCTO",
  "ALMACÉN",
  "TIPO DE MOVIMIENTO",
  "CANTIDAD",
  "STOCK ANTERIOR",
  "STOCK FINAL",
  "COSTO UNITARIO",
  "PRECIO DE VENTA",
  "COSTO TOTAL",
  "INGRESO",
  "UTILIDAD",
  "MOTIVO",
  "NOTA",
] as const;

type ImportField =
  | "name"
  | "sku"
  | "barcode"
  | "category"
  | "supplier"
  | "description"
  | "purchasePrice"
  | "salePrice"
  | "unit"
  | "initialStock"
  | "maxStock"
  | "minStock"
  | "warehouse";

export interface InventoryImportIssue {
  row: number;
  message: string;
}

export interface InventoryImportPreview {
  rows: InventoryImportRow[];
  issues: InventoryImportIssue[];
  sourceRows: number;
  consolidatedRows: number;
  sheetName: string;
}

const headerAliases: Record<string, ImportField> = {
  "nombre de insumo producto": "name",
  "nombre del producto": "name",
  "nombre producto": "name",
  producto: "name",
  nombre: "name",
  sku: "sku",
  codigo: "sku",
  "codigo interno": "sku",
  barcode: "barcode",
  ean: "barcode",
  "codigo de barras": "barcode",
  categoria: "category",
  proveedor: "supplier",
  descripcion: "description",
  "costo de compra": "purchasePrice",
  "precio de compra": "purchasePrice",
  costo: "purchasePrice",
  "precio de venta": "salePrice",
  "unidad de medida": "unit",
  unidad: "unit",
  "stock actual": "initialStock",
  "estock actual": "initialStock",
  existencias: "initialStock",
  stock: "initialStock",
  "stock maximo": "maxStock",
  "stock minimo": "minStock",
  "stock de seguridad": "minStock",
  ubicacion: "warehouse",
  almacen: "warehouse",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

function normalizeHeader(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function rawCellValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if ("result" in value) return rawCellValue(value.result);
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String(part.text)
          : "",
      )
      .join("");
  }
  return String(value);
}

function cellText(value: unknown) {
  const raw = rawCellValue(value);
  return raw == null ? "" : String(raw).trim().replace(/\s+/g, " ");
}

function parseNumber(value: unknown, fallback = 0) {
  const raw = rawCellValue(value);
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;
  const text = String(raw ?? "").trim();
  if (!text) return fallback;

  let normalized = text.replace(/[^0-9,.-]/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    normalized = normalized
      .replace(decimalSeparator === "," ? /\./g : /,/g, "")
      .replace(decimalSeparator, ".");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function downloadBuffer(filename: string, buffer: ArrayBuffer | Uint8Array) {
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function newWorkbook() {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Kadmiel Multimuebles";
  workbook.created = new Date();
  return workbook;
}

function displayLength(value: unknown) {
  if (value instanceof Date) return 16;
  return String(rawCellValue(value) ?? "")
    .split(/\r?\n/)
    .reduce((longest, line) => Math.max(longest, line.length), 0);
}

/**
 * Fits the sheet to its content while keeping long descriptions contained.
 * The supplied widths are maximums, not fixed sizes.
 */
function styleWorksheet(worksheet: Worksheet, maximumWidths: number[]) {
  worksheet.columns.forEach((_, index) => {
    const column = worksheet.getColumn(index + 1);
    const maximum = maximumWidths[index] || 24;
    let measured = 0;
    column.eachCell({ includeEmpty: false }, (cell) => {
      measured = Math.max(measured, displayLength(cell.value));
    });
    column.width = Math.min(Math.max(measured + 2, 11), maximum);
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = `A1:${columnLetter(maximumWidths.length)}1`;
  const header = worksheet.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB00060" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF760040" } },
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    let visualLines = 1;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const width = Math.max(worksheet.getColumn(columnNumber).width || 11, 8);
      const text =
        cell.value instanceof Date
          ? "0000-00-00 00:00"
          : String(rawCellValue(cell.value) ?? "");
      const lines = text
        .split(/\r?\n/)
        .reduce(
          (total, line) => total + Math.max(1, Math.ceil(line.length / width)),
          0,
        );
      visualLines = Math.max(visualLines, Math.min(lines, 4));
      cell.alignment = {
        ...cell.alignment,
        vertical: "top",
        wrapText: true,
      };
    });
    row.height = Math.min(18 + (visualLines - 1) * 12, 54);
  });
}

export function inventoryConflictKey(
  item: Pick<InventoryImportRow, "name" | "unit">,
) {
  const normalizeIdentity = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
  return `${normalizeIdentity(item.name)}|${normalizeIdentity(item.unit || "unidad")}`;
}

export function inventoryNameKey(item: Pick<InventoryImportRow, "name">) {
  return item.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function buildMovementWorkbookRows(
  movements: WorkspaceData["movements"],
  products: WorkspaceData["products"],
  warehouses: WorkspaceData["warehouses"],
) {
  const productById = new Map(products.map((item) => [item.id, item.name]));
  const warehouseById = new Map(warehouses.map((item) => [item.id, item.name]));

  return movements.map((movement) => [
    new Date(movement.occurredAt),
    productById.get(movement.productId) || "Producto eliminado",
    warehouseById.get(movement.warehouseId) || "Sin almacén",
    movementLabels[movement.type],
    movement.quantity,
    movement.stockBefore,
    movement.stockAfter,
    movement.unitCost,
    movement.saleUnitPrice ?? "",
    movement.totalCost,
    movement.revenue,
    movement.grossProfit,
    movement.reason || "Sin motivo",
    movement.note || "Sin observación",
  ] satisfies Array<string | number | Date>);
}

function columnLetter(columnCount: number) {
  let value = columnCount;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export async function parseInventoryWorkbook(
  file: File,
): Promise<InventoryImportPreview> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("El archivo supera el límite de 10 MB.");
  }

  const workbook = await newWorkbook();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await workbook.xlsx.load(bytes as never);
  if (workbook.worksheets.length === 0) {
    throw new Error("El archivo no contiene hojas.");
  }

  let selected:
    | {
        worksheet: (typeof workbook.worksheets)[number];
        headerRow: number;
        columns: Map<ImportField, number>;
        score: number;
      }
    | undefined;

  for (const worksheet of workbook.worksheets) {
    const maxHeaderRow = Math.min(worksheet.rowCount, 20);
    for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber += 1) {
      const columns = new Map<ImportField, number>();
      worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
        const field = headerAliases[normalizeHeader(cellText(cell.value))];
        if (field && !columns.has(field)) columns.set(field, col);
      });
      if (!columns.has("name")) continue;
      const score = columns.size;
      if (!selected || score > selected.score) {
        selected = { worksheet, headerRow: rowNumber, columns, score };
      }
    }
  }

  if (!selected || selected.score < 3) {
    throw new Error(
      "No encontré una tabla válida. Usa la plantilla y conserva los encabezados de producto, unidad y stock.",
    );
  }

  const issues: InventoryImportIssue[] = [];
  const importedRows: Array<{
    value: InventoryImportRow;
    sourceRow: number;
  }> = [];
  let sourceRows = 0;
  const { worksheet, headerRow, columns } = selected;

  for (
    let rowNumber = headerRow + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);
    const get = (field: ImportField) => {
      const column = columns.get(field);
      return column ? row.getCell(column).value : null;
    };
    const hasData = [...columns.values()].some(
      (column) => cellText(row.getCell(column).value) !== "",
    );
    if (!hasData) continue;
    sourceRows += 1;
    if (sourceRows > 1000) {
      issues.push({ row: rowNumber, message: "El límite es de 1000 filas." });
      break;
    }

    const name = cellText(get("name"));
    const sku = cellText(get("sku"));
    const barcode = cellText(get("barcode"));
    const category = cellText(get("category"));
    const supplier = cellText(get("supplier"));
    const description = cellText(get("description"));
    const unitText = cellText(get("unit"));
    const unit = unitText || undefined;
    const warehouse = cellText(get("warehouse"));
    const optionalNumber = (field: ImportField) =>
      cellText(get(field)) ? parseNumber(get(field)) : undefined;
    const purchasePrice = optionalNumber("purchasePrice");
    const salePrice = optionalNumber("salePrice");
    const initialStock = optionalNumber("initialStock");
    const minStock = optionalNumber("minStock");
    const maxStockText = cellText(get("maxStock"));
    const maxStock = maxStockText ? parseNumber(get("maxStock")) : undefined;

    const rowIssues: string[] = [];
    if (name.length < 2) rowIssues.push("falta el nombre del producto");
    if (name.length > 140) rowIssues.push("el nombre supera 140 caracteres");
    if (sku.length > 80) rowIssues.push("el SKU supera 80 caracteres");
    if (barcode.length > 80) {
      rowIssues.push("el código de barras supera 80 caracteres");
    }
    if (category.length > 60) rowIssues.push("la categoría supera 60 caracteres");
    if (supplier.length > 120) rowIssues.push("el proveedor supera 120 caracteres");
    if (description.length > 500) {
      rowIssues.push("la descripción supera 500 caracteres");
    }
    if ((unit?.length || 0) > 24) {
      rowIssues.push("la unidad supera 24 caracteres");
    }
    if (warehouse.length > 120) {
      rowIssues.push("la ubicación supera 120 caracteres");
    }
    if (
      [purchasePrice, salePrice, initialStock, minStock].some(
        (value) =>
          value !== undefined && (!Number.isFinite(value) || value < 0),
      ) ||
      (maxStock !== undefined && (!Number.isFinite(maxStock) || maxStock < 0))
    ) {
      rowIssues.push("hay un precio o una cantidad inválida");
    }
    if (maxStock !== undefined && maxStock < (minStock ?? 0)) {
      rowIssues.push("el stock máximo es menor que el mínimo");
    }
    if (rowIssues.length) {
      issues.push({ row: rowNumber, message: rowIssues.join("; ") });
      continue;
    }

    importedRows.push({
      sourceRow: rowNumber,
      value: {
        name,
        sku: sku || undefined,
        barcode: barcode || undefined,
        category: category || undefined,
        supplier: supplier || undefined,
        description: description || undefined,
        purchasePrice,
        salePrice,
        unit,
        initialStock,
        maxStock,
        minStock,
        warehouse: warehouse || undefined,
      },
    });
  }

  const consolidated = new Map<string, InventoryImportRow>();
  const identityBySku = new Map<string, string>();
  const identityByBarcode = new Map<string, string>();
  let consolidatedRows = 0;
  for (const imported of importedRows) {
    const { value: row, sourceRow } = imported;
    const key = inventoryConflictKey(row);
    const normalizedSku = row.sku?.trim().toUpperCase();
    const normalizedBarcode = row.barcode?.trim();
    if (
      (normalizedSku && identityBySku.get(normalizedSku) !== undefined &&
        identityBySku.get(normalizedSku) !== key) ||
      (normalizedBarcode &&
        identityByBarcode.get(normalizedBarcode) !== undefined &&
        identityByBarcode.get(normalizedBarcode) !== key)
    ) {
      issues.push({
        row: sourceRow,
        message:
          "usa un SKU o código de barras asignado a otro producto dentro del mismo archivo",
      });
      continue;
    }
    const existing = consolidated.get(key);
    if (!existing) {
      consolidated.set(key, row);
      if (normalizedSku) identityBySku.set(normalizedSku, key);
      if (normalizedBarcode) identityByBarcode.set(normalizedBarcode, key);
      continue;
    }
    const incompatibleSku =
      Boolean(existing.sku && row.sku) &&
      existing.sku?.trim().toUpperCase() !== row.sku?.trim().toUpperCase();
    const incompatibleBarcode =
      Boolean(existing.barcode && row.barcode) &&
      existing.barcode?.trim() !== row.barcode?.trim();
    if (incompatibleSku || incompatibleBarcode) {
      issues.push({
        row: sourceRow,
        message:
          "repite el mismo producto y unidad con un SKU o código de barras diferente; corrige el archivo antes de sumar su stock",
      });
      continue;
    }
    const merged: InventoryImportRow = {
      ...existing,
      name: row.name,
      sku: row.sku ?? existing.sku,
      barcode: row.barcode ?? existing.barcode,
      category: row.category ?? existing.category,
      supplier: row.supplier ?? existing.supplier,
      description: row.description ?? existing.description,
      purchasePrice: row.purchasePrice ?? existing.purchasePrice,
      salePrice: row.salePrice ?? existing.salePrice,
      unit: row.unit ?? existing.unit,
      initialStock:
        existing.initialStock !== undefined || row.initialStock !== undefined
          ? (existing.initialStock ?? 0) + (row.initialStock ?? 0)
          : undefined,
      minStock: row.minStock ?? existing.minStock,
      maxStock:
        row.maxStock !== undefined ? row.maxStock : existing.maxStock,
      warehouse: row.warehouse ?? existing.warehouse,
    };
    if (
      merged.maxStock !== undefined &&
      merged.maxStock !== null &&
      merged.maxStock < (merged.minStock ?? 0)
    ) {
      issues.push({
        row: sourceRow,
        message:
          "al consolidar la fila, el stock máximo queda por debajo del mínimo; completa ambos valores de forma compatible",
      });
      continue;
    }
    consolidated.set(key, merged);
    if (normalizedSku) identityBySku.set(normalizedSku, key);
    if (normalizedBarcode) identityByBarcode.set(normalizedBarcode, key);
    consolidatedRows += 1;
  }

  return {
    rows: [...consolidated.values()],
    issues,
    sourceRows,
    consolidatedRows,
    sheetName: worksheet.name,
  };
}

export async function downloadInventoryTemplate() {
  const workbook = await newWorkbook();
  const inventory = workbook.addWorksheet("Inventario");
  inventory.addRow([...inventoryHeaders]);
  styleWorksheet(
    inventory,
    [38, 18, 22, 18, 24, 32, 17, 17, 18, 15, 15, 15, 22],
  );
  inventory.getColumn(2).numFmt = "@";
  inventory.getColumn(3).numFmt = "@";
  inventory.getColumn(7).numFmt = "#,##0.00";
  inventory.getColumn(8).numFmt = "#,##0.00";
  for (const column of [10, 11, 12]) {
    inventory.getColumn(column).numFmt = "#,##0.000";
  }

  const instructions = workbook.addWorksheet("Instrucciones");
  instructions.addRows([
    ["PLANTILLA DE IMPORTACIÓN KADMIEL"],
    ["Completa una fila por producto. No cambies los encabezados de Inventario."],
    [
      "Campos obligatorios",
      "Solo el nombre es obligatorio. SKU, código de barras y los demás campos son opcionales.",
    ],
    [
      "Celdas vacías",
      "En coincidencias conservan el valor actual. En productos nuevos, precios, stock y mínimo usan 0; unidad usa 'unidad' y los demás campos quedan vacíos.",
    ],
    [
      "Coincidencias",
      "La vista previa las identifica por nombre y unidad, SKU o código de barras. Puedes omitirlas o actualizar solo las celdas llenas; el stock existente nunca cambia.",
    ],
    [
      "Filas repetidas",
      "Se suman sus existencias. Los demás valores no vacíos de la última fila prevalecen, sin borrar datos con celdas vacías.",
    ],
    ["Límite", "1000 filas y 10 MB por importación."],
  ]);
  instructions.columns = [{ width: 24 }, { width: 78 }];
  instructions.getRow(1).font = { bold: true, color: { argb: "FF760040" }, size: 14 };
  instructions.getRow(1).height = 28;
  instructions.views = [{ state: "frozen", ySplit: 1 }];

  const output = await workbook.xlsx.writeBuffer();
  downloadBuffer("plantilla-importacion-kadmiel.xlsx", output as ArrayBuffer);
}

export async function createWorkspaceWorkbookBuffer(
  workspace: WorkspaceData,
  inventoryBalances: InventoryBalance[],
) {
  const workbook = await newWorkbook();
  const categoryById = new Map(workspace.categories.map((item) => [item.id, item.name]));
  const supplierById = new Map(workspace.suppliers.map((item) => [item.id, item.name]));
  const warehouseById = new Map(workspace.warehouses.map((item) => [item.id, item.name]));
  const latestWarehouseByProduct = new Map<string, string>();
  for (const movement of workspace.movements) {
    if (!latestWarehouseByProduct.has(movement.productId)) {
      latestWarehouseByProduct.set(
        movement.productId,
        warehouseById.get(movement.warehouseId) || "",
      );
    }
  }
  const defaultWarehouse =
    workspace.warehouses.find((item) => item.isDefault)?.name ||
    workspace.warehouses[0]?.name ||
    "";

  const inventory = workbook.addWorksheet("Inventario");
  inventory.addRow([
    ...inventoryHeaders,
    "RUTA PRIVADA DE IMAGEN",
    "ESTADO",
  ]);
  for (const product of workspace.products) {
    inventory.addRow([
      product.name,
      product.sku,
      product.barcode || "",
      product.categoryId ? categoryById.get(product.categoryId) || "" : "",
      product.supplierId ? supplierById.get(product.supplierId) || "" : "",
      product.description || "",
      product.purchasePrice,
      product.salePrice,
      product.unit,
      product.currentStock,
      product.maxStock ?? "",
      product.minStock,
      latestWarehouseByProduct.get(product.id) || defaultWarehouse,
      product.imagePath || "",
      product.active ? getStockStatus(product) : "archivado",
    ]);
  }
  styleWorksheet(
    inventory,
    [38, 18, 22, 18, 24, 32, 17, 17, 18, 15, 15, 15, 22, 54, 15],
  );
  inventory.getColumn(2).numFmt = "@";
  inventory.getColumn(3).numFmt = "@";
  inventory.getColumn(7).numFmt = "#,##0.00";
  inventory.getColumn(8).numFmt = "#,##0.00";
  for (const column of [10, 11, 12]) {
    inventory.getColumn(column).numFmt = "#,##0.000";
  }

  const productById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const warehouseDetailsById = new Map(
    workspace.warehouses.map((warehouse) => [warehouse.id, warehouse]),
  );
  const balanceSheet = workbook.addWorksheet("Existencias por almacén");
  balanceSheet.addRow([
    "ID DE PRODUCTO",
    "PRODUCTO",
    "SKU",
    "CÓDIGO DE BARRAS",
    "ID DE ALMACÉN",
    "ALMACÉN",
    "UBICACIÓN DEL ALMACÉN",
    "UNIDAD DE MEDIDA",
    "STOCK ACTUAL",
    "COSTO PROMEDIO",
    "VALOR DEL INVENTARIO",
    "ÚLTIMA ACTUALIZACIÓN",
  ]);
  const sortedBalances = [...inventoryBalances].sort((left, right) => {
    const leftProduct = productById.get(left.productId)?.name || "";
    const rightProduct = productById.get(right.productId)?.name || "";
    const productOrder = leftProduct.localeCompare(rightProduct, "es");
    if (productOrder !== 0) return productOrder;

    const leftWarehouse =
      warehouseDetailsById.get(left.warehouseId)?.name || "";
    const rightWarehouse =
      warehouseDetailsById.get(right.warehouseId)?.name || "";
    const warehouseOrder = leftWarehouse.localeCompare(rightWarehouse, "es");
    if (warehouseOrder !== 0) return warehouseOrder;
    return `${left.productId}|${left.warehouseId}`.localeCompare(
      `${right.productId}|${right.warehouseId}`,
    );
  });
  for (const balance of sortedBalances) {
    const product = productById.get(balance.productId);
    const warehouse = warehouseDetailsById.get(balance.warehouseId);
    balanceSheet.addRow([
      balance.productId,
      product?.name || "Producto no disponible",
      product?.sku || "",
      product?.barcode || "",
      balance.warehouseId,
      warehouse?.name || "Almacén no disponible",
      warehouse?.location || "",
      product?.unit || "",
      balance.currentStock,
      balance.averageCost,
      balance.currentStock * balance.averageCost,
      new Date(balance.updatedAt),
    ]);
  }
  styleWorksheet(
    balanceSheet,
    [38, 38, 18, 22, 38, 26, 34, 18, 16, 18, 22, 22],
  );
  balanceSheet.getColumn(3).numFmt = "@";
  balanceSheet.getColumn(4).numFmt = "@";
  balanceSheet.getColumn(9).numFmt = "#,##0.000";
  balanceSheet.getColumn(10).numFmt = "#,##0.0000";
  balanceSheet.getColumn(11).numFmt = "#,##0.00";
  balanceSheet.getColumn(12).numFmt = "yyyy-mm-dd hh:mm";

  const movements = workbook.addWorksheet("Movimientos");
  movements.addRow([...movementWorkbookHeaders]);
  movements.addRows(
    buildMovementWorkbookRows(
      workspace.movements,
      workspace.products,
      workspace.warehouses,
    ),
  );
  styleWorksheet(movements, [20, 34, 22, 18, 14, 16, 14, 16, 16, 16, 16, 16, 22, 34]);
  movements.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  for (const column of [5, 6, 7]) movements.getColumn(column).numFmt = "#,##0.000";
  for (const column of [8, 9, 10, 11, 12]) movements.getColumn(column).numFmt = "#,##0.00";

  const catalogs = workbook.addWorksheet("Catálogos");
  catalogs.addRow(["TIPO", "NOMBRE", "DETALLE"]);
  workspace.categories.forEach((item) => catalogs.addRow(["Categoría", item.name, item.color]));
  workspace.suppliers.forEach((item) => catalogs.addRow(["Proveedor", item.name, item.email || item.phone || ""]));
  workspace.warehouses.forEach((item) => catalogs.addRow(["Almacén", item.name, item.location || ""]));
  workspace.movementReasons.forEach((item) => catalogs.addRow(["Motivo", item.name, ""]));
  styleWorksheet(catalogs, [18, 32, 42]);

  const metrics = calculateWorkspaceMetrics(workspace);
  const summary = workbook.addWorksheet("Resumen");
  summary.addRows([
    ["INDICADOR", "VALOR"],
    ["Empresa", workspace.organization.name],
    ["Productos activos", metrics.productCount],
    ["Unidades", metrics.units],
    ["Valor del inventario", metrics.inventoryValue],
    ["Ingreso potencial", metrics.potentialRevenue],
    ["Productos con stock bajo", metrics.lowStock],
    ["Productos sin stock", metrics.outOfStock],
    ["Tipo de archivo", "Exportación completa de datos operativos en Excel"],
    [
      "Imágenes de productos",
      "Incluye la ruta privada de almacenamiento, pero no los archivos binarios. Este Excel no restaura las imágenes por sí solo.",
    ],
  ]);
  styleWorksheet(summary, [34, 90]);
  summary.getColumn(2).numFmt = "#,##0.00";

  const output = await workbook.xlsx.writeBuffer();
  return output as ArrayBuffer;
}

export async function downloadWorkspaceWorkbook(
  workspace: WorkspaceData,
  inventoryBalances: InventoryBalance[],
) {
  const output = await createWorkspaceWorkbookBuffer(
    workspace,
    inventoryBalances,
  );
  downloadBuffer(
    `exportacion-datos-kadmiel-${new Date().toISOString().slice(0, 10)}.xlsx`,
    output,
  );
}

export async function downloadCompleteWorkspaceWorkbook() {
  const response = await fetch("/api/exports/inventory", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      body?.message || "No fue posible generar la exportación completa.",
    );
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filename =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
    `exportacion-datos-kadmiel-${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadBuffer(filename, await response.arrayBuffer());
}

export async function downloadTableWorkbook(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | Date | null>>,
) {
  const workbook = await newWorkbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(row));
  styleWorksheet(
    worksheet,
    headers.map((header, index) => {
      const longestCell = rows.reduce(
        (longest, row) => Math.max(longest, displayLength(row[index])),
        header.length,
      );
      return Math.min(Math.max(longestCell + 2, header.length + 2, 12), 38);
    }),
  );
  const output = await workbook.xlsx.writeBuffer();
  downloadBuffer(filename.replace(/\.csv$/i, ".xlsx"), output as ArrayBuffer);
}
