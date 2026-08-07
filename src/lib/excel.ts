import type { Worksheet } from "exceljs";

import type { InventoryImportRow, WorkspaceData } from "@/lib/types";
import { calculateWorkspaceMetrics, getStockStatus } from "@/lib/inventory";

const inventoryHeaders = [
  "NOMBRE DE INSUMO / PRODUCTO",
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

type ImportField =
  | "name"
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
  workbook.creator = "PROInv";
  workbook.created = new Date();
  return workbook;
}

function styleWorksheet(
  worksheet: Worksheet,
  widths: number[],
) {
  worksheet.columns.forEach((column, index) => {
    column.width = widths[index] || 16;
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = `A1:${columnLetter(widths.length)}1`;
  const header = worksheet.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B607E" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF063E55" } },
    };
  });
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
  const importedRows: InventoryImportRow[] = [];
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
    const category = cellText(get("category"));
    const supplier = cellText(get("supplier"));
    const description = cellText(get("description"));
    const unit = cellText(get("unit")) || "unidad";
    const warehouse = cellText(get("warehouse"));
    const purchasePrice = parseNumber(get("purchasePrice"));
    const salePrice = parseNumber(get("salePrice"));
    const initialStock = parseNumber(get("initialStock"));
    const minStock = parseNumber(get("minStock"));
    const maxStockText = cellText(get("maxStock"));
    const maxStock = maxStockText ? parseNumber(get("maxStock")) : null;

    const rowIssues: string[] = [];
    if (name.length < 2) rowIssues.push("falta el nombre del producto");
    if (name.length > 140) rowIssues.push("el nombre supera 140 caracteres");
    if (category.length > 60) rowIssues.push("la categoría supera 60 caracteres");
    if (supplier.length > 120) rowIssues.push("el proveedor supera 120 caracteres");
    if (description.length > 500) {
      rowIssues.push("la descripción supera 500 caracteres");
    }
    if (unit.length > 24) rowIssues.push("la unidad supera 24 caracteres");
    if (warehouse.length > 120) {
      rowIssues.push("la ubicación supera 120 caracteres");
    }
    if (
      [purchasePrice, salePrice, initialStock, minStock].some(
        (value) => !Number.isFinite(value) || value < 0,
      ) ||
      (maxStock !== null && (!Number.isFinite(maxStock) || maxStock < 0))
    ) {
      rowIssues.push("hay un precio o una cantidad inválida");
    }
    if (maxStock !== null && maxStock < minStock) {
      rowIssues.push("el stock máximo es menor que el mínimo");
    }
    if (rowIssues.length) {
      issues.push({ row: rowNumber, message: rowIssues.join("; ") });
      continue;
    }

    importedRows.push({
      name,
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
    });
  }

  const consolidated = new Map<string, InventoryImportRow>();
  let consolidatedRows = 0;
  for (const row of importedRows) {
    const key = [
      normalizeText(row.name),
      normalizeText(row.unit),
    ].join("|");
    const existing = consolidated.get(key);
    if (!existing) {
      consolidated.set(key, row);
      continue;
    }
    existing.initialStock += row.initialStock;
    existing.purchasePrice ||= row.purchasePrice;
    existing.salePrice ||= row.salePrice;
    existing.description ||= row.description;
    existing.minStock = Math.max(existing.minStock, row.minStock);
    if (existing.maxStock != null || row.maxStock != null) {
      existing.maxStock = Math.max(
        existing.maxStock || 0,
        row.maxStock || 0,
        existing.minStock,
      );
    }
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
  styleWorksheet(inventory, [38, 18, 24, 32, 17, 17, 18, 15, 15, 15, 22]);
  inventory.getColumn(5).numFmt = "#,##0.00";
  inventory.getColumn(6).numFmt = "#,##0.00";
  for (const column of [8, 9, 10]) inventory.getColumn(column).numFmt = "#,##0.000";

  const instructions = workbook.addWorksheet("Instrucciones");
  instructions.addRows([
    ["PLANTILLA DE IMPORTACIÓN PROINV"],
    ["Completa una fila por producto. No cambies los encabezados de Inventario."],
    ["Campos obligatorios", "Nombre. Los precios y existencias vacíos se interpretan como cero."],
    ["Coincidencias", "Se omiten productos ya existentes con el mismo nombre y unidad."],
    ["Filas repetidas", "Las filas idénticas dentro del archivo se consolidan y suman su stock."],
    ["Límite", "1000 filas y 10 MB por importación."],
  ]);
  instructions.columns = [{ width: 24 }, { width: 78 }];
  instructions.getRow(1).font = { bold: true, color: { argb: "FF0B607E" }, size: 14 };
  instructions.getRow(1).height = 28;
  instructions.views = [{ state: "frozen", ySplit: 1 }];

  const output = await workbook.xlsx.writeBuffer();
  downloadBuffer("plantilla-importacion-proinv.xlsx", output as ArrayBuffer);
}

export async function downloadWorkspaceWorkbook(workspace: WorkspaceData) {
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
  inventory.addRow([...inventoryHeaders, "ESTADO"]);
  for (const product of workspace.products) {
    inventory.addRow([
      product.name,
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
      product.active ? getStockStatus(product) : "archivado",
    ]);
  }
  styleWorksheet(inventory, [38, 18, 24, 32, 17, 17, 18, 15, 15, 15, 22, 15]);
  inventory.getColumn(5).numFmt = "#,##0.00";
  inventory.getColumn(6).numFmt = "#,##0.00";
  for (const column of [8, 9, 10]) inventory.getColumn(column).numFmt = "#,##0.000";

  const movements = workbook.addWorksheet("Movimientos");
  const movementHeaders = [
    "FECHA",
    "PRODUCTO",
    "ALMACÉN",
    "TIPO",
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
  ];
  movements.addRow(movementHeaders);
  const productById = new Map(workspace.products.map((item) => [item.id, item.name]));
  for (const movement of workspace.movements) {
    movements.addRow([
      new Date(movement.occurredAt),
      productById.get(movement.productId) || "Producto eliminado",
      warehouseById.get(movement.warehouseId) || "",
      movement.type,
      movement.quantity,
      movement.stockBefore,
      movement.stockAfter,
      movement.unitCost,
      movement.saleUnitPrice ?? "",
      movement.totalCost,
      movement.revenue,
      movement.grossProfit,
      movement.reason || "",
      movement.note || "",
    ]);
  }
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
  ]);
  styleWorksheet(summary, [34, 24]);
  summary.getColumn(2).numFmt = "#,##0.00";

  const output = await workbook.xlsx.writeBuffer();
  downloadBuffer(
    `respaldo-proinv-${new Date().toISOString().slice(0, 10)}.xlsx`,
    output as ArrayBuffer,
  );
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
    headers.map((header) => Math.min(Math.max(header.length + 4, 14), 34)),
  );
  const output = await workbook.xlsx.writeBuffer();
  downloadBuffer(filename.replace(/\.csv$/i, ".xlsx"), output as ArrayBuffer);
}
