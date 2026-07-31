"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  archiveProductAction,
  createCategoryAction,
  createProductAction,
  createSupplierAction,
  recordMovementAction,
  updateOrganizationAction,
  updateProductAction,
} from "@/app/actions/inventory";
import { demoWorkspace } from "@/lib/demo-data";
import {
  applyMovementToProduct,
  cloneWorkspace,
  roundMoney,
  roundStock,
} from "@/lib/inventory";
import type {
  ActionResult,
  CategoryInput,
  InventoryMovement,
  MovementInput,
  OrganizationInput,
  Product,
  ProductInput,
  ProductUpdateInput,
  SupplierInput,
  WorkspaceData,
} from "@/lib/types";

const DEMO_STORAGE_KEY = "proinv-demo-workspace-v1";

export interface ToastMessage {
  id: string;
  tone: "success" | "error" | "info";
  title: string;
  description?: string;
}

interface InventoryContextValue {
  workspace: WorkspaceData;
  isMutating: boolean;
  toast: ToastMessage | null;
  productDialog: { open: boolean; product: Product | null };
  movementDialog: { open: boolean; product: Product | null };
  openProductDialog: (product?: Product) => void;
  closeProductDialog: () => void;
  openMovementDialog: (product?: Product) => void;
  closeMovementDialog: () => void;
  dismissToast: () => void;
  createProduct: (
    input: ProductInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  updateProduct: (
    input: ProductUpdateInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  archiveProduct: (
    productId: string,
  ) => Promise<ActionResult<WorkspaceData>>;
  recordMovement: (
    input: MovementInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  updateOrganization: (
    input: OrganizationInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  createCategory: (
    input: CategoryInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  createSupplier: (
    input: SupplierInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  resetDemo: () => void;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

function makeResult(
  workspace: WorkspaceData,
  message: string,
): ActionResult<WorkspaceData> {
  return { ok: true, data: workspace, message };
}

function createReadableSku(name: string, existingSkus: Set<string>) {
  const prefix =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "PRO";

  let candidate = "";
  do {
    candidate = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (existingSkus.has(candidate));
  return candidate;
}

function isWorkspaceData(value: unknown): value is WorkspaceData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspaceData>;
  return (
    candidate.mode === "demo" &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.movements) &&
    Boolean(candidate.organization)
  );
}

export function InventoryProvider({
  initialWorkspace,
  children,
}: {
  initialWorkspace: WorkspaceData;
  children: React.ReactNode;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [demoReady, setDemoReady] = useState(
    initialWorkspace.mode !== "demo",
  );
  const [isMutating, setIsMutating] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [productDialog, setProductDialog] = useState<{
    open: boolean;
    product: Product | null;
  }>({ open: false, product: null });
  const [movementDialog, setMovementDialog] = useState<{
    open: boolean;
    product: Product | null;
  }>({ open: false, product: null });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (
      tone: ToastMessage["tone"],
      title: string,
      description?: string,
    ) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({
        id: crypto.randomUUID(),
        tone,
        title,
        description,
      });
      toastTimerRef.current = setTimeout(() => setToast(null), 4800);
    },
    [],
  );

  useEffect(() => {
    if (initialWorkspace.mode !== "demo") return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (isWorkspaceData(parsed)) setWorkspace(parsed);
        }
      } catch {
        window.localStorage.removeItem(DEMO_STORAGE_KEY);
      } finally {
        setDemoReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialWorkspace.mode]);

  useEffect(() => {
    if (workspace.mode !== "demo" || !demoReady) return;
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace));
  }, [demoReady, workspace]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const applyRemoteResult = useCallback(
    (result: ActionResult<WorkspaceData>) => {
      if (result.ok && result.data) {
        setWorkspace(result.data);
        showToast("success", result.message);
      } else {
        showToast("error", "No se pudo completar la acción", result.message);
      }
      return result;
    },
    [showToast],
  );

  const runRemote = useCallback(
    async (
      action: () => Promise<ActionResult<WorkspaceData>>,
    ): Promise<ActionResult<WorkspaceData>> => {
      setIsMutating(true);
      try {
        return applyRemoteResult(await action());
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No fue posible comunicarse con el servidor.";
        const result: ActionResult<WorkspaceData> = {
          ok: false,
          message,
        };
        showToast("error", "No se pudo completar la acción", message);
        return result;
      } finally {
        setIsMutating(false);
      }
    },
    [applyRemoteResult, showToast],
  );

  const createProduct = useCallback(
    async (input: ProductInput) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => createProductAction(input));
      }

      setIsMutating(true);
      try {
        const existingSkus = new Set(
          workspace.products.map((product) => product.sku.toUpperCase()),
        );
        const requestedSku = input.sku?.trim().toUpperCase();
        const sku =
          requestedSku || createReadableSku(input.name, existingSkus);

        if (existingSkus.has(sku)) {
          const result: ActionResult<WorkspaceData> = {
            ok: false,
            message: "El SKU ya está asignado a otro producto.",
          };
          showToast("error", "No se pudo crear el producto", result.message);
          return result;
        }

        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const product: Product = {
          id,
          organizationId: workspace.organization.id,
          categoryId: input.categoryId || null,
          supplierId: input.supplierId || null,
          sku,
          barcode: input.barcode?.trim() || null,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          unit: input.unit.trim(),
          purchasePrice: roundMoney(input.purchasePrice),
          salePrice: roundMoney(input.salePrice),
          minStock: roundStock(input.minStock),
          currentStock: roundStock(input.initialStock),
          averageCost: roundMoney(input.purchasePrice),
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        const initialMovement: InventoryMovement | null =
          input.initialStock > 0
            ? {
                id: crypto.randomUUID(),
                organizationId: workspace.organization.id,
                productId: id,
                warehouseId: input.warehouseId,
                type: "initial",
                quantity: roundStock(input.initialStock),
                stockBefore: 0,
                stockAfter: roundStock(input.initialStock),
                unitCost: roundMoney(input.purchasePrice),
                saleUnitPrice: null,
                totalCost: roundMoney(
                  input.initialStock * input.purchasePrice,
                ),
                revenue: 0,
                grossProfit: 0,
                note: "Stock registrado al crear el producto",
                reference: null,
                occurredAt: now,
                createdBy: workspace.viewer.id,
              }
            : null;
        const nextWorkspace: WorkspaceData = {
          ...workspace,
          products: [product, ...workspace.products],
          movements: initialMovement
            ? [initialMovement, ...workspace.movements]
            : workspace.movements,
        };
        setWorkspace(nextWorkspace);
        showToast("success", "Producto creado y stock calculado.");
        return makeResult(
          nextWorkspace,
          "Producto creado y stock calculado.",
        );
      } finally {
        setIsMutating(false);
      }
    },
    [runRemote, showToast, workspace],
  );

  const updateProduct = useCallback(
    async (input: ProductUpdateInput) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => updateProductAction(input));
      }

