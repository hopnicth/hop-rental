import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import {
  enforceChatMessageRateLimit,
  mapChatMessageRow,
  validateChatMessagePayload,
} from "~~/server/utils/chat-constraints";
import {
  ensureChatConversationAccess,
  requireChatUser,
} from "~~/server/utils/chat";
import type { ChatMessageDto } from "~~/app/types/chat";

export default defineEventHandler(
  async (event): Promise<{ item: ChatMessageDto }> => {
    const conversationId = getRouterParam(event, "conversationId");
    if (!conversationId) {
      throw createError({
        statusCode: 400,
        statusMessage: "conversationId is required",
      });
    }

    const { userId, platformRole, adminClient } = await requireChatUser(event);
    await ensureChatConversationAccess(
      adminClient,
      conversationId,
      userId,
      platformRole,
    );
    enforceChatMessageRateLimit(userId);

    const payload = validateChatMessagePayload(await readBody(event));
    const { data, error } = await adminClient
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        message_type: payload.messageType,
        body: payload.body,
      })
      .select(
        "id, conversation_id, sender_id, message_type, body, created_at, edited_at, deleted_at, chat_attachments(id, message_id, storage_bucket, storage_path, file_name, mime_type, file_size, kind, created_at, deleted_at)",
      )
      .single();

    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    return { item: mapChatMessageRow(data) };
  },
);
