import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

const KYC_DOCUMENTS_BUCKET = "kyc-documents";
const SIGNED_URL_TTL_SECONDS = 60;

type IdCardRow = {
  id_card_url?: unknown;
  id_card_storage_path?: unknown;
};

type QueryResult = {
  data: IdCardRow | null;
  error: { message: string } | null;
};

type IdCardQueryBuilder = {
  select(columns: string): IdCardQueryBuilder;
  eq(column: string, value: unknown): IdCardQueryBuilder;
  maybeSingle(): Promise<QueryResult>;
};

type AdminIdCardClient = {
  from(table: "users" | "walk_in_customers"): IdCardQueryBuilder;
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{
        data: { signedUrl: string };
        error: { message: string } | null;
      }>;
    };
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStorageKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9+_.-]/g, "_").slice(0, 80) || "unknown";
}

function isPublicUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function assertSafePath(
  path: string,
  input: { userId?: string; phone?: string },
) {
  if (!path || isPublicUrl(path)) {
    throw createError({
      statusCode: 409,
      statusMessage: "ID card must be re-uploaded to private storage",
    });
  }

  if (input.userId && path.startsWith(`users/${input.userId}/id-card/`)) return;
  if (
    input.phone &&
    path.startsWith(
      `walk-in-customers/${normalizeStorageKey(input.phone)}/id-card/`,
    )
  ) {
    return;
  }

  throw createError({
    statusCode: 403,
    statusMessage: "ID card document path is not accessible for this customer",
  });
}

async function findIdCardPath(
  adminClient: AdminIdCardClient,
  input: { userId: string; phone: string },
): Promise<string | null> {
  if (input.userId) {
    const { data, error } = await adminClient
      .from("users")
      .select("id, id_card_url")
      .eq("id", input.userId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    const path = asString(data?.id_card_url);
    if (path) return path;
  }

  if (input.phone) {
    const { data, error } = await adminClient
      .from("walk_in_customers")
      .select("phone, id_card_url, id_card_storage_path")
      .eq("phone", input.phone)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    return (
      asString(data?.id_card_storage_path) ||
      asString(data?.id_card_url) ||
      null
    );
  }

  return null;
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const idCardClient = adminClient as unknown as AdminIdCardClient;
  const query = getQuery(event);
  const userId = asString(query.userId);
  const phone = asString(query.phone);

  if (!userId && !phone) {
    throw createError({
      statusCode: 400,
      statusMessage: "userId or phone is required",
    });
  }

  const path = await findIdCardPath(idCardClient, { userId, phone });
  if (!path) {
    throw createError({
      statusCode: 404,
      statusMessage: "ID card document not found",
    });
  }
  assertSafePath(path, { userId, phone });

  const { data, error } = await idCardClient.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });

  return { signedUrl: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
});
