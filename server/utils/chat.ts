import { createError, getQuery, type H3Event } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { CHAT_INITIAL_PAGE_SIZE, CHAT_MAX_PAGE_SIZE } from "./chat-constraints";

type AnyClient = { from: (table: string) => any; storage?: any };
type PlatformRole = "customer" | "staff" | "super_admin";

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage });
}

function getAuthUserId(authUser: unknown): string | null {
  const row = authUser && typeof authUser === "object" ? (authUser as any) : {};
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
      (data as any).platform_role ?? "customer",
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
    String((data as any).conversation_id),
    userId,
    platformRole,
  );
  return data as any;
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
