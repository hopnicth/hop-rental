import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  createProcessingCatalogMediaItem,
  processCatalogImageUpload,
  syncCatalogTargetMediaGallery,
  upsertCatalogMediaGalleryItem,
} from "~~/server/utils/catalog-media";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function readTextPart(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");
  const skuId = getRouterParam(event, "skuId");

  if (!productId || !skuId) {
    throw createError({ statusCode: 400, statusMessage: "productId and skuId are required" });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);

  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: "image file is required" });
  }

  if (!ALLOWED_TYPES.has(file.type || "")) {
    throw createError({ statusCode: 415, statusMessage: "Only JPEG, PNG, or WebP images are supported" });
  }

  if (Buffer.from(file.data).byteLength > 15 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: "Image file must be 15MB or smaller" });
  }

  const { data: row, error } = await adminClient
    .from("product_skus")
    .select("media_gallery, use_product_images")
    .eq("product_id", productId)
    .eq("id", skuId)
    .single();

  if (error || !row) {
    throw createError({ statusCode: 404, statusMessage: error?.message ?? "SKU not found" });
  }

  const mediaId = crypto.randomUUID();
  const placeholder = createProcessingCatalogMediaItem({
    mediaId,
    position: Array.isArray(row.media_gallery) ? row.media_gallery.length : 0,
    title: readTextPart(parts, "title"),
    altText: readTextPart(parts, "altText"),
    fit: readTextPart(parts, "fit"),
    originalFilename: file.filename,
  });

  await syncCatalogTargetMediaGallery({
    adminClient,
    target: { kind: "sku", productId, skuId },
    useProductImages: false,
    mediaGallery: upsertCatalogMediaGalleryItem(row.media_gallery, placeholder),
  });

  const task = (async () => {
    try {
      const readyItem = await processCatalogImageUpload({
        adminClient,
        target: { kind: "sku", productId, skuId },
        mediaId,
        buffer: Buffer.from(file.data),
        title: placeholder.title,
        altText: placeholder.altText,
        fit: String(placeholder.fit),
        originalFilename: file.filename,
      });
      const { data: current } = await adminClient
        .from("product_skus")
        .select("media_gallery, use_product_images")
        .eq("product_id", productId)
        .eq("id", skuId)
        .single();

      await syncCatalogTargetMediaGallery({
        adminClient,
        target: { kind: "sku", productId, skuId },
        useProductImages: false,
        mediaGallery: upsertCatalogMediaGalleryItem(current?.media_gallery ?? [], {
          ...placeholder,
          ...readyItem,
          position: placeholder.position,
        }),
      });
    } catch (processingError) {
      const { data: current } = await adminClient
        .from("product_skus")
        .select("media_gallery, use_product_images")
        .eq("product_id", productId)
        .eq("id", skuId)
        .single();

      await syncCatalogTargetMediaGallery({
        adminClient,
        target: { kind: "sku", productId, skuId },
        useProductImages: false,
        mediaGallery: upsertCatalogMediaGalleryItem(current?.media_gallery ?? [], {
          ...placeholder,
          status: "failed",
          error:
            processingError instanceof Error
              ? processingError.message
              : "Media processing failed",
          updatedAt: new Date().toISOString(),
        }),
      });
    }
  })();

  if (typeof event.waitUntil === "function") {
    event.waitUntil(task);
  } else {
    void task;
  }

  return { item: placeholder };
});