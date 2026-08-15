import { loadWorkspaceData } from "@/lib/data";
import { createWorkspaceWorkbookBuffer } from "@/lib/excel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  InventoryBalance,
  InventoryMovement,
  MovementType,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exportPageSize = 1000;

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

interface DbBalanceExport {
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  current_stock: number | string;
  average_cost: number | string;
  updated_at: string;
}

interface DbMovementExport {
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

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapMovement(movement: DbMovementExport): InventoryMovement {
  return {
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
  };
}

function mapBalance(balance: DbBalanceExport): InventoryBalance {
  return {
    organizationId: balance.organization_id,
    productId: balance.product_id,
    warehouseId: balance.warehouse_id,
    currentStock: toNumber(balance.current_stock),
    averageCost: toNumber(balance.average_cost),
    updatedAt: balance.updated_at,
  };
}

async function loadAllMovements(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  const movements: InventoryMovement[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select(
        "id, organization_id, product_id, warehouse_id, movement_type, quantity, stock_before, stock_after, unit_cost, sale_unit_price, total_cost, revenue, gross_profit, note, reference, occurred_at, created_by",
      )
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + exportPageSize - 1);

    if (error) {
      throw new Error(`No fue posible leer el historial completo: ${error.message}`);
    }

    const page = (data ?? []) as unknown as DbMovementExport[];
    if (page.length === 0) break;

    movements.push(...page.map(mapMovement));
    from += page.length;
  }

  return movements;
}

async function loadAllBalances(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  const balances: InventoryBalance[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("inventory_balances")
      .select(
        "organization_id, product_id, warehouse_id, current_stock, average_cost, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("product_id", { ascending: true })
      .order("warehouse_id", { ascending: true })
      .range(from, from + exportPageSize - 1);

    if (error) {
      throw new Error(
        `No fue posible leer las existencias completas: ${error.message}`,
      );
    }

    const page = (data ?? []) as unknown as DbBalanceExport[];
    if (page.length === 0) break;

    balances.push(...page.map(mapBalance));
    from += page.length;
  }

  return balances;
}

export async function GET() {
  try {
    const workspace = await loadWorkspaceData();
    if (
      workspace.viewer.role !== "owner" &&
      workspace.viewer.role !== "admin"
    ) {
      return Response.json(
        { message: "Solo un administrador puede exportar todos los datos." },
        { status: 403 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const [movements, balances] = await Promise.all([
      loadAllMovements(supabase, workspace.organization.id),
      loadAllBalances(supabase, workspace.organization.id),
    ]);
    const output = await createWorkspaceWorkbookBuffer(
      {
        ...workspace,
        movements,
      },
      balances,
    );
    const filename = `exportacion-datos-kadmiel-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(output, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("sesión")
        ? error.message
        : "No fue posible generar la exportación. Inténtalo nuevamente.";
    return Response.json(
      { message },
      { status: message.includes("sesión") ? 401 : 500 },
    );
  }
}
