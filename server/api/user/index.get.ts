import { createError, defineEventHandler } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  isMissingUserLifecycleColumns,
  USER_PROFILE_SELECT_BASE,
  USER_PROFILE_SELECT_WITH_LIFECYCLE,
} from "~~/server/utils/user-profile";

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
};

type UserQueryBuilder = {
  select(columns: string): UserQueryBuilder;
  eq(column: string, value: unknown): UserQueryBuilder;
  maybeSingle(): Promise<QueryResult>;
};

type UserProfileClient = {
  from(table: "users"): UserQueryBuilder;
};

async function selectProfile(
  client: UserProfileClient,
  userId: string,
  columns: string,
) {
  return await client
    .from("users")
    .select(columns)
    .eq("id", userId)
    .maybeSingle();
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const client = serverSupabaseServiceRole(
    event,
  ) as unknown as UserProfileClient;
  let result = await selectProfile(
    client,
    userId,
    USER_PROFILE_SELECT_WITH_LIFECYCLE,
  );

  if (result.error && isMissingUserLifecycleColumns(result.error)) {
    result = await selectProfile(client, userId, USER_PROFILE_SELECT_BASE);
  }

  if (result.error) {
    throw createError({ statusCode: 500, statusMessage: result.error.message });
  }

  return { profile: result.data ?? null };
});
