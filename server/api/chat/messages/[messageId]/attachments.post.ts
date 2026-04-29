import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import {
  mapChatAttachmentRow,
  validateChatAttachmentPayload,
} from "~~/server/utils/chat-constraints";
import {
  isChatAdmin,
  loadAccessibleChatMessage,
  requireChatUser,
} from "~~/server/utils/chat";
import type { ChatAttachmentDto } from "~~/app/types/chat";

export default defineEventHandler(
  async (event): Promise<{ item: ChatAttachmentDto }> => {
    const messageId = getRouterParam(event, "messageId");
    if (!messageId) {
      throw createError({
        statusCode: 400,
        statusMessage: "messageId is required",
      });
    }

    const { userId, platformRole, adminClient } = await requireChatUser(event);
    const message = await loadAccessibleChatMessage(
      adminClient,
      messageId,
      userId,
      platformRole,
    );
    if (message.deleted_at)
      throw createError({
        statusCode: 409,
        statusMessage: "Message is deleted",
      });
    if (message.message_type !== "attachment") {
      throw createError({
        statusCode: 409,
        statusMessage: "Attachments require an attachment message",
      });
    }
    if (message.sender_id !== userId && !isChatAdmin(platformRole)) {
      throw createError({
        statusCode: 403,
        statusMessage: "Only the sender can attach files to this message",
      });
    }

    const payload = validateChatAttachmentPayload(
      await readBody(event),
      String(message.conversation_id),
      messageId,
    );
    const { data, error } = await adminClient
      .from("chat_attachments")
      .insert({
        message_id: messageId,
        storage_bucket: payload.storageBucket,
        storage_path: payload.storagePath,
        file_name: payload.fileName,
        mime_type: payload.mimeType,
        file_size: payload.fileSize,
        kind: payload.kind,
      })
      .select(
        "id, message_id, storage_bucket, storage_path, file_name, mime_type, file_size, kind, created_at",
      )
      .single();

    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    return { item: mapChatAttachmentRow(data) };
  },
);
