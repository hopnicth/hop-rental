import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} is required`,
    });
  }

  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const rentalAccessId = asNonEmptyString(body.rentalAccessId, "rentalAccessId");
  const productId = asNonEmptyString(body.productId, "productId");
  const matchType =
    typeof body.matchType === "string" && body.matchType.trim().length > 0
      ? body.matchType.trim()
      : "compatible";

  const { data, error } = await adminClient
    .from("rental_access_matches")
    .insert({
      rental_access_id: rentalAccessId,
      product_id: productId,
      match_type: matchType,
      sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
      note:
        typeof body.note === "string" && body.note.trim().length > 0
          ? body.note.trim()
          : null,
    })
    .select(
      "id, rental_access_id, product_id, match_type, sort_order, note, updated_at, rental_access:rental_accesses(code, name_th, status), product:products(slug, name_th, is_hidden)",
    )
    .single();

  if (error) {
    const statusCode = error.code === "23505" ? 409 : 500;
    throw createError({
      statusCode,
      statusMessage: error.message,
    });
  }

  return {
    item: {
      id: data.id,
      rentalAccessId: data.rental_access_id,
      productId: data.product_id,
      matchType: data.match_type,
      sortOrder: Number(data.sort_order ?? 0),
      note: data.note ?? "",
      updatedAt: data.updated_at,
      rentalAccessLabel: `${data.rental_access?.code ?? "—"} · ${data.rental_access?.name_th ?? "Unknown access"}`,
      rentalAccessStatus: data.rental_access?.status ?? "draft",
      productLabel: `${data.product?.name_th ?? data.product_id} · ${data.product?.slug ?? ""}`,
      productHidden: data.product?.is_hidden === true,
    },
  };
});