      setIsMutating(true);
      try {
        const duplicate = workspace.products.some(
          (product) =>
            product.id !== input.id &&
            product.sku.toUpperCase() === input.sku.trim().toUpperCase(),
        );
        if (duplicate) {
          const result: ActionResult<WorkspaceData> = {
            ok: false,
            message: "El SKU ya está asignado a otro producto.",
          };
          showToast("error", "No se pudo actualizar", result.message);
          return result;
        }

        const nextWorkspace: WorkspaceData = {
          ...workspace,
          products: workspace.products.map((product) =>
            product.id === input.id
              ? {
                  ...product,
                  name: input.name.trim(),
                  sku: input.sku.trim().toUpperCase(),
                  barcode: input.barcode?.trim() || null,
                  description: input.description?.trim() || null,
                  categoryId: input.categoryId || null,
                  supplierId: input.supplierId || null,
                  unit: input.unit.trim(),
                  purchasePrice: roundMoney(input.purchasePrice),
                  salePrice: roundMoney(input.salePrice),
                  minStock: roundStock(input.minStock),
                  updatedAt: new Date().toISOString(),
                }
              : product,
          ),
        };
        setWorkspace(nextWorkspace);
        showToast("success", "Producto actualizado.");
        return makeResult(nextWorkspace, "Producto actualizado.");
      } finally {
        setIsMutating(false);
      }
    },
    [runRemote, showToast, workspace],
  );

  const archiveProduct = useCallback(
    async (productId: string) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => archiveProductAction(productId));
      }

      const nextWorkspace: WorkspaceData = {
        ...workspace,
        products: workspace.products.map((product) =>
          product.id === productId
            ? {
                ...product,
                active: false,
                updatedAt: new Date().toISOString(),
              }
            : product,
        ),
      };
      setWorkspace(nextWorkspace);
      showToast("success", "Producto archivado.");
      return makeResult(nextWorkspace, "Producto archivado.");
    },
    [runRemote, showToast, workspace],
  );

  const recordMovement = useCallback(
    async (input: MovementInput) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => recordMovementAction(input));
      }

      setIsMutating(true);
      try {
        const product = workspace.products.find(
          (item) => item.id === input.productId,
        );
        if (!product) {
          const result: ActionResult<WorkspaceData> = {
            ok: false,
            message: "El producto seleccionado ya no existe.",
          };
          showToast("error", "No se pudo registrar", result.message);
          return result;
        }

        try {
          const applied = applyMovementToProduct(product, input);
          const nextWorkspace: WorkspaceData = {
            ...workspace,
            products: workspace.products.map((item) =>
              item.id === product.id ? applied.product : item,
            ),
            movements: [
              {
                ...applied.movement,
                createdBy: workspace.viewer.id,
              },
              ...workspace.movements,
            ],
          };
          setWorkspace(nextWorkspace);
          showToast(
            "success",
            "Movimiento registrado. El stock fue recalculado.",
          );
          return makeResult(
            nextWorkspace,
            "Movimiento registrado. El stock fue recalculado.",
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Movimiento inválido.";
          const result: ActionResult<WorkspaceData> = {
            ok: false,
            message,
          };
          showToast("error", "No se pudo registrar", message);
          return result;
        }
      } finally {
        setIsMutating(false);
      }
    },
    [runRemote, showToast, workspace],
  );

  const updateOrganization = useCallback(
    async (input: OrganizationInput) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => updateOrganizationAction(input));
      }

      const nextWorkspace: WorkspaceData = {
        ...workspace,
        organization: {
          ...workspace.organization,
          name: input.name.trim(),
          taxId: input.taxId?.trim() || null,
          currency: input.currency.toUpperCase(),
          taxRate: roundMoney(input.taxRate),
          locale: input.locale,
        },
      };
      setWorkspace(nextWorkspace);
      showToast("success", "Configuración guardada.");
      return makeResult(nextWorkspace, "Configuración guardada.");
    },
    [runRemote, showToast, workspace],
  );

  const createCategory = useCallback(
    async (input: CategoryInput) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => createCategoryAction(input));
      }

      if (
        workspace.categories.some(
          (category) =>
            category.name.toLowerCase() === input.name.trim().toLowerCase(),
        )
      ) {
        const result: ActionResult<WorkspaceData> = {
          ok: false,
          message: "Ya existe una categoría con ese nombre.",
        };
        showToast("error", "No se pudo crear", result.message);
        return result;
      }

      const nextWorkspace: WorkspaceData = {
        ...workspace,
        categories: [
          ...workspace.categories,
          {
            id: crypto.randomUUID(),
            organizationId: workspace.organization.id,
            name: input.name.trim(),
            color: input.color,
            createdAt: new Date().toISOString(),
          },
        ].sort((a, b) => a.name.localeCompare(b.name, "es")),
      };
      setWorkspace(nextWorkspace);
      showToast("success", "Categoría creada.");
      return makeResult(nextWorkspace, "Categoría creada.");
    },
    [runRemote, showToast, workspace],
  );

  const createSupplier = useCallback(
    async (input: SupplierInput) => {
      if (workspace.mode === "supabase") {
        return runRemote(() => createSupplierAction(input));
      }

      const nextWorkspace: WorkspaceData = {
        ...workspace,
        suppliers: [
          ...workspace.suppliers,
          {
            id: crypto.randomUUID(),
            organizationId: workspace.organization.id,
            name: input.name.trim(),
            contactName: input.contactName?.trim() || null,
            email: input.email?.trim() || null,
            phone: input.phone?.trim() || null,
            createdAt: new Date().toISOString(),
          },
        ].sort((a, b) => a.name.localeCompare(b.name, "es")),
      };
      setWorkspace(nextWorkspace);
      showToast("success", "Proveedor creado.");
      return makeResult(nextWorkspace, "Proveedor creado.");
    },
    [runRemote, showToast, workspace],
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      workspace,
      isMutating,
      toast,
      productDialog,
      movementDialog,
      openProductDialog: (product) =>
        setProductDialog({ open: true, product: product || null }),
      closeProductDialog: () =>
        setProductDialog({ open: false, product: null }),
      openMovementDialog: (product) =>
        setMovementDialog({ open: true, product: product || null }),
      closeMovementDialog: () =>
        setMovementDialog({ open: false, product: null }),
      dismissToast: () => setToast(null),
      createProduct,
      updateProduct,
      archiveProduct,
      recordMovement,
      updateOrganization,
      createCategory,
      createSupplier,
      resetDemo: () => {
        const fresh = cloneWorkspace(demoWorkspace);
        setWorkspace(fresh);
        window.localStorage.removeItem(DEMO_STORAGE_KEY);
        showToast("info", "Los datos de demostración fueron restaurados.");
      },
    }),
    [
      archiveProduct,
      createCategory,
      createProduct,
      createSupplier,
      isMutating,
      movementDialog,
      productDialog,
      recordMovement,
      showToast,
      toast,
      updateOrganization,
      updateProduct,
      workspace,
    ],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error("useInventory debe usarse dentro de InventoryProvider.");
  }
  return context;
}
