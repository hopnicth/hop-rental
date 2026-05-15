import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  buildUserProfileUpdatePayload,
  USER_PROFILE_SELECT_BASE,
} from "~~/server/utils/user-profile";

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
};

type UserMutationBuilder = {
  select(columns: string): UserMutationBuilder;
  update(payload: Record<string, unknown>): UserMutationBuilder;
  insert(payload: Record<string, unknown>): UserMutationBuilder;
  eq(column: string, value: unknown): UserMutationBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
};

type UserProfileClient = {
  from(table: "users"): UserMutationBuilder;
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
  const payload = buildUserProfileUpdatePayload(body);
  const client = serverSupabaseServiceRole(
    event,
  ) as unknown as UserProfileClient;

  const { data: existing, error: existingError } = await client
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: existingError.message });
  }

  const mutation = existing?.id
    ? await client
        .from("users")
        .update(payload)
        .eq("id", userId)
        .select(USER_PROFILE_SELECT_BASE)
        .single()
    : await client
        .from("users")
        .insert({ id: userId, ...payload })
        .select(USER_PROFILE_SELECT_BASE)
        .single();

  if (mutation.error) {
    throw createError({ statusCode: 500, statusMessage: mutation.error.message });
  }

  return { profile: mutation.data };
});
