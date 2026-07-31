"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireViewer } from "@/lib/auth";
import { loadWorkspaceData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ActionResult,
  CategoryInput,
  MemberRole,
  MovementInput,
  OrganizationInput,
  ProductInput,
  ProductUpdateInput,
  SupplierInput,
  WorkspaceData,
} from "@/lib/types";

const optionalText = z.string().trim().max(300).optional();

const productSchema = z.object({
  name: z.string().trim().min(2).max(140),
  sku: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  categoryId: z.string().trim().optional(),
  supplierId: z.string().trim().optional(),
  warehouseId: z.string().min(1),
  unit: z.string().trim().min(1).max(24),
  purchasePrice: z.number().min(0),
  salePrice: z.number().min(0),
  initialStock: z.number().min(0),
  minStock: z.number().min(0),
});

const productUpdateSchema = productSchema
  .omit({ warehouseId: true, initialStock: true })
  .extend({
    id: z.string().uuid(),
    sku: z.string().trim().min(1).max(40),
  });

const movementSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  type: z.enum([
    "purchase",
    "sale",
    "adjustment_in",
    "adjustment_out",
    "return_in",
    "return_out",
  ]),
  quantity: z.number().positive(),
  unitCost: z.number().min(0).optional(),
  saleUnitPrice: z.number().min(0).optional(),
  note: optionalText,
  reference: z.string().trim().max(80).optional(),
});

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(30).optional(),
  currency: z.string().trim().length(3),
  taxRate: z.number().min(0).max(100),
  locale: z.string().trim().min(2).max(15),
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const categoryIdSchema = z.string().uuid();

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().trim().max(40).optional(),
});

function validationError<T>(error: z.ZodError): ActionResult<T> {
  return {
    ok: false,
    message: "Revisa los campos marcados e inténtalo nuevamente.",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

function dataError<T>(message: string): ActionResult<T> {
  return { ok: false, message };
}

const operatorRoles: MemberRole[] = ["owner", "admin", "operator"];
const administratorRoles: MemberRole[] = ["owner", "admin"];

async function ensureSupabase<T>(
  allowedRoles: MemberRole[],
): Promise<ActionResult<T> | null> {
  if (!isSupabaseConfigured()) {
    return dataError(
      "Supabase no está configurado. Agrega las variables de entorno antes de continuar.",
    );
  }
  const viewer = await requireViewer();
  if (!allowedRoles.includes(viewer.role)) {
    return dataError("Tu rol es de solo consulta para esta operación.");
  }
  return null;
}

async function refreshedWorkspace(
  message: string,
): Promise<ActionResult<WorkspaceData>> {
  revalidatePath("/", "layout");
  return {
    ok: true,
    message,
    data: await loadWorkspaceData(),
  };
}

function readableError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Inténtalo nuevamente.";
}

export async function createProductAction(
  input: ProductInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(operatorRoles);
  if (configured) return configured;

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const supabase = await createSupabaseServerClient();
    const value = parsed.data;
    const { error } = await supabase.rpc("create_product_with_stock", {
      p_name: value.name,
      p_sku: value.sku || null,
      p_barcode: value.barcode || null,
      p_description: value.description || null,
      p_category_id: value.categoryId || null,
      p_supplier_id: value.supplierId || null,
      p_warehouse_id: value.warehouseId,
      p_unit: value.unit,
      p_purchase_price: value.purchasePrice,
      p_sale_price: value.salePrice,
      p_initial_stock: value.initialStock,
      p_min_stock: value.minStock,
    });

    if (error) return dataError(error.message);
    return refreshedWorkspace("Producto creado y stock calculado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function updateProductAction(
  input: ProductUpdateInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(operatorRoles);
  if (configured) return configured;

  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const supabase = await createSupabaseServerClient();
    const value = parsed.data;
    const { error } = await supabase
      .from("products")
      .update({
        name: value.name,
        sku: value.sku,
        barcode: value.barcode || null,
        description: value.description || null,
        category_id: value.categoryId || null,
        supplier_id: value.supplierId || null,
        unit: value.unit,
        purchase_price: value.purchasePrice,
        sale_price: value.salePrice,
        min_stock: value.minStock,
      })
      .eq("id", value.id)
      .select("id")
      .single();

    if (error) return dataError(error.message);
    return refreshedWorkspace("Producto actualizado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function archiveProductAction(
  productId: string,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(operatorRoles);
  if (configured) return configured;

  try {
    const id = z.string().uuid().parse(productId);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", id)
      .select("id")
      .single();

    if (error) return dataError(error.message);
    return refreshedWorkspace("Producto archivado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function recordMovementAction(
  input: MovementInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(operatorRoles);
  if (configured) return configured;

  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const supabase = await createSupabaseServerClient();
    const value = parsed.data;
    const { error } = await supabase.rpc("record_inventory_movement", {
      p_product_id: value.productId,
      p_warehouse_id: value.warehouseId,
      p_movement_type: value.type,
      p_quantity: value.quantity,
      p_unit_cost: value.unitCost ?? null,
      p_sale_unit_price: value.saleUnitPrice ?? null,
      p_note: value.note || null,
      p_reference: value.reference || null,
    });

    if (error) return dataError(error.message);
    return refreshedWorkspace("Movimiento registrado. El stock fue recalculado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function updateOrganizationAction(
  input: OrganizationInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const workspace = await loadWorkspaceData();
    const supabase = await createSupabaseServerClient();
    const value = parsed.data;
    const { error } = await supabase
      .from("organizations")
      .update({
        name: value.name,
        tax_id: value.taxId || null,
        currency: value.currency.toUpperCase(),
        tax_rate: value.taxRate,
        locale: value.locale,
      })
      .eq("id", workspace.organization.id)
      .select("id")
      .single();

    if (error) return dataError(error.message);
    return refreshedWorkspace("Configuración guardada.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function createCategoryAction(
  input: CategoryInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const workspace = await loadWorkspaceData();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("categories").insert({
      organization_id: workspace.organization.id,
      name: parsed.data.name,
      color: parsed.data.color,
    });

    if (error) {
      return dataError(
        error.code === "23505"
          ? "Ya existe una categoría con ese nombre."
          : error.message,
      );
    }
    return refreshedWorkspace("Categoría creada.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = categoryIdSchema.safeParse(categoryId);
  if (!parsed.success) {
    return dataError("La categoría seleccionada no es válida.");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("categories")
      .delete()
      .eq("id", parsed.data)
      .select("id")
      .maybeSingle();

    if (error) return dataError(error.message);
    if (!data) {
      return dataError("No se encontró la categoría o no tienes permiso para eliminarla.");
    }
    return refreshedWorkspace(
      "Categoría eliminada. Los productos quedaron sin categoría.",
    );
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function createSupplierAction(
  input: SupplierInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const workspace = await loadWorkspaceData();
    const supabase = await createSupabaseServerClient();
    const value = parsed.data;
    const { error } = await supabase.from("suppliers").insert({
      organization_id: workspace.organization.id,
      name: value.name,
      contact_name: value.contactName || null,
      email: value.email || null,
      phone: value.phone || null,
    });

    if (error) return dataError(error.message);
    return refreshedWorkspace("Proveedor creado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}
