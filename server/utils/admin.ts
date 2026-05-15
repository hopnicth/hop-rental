import { createError, type H3Event } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";

const ALLOWED_PLATFORM_ROLES = ["staff", "super_admin"] as const;

export async function requirePlatformAdmin(event: H3Event) {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: profile, error } = await adminClient
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
    adminClient,
  };
}

export async function requireSuperAdmin(event: H3Event) {
  const admin = await requirePlatformAdmin(event);

  if (admin.platformRole !== "super_admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Super admin access required",
    });
  }

  return admin;
}

export async function requirePlatformAdminReadAccess(event: H3Event) {
  const admin = await requirePlatformAdmin(event);

  return {
    ...admin,
    adminMode: "full" as const,
    adminWarning: null,
  };
}
