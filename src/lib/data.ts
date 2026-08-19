import "server-only";

import { cache } from "react";

import { requireViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Category,
  InventoryBalance,
  InventoryMovement,
  MemberRole,
  MovementReason,
  MovementType,
  Organization,
  Product,
  ProductSubstitute,
  Supplier,
  Warehouse,
  WorkspaceData,
} from "@/lib/types";

interface DbMembership {
  organization_id: string;
  role: MemberRole;
}

interface DbOrganization {
  id: string;
  name: string;
  tax_id: string | null;
  currency: string;
  tax_rate: number | string;
  locale: string;
  created_at: string;
}

interface DbCategory {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

interface DbMovementReason {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

interface DbSupplier {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface DbWarehouse {
  id: string;
  organization_id: string;
  name: string;
  location: string | null;
  is_default: boolean;
  created_at: string;
}

interface DbProduct {
  id: string;
  organization_id: string;
  category_id: string | null;
  supplier_id: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  image_path?: string | null;
  unit: string;
  purchase_price: number | string;
  sale_price: number | string;
  min_stock: number | string;
  max_stock: number | string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DbBalance {
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  current_stock: number | string;
  average_cost: number | string;
  updated_at: string;
}

interface DbProductSubstitute {
  id: string;
  organization_id: string;
  product_id: string;
  substitute_product_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DbMovement {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: MovementType;
  quantity: number | string;
  stock_before: number | string;
  stock_after: number | string;
  unit_cost: number | string;
  sale_unit_price: number | string | null;
  total_cost: number | string;
  revenue: number | string;
  gross_profit: number | string;
  note: string | null;
  reference: string | null;
  occurred_at: string;
  created_by: string | null;
}

interface QueryError {
  code?: string;
  message: string;
}

interface PagedQueryResult {
  data: unknown[] | null;
  error: QueryError | null;
}

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

const databasePageSize = 1000;

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resultError(
  results: Array<{ error: { message: string } | null }>,
): string | null {
  return results.find((result) => result.error)?.error?.message || null;
}

async function loadAllRows(
  loadPage: (from: number, to: number) => Promise<PagedQueryResult>,
): Promise<PagedQueryResult> {
  const rows: unknown[] = [];
  let from = 0;

  while (true) {
    const result = await loadPage(from, from + databasePageSize - 1);
    if (result.error) return { data: null, error: result.error };

    const page = result.data ?? [];
    if (page.length === 0) return { data: rows, error: null };

    rows.push(...page);
    from += page.length;
  }
}

async function loadProducts(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PagedQueryResult> {
  const loadWithColumns = (columns: string) =>
    loadAllRows(async (from, to) => {
      const { data, error } = await supabase
        .from("products")
        .select(columns)
        .eq("organization_id", organizationId)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    });

  const productsWithImages = await loadWithColumns(
    "id, organization_id, category_id, supplier_id, sku, barcode, name, description, image_path, unit, purchase_price, sale_price, min_stock, max_stock, active, created_at, updated_at",
  );
  if (!productsWithImages.error) return productsWithImages;

  const missingOptionalColumn =
    productsWithImages.error.code === "42703" &&
    (productsWithImages.error.message.includes("image_path") ||
      productsWithImages.error.message.includes("max_stock"));
  if (!missingOptionalColumn) return productsWithImages;

  const productsWithMaxStock = await loadWithColumns(
    "id, organization_id, category_id, supplier_id, sku, barcode, name, description, unit, purchase_price, sale_price, min_stock, max_stock, active, created_at, updated_at",
  );
  const missingMaxStock =
    productsWithMaxStock.error?.code === "42703" &&
    productsWithMaxStock.error.message.includes("max_stock");
  if (!missingMaxStock) return productsWithMaxStock;

  return loadWithColumns(
    "id, organization_id, category_id, supplier_id, sku, barcode, name, description, unit, purchase_price, sale_price, min_stock, active, created_at, updated_at",
  );
}

async function loadProductSubstitutes(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PagedQueryResult> {
  const result = await loadAllRows(async (from, to) => {
    const { data, error } = await supabase
      .from("product_substitutes")
      .select(
        "id, organization_id, product_id, substitute_product_id, note, created_by, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    return { data, error };
  });

  if (
    result.error?.code === "42P01" ||
    result.error?.code === "PGRST205"
  ) {
    return { data: [], error: null };
  }
  return result;
}

export async function loadWorkspaceData(): Promise<WorkspaceData> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase no está configurado. Agrega las variables de entorno antes de usar el inventario.",
    );
  }

  const viewer = await requireViewer();

  const supabase = await createSupabaseServerClient();
  const membershipResult = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipResult.error) {
    throw new Error(
      `No fue posible consultar la organización: ${membershipResult.error.message}`,
    );
  }

