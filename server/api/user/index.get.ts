import { createError, defineEventHandler, setHeader } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseSession,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  isMissingOptionalUserProfileColumns,
  isMissingUserLifecycleColumns,
  USER_PROFILE_SELECT_BASE,
  USER_PROFILE_SELECT_LEGACY,
  USER_PROFILE_SELECT_LEGACY_WITH_LIFECYCLE,
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
  setHeader(event, "Cache-Control", "private, no-store");

  // Trigger an active session lookup first so @supabase/ssr can refresh an
  // expired access token using the refresh-token cookie before we read claims.
  // serverSupabaseUser uses getClaims(), which only parses the current JWT and
  // does not perform refresh — leading to false 401s after the 1h access-token
  // TTL even though the session is still valid. Errors here are swallowed so
  // the existing auth flow (serverSupabaseUser → 401) still owns the response.
  try {
    await serverSupabaseSession(event);
  } catch {
    // Ignore: serverSupabaseUser below will produce the correct 401 if the
    // session is truly invalid, or surface a 500 on real client errors.
  }

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
  const candidateSelects = [
    USER_PROFILE_SELECT_WITH_LIFECYCLE,
    USER_PROFILE_SELECT_BASE,
    USER_PROFILE_SELECT_LEGACY_WITH_LIFECYCLE,
    USER_PROFILE_SELECT_LEGACY,
  ];

  let result: QueryResult | null = null;
  for (const columns of candidateSelects) {
    result = await selectProfile(client, userId, columns);
    if (!result.error) break;
    if (
      !isMissingUserLifecycleColumns(result.error) &&
      !isMissingOptionalUserProfileColumns(result.error)
    ) {
      break;
    }
  }

  if (result?.error) {
    throw createError({ statusCode: 500, statusMessage: result.error.message });
  }

  return { profile: result?.data ?? null };
});
