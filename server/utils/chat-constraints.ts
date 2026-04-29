import { createError } from "h3";
import type {
  ChatAttachmentDto,
  ChatAttachmentKind,
  ChatMessageDto,
  ChatMessageType,
  CreateChatAttachmentPayload,
  CreateChatMessagePayload,
} from "~~/app/types/chat";

export const CHAT_MESSAGE_MAX_CHARS = 4000;
export const CHAT_INITIAL_PAGE_SIZE = 30;
export const CHAT_MAX_PAGE_SIZE = 50;
export const CHAT_MESSAGE_RATE_LIMIT_PER_SECOND = 10;
export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface ChatUnreadMessageRow {
  conversation_id?: unknown;
  conversationId?: unknown;
  sender_id?: unknown;
  senderId?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  deleted_at?: unknown;
  deletedAt?: unknown;
}

export const CHAT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const rateBuckets = new Map<string, { startsAt: number; count: number }>();

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage });
}

export function validateChatMessagePayload(input: unknown): {
  messageType: Exclude<ChatMessageType, "system">;
  body: string | null;
} {
  const payload = (input && typeof input === "object" ? input : {}) as
    | CreateChatMessagePayload
    | Record<string, unknown>;
  const messageType =
    payload.messageType === "attachment" ? "attachment" : "text";
  const rawBody = typeof payload.body === "string" ? payload.body.trim() : "";

  if (rawBody.length > CHAT_MESSAGE_MAX_CHARS) {
    fail(
      413,
      `Message must be ${CHAT_MESSAGE_MAX_CHARS} characters or fewer; use an attachment for long content`,
    );
  }
  if (messageType === "text" && rawBody.length === 0) {
    fail(422, "Message body is required");
  }

  return { messageType, body: rawBody.length > 0 ? rawBody : null };
}

export function enforceChatMessageRateLimit(userId: string) {
  const now = Date.now();
  const current = rateBuckets.get(userId);
  if (!current || now - current.startsAt >= 1000) {
    rateBuckets.set(userId, { startsAt: now, count: 1 });
    return;
  }
  if (current.count >= CHAT_MESSAGE_RATE_LIMIT_PER_SECOND) {
    fail(429, "Message rate limit exceeded");
  }
  current.count += 1;
}

export function classifyChatAttachment(mimeType: unknown, fileSize: unknown) {
  const mime =
    typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  const size = Number(fileSize);
  if (!CHAT_ALLOWED_MIME_TYPES.has(mime)) {
    fail(415, "Attachment must be JPEG, PNG, WebP, or PDF");
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    fail(422, "Attachment fileSize must be a positive integer");
  }

  const isImage = mime.startsWith("image/");
  const max = isImage ? CHAT_IMAGE_MAX_BYTES : CHAT_DOCUMENT_MAX_BYTES;
  if (size > max) {
    fail(
      413,
      isImage
        ? "Image attachments must be 5MB or smaller"
        : "PDF attachments must be 10MB or smaller",
    );
  }

  return {
    mimeType: mime,
    fileSize: size,
    kind: (isImage ? "image" : "document") as ChatAttachmentKind,
  };
}

export function validateChatAttachmentPayload(
  input: unknown,
  conversationId: string,
  messageId: string,
) {
  const payload = (input && typeof input === "object" ? input : {}) as
    | CreateChatAttachmentPayload
    | Record<string, unknown>;
  const { mimeType, fileSize, kind } = classifyChatAttachment(
    payload.mimeType,
    payload.fileSize,
  );
  const storageBucket =
    typeof payload.storageBucket === "string" && payload.storageBucket.trim()
      ? payload.storageBucket.trim()
      : CHAT_ATTACHMENT_BUCKET;
  const storagePath =
    typeof payload.storagePath === "string" ? payload.storagePath.trim() : "";
  const requiredPrefix = `conversations/${conversationId}/${messageId}/`;

  if (
    !storagePath ||
    storagePath.length > 1024 ||
    /^data:/i.test(storagePath) ||
    /base64,/i.test(storagePath)
  ) {
    fail(
      422,
      "storagePath must be an external storage object path, not inline data",
    );
  }
  if (storageBucket !== CHAT_ATTACHMENT_BUCKET) {
    fail(422, `storageBucket must be ${CHAT_ATTACHMENT_BUCKET}`);
  }
  if (!storagePath.startsWith(requiredPrefix)) {
    fail(422, `storagePath must start with ${requiredPrefix}`);
  }

  const fileName =
    typeof payload.fileName === "string" && payload.fileName.trim()
      ? payload.fileName.trim().slice(0, 255)
      : null;

  return { storageBucket, storagePath, fileName, mimeType, fileSize, kind };
}

export function countChatUnreadMessages(params: {
  conversationIds: string[];
  participantLastReadByConversation: Map<string, string | null | undefined>;
  messages: ChatUnreadMessageRow[];
  userId: string;
}) {
  const counts = new Map(params.conversationIds.map((id) => [id, 0]));

  for (const message of params.messages) {
    const conversationId = String(
      message.conversation_id ?? message.conversationId ?? "",
    );
    if (!counts.has(conversationId)) continue;
    if (message.deleted_at || message.deletedAt) continue;

    const senderId = String(message.sender_id ?? message.senderId ?? "");
    if (!senderId || senderId === params.userId) continue;

    const createdAt = String(message.created_at ?? message.createdAt ?? "");
    const createdAtMs = Date.parse(createdAt);
    if (Number.isNaN(createdAtMs)) continue;

    const lastReadAt =
      params.participantLastReadByConversation.get(conversationId);
    const lastReadAtMs = lastReadAt ? Date.parse(lastReadAt) : Number.NaN;
    if (
      !lastReadAt ||
      Number.isNaN(lastReadAtMs) ||
      createdAtMs > lastReadAtMs
    ) {
      counts.set(conversationId, (counts.get(conversationId) ?? 0) + 1);
    }
  }

  return counts;
}

export function mapChatAttachmentRow(row: any): ChatAttachmentDto {
  return {
    id: String(row.id ?? ""),
    messageId: String(row.message_id ?? ""),
    storageBucket: String(row.storage_bucket ?? CHAT_ATTACHMENT_BUCKET),
    storagePath: String(row.storage_path ?? ""),
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    mimeType: String(row.mime_type ?? ""),
    fileSize: Number(row.file_size ?? 0),
    kind: String(row.kind ?? "document") as ChatAttachmentKind,
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapChatMessageRow(row: any): ChatMessageDto {
  const attachments = Array.isArray(row.chat_attachments)
    ? row.chat_attachments
        .filter((item: any) => !item.deleted_at)
        .map(mapChatAttachmentRow)
    : [];
  return {
    id: String(row.id ?? ""),
    conversationId: String(row.conversation_id ?? ""),
    senderId: String(row.sender_id ?? ""),
    messageType: String(row.message_type ?? "text") as ChatMessageType,
    body: typeof row.body === "string" ? row.body : null,
    createdAt: String(row.created_at ?? ""),
    editedAt: typeof row.edited_at === "string" ? row.edited_at : null,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    attachments,
  };
}
