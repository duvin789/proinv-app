"use client";

import {
  ArrowsLeftRightIcon,
  InfoIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { useInventory } from "@/components/inventory-provider";

export function ProductSubstitutesPanel() {
  const {
    workspace,
    isMutating,
    createProductSubstitute,
    deleteProductSubstitute,
  } = useInventory();
  const canManage =
    workspace.viewer.role === "owner" || workspace.viewer.role === "admin";
  const activeProducts = useMemo(
    () =>
      workspace.products
        .filter((product) => product.active)
        .toSorted((a, b) => a.name.localeCompare(b.name, "es")),
    [workspace.products],
  );
  const productMap = useMemo(
    () => new Map(workspace.products.map((product) => [product.id, product])),
    [workspace.products],
  );
  const relations = useMemo(
    () =>
      workspace.productSubstitutes.toSorted((a, b) => {
        const firstA = productMap.get(a.productId)?.name || "";
        const firstB = productMap.get(b.productId)?.name || "";
        return firstA.localeCompare(firstB, "es");
      }),
    [productMap, workspace.productSubstitutes],
  );
  const [form, setForm] = useState({
    productId: "",
    substituteProductId: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedProduct = productMap.get(form.productId);

  const unavailableSubstituteIds = useMemo(() => {
    if (!form.productId) return new Set<string>();
    const ids = new Set<string>([form.productId]);
    for (const relation of workspace.productSubstitutes) {
      if (relation.productId === form.productId) {
        ids.add(relation.substituteProductId);
      } else if (relation.substituteProductId === form.productId) {
        ids.add(relation.productId);
      }
    }
    return ids;
  }, [form.productId, workspace.productSubstitutes]);
  const compatibleSubstitutes = useMemo(() => {
    if (!selectedProduct) return [];
    const selectedUnit = selectedProduct.unit.trim().toLocaleLowerCase("es");
    return activeProducts.filter(
      (product) =>
        product.unit.trim().toLocaleLowerCase("es") === selectedUnit &&
        !unavailableSubstituteIds.has(product.id),
    );
  }, [activeProducts, selectedProduct, unavailableSubstituteIds]);

  async function addRelation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!form.productId || !form.substituteProductId) {
      setError("Selecciona el producto y su alternativa.");
      return;
    }

    const result = await createProductSubstitute({
      productId: form.productId,
      substituteProductId: form.substituteProductId,
      note: form.note || undefined,
    });
    if (result.ok) {
      setForm({ productId: "", substituteProductId: "", note: "" });
    } else {
      setError(result.message);
    }
  }

  async function removeRelation(
    relationId: string,
    firstName: string,
    secondName: string,
  ) {
    const confirmed = window.confirm(
      `¿Dejar de sugerir “${firstName}” y “${secondName}” como sustitutos?`,
    );
    if (!confirmed) return;

    setError("");
    setDeletingId(relationId);
    try {
      const result = await deleteProductSubstitute(relationId);
      if (!result.ok) setError(result.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="substitute-settings">
      <div className="substitute-guidance">
        <InfoIcon size={19} weight="duotone" aria-hidden="true" />
        <p>
          Solo se sugerirán relaciones confirmadas aquí. El sistema no asumirá
          que dos productos son equivalentes por tener nombres parecidos y solo
          permite alternativas con la misma unidad de medida.
        </p>
      </div>

      <div className="substitute-list" aria-live="polite">
        {relations.length === 0 ? (
          <p className="settings-list-empty">
            Aún no hay sustitutos configurados. El aviso de stock mostrará
            únicamente el mismo producto disponible en otros almacenes.
          </p>
        ) : (
          relations.map((relation) => {
            const first = productMap.get(relation.productId);
            const second = productMap.get(relation.substituteProductId);
            if (!first || !second) return null;
            return (
              <article key={relation.id} className="substitute-row">
                <div className="substitute-product-name">
                  <strong>{first.name}</strong>
                  <span>{first.sku}</span>
                </div>
                <span className="substitute-link-icon" aria-hidden="true">
                  <ArrowsLeftRightIcon size={19} weight="bold" />
                </span>
                <div className="substitute-product-name">
                  <strong>{second.name}</strong>
                  <span>{second.sku}</span>
                </div>
                {relation.note ? (
                  <p className="substitute-note">{relation.note}</p>
                ) : (
                  <span className="substitute-note muted">Sin indicación adicional</span>
                )}
                <button
                  type="button"
                  className="icon-button danger-icon-button"
                  onClick={() =>
                    removeRelation(relation.id, first.name, second.name)
                  }
                  disabled={!canManage || isMutating}
                  aria-label={`Eliminar relación entre ${first.name} y ${second.name}`}
                  title={canManage ? "Eliminar relación" : "Solo administradores"}
                  aria-busy={deletingId === relation.id}
                >
                  <TrashIcon size={18} />
                </button>
              </article>
            );
          })
        )}
      </div>

      <form className="substitute-create-form" onSubmit={addRelation}>
        <div className="form-grid form-grid-2">
          <label className="field">
            <span>Producto</span>
            <select
              value={form.productId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  productId: event.target.value,
                  substituteProductId: "",
                }))
              }
              disabled={!canManage || activeProducts.length < 2}
              required
            >
              <option value="">Selecciona un producto</option>
              {activeProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.sku}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Producto sustituto</span>
            <select
              value={form.substituteProductId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  substituteProductId: event.target.value,
                }))
              }
              disabled={
                !canManage ||
                !form.productId ||
                compatibleSubstitutes.length === 0
              }
              required
            >
              <option value="">
                {form.productId && compatibleSubstitutes.length === 0
                  ? "No hay alternativas con la misma unidad"
                  : "Selecciona la alternativa"}
              </option>
              {compatibleSubstitutes.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.sku}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-span-2">
            <span>Cuándo usarlo</span>
            <input
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Opcional: misma medida, acabado equivalente…"
              maxLength={500}
              disabled={!canManage}
            />
          </label>
        </div>
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="settings-form-footer">
          <button
            type="submit"
            className="button button-secondary"
            disabled={
              !canManage ||
              isMutating ||
              !form.productId ||
              !form.substituteProductId
            }
          >
            <PlusIcon size={18} weight="bold" />
            Vincular sustitutos
          </button>
        </div>
      </form>
    </div>
  );
}
