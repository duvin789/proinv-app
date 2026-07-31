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
  deleteCategoryAction,
  recordMovementAction,
  updateOrganizationAction,
  updateProductAction,
} from "@/app/actions/inventory";
import type {
  ActionResult,
  CategoryInput,
  MovementInput,
  OrganizationInput,
  Product,
  ProductInput,
  ProductUpdateInput,
  SupplierInput,
  WorkspaceData,
} from "@/lib/types";

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
  deleteCategory: (
    categoryId: string,
  ) => Promise<ActionResult<WorkspaceData>>;
  createSupplier: (
    input: SupplierInput,
  ) => Promise<ActionResult<WorkspaceData>>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({
  initialWorkspace,
  children,
}: {
  initialWorkspace: WorkspaceData;
  children: React.ReactNode;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
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
    (input: ProductInput) => runRemote(() => createProductAction(input)),
    [runRemote],
  );

  const updateProduct = useCallback(
    (input: ProductUpdateInput) =>
      runRemote(() => updateProductAction(input)),
    [runRemote],
  );

  const archiveProduct = useCallback(
    (productId: string) =>
      runRemote(() => archiveProductAction(productId)),
    [runRemote],
  );

  const recordMovement = useCallback(
    (input: MovementInput) =>
      runRemote(() => recordMovementAction(input)),
    [runRemote],
  );

  const updateOrganization = useCallback(
    (input: OrganizationInput) =>
      runRemote(() => updateOrganizationAction(input)),
    [runRemote],
  );

  const createCategory = useCallback(
    (input: CategoryInput) =>
      runRemote(() => createCategoryAction(input)),
    [runRemote],
  );

  const deleteCategory = useCallback(
    (categoryId: string) =>
      runRemote(() => deleteCategoryAction(categoryId)),
    [runRemote],
  );

  const createSupplier = useCallback(
    (input: SupplierInput) =>
      runRemote(() => createSupplierAction(input)),
    [runRemote],
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
      deleteCategory,
      createSupplier,
    }),
    [
      archiveProduct,
      createCategory,
      createProduct,
      createSupplier,
      deleteCategory,
      isMutating,
      movementDialog,
      productDialog,
      recordMovement,
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
