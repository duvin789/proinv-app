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
  InventoryImportConflictPolicy,
  InventoryImportRow,
  MemberRole,
  MovementInput,
  MovementReasonInput,
  MovementReasonUpdateInput,
  MovementUpdateInput,
  OrganizationInput,
  ProductInput,
  ProductUpdateInput,
  SupplierInput,
  WarehouseInput,
  WorkspaceData,
} from "@/lib/types";

const optionalText = z.string().trim().max(300).optional();
const optionalProductCode = z.string().trim().max(80).optional();
const productImageFileSchema = z
  .custom<File>((value) => value instanceof File)
  .nullable()
  .optional();

const productSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(500).optional(),
  sku: optionalProductCode,
  barcode: optionalProductCode,
  categoryId: z.string().trim().optional(),
  supplierName: z.string().trim().max(120).optional(),
  warehouseId: z.string().min(1),
  unit: z.string().trim().min(1).max(24),
  purchasePrice: z.number().min(0),
  salePrice: z.number().min(0),
  initialStock: z.number().min(0),
  minStock: z.number().min(0),
  maxStock: z.number().min(0).nullable().optional(),
  imageFile: productImageFileSchema,
});

const productUpdateSchema = productSchema
  .omit({ warehouseId: true, initialStock: true })
  .extend({
    id: z.string().uuid(),
    removeImage: z.boolean().optional(),
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
  reason: z.string().trim().max(80).optional(),
});

const movementUpdateSchema = movementSchema
  .omit({ productId: true, warehouseId: true })
  .extend({
    id: z.string().uuid(),
    type: z.enum([
      "initial",
      "purchase",
      "sale",
      "adjustment_in",
      "adjustment_out",
      "return_in",
      "return_out",
    ]),
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

const movementReasonSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

const movementReasonUpdateSchema = movementReasonSchema.extend({
  id: z.string().uuid(),
});

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().trim().max(40).optional(),
});

const warehouseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(200).optional(),
});

const inventoryImportRowSchema = z
  .object({
    name: z.string().trim().min(2).max(140),
    sku: optionalProductCode,
    barcode: optionalProductCode,
    category: z.string().trim().max(60).optional(),
    supplier: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).optional(),
    purchasePrice: z.number().min(0).optional(),
    salePrice: z.number().min(0).optional(),
    unit: z.string().trim().min(1).max(24).optional(),
    initialStock: z.number().min(0).optional(),
    maxStock: z.number().min(0).nullable().optional(),
    minStock: z.number().min(0).optional(),
    warehouse: z.string().trim().max(120).optional(),
  })
  .refine(
    (row) => row.maxStock == null || row.maxStock >= (row.minStock ?? 0),
    { message: "El stock máximo no puede ser menor que el mínimo." },
  );

const inventoryImportSchema = z.array(inventoryImportRowSchema).min(1).max(1000);

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

const productImageBucket = "product-images";
const maxProductImageBytes = 5 * 1024 * 1024;
const productImageRemovalAttempts = 3;
const productImageExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

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

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

function normalizedSupplierName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

async function resolveSupplierId(
  supabase: SupabaseServerClient,
  workspace: WorkspaceData,
  rawSupplierName?: string,
) {
  const supplierName = rawSupplierName?.trim();
  if (!supplierName) return null;

  const normalizedName = normalizedSupplierName(supplierName);
  const existingSupplier = workspace.suppliers.find(
    (supplier) => normalizedSupplierName(supplier.name) === normalizedName,
  );
  if (existingSupplier) return existingSupplier.id;

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: workspace.organization.id,
      name: supplierName,
    })
    .select("id")
    .single();

  if (!error && data) return data.id;
  if (error?.code !== "23505") {
    throw new Error(
      "No fue posible registrar el proveedor escrito. Inténtalo nuevamente.",
    );
  }

  const { data: suppliers, error: lookupError } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", workspace.organization.id);
  if (lookupError) throw new Error(lookupError.message);

  const concurrentSupplier = suppliers?.find(
    (supplier) => normalizedSupplierName(supplier.name) === normalizedName,
  );
  if (!concurrentSupplier) {
    throw new Error("No fue posible relacionar el proveedor escrito.");
  }
  return concurrentSupplier.id;
}

function hasExpectedImageSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

async function uploadProductImage(
  supabase: SupabaseServerClient,
  organizationId: string,
  file?: File | null,
) {
  if (!file) return null;

  const extension = productImageExtensions.get(file.type);
  if (!extension) {
    throw new Error("La imagen debe estar en formato JPG, PNG o WebP.");
  }
  if (file.size <= 0 || file.size > maxProductImageBytes) {
    throw new Error("La imagen debe pesar como máximo 5 MB.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!hasExpectedImageSignature(file.type, bytes)) {
    throw new Error("El archivo no contiene una imagen válida.");
  }

  const imagePath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(productImageBucket)
    .upload(imagePath, arrayBuffer, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`No fue posible cargar la imagen: ${error.message}`);
  }
  return imagePath;
}

async function removeProductImages(
  supabase: SupabaseServerClient,
  paths: Array<string | null | undefined>,
) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => Boolean(path))),
  );
  if (uniquePaths.length === 0) return null;

  const cleanupErrors: string[] = [];
  for (let index = 0; index < uniquePaths.length; index += 100) {
    const chunk = uniquePaths.slice(index, index + 100);
    let lastError: string | null = null;

    for (let attempt = 0; attempt < productImageRemovalAttempts; attempt += 1) {
      const { error } = await supabase.storage
        .from(productImageBucket)
        .remove(chunk);
      if (!error) {
        lastError = null;
        break;
      }
      lastError = error.message;
    }

    if (lastError) cleanupErrors.push(lastError);
  }

  return cleanupErrors.length > 0
    ? Array.from(new Set(cleanupErrors)).join(" ")
    : null;
}

