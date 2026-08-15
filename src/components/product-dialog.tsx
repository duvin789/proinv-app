"use client";

import {
  CalculatorIcon,
  ImageSquareIcon,
  InfoIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatCurrency, formatPercent } from "@/lib/format";
import { useInventory } from "@/components/inventory-provider";
import { Modal } from "@/components/ui/modal";
import type { ProductInput, ProductUpdateInput } from "@/lib/types";

const manufacturingUnits = [
  "unidad",
  "pieza",
  "par",
  "juego",
  "kit",
  "docena",
  "milímetro",
  "centímetro",
  "pulgada",
  "metro",
  "metro lineal",
  "metro de tela",
  "metro cuadrado",
  "metro cúbico",
  "pie",
  "pie lineal",
  "pie cuadrado",
  "pie tablar",
  "yarda",
  "gramo",
  "kilogramo",
  "tonelada",
  "libra",
  "onza",
  "mililitro",
  "litro",
  "galón",
  "rollo",
  "bobina",
  "carrete",
  "cono",
  "madeja",
  "plancha",
  "placa",
  "panel",
  "lámina",
  "chapa",
  "tablero",
  "tablón",
  "listón",
  "barra",
  "perfil",
  "tubo",
  "varilla",
  "bloque",
  "caja",
  "paquete",
  "bolsa",
  "saco",
  "fardo",
  "lote",
  "pallet",
  "tambor",
  "balde",
  "bidón",
  "botella",
  "tarro",
  "resma",
] as const;

const emptyForm = {
  name: "",
  description: "",
  sku: "",
  barcode: "",
  categoryId: "",
  supplierName: "",
  warehouseId: "",
  unit: "unidad",
  purchasePrice: "0",
  salePrice: "0",
  initialStock: "0",
  minStock: "5",
  maxStock: "",
};

