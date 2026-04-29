import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  ensureChatConversationAccess,
  requireChatUser,
} from "~~/server/utils/chat";

export default defineEventHandler(async (event) => {
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

  const lastReadAt = new Date().toISOString();
  const { error } = await adminClient.from("chat_participants").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      participant_role: platformRole,
      last_read_at: lastReadAt,
    },
    { onConflict: "conversation_id,user_id" },
  );

  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return { lastReadAt };
});
