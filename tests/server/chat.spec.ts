import { describe, expect, it } from "vitest";
import {
  CHAT_DOCUMENT_MAX_BYTES,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_MESSAGE_RATE_LIMIT_PER_SECOND,
  classifyChatAttachment,
  countChatUnreadMessages,
  enforceChatMessageRateLimit,
  mapChatMessageRow,
  validateChatAttachmentPayload,
  validateChatMessagePayload,
} from "../../server/utils/chat-constraints";

describe("chat message constraints", () => {
  it("accepts trimmed text messages within the configured limit", () => {
    expect(validateChatMessagePayload({ body: " hello " })).toEqual({
      messageType: "text",
      body: "hello",
    });
  });

  it("rejects empty text and over-limit text", () => {
    expect(() => validateChatMessagePayload({ body: "   " })).toThrow(
      /required/i,
    );
    expect(() =>
      validateChatMessagePayload({
        body: "x".repeat(CHAT_MESSAGE_MAX_CHARS + 1),
      }),
    ).toThrow(/attachment/i);
  });

  it("allows attachment messages to use an optional caption", () => {
    expect(validateChatMessagePayload({ messageType: "attachment" })).toEqual({
      messageType: "attachment",
      body: null,
    });
  });

  it("rate limits bursts per sender", () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < CHAT_MESSAGE_RATE_LIMIT_PER_SECOND; i += 1) {
      expect(() => enforceChatMessageRateLimit(userId)).not.toThrow();
    }
    expect(() => enforceChatMessageRateLimit(userId)).toThrow(/rate limit/i);
  });
});

describe("chat attachment constraints", () => {
  it("classifies supported attachments and enforces size limits", () => {
    expect(
      classifyChatAttachment("image/jpeg", CHAT_IMAGE_MAX_BYTES),
    ).toMatchObject({
      kind: "image",
      mimeType: "image/jpeg",
    });
    expect(
      classifyChatAttachment("application/pdf", CHAT_DOCUMENT_MAX_BYTES),
    ).toMatchObject({
      kind: "document",
      mimeType: "application/pdf",
    });
    expect(() =>
      classifyChatAttachment("image/jpeg", CHAT_IMAGE_MAX_BYTES + 1),
    ).toThrow(/5MB/i);
    expect(() =>
      classifyChatAttachment("application/pdf", CHAT_DOCUMENT_MAX_BYTES + 1),
    ).toThrow(/10MB/i);
    expect(() => classifyChatAttachment("text/html", 100)).toThrow(/jpeg/i);
  });

  it("requires external storage paths under the conversation/message prefix", () => {
    const conversationId = "conv-1";
    const messageId = "msg-1";
    const storagePath = `conversations/${conversationId}/${messageId}/photo.jpg`;

    expect(
      validateChatAttachmentPayload(
        {
          storagePath,
          fileName: "photo.jpg",
          mimeType: "image/png",
          fileSize: 1000,
        },
        conversationId,
        messageId,
      ),
    ).toMatchObject({ storagePath, kind: "image" });

    expect(() =>
      validateChatAttachmentPayload(
        {
          storagePath: "data:image/png;base64,abc",
          mimeType: "image/png",
          fileSize: 1000,
        },
        conversationId,
        messageId,
      ),
    ).toThrow(/external storage/i);

    expect(() =>
      validateChatAttachmentPayload(
        {
          storagePath: "other/path/file.pdf",
          mimeType: "application/pdf",
          fileSize: 1000,
        },
        conversationId,
        messageId,
      ),
    ).toThrow(/must start/i);
  });
});

describe("chat row mapping", () => {
  it("filters deleted attachment metadata from message DTOs", () => {
    const dto = mapChatMessageRow({
      id: "m1",
      conversation_id: "c1",
      sender_id: "u1",
      message_type: "attachment",
      created_at: "2026-04-29T00:00:00.000Z",
      chat_attachments: [
        {
          id: "a1",
          message_id: "m1",
          storage_path: "ok",
          mime_type: "image/png",
          file_size: 1,
          kind: "image",
        },
        { id: "a2", deleted_at: "2026-04-29T00:00:00.000Z" },
      ],
    });

    expect(dto.attachments).toHaveLength(1);
    expect(dto.attachments[0]?.id).toBe("a1");
  });
});

describe("chat unread counts", () => {
  it("counts unread messages per conversation after the user's last read time", () => {
    const counts = countChatUnreadMessages({
      conversationIds: ["c1", "c2", "c3"],
      participantLastReadByConversation: new Map([
        ["c1", "2026-04-29T10:00:00.000Z"],
        ["c2", null],
      ]),
      messages: [
        {
          conversation_id: "c1",
          sender_id: "other",
          created_at: "2026-04-29T09:59:00.000Z",
        },
        {
          conversation_id: "c1",
          sender_id: "other",
          created_at: "2026-04-29T10:01:00.000Z",
        },
        {
          conversation_id: "c1",
          sender_id: "me",
          created_at: "2026-04-29T10:02:00.000Z",
        },
        {
          conversation_id: "c1",
          sender_id: "other",
          created_at: "2026-04-29T10:03:00.000Z",
          deleted_at: "2026-04-29T10:04:00.000Z",
        },
        {
          conversation_id: "c2",
          sender_id: "other",
          created_at: "2026-04-29T08:00:00.000Z",
        },
        {
          conversation_id: "c2",
          sender_id: "other",
          created_at: "2026-04-29T08:01:00.000Z",
        },
      ],
      userId: "me",
    });

    expect(counts.get("c1")).toBe(1);
    expect(counts.get("c2")).toBe(2);
    expect(counts.get("c3")).toBe(0);
  });
});
