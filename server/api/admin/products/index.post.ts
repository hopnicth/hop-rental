import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PRODUCT_LIST_SELECT,
  asOptionalString,
  buildProductPayload,
  mapAdminProductListItem,
} from "~~/server/utils/admin-catalog";

function generateProductId() {
  const seed = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `prod-${seed}`;
}

function slugifySegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}

function buildProductSlug(input: {
  nameEn?: string | null;
  nameTh?: string | null;
  brand?: string | null;
  productId: string;
}) {
  const nameSegment =
    slugifySegment(input.nameEn || "") ||
    slugifySegment(input.nameTh || "") ||
    "product";
  const brandSegment = slugifySegment(input.brand || "");
  const shortId = input.productId.replace(/^prod-/, "").slice(0, 8) || "draft";

  return [nameSegment, brandSegment, shortId].filter(Boolean).join("-");
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const id = asOptionalString(body.id) ?? generateProductId();
  const slug =
    asOptionalString(body.slug) ??
    buildProductSlug({
      nameEn: asOptionalString(body.nameEn),
      nameTh: asOptionalString(body.nameTh),
      brand: asOptionalString(body.brand),
      productId: id,
    });

  const payload = {
    id,
    ...buildProductPayload({
      ...body,
      slug,
      isHidden: typeof body.isHidden === "boolean" ? body.isHidden : true,
    }),
  };

  const { data, error } = await adminClient
    .from("products")
    .insert(payload)
    .select(ADMIN_PRODUCT_LIST_SELECT)
    .single();

  if (error) {
    throw createError({
      statusCode: error.code === "23505" ? 409 : 500,
      statusMessage: error.message,
    });
  }

  return {
    item: mapAdminProductListItem(data as Record<string, unknown>),
  };
});
