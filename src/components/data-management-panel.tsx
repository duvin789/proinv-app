"use client";

import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileArrowDownIcon,
  FileXlsIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";

import { useInventory } from "@/components/inventory-provider";
import { Modal } from "@/components/ui/modal";
import {
  downloadInventoryTemplate,
  downloadCompleteWorkspaceWorkbook,
  inventoryConflictKey,
  inventoryNameKey,
  parseInventoryWorkbook,
  type InventoryImportPreview,
} from "@/lib/excel";
import type {
  InventoryImportConflictPolicy,
  Product,
} from "@/lib/types";

export function DataManagementPanel() {
  const {
    workspace,
    isMutating,
    importInventoryProducts,
    clearInventoryData,
  } = useInventory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [conflictPolicy, setConflictPolicy] = useState<
    "" | InventoryImportConflictPolicy
  >(
    "",
  );
  const [busyTask, setBusyTask] = useState<
    "parse" | "export" | "template" | null
  >(null);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const canManage =
    workspace.viewer.role === "owner" || workspace.viewer.role === "admin";
  const canDeleteAll = canManage;
  const previewMatchAnalysis = useMemo(() => {
    if (!preview) return { conflicts: [], ambiguities: [] };

    const addToIndex = (
      index: Map<string, Product[]>,
      key: string,
      product: Product,
    ) => {
      if (!key) return;
      index.set(key, [...(index.get(key) || []), product]);
    };
    const existingByKey = new Map<string, Product[]>();
    const existingByName = new Map<string, Product[]>();
    const existingBySku = new Map<string, Product[]>();
    const existingByBarcode = new Map<string, Product[]>();

    for (const product of workspace.products) {
      addToIndex(existingByKey, inventoryConflictKey(product), product);
      addToIndex(existingByName, inventoryNameKey(product), product);
      addToIndex(existingBySku, product.sku.trim().toUpperCase(), product);
      addToIndex(
        existingByBarcode,
        product.barcode?.trim() || "",
        product,
      );
    }

    const conflicts: Array<{
      index: number;
      row: (typeof preview.rows)[number];
      product: Product;
    }> = [];
    const ambiguities: Array<{
      index: number;
      row: (typeof preview.rows)[number];
      products: Product[];
    }> = [];

    preview.rows.forEach((row, index) => {
      const candidates = new Map<string, Product>();
      const addCandidates = (products: Product[] | undefined) => {
        for (const product of products || []) {
          candidates.set(product.id, product);
        }
      };

      addCandidates(
        row.unit
          ? existingByKey.get(inventoryConflictKey(row))
          : existingByName.get(inventoryNameKey(row)),
      );
      if (row.sku) {
        addCandidates(existingBySku.get(row.sku.trim().toUpperCase()));
      }
      if (row.barcode) {
        addCandidates(existingByBarcode.get(row.barcode.trim()));
      }

      const products = [...candidates.values()];
      if (products.length === 1) {
        conflicts.push({ index, row, product: products[0] });
      } else if (products.length > 1) {
        ambiguities.push({ index, row, products });
      }
    });

    return { conflicts, ambiguities };
  }, [preview, workspace.products]);
  const previewConflicts = previewMatchAnalysis.conflicts;
  const previewAmbiguities = previewMatchAnalysis.ambiguities;
  const conflictIndexes = useMemo(
    () => new Set(previewConflicts.map((conflict) => conflict.index)),
    [previewConflicts],
  );
  const ambiguityIndexes = useMemo(
    () => new Set(previewAmbiguities.map((ambiguity) => ambiguity.index)),
    [previewAmbiguities],
  );
  const importableRows = useMemo(
    () =>
      preview?.rows.filter((_, index) => !ambiguityIndexes.has(index)) || [],
    [ambiguityIndexes, preview],
  );
  const newRows = useMemo(
    () =>
      preview?.rows.filter(
        (_, index) =>
          !conflictIndexes.has(index) && !ambiguityIndexes.has(index),
      ) || [],
    [ambiguityIndexes, conflictIndexes, preview],
  );

  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setBusyTask("parse");
    try {
      const result = await parseInventoryWorkbook(file);
      setFileName(file.name);
      setPreview(result);
      setConflictPolicy("");
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "No fue posible leer el archivo.",
      );
      event.target.value = "";
    } finally {
      setBusyTask(null);
    }
  }

  async function exportBackup() {
    setError("");
    setBusyTask("export");
    try {
      await downloadCompleteWorkspaceWorkbook();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "No fue posible generar la exportación.",
      );
    } finally {
      setBusyTask(null);
    }
  }

  async function exportTemplate() {
    setError("");
    setBusyTask("template");
    try {
      await downloadInventoryTemplate();
    } catch (templateError) {
      setError(
        templateError instanceof Error
          ? templateError.message
          : "No fue posible generar la plantilla.",
      );
    } finally {
      setBusyTask(null);
    }
  }

  function closePreview() {
    if (isMutating) return;
    setPreview(null);
    setFileName("");
    setConflictPolicy("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmImport() {
    if (!preview?.rows.length) return;
    if (importableRows.length === 0) {
      setError(
        "No hay productos que se puedan importar. Corrige los conflictos ambiguos del archivo.",
      );
      return;
    }
    if (previewConflicts.length > 0 && !conflictPolicy) {
      setError("Elige qué hacer con los productos que ya existen.");
      return;
    }
    const policy: InventoryImportConflictPolicy =
      previewConflicts.length > 0
        ? (conflictPolicy as InventoryImportConflictPolicy)
        : "skip";
    if (policy === "skip" && newRows.length === 0) {
      setError(
        "Todos los productos del archivo ya existen. No hay filas nuevas para importar.",
      );
      return;
    }
    const rowsToImport = policy === "update" ? importableRows : newRows;
    const result = await importInventoryProducts(rowsToImport, policy);
    if (result.ok) closePreview();
    else setError(result.message);
  }

  async function confirmDelete() {
    const result = await clearInventoryData(confirmation);
    if (result.ok) {
      setDeleteOpen(false);
      setConfirmation("");
    }
  }

  return (
    <>
      <div className="data-management-grid">
        <article className="data-action-card">
          <span className="data-action-icon" aria-hidden="true">
            <FileArrowDownIcon size={22} weight="duotone" />
          </span>
          <div>
            <strong>Exportación completa de datos</strong>
            <p>
              Exporta productos, existencias por almacén, movimientos,
              catálogos y un resumen en un solo archivo Excel.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={exportBackup}
            disabled={!canManage || busyTask !== null}
            title={
              canManage
                ? undefined
                : "Solo un administrador puede exportar todos los datos"
            }
          >
            <DownloadSimpleIcon size={18} weight="bold" />
            {busyTask === "export" ? "Preparando..." : "Exportar Excel"}
          </button>
        </article>

        <article className="data-action-card">
          <span className="data-action-icon" aria-hidden="true">
            <FileXlsIcon size={22} weight="duotone" />
          </span>
          <div>
            <strong>Importar inventario</strong>
            <p>
              Reconoce la estructura de data.xlsx, valida las filas y muestra
              una vista previa antes de guardar.
            </p>
          </div>
          <div className="data-action-buttons">
            <button
              type="button"
              className="button button-secondary"
              onClick={exportTemplate}
              disabled={busyTask !== null}
            >
              <DownloadSimpleIcon size={17} />
              {busyTask === "template" ? "Preparando..." : "Plantilla"}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canManage || busyTask !== null || isMutating}
            >
              <UploadSimpleIcon size={18} weight="bold" />
              {busyTask === "parse" ? "Leyendo..." : "Elegir archivo"}
            </button>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={selectFile}
              tabIndex={-1}
            />
          </div>
        </article>
      </div>

      <p className="settings-helper data-helper">
        Antes de guardar se comparan nombre y unidad. Si hay coincidencias,
        eliges cómo resolverlas; nunca se cambia el stock existente en silencio.
      </p>

      {error ? (
        <p className="inline-error data-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="danger-zone">
        <div>
          <strong>Borrar todos los datos</strong>
          <p>
            Elimina productos, movimientos y catálogos. Conserva la cuenta, la
            empresa y el almacén principal. El Excel conserva datos y rutas,
            pero no copia los archivos de imagen; guarda las fotos importantes
            por separado antes de borrar.
          </p>
        </div>
        <button
          type="button"
          className="button button-danger"
          onClick={() => setDeleteOpen(true)}
          disabled={!canDeleteAll || isMutating}
          title={
            canDeleteAll
              ? undefined
              : "Solo propietarios y administradores pueden borrar todos los datos"
          }
        >
          <TrashIcon size={18} />
          Borrar datos
        </button>
      </div>

      <Modal
        open={preview !== null}
        onClose={closePreview}
        title="Revisar importación"
        description={fileName || "Archivo Excel"}
        size="lg"
      >
        {preview ? (
          <div className="import-preview">
            <div className="import-summary">
              <div>
                <CheckCircleIcon size={20} weight="fill" />
                <span>Nuevos</span>
                <strong>{newRows.length}</strong>
              </div>
              <div>
                <WarningIcon size={20} weight="duotone" />
                <span>Coincidencias</span>
                <strong>{previewConflicts.length}</strong>
              </div>
              <div>
                <WarningIcon size={20} weight="duotone" />
                <span>Con observaciones</span>
                <strong>
                  {preview.issues.length + previewAmbiguities.length}
                </strong>
              </div>
              <div>
                <FileXlsIcon size={20} weight="duotone" />
                <span>Hoja detectada</span>
                <strong>{preview.sheetName}</strong>
              </div>
            </div>

            {preview.consolidatedRows > 0 ? (
              <p className="import-note">
                Se consolidaron {preview.consolidatedRows} filas repetidas y se
                sumaron sus existencias.
              </p>
            ) : null}

            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU o código</th>
                    <th>Proveedor</th>
                    <th>Unidad</th>
                    <th className="align-right">Stock</th>
                    <th className="align-right">Mínimo</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 8).map((row, index) => {
                    const isConflict = conflictIndexes.has(index);
                    const isAmbiguous = ambiguityIndexes.has(index);
                    return (
                      <tr key={`${row.name}-${row.supplier || ""}-${index}`}>
                        <td>{row.name}</td>
                        <td>
                          {row.sku ||
                            row.barcode ||
                            (isConflict
                              ? "Sin cambio"
                              : isAmbiguous
                                ? "Revisar archivo"
                                : "Sin código")}
                        </td>
                        <td>
                          {row.supplier ||
                            (isConflict
                              ? "Sin cambio"
                              : isAmbiguous
                                ? "Revisar archivo"
                                : "Sin proveedor")}
                        </td>
                        <td>
                          {row.unit ||
                            (isConflict
                              ? "Sin cambio"
                              : isAmbiguous
                                ? "Revisar archivo"
                                : "unidad")}
                        </td>
                        <td className="align-right">
                          {isConflict
                            ? "No cambia"
                            : isAmbiguous
                              ? "No se importa"
                              : (row.initialStock ?? 0)}
                        </td>
                        <td className="align-right">
                          {row.minStock ??
                            (isConflict
                              ? "Sin cambio"
                              : isAmbiguous
                                ? "Revisar"
                                : 0)}
                        </td>
                        <td>
                          {isAmbiguous
                            ? "Conflicto ambiguo"
                            : isConflict
                              ? "Ya existe"
                              : "Producto nuevo"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 8 ? (
              <p className="import-more">
                Y {preview.rows.length - 8} productos más.
              </p>
            ) : null}

            {previewConflicts.length > 0 ? (
              <label className="field">
                <span>Qué hacer con las coincidencias</span>
                <select
                  value={conflictPolicy}
                  onChange={(event) => {
                    setConflictPolicy(
                      event.target.value as
                        | ""
                        | InventoryImportConflictPolicy,
                    );
                    setError("");
                  }}
                  required
                >
                  <option value="">Elige una opción antes de importar</option>
                  <option value="skip">
                    Omitir coincidencias y conservarlas sin cambios
                  </option>
                  <option value="update">
                    Actualizar solo las celdas llenas, sin cambiar stock
                  </option>
                </select>
                <small>
                  Se detectaron {previewConflicts.length} productos con el mismo
                  nombre, unidad o código. Las celdas vacías conservarán el
                  valor actual y ninguna opción sumará sus existencias.
                </small>
              </label>
            ) : null}

            {previewAmbiguities.length > 0 ? (
              <div className="import-issues" role="alert">
                <strong>Conflictos ambiguos que no se importarán</strong>
                <p>
                  Estos datos apuntan a más de un producto existente. Los
                  excluiremos de esta importación para proteger el inventario;
                  corrige su nombre, unidad, SKU o código de barras en el Excel.
                </p>
                <ul>
                  {previewAmbiguities.slice(0, 6).map((ambiguity) => (
                    <li key={`${ambiguity.index}-${ambiguity.row.name}`}>
                      {ambiguity.row.name}: coincide con{" "}
                      {ambiguity.products
                        .map(
                          (product) =>
                            `${product.name} (${product.sku || product.barcode || product.unit})`,
                        )
                        .join(", ")}
                      .
                    </li>
                  ))}
                </ul>
                {previewAmbiguities.length > 6 ? (
                  <small>
                    Y {previewAmbiguities.length - 6} conflictos ambiguos más.
                  </small>
                ) : null}
              </div>
            ) : null}

            {preview.issues.length ? (
              <div className="import-issues" role="status">
                <strong>Filas que no se importarán</strong>
                <ul>
                  {preview.issues.slice(0, 6).map((issue) => (
                    <li key={`${issue.row}-${issue.message}`}>
                      Fila {issue.row}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <footer className="modal-footer import-footer">
              <button
                type="button"
                className="button button-secondary"
                onClick={closePreview}
                disabled={isMutating}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={confirmImport}
                disabled={
                  isMutating ||
                  importableRows.length === 0 ||
                  (previewConflicts.length > 0 &&
                    (!conflictPolicy ||
                      (conflictPolicy === "skip" && newRows.length === 0)))
                }
              >
                <UploadSimpleIcon size={18} weight="bold" />
                {isMutating
                  ? "Importando..."
                  : conflictPolicy === "update"
                    ? `Crear o actualizar ${importableRows.length} productos`
                    : `Importar ${newRows.length} productos nuevos`}
              </button>
            </footer>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (!isMutating) setDeleteOpen(false);
        }}
        title="Borrar todos los datos"
        description="Esta acción no se puede deshacer. Exporta los datos y guarda las imágenes importantes antes de continuar."
        size="sm"
      >
        <div className="delete-all-form">
          <div className="delete-warning">
            <WarningIcon size={22} weight="fill" />
            <p>
              Se borrarán {workspace.products.length} productos y{" "}
              {workspace.movements.length} movimientos visibles.
            </p>
          </div>
          <label className="field">
            <span>Escribe BORRAR TODO para confirmar</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={isMutating}
            />
          </label>
          <footer className="modal-footer import-footer">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={isMutating}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={confirmDelete}
              disabled={confirmation.trim().toUpperCase() !== "BORRAR TODO" || isMutating}
            >
              <TrashIcon size={18} />
              {isMutating ? "Borrando..." : "Borrar definitivamente"}
            </button>
          </footer>
        </div>
      </Modal>
    </>
  );
}
