import { createError, defineEventHandler, getQuery } from "h3";
import {
  countChatUnreadMessages,
  mapChatMessageRow,
} from "~~/server/utils/chat-constraints";
import { isChatAdmin, requireChatUser } from "~~/server/utils/chat";
import type {
  ChatConversationDto,
  ChatConversationsResponse,
} from "~~/app/types/chat";

const CHAT_CONVERSATION_LIST_MAX = 50;

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export default defineEventHandler(
  async (event): Promise<ChatConversationsResponse> => {
    const { userId, platformRole, adminClient } = await requireChatUser(event);
    const query = getQuery(event);
    const requested = Number(query.limit ?? 30);
    const limit = Math.min(
      CHAT_CONVERSATION_LIST_MAX,
      Math.max(1, Number.isFinite(requested) ? requested : 30),
    );

    let participantRows: any[] = [];
    let request = adminClient
      .from("chat_conversations")
      .select(
        "id, subject_type, subject_id, customer_id, status, last_message_id, created_at, updated_at, closed_at, archived_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (!isChatAdmin(platformRole)) {
      const { data, error } = await adminClient
        .from("chat_participants")
        .select("conversation_id, participant_role, last_read_at")
        .eq("user_id", userId)
        .is("left_at", null);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      participantRows = data ?? [];
      const conversationIds = participantRows.map((row) => row.conversation_id);
      if (conversationIds.length === 0) return { items: [], pageSize: limit };
      request = request.in("id", conversationIds);
    }

    const status = typeof query.status === "string" ? query.status : "";
    if (["open", "closed", "archived"].includes(status)) {
      request = request.eq("status", status);
    }

    const { data: conversationRows, error: conversationError } = await request;
    if (conversationError) {
      throw createError({
        statusCode: 500,
        statusMessage: conversationError.message,
      });
    }

    const rows = conversationRows ?? [];
    const ids = rows.map((row: any) => String(row.id));
    const lastMessageIds = rows
      .map((row: any) => stringOrNull(row.last_message_id))
      .filter(Boolean) as string[];
    const customerIds = rows
      .map((row: any) => stringOrNull(row.customer_id))
      .filter(Boolean) as string[];

    if (isChatAdmin(platformRole) && ids.length > 0) {
      const { data, error } = await adminClient
        .from("chat_participants")
        .select("conversation_id, participant_role, last_read_at")
        .eq("user_id", userId)
        .in("conversation_id", ids);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      participantRows = data ?? [];
    }

    const participantByConversation = new Map(
      participantRows.map((row) => [String(row.conversation_id), row]),
    );

    const lastMessageById = new Map<string, any>();
    if (lastMessageIds.length > 0) {
      const { data, error } = await adminClient
        .from("chat_messages")
        .select(
          "id, conversation_id, sender_id, message_type, body, created_at, edited_at, deleted_at, chat_attachments(id, message_id, storage_bucket, storage_path, file_name, mime_type, file_size, kind, created_at, deleted_at)",
        )
        .in("id", lastMessageIds);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      for (const row of data ?? []) lastMessageById.set(String(row.id), row);
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

    let unreadCountByConversation = new Map<string, number>();
    if (ids.length > 0) {
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
      unreadCountByConversation = countChatUnreadMessages({
        conversationIds: ids,
        participantLastReadByConversation: lastReadByConversation,
        messages: unreadRows ?? [],
        userId,
      });
    }

    const customerById = new Map<string, any>();
    if (customerIds.length > 0) {
      const { data, error } = await adminClient
        .from("users")
        .select("id, full_name, phone")
        .in("id", customerIds);
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      for (const row of data ?? []) customerById.set(String(row.id), row);
    }

    const items: ChatConversationDto[] = rows.map((row: any) => {
      const participant = participantByConversation.get(String(row.id));
      const lastMessageRow = stringOrNull(row.last_message_id)
        ? lastMessageById.get(String(row.last_message_id))
        : null;
      const lastMessage = lastMessageRow
        ? mapChatMessageRow(lastMessageRow)
        : null;
      const lastReadAt = stringOrNull(participant?.last_read_at);
      const unreadCount = unreadCountByConversation.get(String(row.id)) ?? 0;
      const customer = stringOrNull(row.customer_id)
        ? customerById.get(String(row.customer_id))
        : null;

      return {
        id: String(row.id),
        subjectType: String(
          row.subject_type ?? "general",
        ) as ChatConversationDto["subjectType"],
        subjectId: stringOrNull(row.subject_id),
        customerId: stringOrNull(row.customer_id),
        status: String(row.status ?? "open") as ChatConversationDto["status"],
        lastMessageId: stringOrNull(row.last_message_id),
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
        closedAt: stringOrNull(row.closed_at),
        archivedAt: stringOrNull(row.archived_at),
        participantRole: participant?.participant_role ?? null,
        lastReadAt,
        unreadCount,
        customer: customer
          ? {
              id: String(customer.id),
              fullName: stringOrNull(customer.full_name),
              phone: stringOrNull(customer.phone),
            }
          : null,
        lastMessage,
      };
    });

    return { items, pageSize: limit };
  },
);