  const membership = membershipResult.data as DbMembership | null;
  if (!membership) {
    throw new Error(
      "La cuenta no pertenece a una organización. Ejecuta la migración de Supabase o crea una nueva cuenta.",
    );
  }

  const organizationId = membership.organization_id;
  const [
    organizationResult,
    categoriesResult,
    movementReasonsResult,
    suppliersResult,
    warehousesResult,
    productsResult,
    balancesResult,
    productSubstitutesResult,
    movementsResult,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, tax_id, currency, tax_rate, locale, created_at")
      .eq("id", organizationId)
      .single(),
    loadAllRows(async (from, to) => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, organization_id, name, color, created_at")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
    loadAllRows(async (from, to) => {
      const { data, error } = await supabase
        .from("movement_reasons")
        .select("id, organization_id, name, created_at")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
    loadAllRows(async (from, to) => {
      const { data, error } = await supabase
        .from("suppliers")
        .select(
          "id, organization_id, name, contact_name, email, phone, created_at",
        )
        .eq("organization_id", organizationId)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
    loadAllRows(async (from, to) => {
      const { data, error } = await supabase
        .from("warehouses")
        .select(
          "id, organization_id, name, location, is_default, created_at",
        )
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
    loadProducts(supabase, organizationId),
    loadAllRows(async (from, to) => {
      const { data, error } = await supabase
        .from("inventory_balances")
        .select(
          "organization_id, product_id, warehouse_id, current_stock, average_cost, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("product_id", { ascending: true })
        .order("warehouse_id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
    loadProductSubstitutes(supabase, organizationId),
    supabase
      .from("inventory_movements")
      .select(
        "id, organization_id, product_id, warehouse_id, movement_type, quantity, stock_before, stock_after, unit_cost, sale_unit_price, total_cost, revenue, gross_profit, note, reference, occurred_at, created_by",
      )
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500),
  ]);

  const queryError = resultError([
    organizationResult,
    categoriesResult,
    movementReasonsResult,
    suppliersResult,
    warehousesResult,
    productsResult,
    balancesResult,
    productSubstitutesResult,
    movementsResult,
  ]);

  if (queryError) {
    throw new Error(`No fue posible cargar el inventario: ${queryError}`);
  }

  const dbOrganization = organizationResult.data as DbOrganization;
  const dbCategories = (categoriesResult.data ?? []) as unknown as DbCategory[];
  const dbMovementReasons = (movementReasonsResult.data ??
    []) as unknown as DbMovementReason[];
  const dbSuppliers = (suppliersResult.data ?? []) as unknown as DbSupplier[];
  const dbWarehouses = (warehousesResult.data ?? []) as unknown as DbWarehouse[];
  const dbProducts = (productsResult.data ?? []) as unknown as DbProduct[];
  const dbBalances = (balancesResult.data ?? []) as unknown as DbBalance[];
  const dbProductSubstitutes = (productSubstitutesResult.data ??
    []) as unknown as DbProductSubstitute[];
  const dbMovements = (movementsResult.data ?? []) as unknown as DbMovement[];

  const balanceMap = new Map<
    string,
    { stock: number; inventoryValue: number }
  >();
  for (const balance of dbBalances) {
    const stock = toNumber(balance.current_stock);
    const value = stock * toNumber(balance.average_cost);
    const aggregate = balanceMap.get(balance.product_id) || {
      stock: 0,
      inventoryValue: 0,
    };
    aggregate.stock += stock;
    aggregate.inventoryValue += value;
    balanceMap.set(balance.product_id, aggregate);
  }

  const organization: Organization = {
    id: dbOrganization.id,
    name: dbOrganization.name,
    taxId: dbOrganization.tax_id,
    currency: dbOrganization.currency,
    taxRate: toNumber(dbOrganization.tax_rate),
    locale: dbOrganization.locale,
    createdAt: dbOrganization.created_at,
  };

  const categories: Category[] = dbCategories.map((category) => ({
    id: category.id,
    organizationId: category.organization_id,
    name: category.name,
    color: category.color,
    createdAt: category.created_at,
  }));

  const movementReasons: MovementReason[] = dbMovementReasons.map((reason) => ({
    id: reason.id,
    organizationId: reason.organization_id,
    name: reason.name,
    createdAt: reason.created_at,
  }));

  const suppliers: Supplier[] = dbSuppliers.map((supplier) => ({
    id: supplier.id,
    organizationId: supplier.organization_id,
    name: supplier.name,
    contactName: supplier.contact_name,
    email: supplier.email,
    phone: supplier.phone,
    createdAt: supplier.created_at,
  }));

  const warehouses: Warehouse[] = dbWarehouses.map((warehouse) => ({
    id: warehouse.id,
    organizationId: warehouse.organization_id,
    name: warehouse.name,
    location: warehouse.location,
    isDefault: warehouse.is_default,
    createdAt: warehouse.created_at,
  }));

  const products: Product[] = dbProducts.map((product) => {
    const balance = balanceMap.get(product.id);
    const stock = balance?.stock || 0;
    const fallbackCost = toNumber(product.purchase_price);
    const averageCost =
      balance && balance.stock > 0
        ? balance.inventoryValue / balance.stock
        : fallbackCost;

    return {
      id: product.id,
      organizationId: product.organization_id,
      categoryId: product.category_id,
      supplierId: product.supplier_id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      imagePath: product.image_path ?? null,
      imageUrl: product.image_path
        ? `/api/product-images/${encodeURIComponent(product.id)}?size=thumb`
        : null,
      unit: product.unit,
      purchasePrice: fallbackCost,
      salePrice: toNumber(product.sale_price),
      minStock: toNumber(product.min_stock),
      maxStock: product.max_stock == null ? null : toNumber(product.max_stock),
      currentStock: stock,
      averageCost,
      active: product.active,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  });

  const inventoryBalances: InventoryBalance[] = dbBalances.map((balance) => ({
    organizationId: balance.organization_id,
    productId: balance.product_id,
    warehouseId: balance.warehouse_id,
    currentStock: toNumber(balance.current_stock),
    averageCost: toNumber(balance.average_cost),
    updatedAt: balance.updated_at,
  }));

  const productSubstitutes: ProductSubstitute[] = dbProductSubstitutes.map(
    (relation) => ({
      id: relation.id,
      organizationId: relation.organization_id,
      productId: relation.product_id,
      substituteProductId: relation.substitute_product_id,
      note: relation.note,
      createdBy: relation.created_by,
      createdAt: relation.created_at,
      updatedAt: relation.updated_at,
    }),
  );

  const movements: InventoryMovement[] = dbMovements.map((movement) => ({
    id: movement.id,
    organizationId: movement.organization_id,
    productId: movement.product_id,
    warehouseId: movement.warehouse_id,
    type: movement.movement_type,
    quantity: toNumber(movement.quantity),
    stockBefore: toNumber(movement.stock_before),
    stockAfter: toNumber(movement.stock_after),
    unitCost: toNumber(movement.unit_cost),
    saleUnitPrice:
      movement.sale_unit_price === null
        ? null
        : toNumber(movement.sale_unit_price),
    totalCost: toNumber(movement.total_cost),
    revenue: toNumber(movement.revenue),
    grossProfit: toNumber(movement.gross_profit),
    note: movement.note,
    reason: movement.reference,
    occurredAt: movement.occurred_at,
    createdBy: movement.created_by,
  }));

  return {
    viewer: {
      ...viewer,
      role: membership.role,
    },
    organization,
    categories,
    movementReasons,
    suppliers,
    warehouses,
    products,
    inventoryBalances,
    productSubstitutes,
    movements,
  };
}

export const getWorkspaceData = cache(loadWorkspaceData);
