export type MemberRole = "owner" | "admin" | "operator" | "viewer";

export type MovementType =
  | "initial"
  | "purchase"
  | "sale"
  | "adjustment_in"
  | "adjustment_out"
  | "return_in"
  | "return_out"
  | "transfer_in"
  | "transfer_out";

export interface Viewer {
  id: string;
  email: string;
  fullName: string;
  role: MemberRole;
  initials: string;
}

export interface Organization {
  id: string;
  name: string;
  taxId: string | null;
  currency: string;
  taxRate: number;
  locale: string;
  createdAt: string;
}

export interface Category {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface MovementReason {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  organizationId: string;
  categoryId: string | null;
  supplierId: string | null;
  name: string;
  description: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  maxStock: number | null;
  currentStock: number;
  averageCost: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  saleUnitPrice: number | null;
  totalCost: number;
  revenue: number;
  grossProfit: number;
  note: string | null;
  reason: string | null;
  occurredAt: string;
  createdBy: string | null;
}

export interface WorkspaceData {
  viewer: Viewer;
  organization: Organization;
  categories: Category[];
  movementReasons: MovementReason[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
  movements: InventoryMovement[];
}

export interface ProductInput {
  name: string;
  description?: string;
  categoryId?: string;
  supplierName?: string;
  warehouseId: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  initialStock: number;
  minStock: number;
  maxStock?: number | null;
}

export interface ProductUpdateInput {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  supplierName?: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  maxStock?: number | null;
}

export interface InventoryImportRow {
  name: string;
  category?: string;
  supplier?: string;
  description?: string;
  purchasePrice: number;
  salePrice: number;
  unit: string;
  initialStock: number;
  maxStock?: number | null;
  minStock: number;
  warehouse?: string;
}

export interface MovementInput {
  productId: string;
  warehouseId: string;
  type: Exclude<MovementType, "initial" | "transfer_in" | "transfer_out">;
  quantity: number;
  unitCost?: number;
  saleUnitPrice?: number;
  note?: string;
  reason?: string;
}

export interface MovementUpdateInput {
  id: string;
  type: Exclude<MovementType, "transfer_in" | "transfer_out">;
  quantity: number;
  unitCost?: number;
  saleUnitPrice?: number;
  note?: string;
  reason?: string;
}

export interface OrganizationInput {
  name: string;
  taxId?: string;
  currency: string;
  taxRate: number;
  locale: string;
}

export interface CategoryInput {
  name: string;
  color: string;
}

export interface MovementReasonInput {
  name: string;
}

export interface MovementReasonUpdateInput extends MovementReasonInput {
  id: string;
}

export interface SupplierInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export interface WarehouseInput {
  name: string;
  location?: string;
}

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
