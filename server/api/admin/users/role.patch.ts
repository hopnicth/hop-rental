import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

const ALLOWED_ROLES = ["customer", "staff", "super_admin"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

type UserUpdateBuilder = {
  update(payload: Record<string, unknown>): UserUpdateBuilder;
  eq(column: string, value: unknown): UserUpdateBuilder;
  select(columns: string): UserUpdateBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
};

type AdminUserClient = {
  from(table: "users"): UserUpdateBuilder;
};

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);

  const body = (await readBody(event)) as Record<string, unknown>;
  const userId =
    typeof body.userId === "string" ? body.userId.trim() : null;
  const role = typeof body.role === "string" ? body.role.trim() : null;

  if (!userId || userId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "userId is required" });
  }

  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    throw createError({
      statusCode: 400,
      statusMessage: `role must be one of: ${ALLOWED_ROLES.join(", ")}`,
    });
  }

  const client = adminClient as unknown as AdminUserClient;

  const { data, error } = await client
    .from("users")
    .update({ platform_role: role as AllowedRole })
    .eq("id", userId)
    .select("id, platform_role")
    .single();

  if (error) {
    if (error.message?.includes("No rows") || error.message?.includes("0 rows")) {
      throw createError({ statusCode: 404, statusMessage: "User not found" });
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return {
    userId: data.id,
    platformRole: data.platform_role,
  };
});
