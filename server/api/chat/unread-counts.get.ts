import { createError, defineEventHandler } from "h3";
import { countChatUnreadMessages } from "~~/server/utils/chat-constraints";
import { isChatAdmin, requireChatUser } from "~~/server/utils/chat";
import type {
  ChatUnreadCountsResponse,
  ChatUnreadEntry,
} from "~~/app/types/chat";

const CHAT_UNREAD_LIST_MAX = 100;

export default defineEventHandler(
  async (event): Promise<ChatUnreadCountsResponse> => {
    const { userId, platformRole, adminClient } = await requireChatUser(event);
    const fetchedAt = new Date().toISOString();

    let participantRows: any[] = [];
    let conversationRows: any[] = [];

    if (isChatAdmin(platformRole)) {
      const { data, error } = await adminClient
        .from("chat_conversations")
        .select("id, customer_id, updated_at, status")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(CHAT_UNREAD_LIST_MAX);
      if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
      }
      conversationRows = data ?? [];

      const ids = conversationRows.map((row: any) => String(row.id));
      if (ids.length > 0) {
        const { data: parts, error: partsError } = await adminClient
          .from("chat_participants")
          .select("conversation_id, last_read_at")
          .eq("user_id", userId)
          .in("conversation_id", ids);
        if (partsError) {
          throw createError({
            statusCode: 500,
            statusMessage: partsError.message,
          });
        }
        participantRows = parts ?? [];
      }
    } else {
      const { data, error } = await adminClient
        .from("chat_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", userId)
        .is("left_at", null)
        .limit(CHAT_UNREAD_LIST_MAX);
      if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
      }
      participantRows = data ?? [];

      const ids = participantRows.map((row) => String(row.conversation_id));
      if (ids.length > 0) {
        const { data: convs, error: convError } = await adminClient
          .from("chat_conversations")
          .select("id, customer_id, updated_at, status")
          .in("id", ids);
        if (convError) {
          throw createError({
            statusCode: 500,
            statusMessage: convError.message,
          });
        }
        conversationRows = convs ?? [];
      }
    }

    const ids = conversationRows.map((row: any) => String(row.id));
    if (ids.length === 0) {
      return { items: [], totalUnread: 0, fetchedAt };
    }

    const lastReadByConversation = new Map<string, string | null>();
    for (const row of participantRows) {
      const conversationId = String(row.conversation_id ?? "");
      if (!conversationId) continue;
      lastReadByConversation.set(
        conversationId,
        typeof row.last_read_at === "string" ? row.last_read_at : null,
      );
    }

    const { data: unreadRows, error: unreadError } = await adminClient
      .from("chat_messages")
      .select("conversation_id, sender_id, created_at, deleted_at")
      .in("conversation_id", ids)
      .neq("sender_id", userId)
      .is("deleted_at", null);
    if (unreadError) {
      throw createError({
        statusCode: 500,
        statusMessage: unreadError.message,
      });
    }

    const counts = countChatUnreadMessages({
      conversationIds: ids,
      participantLastReadByConversation: lastReadByConversation,
      messages: unreadRows ?? [],
      userId,
    });

    const items: ChatUnreadEntry[] = conversationRows.map((row: any) => ({
      conversationId: String(row.id),
      customerId:
        typeof row.customer_id === "string" && row.customer_id.length > 0
          ? row.customer_id
          : null,
      unreadCount: counts.get(String(row.id)) ?? 0,
      lastReadAt: lastReadByConversation.get(String(row.id)) ?? null,
      updatedAt: String(row.updated_at ?? ""),
    }));

    const totalUnread = items.reduce((sum, item) => sum + item.unreadCount, 0);
    return { items, totalUnread, fetchedAt };
  },
);