export async function createProductAction(
  input: ProductInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(operatorRoles);
  if (configured) return configured;

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  let uploadedImagePath: string | null = null;
  let imageClient: SupabaseServerClient | null = null;
  let databaseCommitted = false;
  try {
    const [workspace, supabase] = await Promise.all([
      loadWorkspaceData(),
      createSupabaseServerClient(),
    ]);
    imageClient = supabase;
    const value = parsed.data;
    const supplierId = await resolveSupplierId(
      supabase,
      workspace,
      value.supplierName,
    );
    uploadedImagePath = await uploadProductImage(
      supabase,
      workspace.organization.id,
      value.imageFile,
    );
    const { error } = await supabase.rpc("create_product_with_stock_v3", {
      p_name: value.name,
      p_sku: value.sku?.trim() || null,
      p_barcode: value.barcode?.trim() || null,
      p_description: value.description || null,
      p_category_id: value.categoryId || null,
      p_supplier_id: supplierId,
      p_warehouse_id: value.warehouseId,
      p_unit: value.unit,
      p_purchase_price: value.purchasePrice,
      p_sale_price: value.salePrice,
      p_initial_stock: value.initialStock,
      p_min_stock: value.minStock,
      p_max_stock: value.maxStock ?? null,
      p_image_path: uploadedImagePath,
    });

    if (error) {
      await removeProductImages(supabase, [uploadedImagePath]);
      return dataError(error.message);
    }
    databaseCommitted = true;
    return refreshedWorkspace("Producto creado y stock calculado.");
  } catch (error) {
    if (!databaseCommitted && imageClient && uploadedImagePath) {
      await removeProductImages(imageClient, [uploadedImagePath]);
    }
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

  let uploadedImagePath: string | null = null;
  let imageClient: SupabaseServerClient | null = null;
  let databaseCommitted = false;
  try {
    const [workspace, supabase] = await Promise.all([
      loadWorkspaceData(),
      createSupabaseServerClient(),
    ]);
    imageClient = supabase;
    const value = parsed.data;
    const existingProduct = workspace.products.find(
      (product) => product.id === value.id,
    );
    if (!existingProduct) return dataError("El producto ya no está disponible.");

    const supplierId = await resolveSupplierId(
      supabase,
      workspace,
      value.supplierName,
    );
    uploadedImagePath = await uploadProductImage(
      supabase,
      workspace.organization.id,
      value.imageFile,
    );
    const nextImagePath = uploadedImagePath
      ? uploadedImagePath
      : value.removeImage
        ? null
        : existingProduct.imagePath;
    const { error } = await supabase
      .from("products")
      .update({
        name: value.name,
        sku: value.sku?.trim().toUpperCase() || existingProduct.sku,
        barcode: value.barcode?.trim() || null,
        description: value.description || null,
        image_path: nextImagePath,
        category_id: value.categoryId || null,
        supplier_id: supplierId,
        unit: value.unit,
        purchase_price: value.purchasePrice,
        sale_price: value.salePrice,
        min_stock: value.minStock,
        max_stock: value.maxStock ?? null,
      })
      .eq("id", value.id)
      .eq("organization_id", workspace.organization.id)
      .select("id")
      .single();

    if (error) {
      await removeProductImages(supabase, [uploadedImagePath]);
      return dataError(error.message);
    }
    databaseCommitted = true;

    const cleanupError =
      existingProduct.imagePath !== nextImagePath
        ? await removeProductImages(supabase, [existingProduct.imagePath])
        : null;
    return refreshedWorkspace(
      cleanupError
        ? "Producto actualizado. La imagen anterior quedó pendiente de limpieza."
        : "Producto actualizado.",
    );
  } catch (error) {
    if (!databaseCommitted && imageClient && uploadedImagePath) {
      await removeProductImages(imageClient, [uploadedImagePath]);
    }
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

export async function deleteProductAction(
  productId: string,
  confirmation: string,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) {
    return dataError("El producto seleccionado no es válido.");
  }
  if (confirmation.trim().toLocaleUpperCase("es") !== "ELIMINAR") {
    return dataError("Escribe ELIMINAR para confirmar la operación.");
  }

  try {
    const [workspace, supabase] = await Promise.all([
      loadWorkspaceData(),
      createSupabaseServerClient(),
    ]);
    const imagePath = workspace.products.find(
      (product) => product.id === parsed.data,
    )?.imagePath;
    const { error } = await supabase.rpc("delete_inventory_product", {
      p_product_id: parsed.data,
      p_confirmation: "ELIMINAR",
    });

    if (error) return dataError(error.message);
    const cleanupError = await removeProductImages(supabase, [imagePath]);
    return refreshedWorkspace(
      cleanupError
        ? "Producto eliminado. La imagen quedó pendiente de limpieza."
        : "Producto eliminado definitivamente.",
    );
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
      p_reference: value.reason || null,
    });

    if (error) return dataError(error.message);
    return refreshedWorkspace("Movimiento registrado. El stock fue recalculado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function updateMovementAction(
  input: MovementUpdateInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = movementUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const supabase = await createSupabaseServerClient();
    const value = parsed.data;
    const { error } = await supabase.rpc("update_inventory_movement", {
      p_movement_id: value.id,
      p_movement_type: value.type,
      p_quantity: value.quantity,
      p_unit_cost: value.unitCost ?? null,
      p_sale_unit_price: value.saleUnitPrice ?? null,
      p_note: value.note || null,
      p_reference: value.reason || null,
    });

    if (error) return dataError(error.message);
    return refreshedWorkspace("Movimiento actualizado y stock recalculado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function deleteMovementAction(
  movementId: string,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = z.string().uuid().safeParse(movementId);
  if (!parsed.success) return dataError("El movimiento seleccionado no es válido.");

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_inventory_movement", {
      p_movement_id: parsed.data,
    });

    if (error) return dataError(error.message);
    return refreshedWorkspace("Movimiento eliminado y stock recalculado.");
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

export async function createMovementReasonAction(
  input: MovementReasonInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = movementReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const workspace = await loadWorkspaceData();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("movement_reasons").insert({
      organization_id: workspace.organization.id,
      name: parsed.data.name,
    });

    if (error) {
      return dataError(
        error.code === "23505"
          ? "Ya existe un motivo con ese nombre."
          : error.message,
      );
    }
    return refreshedWorkspace("Motivo agregado.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function updateMovementReasonAction(
  input: MovementReasonUpdateInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = movementReasonUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("rename_movement_reason", {
      p_reason_id: parsed.data.id,
      p_name: parsed.data.name,
    });

    if (error) {
      return dataError(
        error.code === "23505"
          ? "Ya existe un motivo con ese nombre."
          : error.message,
      );
    }
    return refreshedWorkspace("Motivo actualizado también en el historial.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function deleteMovementReasonAction(
  reasonId: string,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = z.string().uuid().safeParse(reasonId);
  if (!parsed.success) return dataError("El motivo seleccionado no es válido.");

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("movement_reasons")
      .delete()
      .eq("id", parsed.data)
      .select("id")
      .maybeSingle();

    if (error) return dataError(error.message);
    if (!data) return dataError("No se encontró el motivo o no tienes permiso.");
    return refreshedWorkspace("Motivo eliminado. El historial conserva su texto.");
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

export async function createWarehouseAction(
  input: WarehouseInput,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = warehouseSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const workspace = await loadWorkspaceData();
    const normalizedName = parsed.data.name.toLocaleLowerCase("es");
    const duplicate = workspace.warehouses.some(
      (warehouse) =>
        warehouse.name.trim().toLocaleLowerCase("es") === normalizedName,
    );
    if (duplicate) {
      return dataError("Ya existe un almacén con ese nombre.");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("warehouses")
      .insert({
        organization_id: workspace.organization.id,
        name: parsed.data.name,
        location: parsed.data.location || null,
        is_default: workspace.warehouses.length === 0,
      })
      .select("id")
      .single();

    if (error) return dataError(error.message);
    return refreshedWorkspace("Almacén creado y disponible para el inventario.");
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function importInventoryProductsAction(
  rows: InventoryImportRow[],
  conflictPolicy: InventoryImportConflictPolicy,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  const parsed = inventoryImportSchema.safeParse(rows);
  if (!parsed.success) return validationError(parsed.error);
  const parsedPolicy = z.enum(["skip", "update"]).safeParse(conflictPolicy);
  if (!parsedPolicy.success) {
    return dataError("Elige cómo resolver los productos que ya existen.");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("import_inventory_products_v2", {
      p_rows: parsed.data,
      p_conflict_policy: parsedPolicy.data,
    });

    if (error) return dataError(error.message);
    const summary = data as {
      created?: number;
      updated?: number;
      skipped?: number;
    } | null;
    const created = Number(summary?.created || 0);
    const updated = Number(summary?.updated || 0);
    const skipped = Number(summary?.skipped || 0);
    const updatedText = updated
      ? ` Se actualizaron ${updated} ${updated === 1 ? "coincidencia" : "coincidencias"} sin modificar su stock.`
      : "";
    const skippedText = skipped
      ? ` Se omitieron ${skipped} coincidencias ya existentes.`
      : "";
    return refreshedWorkspace(
      `${created} ${created === 1 ? "producto importado" : "productos importados"}.${updatedText}${skippedText}`,
    );
  } catch (error) {
    return dataError(readableError(error));
  }
}

export async function clearInventoryDataAction(
  confirmation: string,
): Promise<ActionResult<WorkspaceData>> {
  const configured = await ensureSupabase<WorkspaceData>(administratorRoles);
  if (configured) return configured;

  if (confirmation.trim().toLocaleUpperCase("es") !== "BORRAR TODO") {
    return dataError("Escribe BORRAR TODO para confirmar la operación.");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("clear_inventory_data", {
      p_confirmation: "BORRAR TODO",
    });

    if (error) return dataError(error.message);
    const imagePaths = Array.isArray(data)
      ? data.filter((path): path is string => typeof path === "string")
      : [];
    const cleanupError = await removeProductImages(supabase, imagePaths);
    return refreshedWorkspace(
      cleanupError
        ? "Los datos fueron borrados. Algunas imágenes quedaron pendientes de limpieza."
        : "Todos los datos de inventario fueron borrados. La cuenta y la empresa se conservaron.",
    );
  } catch (error) {
    return dataError(readableError(error));
  }
}
