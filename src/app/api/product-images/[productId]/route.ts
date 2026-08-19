import sharp from "sharp";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routeParamsSchema = z.object({
  productId: z.uuid(),
});

const imageSizeSchema = z.enum(["thumb", "preview"]);

const imageSizes = {
  thumb: { width: 112, height: 112, quality: 72 },
  preview: { width: 640, height: 480, quality: 80 },
} as const;

const privateImageHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

function errorResponse(message: string, status: number) {
  return Response.json(
    { message },
    {
      status,
      headers: privateImageHeaders,
    },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return errorResponse("El producto no es válido.", 400);
  }

  const url = new URL(request.url);
  const parsedSize = imageSizeSchema.safeParse(
    url.searchParams.get("size") ?? "thumb",
  );
  if (!parsedSize.success) {
    return errorResponse("El tamaño de imagen no es válido.", 400);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (claimsError || !claimsData?.claims?.sub) {
      return errorResponse("Debes iniciar sesión.", 401);
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("image_path")
      .eq("id", parsedParams.data.productId)
      .maybeSingle();

    if (productError) {
      return errorResponse("No fue posible leer la imagen.", 500);
    }
    if (!product?.image_path) {
      return errorResponse("La imagen no existe.", 404);
    }

    const { data: sourceImage, error: downloadError } = await supabase.storage
      .from("product-images")
      .download(product.image_path, {}, { cache: "no-store" });

    if (downloadError || !sourceImage) {
      return errorResponse("La imagen no existe.", 404);
    }
    if (sourceImage.size <= 0 || sourceImage.size > 5 * 1024 * 1024) {
      return errorResponse("La imagen almacenada no es válida.", 422);
    }

    const size = imageSizes[parsedSize.data];
    const output = await sharp(await sourceImage.arrayBuffer(), {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(size.width, size.height, {
        fit: parsedSize.data === "preview" ? "inside" : "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .webp({ quality: size.quality })
      .toBuffer();

    return new Response(new Uint8Array(output), {
      status: 200,
      headers: {
        ...privateImageHeaders,
        "Content-Type": "image/webp",
      },
    });
  } catch {
    return errorResponse("No fue posible preparar la imagen.", 500);
  }
}
