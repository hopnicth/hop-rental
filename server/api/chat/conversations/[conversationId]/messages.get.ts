import { createError, defineEventHandler, getRouterParam } from "h3";
import { mapChatMessageRow } from "~~/server/utils/chat-constraints";
import {
  ensureChatConversationAccess,
  parseChatMessagePage,
  requireChatUser,
} from "~~/server/utils/chat";
import type { ChatMessagesResponse } from "~~/app/types/chat";

export default defineEventHandler(
  async (event): Promise<ChatMessagesResponse> => {
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

    const { limit, before } = parseChatMessagePage(event);
    let request = adminClient
      .from("chat_messages")
      .select(
        "id, conversation_id, sender_id, message_type, body, created_at, edited_at, deleted_at, chat_attachments(id, message_id, storage_bucket, storage_path, file_name, mime_type, file_size, kind, created_at, deleted_at)",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (before) request = request.lt("created_at", before);

    const { data, error } = await request;
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });

    const rows = (data ?? []) as any[];
    const pageRows = rows.slice(0, limit);
    const oldest = pageRows[pageRows.length - 1] as any | undefined;

    return {
      items: pageRows.reverse().map(mapChatMessageRow),
      pageSize: limit,
      hasMore: rows.length > limit,
      nextBefore:
        typeof oldest?.created_at === "string" ? oldest.created_at : null,
    };
  },
);
