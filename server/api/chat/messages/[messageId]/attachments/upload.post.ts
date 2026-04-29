import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import {
  CHAT_ATTACHMENT_BUCKET,
  classifyChatAttachment,
  mapChatAttachmentRow,
} from "~~/server/utils/chat-constraints";
import {
  isChatAdmin,
  loadAccessibleChatMessage,
  requireChatUser,
} from "~~/server/utils/chat";
import type { ChatAttachmentDto } from "~~/app/types/chat";

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}

function safeFileName(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized.slice(0, 255) || null;
}

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
    if (message.deleted_at) {
      throw createError({
        statusCode: 409,
        statusMessage: "Message is deleted",
      });
    }
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

    const parts = await readMultipartFormData(event);
    const file = parts?.find((part) => part.filename && part.data);
    if (!file?.data) {
      throw createError({
        statusCode: 400,
        statusMessage: "Attachment file is required",
      });
    }

    const buffer = Buffer.from(file.data);
    const { mimeType, fileSize, kind } = classifyChatAttachment(
      file.type,
      buffer.byteLength,
    );
    const ext = extensionForMime(mimeType);
    const storagePath = `conversations/${
      message.conversation_id
    }/${messageId}/${crypto.randomUUID()}.${ext}`;
    const fileName = safeFileName(file.filename);

    const { error: uploadError } = await adminClient.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (uploadError) {
      throw createError({
        statusCode: 500,
        statusMessage: uploadError.message,
      });
    }

    const { data, error } = await adminClient
      .from("chat_attachments")
      .insert({
        message_id: messageId,
        storage_bucket: CHAT_ATTACHMENT_BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        kind,
      })
      .select(
        "id, message_id, storage_bucket, storage_path, file_name, mime_type, file_size, kind, created_at",
      )
      .single();

    if (error) {
      await adminClient.storage
        .from(CHAT_ATTACHMENT_BUCKET)
        .remove([storagePath]);
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    return { item: mapChatAttachmentRow(data) };
  },
);