export function ProductDialog() {
  const {
    workspace,
    isMutating,
    productDialog,
    closeProductDialog,
    createProduct,
    updateProduct,
  } = useInventory();
  const [form, setForm] = useState(() => {
    const product = productDialog.product;
    const warehouseId =
      workspace.warehouses.find((warehouse) => warehouse.isDefault)?.id ||
      workspace.warehouses[0]?.id ||
      "";

    return product
      ? {
          name: product.name,
          description: product.description || "",
          sku: product.sku,
          barcode: product.barcode || "",
          categoryId: product.categoryId || "",
          supplierName:
            workspace.suppliers.find(
              (supplier) => supplier.id === product.supplierId,
            )?.name || "",
          warehouseId,
          unit: product.unit,
          purchasePrice: String(product.purchasePrice),
          salePrice: String(product.salePrice),
          initialStock: String(product.currentStock),
          minStock: String(product.minStock),
          maxStock:
            product.maxStock === null ? "" : String(product.maxStock),
        }
      : { ...emptyForm, warehouseId };
  });
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editingProduct = productDialog.product;

  useEffect(() => {
    return () => {
      if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    };
  }, [localImageUrl]);

  const imagePreviewUrl =
    localImageUrl ||
    (!removeImage && editingProduct?.imagePath
      ? `/api/product-images/${encodeURIComponent(editingProduct.id)}?size=preview`
      : null);
  const hasProductImage = Boolean(
    imageFile || (!removeImage && editingProduct?.imagePath),
  );

  const calculations = useMemo(() => {
    const purchasePrice = Number(form.purchasePrice) || 0;
    const salePrice = Number(form.salePrice) || 0;
    const initialStock = Number(form.initialStock) || 0;
    return {
      margin:
        salePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : 0,
      unitProfit: salePrice - purchasePrice,
      initialValue: initialStock * purchasePrice,
    };
  }, [form.initialStock, form.purchasePrice, form.salePrice]);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("La imagen debe estar en formato JPG, PNG o WebP.");
      event.target.value = "";
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError("La imagen debe pesar como máximo 5 MB.");
      event.target.value = "";
      return;
    }

    setError("");
    setImageFile(file);
    setLocalImageUrl(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  function clearImage() {
    setImageFile(null);
    setLocalImageUrl(null);
    setRemoveImage(Boolean(editingProduct?.imagePath));
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Ingresa el nombre del producto.");
      return;
    }
    if (!form.warehouseId) {
      setError("Selecciona un almacén.");
      return;
    }

    const numericValues = [
      Number(form.purchasePrice),
      Number(form.salePrice),
      Number(form.initialStock),
      Number(form.minStock),
      form.maxStock === "" ? 0 : Number(form.maxStock),
    ];
    if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Los precios y las cantidades deben ser números positivos.");
      return;
    }

    if (
      form.maxStock !== "" &&
      Number(form.maxStock) < Number(form.minStock)
    ) {
      setError("El stock máximo no puede ser menor que el stock mínimo.");
      return;
    }

    const base = {
      name: form.name,
      description: form.description || undefined,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      categoryId: form.categoryId || undefined,
      supplierName: form.supplierName || undefined,
      unit: form.unit,
      purchasePrice: Number(form.purchasePrice),
      salePrice: Number(form.salePrice),
      minStock: Number(form.minStock),
      maxStock: form.maxStock === "" ? null : Number(form.maxStock),
      imageFile,
    };

    const result = editingProduct
      ? await updateProduct({
          ...base,
          id: editingProduct.id,
          removeImage,
        } satisfies ProductUpdateInput)
      : await createProduct({
          ...base,
          warehouseId: form.warehouseId,
          initialStock: Number(form.initialStock),
        } satisfies ProductInput);

    if (result.ok) closeProductDialog();
    else setError(result.message);
  }

  const currency = workspace.organization.currency;
  const locale = workspace.organization.locale;

  return (
    <Modal
      open={productDialog.open}
      onClose={closeProductDialog}
      title={editingProduct ? "Editar producto" : "Nuevo producto"}
      description={
        editingProduct
          ? "Actualiza los datos comerciales. El stock se modifica con movimientos."
          : "Completa lo esencial. Kadmiel hará los cálculos por ti."
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-section">
          <div className="form-section-heading">
            <h3>Identificación</h3>
            <p>El identificador interno se genera automáticamente.</p>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field field-span-2">
              <span>Nombre del producto</span>
              <input
                name="name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Ej. Espuma D20 de 4 pulgadas"
                required
                maxLength={140}
              />
            </label>
            <label className="field">
              <span>SKU</span>
              <input
                name="sku"
                value={form.sku}
                onChange={(event) => updateField("sku", event.target.value)}
                placeholder="Se genera si lo dejas vacío"
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Código de barras</span>
              <input
                name="barcode"
                value={form.barcode}
                onChange={(event) =>
                  updateField("barcode", event.target.value)
                }
                placeholder="Escanea o escribe el código"
                maxLength={80}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Categoría</span>
              <select
                name="categoryId"
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
              >
                <option value="">Sin categoría</option>
                {workspace.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Proveedor (ingreso manual)</span>
              <input
                name="supplierName"
                list="supplier-options"
                value={form.supplierName}
                onChange={(event) =>
                  updateField("supplierName", event.target.value)
                }
                placeholder="Escribe el nombre del proveedor"
                maxLength={120}
                autoComplete="off"
              />
              <datalist id="supplier-options">
                {workspace.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.name} />
                ))}
              </datalist>
            </label>
            <label className="field field-span-2">
              <span>Descripción</span>
              <textarea
                name="description"
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Material, densidad, medida, color o acabado"
                rows={2}
                maxLength={500}
              />
            </label>
            <div className="product-image-field field-span-2">
              <div className="product-image-preview" aria-live="polite">
                {imagePreviewUrl ? (
                  <Image
                    src={imagePreviewUrl}
                    alt={`Vista previa de ${form.name || "producto"}`}
                    width={160}
                    height={120}
                    unoptimized
                  />
                ) : (
                  <ImageSquareIcon
                    size={34}
                    weight="duotone"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="product-image-controls">
                <strong>Imagen del producto</strong>
                <span>JPG, PNG o WebP. Máximo 5 MB.</span>
                <div>
                  <label className="button button-secondary product-image-upload">
                    <UploadSimpleIcon size={17} weight="bold" />
                    {hasProductImage ? "Cambiar imagen" : "Elegir imagen"}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="sr-only"
                    />
                  </label>
                  {hasProductImage ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={clearImage}
                    >
                      <TrashIcon size={17} />
                      Quitar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-heading">
            <h3>Precios y existencias</h3>
            <p>El margen y la valorización se actualizan al instante.</p>
          </div>
          <div className="form-grid form-grid-3">
            <label className="field">
              <span>Costo de compra</span>
              <div className="input-prefix">
                <span>{currency}</span>
                <input
                  name="purchasePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(event) =>
                    updateField("purchasePrice", event.target.value)
                  }
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Precio de venta</span>
              <div className="input-prefix">
                <span>{currency}</span>
                <input
                  name="salePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salePrice}
                  onChange={(event) =>
                    updateField("salePrice", event.target.value)
                  }
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Unidad de medida</span>
              <input
                name="unit"
                list="manufacturing-unit-options"
                value={form.unit}
                onChange={(event) => updateField("unit", event.target.value)}
                placeholder="Ej. metro, kg, plancha"
                maxLength={24}
                required
                autoComplete="off"
              />
              <datalist id="manufacturing-unit-options">
                {manufacturingUnits.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </label>
            {!editingProduct ? (
              <label className="field">
                <span>Stock inicial</span>
                <input
                  name="initialStock"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.initialStock}
                  onChange={(event) =>
                    updateField("initialStock", event.target.value)
                  }
                  required
                />
              </label>
            ) : null}
            <label className="field">
              <span>Alerta de stock mínimo</span>
              <input
                name="minStock"
                type="number"
                min="0"
                step="0.001"
                value={form.minStock}
                onChange={(event) =>
                  updateField("minStock", event.target.value)
                }
                required
              />
            </label>
            <label className="field">
              <span>Stock máximo</span>
              <input
                name="maxStock"
                type="number"
                min="0"
                step="0.001"
                value={form.maxStock}
                onChange={(event) =>
                  updateField("maxStock", event.target.value)
                }
                placeholder="Opcional"
              />
            </label>
            {!editingProduct ? (
              <label className="field">
                <span>Almacén</span>
                <select
                  name="warehouseId"
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
            ) : null}
          </div>
        </div>

        <div className="calculation-preview" aria-live="polite">
          <div className="calculation-preview-icon">
            <CalculatorIcon size={22} weight="duotone" />
          </div>
          <div>
            <span>Ganancia por unidad</span>
            <strong>
              {formatCurrency(calculations.unitProfit, currency, locale)}
            </strong>
          </div>
          <div>
            <span>Margen bruto</span>
            <strong>{formatPercent(calculations.margin, locale)}</strong>
          </div>
          {!editingProduct ? (
            <div>
              <span>Valor inicial</span>
              <strong>
                {formatCurrency(calculations.initialValue, currency, locale)}
              </strong>
            </div>
          ) : null}
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
            onClick={closeProductDialog}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isMutating}
          >
            {isMutating
              ? "Guardando..."
              : editingProduct
                ? "Guardar cambios"
                : "Crear producto"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
