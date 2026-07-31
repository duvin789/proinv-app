import type {
  InventoryMovement,
  MovementInput,
  MovementType,
  Product,
  WorkspaceData,
} from "@/lib/types";

export const movementLabels: Record<MovementType, string> = {
  initial: "Stock inicial",
  purchase: "Compra",
  sale: "Venta",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de salida",
  return_in: "Devolución recibida",
  return_out: "Devolución a proveedor",
  transfer_in: "Traslado recibido",
  transfer_out: "Traslado enviado",
};

export const movementShortLabels: Record<MovementType, string> = {
  initial: "Inicial",
  purchase: "Entrada",
  sale: "Salida",
  adjustment_in: "Ajuste +",
  adjustment_out: "Ajuste -",
  return_in: "Devolución +",
  return_out: "Devolución -",
  transfer_in: "Traslado +",
  transfer_out: "Traslado -",
};

export const incomingMovementTypes = new Set<MovementType>([
  "initial",
  "purchase",
  "adjustment_in",
  "return_in",
  "transfer_in",
]);

export function isIncomingMovement(type: MovementType) {
  return incomingMovementTypes.has(type);
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundStock(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function productMargin(product: Product) {
  if (product.salePrice <= 0) return 0;
  return ((product.salePrice - product.averageCost) / product.salePrice) * 100;
}

export function productMarkup(product: Product) {
  if (product.averageCost <= 0) return 0;
  return ((product.salePrice - product.averageCost) / product.averageCost) * 100;
}

export function getStockStatus(product: Product) {
  if (!product.active) return "inactive" as const;
  if (product.currentStock <= 0) return "out" as const;
  if (product.currentStock <= product.minStock) return "low" as const;
  return "healthy" as const;
}

export function calculateWorkspaceMetrics(workspace: WorkspaceData) {
  const activeProducts = workspace.products.filter((product) => product.active);
  let units = 0;
  let inventoryValue = 0;
  let potentialRevenue = 0;
  let lowStock = 0;
  let outOfStock = 0;

  for (const product of activeProducts) {
    units += product.currentStock;
    inventoryValue += product.currentStock * product.averageCost;
    potentialRevenue += product.currentStock * product.salePrice;
    if (product.currentStock <= 0) outOfStock += 1;
    else if (product.currentStock <= product.minStock) lowStock += 1;
  }

  const sales = workspace.movements.filter(
    (movement) => movement.type === "sale",
  );
  const salesRevenue = sales.reduce(
    (total, movement) => total + movement.revenue,
    0,
  );
  const realizedProfit = sales.reduce(
    (total, movement) => total + movement.grossProfit,
    0,
  );

  return {
    productCount: activeProducts.length,
    units: roundStock(units),
    inventoryValue: roundMoney(inventoryValue),
    potentialRevenue: roundMoney(potentialRevenue),
    projectedProfit: roundMoney(potentialRevenue - inventoryValue),
    lowStock,
    outOfStock,
    salesRevenue: roundMoney(salesRevenue),
    realizedProfit: roundMoney(realizedProfit),
  };
}

export function applyMovementToProduct(
  product: Product,
  input: MovementInput,
): { product: Product; movement: InventoryMovement } {
  const incoming = isIncomingMovement(input.type);
  const signedQuantity = incoming ? input.quantity : -input.quantity;
  const nextStock = roundStock(product.currentStock + signedQuantity);

  if (nextStock < 0) {
    throw new Error(
      `Stock insuficiente. Hay ${product.currentStock} ${product.unit} disponibles.`,
    );
  }

  const suppliedCost =
    input.unitCost && input.unitCost > 0
      ? input.unitCost
      : product.averageCost || product.purchasePrice;
  let nextAverageCost = product.averageCost || product.purchasePrice;

  if (incoming && input.quantity > 0) {
    const previousValue = product.currentStock * nextAverageCost;
    const incomingValue = input.quantity * suppliedCost;
    const valuationStock = product.currentStock + input.quantity;
    nextAverageCost =
      valuationStock > 0
        ? roundMoney((previousValue + incomingValue) / valuationStock)
        : roundMoney(suppliedCost);
  }

  const movementCost = incoming ? suppliedCost : nextAverageCost;
  const saleUnitPrice =
    input.type === "sale"
      ? input.saleUnitPrice || product.salePrice
      : input.saleUnitPrice || null;
  const totalCost = roundMoney(input.quantity * movementCost);
  const revenue =
    input.type === "sale" && saleUnitPrice
      ? roundMoney(input.quantity * saleUnitPrice)
      : 0;
  const grossProfit =
    input.type === "sale" ? roundMoney(revenue - totalCost) : 0;

  const now = new Date().toISOString();
  const updatedProduct: Product = {
    ...product,
    currentStock: nextStock,
    averageCost: roundMoney(nextAverageCost),
    purchasePrice:
      input.type === "purchase" ? roundMoney(suppliedCost) : product.purchasePrice,
    updatedAt: now,
  };

  return {
    product: updatedProduct,
    movement: {
      id: crypto.randomUUID(),
      organizationId: product.organizationId,
      productId: product.id,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: roundStock(input.quantity),
      stockBefore: product.currentStock,
      stockAfter: nextStock,
      unitCost: roundMoney(movementCost),
      saleUnitPrice,
      totalCost,
      revenue,
      grossProfit,
      note: input.note?.trim() || null,
      reference: input.reference?.trim() || null,
      occurredAt: now,
      createdBy: "demo-user",
    },
  };
}

export function cloneWorkspace(workspace: WorkspaceData): WorkspaceData {
  return JSON.parse(JSON.stringify(workspace)) as WorkspaceData;
}
