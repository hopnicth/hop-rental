import { createError, defineEventHandler } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);

  const [matchesResult, rentalAccessesResult, productsResult] =
    await Promise.all([
      adminClient
        .from("rental_access_matches")
        .select(
          "id, rental_access_id, product_id, match_type, sort_order, note, updated_at, rental_access:rental_accesses(code, name_th, status), product:products(slug, name_th, is_hidden)",
        )
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false }),
      adminClient
        .from("rental_accesses")
        .select("id, code, name_th, status, is_hidden")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false }),
      adminClient
        .from("products")
        .select("id, slug, name_th, is_hidden")
        .order("updated_at", { ascending: false }),
    ]);

  if (matchesResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: matchesResult.error.message,
    });
  }

  if (rentalAccessesResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: rentalAccessesResult.error.message,
    });
  }

  if (productsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: productsResult.error.message,
    });
  }

  return {
    matches: (matchesResult.data ?? []).map((row) => ({
      id: row.id,
      rentalAccessId: row.rental_access_id,
      productId: row.product_id,
      matchType: row.match_type,
      sortOrder: Number(row.sort_order ?? 0),
      note: row.note ?? "",
      updatedAt: row.updated_at,
      rentalAccessLabel: `${row.rental_access?.code ?? "—"} · ${row.rental_access?.name_th ?? "Unknown access"}`,
      rentalAccessStatus: row.rental_access?.status ?? "draft",
      productLabel: `${row.product?.name_th ?? row.product_id} · ${row.product?.slug ?? ""}`,
      productHidden: row.product?.is_hidden === true,
    })),
    rentalAccessOptions: (rentalAccessesResult.data ?? []).map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name_th}`,
      status: row.status,
      isHidden: row.is_hidden === true,
    })),
    productOptions: (productsResult.data ?? []).map((row) => ({
      value: row.id,
      label: `${row.name_th} · ${row.slug}`,
      isHidden: row.is_hidden === true,
    })),
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
