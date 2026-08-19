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
import { useRouter } from "next/navigation";

import {
  archiveProductAction,
  clearInventoryDataAction,
  createCategoryAction,
  createMovementReasonAction,
  createProductAction,
  createProductSubstituteAction,
  createSupplierAction,
  createWarehouseAction,
  deleteCategoryAction,
  deleteMovementAction,
  deleteMovementReasonAction,
  deleteProductAction,
  deleteProductSubstituteAction,
  importInventoryProductsAction,
  recordMovementAction,
  transferInventoryStockAction,
  updateOrganizationAction,
  updateMovementAction,
  updateMovementReasonAction,
  updateProductAction,
} from "@/app/actions/inventory";
import type {
  ActionResult,
  CategoryInput,
  InventoryImportConflictPolicy,
  InventoryImportRow,
  InventoryMovement,
  MovementInput,
  MovementReasonInput,
  MovementReasonUpdateInput,
  MovementUpdateInput,
  OrganizationInput,
  Product,
  ProductInput,
  ProductSubstituteInput,
  ProductUpdateInput,
  SupplierInput,
  TransferInput,
  WarehouseInput,
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
  movementDialog: {
    open: boolean;
    product: Product | null;
    movement: InventoryMovement | null;
  };
  openProductDialog: (product?: Product) => void;
  closeProductDialog: () => void;
  openMovementDialog: (product?: Product) => void;
  openMovementEditDialog: (movement: InventoryMovement) => void;
  closeMovementDialog: () => void;
  dismissToast: () => void;
  createProduct: (
    input: ProductInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  createProductSubstitute: (
    input: ProductSubstituteInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  deleteProductSubstitute: (
    relationId: string,
  ) => Promise<ActionResult<WorkspaceData>>;
  updateProduct: (
    input: ProductUpdateInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  archiveProduct: (
    productId: string,
  ) => Promise<ActionResult<WorkspaceData>>;
  deleteProduct: (
    productId: string,
    confirmation: string,
  ) => Promise<ActionResult<WorkspaceData>>;
  recordMovement: (
    input: MovementInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  transferStock: (
    input: TransferInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  updateMovement: (
    input: MovementUpdateInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  deleteMovement: (
    movementId: string,
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
  createMovementReason: (
    input: MovementReasonInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  updateMovementReason: (
    input: MovementReasonUpdateInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  deleteMovementReason: (
    reasonId: string,
  ) => Promise<ActionResult<WorkspaceData>>;
  createSupplier: (
    input: SupplierInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  createWarehouse: (
    input: WarehouseInput,
  ) => Promise<ActionResult<WorkspaceData>>;
  importInventoryProducts: (
    rows: InventoryImportRow[],
    conflictPolicy: InventoryImportConflictPolicy,
  ) => Promise<ActionResult<WorkspaceData>>;
  clearInventoryData: (
    confirmation: string,
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
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [previousInitialWorkspace, setPreviousInitialWorkspace] =
    useState(initialWorkspace);
  const [isMutating, setIsMutating] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [productDialog, setProductDialog] = useState<{
    open: boolean;
    product: Product | null;
  }>({ open: false, product: null });
  const [movementDialog, setMovementDialog] = useState<{
    open: boolean;
    product: Product | null;
    movement: InventoryMovement | null;
  }>({ open: false, product: null, movement: null });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initialWorkspace !== previousInitialWorkspace) {
    setPreviousInitialWorkspace(initialWorkspace);
    setWorkspace(initialWorkspace);
  }

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
      if (result.data) {
        setWorkspace(result.data);
      } else if (result.ok) {
        router.refresh();
      }
      if (result.ok) {
        showToast("success", result.message);
      } else {
        showToast("error", "No se pudo completar la acción", result.message);
      }
      return result;
    },
    [router, showToast],
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

  const createProductSubstitute = useCallback(
    (input: ProductSubstituteInput) =>
      runRemote(() => createProductSubstituteAction(input)),
    [runRemote],
  );

  const deleteProductSubstitute = useCallback(
    (relationId: string) =>
      runRemote(() => deleteProductSubstituteAction(relationId)),
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

  const deleteProduct = useCallback(
    (productId: string, confirmation: string) =>
      runRemote(() => deleteProductAction(productId, confirmation)),
    [runRemote],
  );

  const recordMovement = useCallback(
    (input: MovementInput) =>
      runRemote(() => recordMovementAction(input)),
    [runRemote],
  );

  const transferStock = useCallback(
    (input: TransferInput) =>
      runRemote(() => transferInventoryStockAction(input)),
    [runRemote],
  );

  const updateMovement = useCallback(
    (input: MovementUpdateInput) =>
      runRemote(() => updateMovementAction(input)),
    [runRemote],
  );

  const deleteMovement = useCallback(
    (movementId: string) =>
      runRemote(() => deleteMovementAction(movementId)),
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

  const createMovementReason = useCallback(
    (input: MovementReasonInput) =>
      runRemote(() => createMovementReasonAction(input)),
    [runRemote],
  );

  const updateMovementReason = useCallback(
    (input: MovementReasonUpdateInput) =>
      runRemote(() => updateMovementReasonAction(input)),
    [runRemote],
  );

  const deleteMovementReason = useCallback(
    (reasonId: string) =>
      runRemote(() => deleteMovementReasonAction(reasonId)),
    [runRemote],
  );

  const createSupplier = useCallback(
    (input: SupplierInput) =>
      runRemote(() => createSupplierAction(input)),
    [runRemote],
  );

  const createWarehouse = useCallback(
    (input: WarehouseInput) =>
      runRemote(() => createWarehouseAction(input)),
    [runRemote],
  );

  const importInventoryProducts = useCallback(
    (
      rows: InventoryImportRow[],
      conflictPolicy: InventoryImportConflictPolicy,
    ) =>
      runRemote(() => importInventoryProductsAction(rows, conflictPolicy)),
    [runRemote],
  );

  const clearInventoryData = useCallback(
    (confirmation: string) =>
      runRemote(() => clearInventoryDataAction(confirmation)),
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
        setMovementDialog({
          open: true,
          product: product || null,
          movement: null,
        }),
      openMovementEditDialog: (movement) =>
        setMovementDialog({ open: true, product: null, movement }),
      closeMovementDialog: () =>
        setMovementDialog({ open: false, product: null, movement: null }),
      dismissToast: () => setToast(null),
      createProduct,
      createProductSubstitute,
      deleteProductSubstitute,
      updateProduct,
      archiveProduct,
      deleteProduct,
      recordMovement,
      transferStock,
      updateMovement,
      deleteMovement,
      updateOrganization,
      createCategory,
      deleteCategory,
      createMovementReason,
      updateMovementReason,
      deleteMovementReason,
      createSupplier,
      createWarehouse,
      importInventoryProducts,
      clearInventoryData,
    }),
    [
      archiveProduct,
      createCategory,
      createMovementReason,
      createProduct,
      createProductSubstitute,
      createSupplier,
      createWarehouse,
      importInventoryProducts,
      clearInventoryData,
      deleteCategory,
      deleteMovement,
      deleteMovementReason,
      deleteProduct,
      deleteProductSubstitute,
      isMutating,
      movementDialog,
      productDialog,
      recordMovement,
      transferStock,
      toast,
      updateOrganization,
      updateMovement,
      updateMovementReason,
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
