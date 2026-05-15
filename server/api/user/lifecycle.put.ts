import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  assertLifecycleTransitionAllowed,
  isMissingAccountLifecycleSchema,
  requireAccountLifecycleAction,
  USER_LIFECYCLE_SELECT,
} from "~~/server/utils/user-lifecycle";

type SupabaseMutationResult = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
};

type SupabaseLifecycleBuilder = {
  select(columns: string): SupabaseLifecycleBuilder;
  update(payload: Record<string, unknown>): SupabaseLifecycleBuilder;
  eq(column: string, value: unknown): SupabaseLifecycleBuilder;
  single(): Promise<SupabaseMutationResult>;
};

type SupabaseLifecycleClient = {
  from(table: "users"): SupabaseLifecycleBuilder;
};

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const action = requireAccountLifecycleAction(body);
  const client = serverSupabaseServiceRole(
    event,
  ) as unknown as SupabaseLifecycleClient;

  const { data: current, error: currentError } = await client
    .from("users")
    .select(USER_LIFECYCLE_SELECT)
    .eq("id", userId)
    .single();

  if (currentError) {
    if (isMissingAccountLifecycleSchema(currentError)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Migration 071 is required",
      });
    }
    throw createError({ statusCode: 500, statusMessage: currentError.message });
  }
  if (!current) {
    throw createError({
      statusCode: 404,
      statusMessage: "User profile not found",
    });
  }

  assertLifecycleTransitionAllowed(action, current.account_status);

  const requestedAt = new Date().toISOString();
  const payload =
    action === "deactivate"
      ? {
          account_status: "deactivated",
          deactivation_requested_at: requestedAt,
          lifecycle_note:
            "Customer requested temporary deactivation from Account Settings.",
          lifecycle_updated_at: requestedAt,
          lifecycle_updated_by: userId,
        }
      : {
          account_status: "deletion_requested",
          deletion_requested_at: requestedAt,
          lifecycle_note:
            "Customer requested PDPA deletion from Account Settings. Transaction and tax records remain retained by legal policy.",
          lifecycle_updated_at: requestedAt,
          lifecycle_updated_by: userId,
        };

  const { data, error } = await client
    .from("users")
    .update(payload)
    .eq("id", userId)
    .select(USER_LIFECYCLE_SELECT)
    .single();

  if (error) {
    if (isMissingAccountLifecycleSchema(error)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Migration 071 is required",
      });
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { profile: data };
});
