import { createError, defineEventHandler, readBody } from "h3";
import {
  mapChatMessageRow,
  validateChatMessagePayload,
} from "~~/server/utils/chat-constraints";
import { isChatAdmin, requireChatUser } from "~~/server/utils/chat";
import type {
  ChatConversationDto,
  ChatSubjectType,
  CreateChatConversationPayload,
} from "~~/app/types/chat";

const CHAT_SUBJECT_TYPES = new Set([
  "general",
  "product",
  "asset",
  "order",
  "rental_booking",
]);

type ChatConversationRow = Record<string, unknown>;
type ChatMessageRow = Record<string, unknown>;

function cleanSubjectType(value: unknown): ChatSubjectType {
  return CHAT_SUBJECT_TYPES.has(String(value))
    ? (String(value) as ChatSubjectType)
    : "general";
}

function cleanText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, max) : null;
}

function mapConversation(
  row: ChatConversationRow,
  message: ChatMessageRow | null,
): ChatConversationDto {
  return {
    id: String(row.id),
    subjectType: String(row.subject_type ?? "general") as ChatSubjectType,
    subjectId: cleanText(row.subject_id),
    customerId: cleanText(row.customer_id, 64),
    status: row.status ?? "open",
    lastMessageId: cleanText(row.last_message_id, 64),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    closedAt: cleanText(row.closed_at, 64),
    archivedAt: cleanText(row.archived_at, 64),
    participantRole: null,
    lastReadAt: null,
    unreadCount: 0,
    customer: null,
    lastMessage: message ? mapChatMessageRow(message) : null,
  };
}

export default defineEventHandler(
  async (event): Promise<{ item: ChatConversationDto; created: boolean }> => {
    const { userId, platformRole, adminClient } = await requireChatUser(event);
    const payload = (await readBody(
      event,
    )) as CreateChatConversationPayload | null;
    const subjectType = cleanSubjectType(payload?.subjectType);
    const subjectId =
      subjectType === "general" ? null : cleanText(payload?.subjectId);
    if (subjectType !== "general" && !subjectId) {
      throw createError({
        statusCode: 422,
        statusMessage: "subjectId is required",
      });
    }

    const customerId =
      isChatAdmin(platformRole) && payload?.customerId
        ? cleanText(payload.customerId, 64)
        : userId;
    if (!customerId) {
      throw createError({
        statusCode: 422,
        statusMessage: "customerId is required",
      });
    }

    let existingRequest = adminClient
      .from("chat_conversations")
      .select(
        "id, subject_type, subject_id, customer_id, status, last_message_id, created_at, updated_at, closed_at, archived_at",
      )
      .eq("customer_id", customerId)
      .eq("subject_type", subjectType)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(1);
    existingRequest = subjectId
      ? existingRequest.eq("subject_id", subjectId)
      : existingRequest.is("subject_id", null);

    const { data: existingRows, error: existingError } = await existingRequest;
    if (existingError) {
      throw createError({
        statusCode: 500,
        statusMessage: existingError.message,
      });
    }
    if (existingRows?.[0]) {
      return { item: mapConversation(existingRows[0], null), created: false };
    }

    const { data: conversation, error } = await adminClient
      .from("chat_conversations")
      .insert({
        subject_type: subjectType,
        subject_id: subjectId,
        customer_id: customerId,
      })
      .select(
        "id, subject_type, subject_id, customer_id, status, last_message_id, created_at, updated_at, closed_at, archived_at",
      )
      .single();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });

    const { error: participantError } = await adminClient
      .from("chat_participants")
      .upsert(
        {
          conversation_id: conversation.id,
          user_id: userId,
          participant_role: platformRole,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (participantError) {
      throw createError({
        statusCode: 500,
        statusMessage: participantError.message,
      });
    }

    let initialMessage: ChatMessageRow | null = null;
    if (payload?.initialMessage) {
      const messagePayload = validateChatMessagePayload({
        body: payload.initialMessage,
      });
      const { data: message, error: messageError } = await adminClient
        .from("chat_messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: userId,
          message_type: messagePayload.messageType,
          body: messagePayload.body,
        })
        .select(
          "id, conversation_id, sender_id, message_type, body, created_at, edited_at, deleted_at, chat_attachments(id, message_id, storage_bucket, storage_path, file_name, mime_type, file_size, kind, created_at, deleted_at)",
        )
        .single();
      if (messageError) {
        throw createError({
          statusCode: 500,
          statusMessage: messageError.message,
        });
      }
      initialMessage = message;
    }

    return {
      item: mapConversation(conversation, initialMessage),
      created: true,
    };
  },
);
