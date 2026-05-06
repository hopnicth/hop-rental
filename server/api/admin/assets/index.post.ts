import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  ADMIN_ASSET_DETAIL_SELECT_LEGACY,
  buildAssetPayload,
  isMissingAssetSearchKeywordsColumn,
  mapAssetDetail,
  stripAssetSearchKeywords,
} from "~~/server/utils/admin-asset";

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function generateAssetCode() {
  const seed = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `R-${seed}`;
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

function buildAssetSlug(input: {
  nameEn?: string | null;
  nameTh?: string | null;
  brand?: string | null;
  code: string;
}) {
  const nameSegment =
    slugifySegment(input.nameEn || "") ||
    slugifySegment(input.nameTh || "") ||
    "asset";
  const brandSegment = slugifySegment(input.brand || "");
  const codeTail = slugifySegment(input.code).slice(-8) || "draft";
  return [nameSegment, brandSegment, codeTail].filter(Boolean).join("-");
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const code = asOptionalString(body.code) ?? generateAssetCode();
  const slug =
    asOptionalString(body.slug) ??
    buildAssetSlug({
      nameEn: asOptionalString(body.nameEn),
      nameTh: asOptionalString(body.nameTh),
      brand: asOptionalString(body.brand),
      code,
    });

  const payload = buildAssetPayload({ ...body, code, slug }, "create");

  let { data, error } = await adminClient
    .from("assets")
    .insert(payload)
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .single();

  if (isMissingAssetSearchKeywordsColumn(error)) {
    const fallback = await adminClient
      .from("assets")
      .insert(stripAssetSearchKeywords(payload))
      .select(ADMIN_ASSET_DETAIL_SELECT_LEGACY)
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    const statusCode = error.code === "23505" ? 409 : 500;
    throw createError({ statusCode, statusMessage: error.message });
  }

  return { item: mapAssetDetail(data as Record<string, unknown>) };
});
