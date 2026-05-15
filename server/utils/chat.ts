import { createError, getQuery, type H3Event } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { CHAT_INITIAL_PAGE_SIZE, CHAT_MAX_PAGE_SIZE } from "./chat-constraints";

type PlatformRole = "customer" | "staff" | "super_admin";
type QueryError = { message: string };
type SupabaseRow = Record<string, unknown>;
type MaybeSingleResult<T extends SupabaseRow> = Promise<{
  data: T | null;
  error: QueryError | null;
}>;
type SelectBuilder<T extends SupabaseRow> = {
  select(columns: string): SelectBuilder<T>;
  eq(column: string, value: unknown): SelectBuilder<T>;
  is(column: string, value: unknown): SelectBuilder<T>;
  maybeSingle(): MaybeSingleResult<T>;
};
type AnyClient = {
  from(table: string): SelectBuilder<SupabaseRow>;
  storage?: unknown;
};
type AuthUserRow = { sub?: string; id?: string };
type UserProfileRow = SupabaseRow & { platform_role?: string | null };
type ChatMessageRow = SupabaseRow & { conversation_id?: string | null };

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage });
}

function getAuthUserId(authUser: unknown): string | null {
  const row: AuthUserRow =
    authUser && typeof authUser === "object" ? (authUser as AuthUserRow) : {};
  return typeof row.sub === "string"
    ? row.sub
    : typeof row.id === "string"
      ? row.id
      : null;
}

export function isChatAdmin(role: PlatformRole): boolean {
  return role === "staff" || role === "super_admin";
}

export async function requireChatUser(event: H3Event) {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) fail(401, "Authentication required");

  const adminClient = serverSupabaseServiceRole(event);
  const { data, error } = await adminClient
    .from("users")
    .select("id, platform_role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) fail(403, "User profile not found");
  return {
    userId,
    platformRole: String(
      (data as UserProfileRow).platform_role ?? "customer",
    ) as PlatformRole,
    adminClient,
  };
}

export async function ensureChatConversationAccess(
  adminClient: AnyClient,
  conversationId: string,
  userId: string,
  platformRole: PlatformRole,
) {
  if (isChatAdmin(platformRole)) {
    const { data, error } = await adminClient
      .from("chat_conversations")
      .select("id, status")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) fail(500, error.message);
    if (!data) fail(404, "Conversation not found");
    return data;
  }

  const { data, error } = await adminClient
    .from("chat_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) fail(500, error.message);
  if (!data) fail(403, "Conversation access denied");
  return data;
}

export async function loadAccessibleChatMessage(
  adminClient: AnyClient,
  messageId: string,
  userId: string,
  platformRole: PlatformRole,
) {
  const { data, error } = await adminClient
    .from("chat_messages")
    .select("id, conversation_id, sender_id, message_type, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (error) fail(500, error.message);
  if (!data) fail(404, "Message not found");

  await ensureChatConversationAccess(
    adminClient,
    String((data as ChatMessageRow).conversation_id),
    userId,
    platformRole,
  );
  return data as ChatMessageRow;
}

export function parseChatMessagePage(event: H3Event) {
  const query = getQuery(event);
  const requested = Number(query.limit ?? CHAT_INITIAL_PAGE_SIZE);
  const limit = Math.min(
    CHAT_MAX_PAGE_SIZE,
    Math.max(
      1,
      Number.isFinite(requested) ? requested : CHAT_INITIAL_PAGE_SIZE,
    ),
  );
  const before = typeof query.before === "string" ? query.before.trim() : "";
  if (before && Number.isNaN(Date.parse(before))) {
    fail(400, "before must be an ISO timestamp");
  }
  return { limit, before: before || null };
}
