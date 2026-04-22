import { createError, type H3Event } from "h3";
import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";

const ALLOWED_PLATFORM_ROLES = ["staff", "super_admin"] as const;

export const ADMIN_SERVICE_KEY_MISSING_CODE = "ADMIN_SERVICE_KEY_MISSING";
export const ADMIN_SERVICE_KEY_MISSING_TITLE =
  "Admin API is running in read-only fallback mode";
export const ADMIN_SERVICE_KEY_MISSING_MESSAGE =
  "Set SUPABASE_SECRET_KEY (recommended) or SUPABASE_SERVICE_KEY in the server environment to enable privileged admin reads and writes.";

export type AdminApiWarning = {
  code: string;
  title: string;
  message: string;
};

function createAdminServiceKeyWarning(): AdminApiWarning {
  return {
    code: ADMIN_SERVICE_KEY_MISSING_CODE,
    title: ADMIN_SERVICE_KEY_MISSING_TITLE,
    message: ADMIN_SERVICE_KEY_MISSING_MESSAGE,
  };
}

export function hasAdminServiceKey(): boolean {
  return [
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_KEY,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

function throwAdminServiceKeyMissing(): never {
  throw createError({
    statusCode: 503,
    statusMessage: ADMIN_SERVICE_KEY_MISSING_TITLE,
    data: createAdminServiceKeyWarning(),
  });
}

async function requirePlatformAdminProfile(event: H3Event) {
  const authUser = await serverSupabaseUser(event);
  const userId = typeof authUser?.sub === "string" ? authUser.sub : null;

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const userClient = await serverSupabaseClient(event);
  const { data: profile, error } = await userClient
    .from("users")
    .select("id, platform_role")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin profile not found",
    });
  }

  if (!ALLOWED_PLATFORM_ROLES.includes(profile.platform_role)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }

  return {
    userId,
    platformRole: profile.platform_role,
    userClient,
  };
}

export async function requirePlatformAdmin(event: H3Event) {
  const { userId, platformRole } = await requirePlatformAdminProfile(event);

  if (!hasAdminServiceKey()) {
    throwAdminServiceKeyMissing();
  }

  return {
    userId,
    platformRole,
    adminClient: serverSupabaseServiceRole(event),
  };
}

export async function requirePlatformAdminReadAccess(event: H3Event) {
  const { userId, platformRole, userClient } =
    await requirePlatformAdminProfile(event);

  if (!hasAdminServiceKey()) {
    return {
      userId,
      platformRole,
      adminClient: userClient,
      adminMode: "read_only" as const,
      adminWarning: createAdminServiceKeyWarning(),
    };
  }

  return {
    userId,
    platformRole,
    adminClient: serverSupabaseServiceRole(event),
    adminMode: "full" as const,
    adminWarning: null,
  };
}
