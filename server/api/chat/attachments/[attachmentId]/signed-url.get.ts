import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  loadAccessibleChatMessage,
  requireChatUser,
} from "~~/server/utils/chat";

const SIGNED_URL_TTL_SECONDS = 60;

export default defineEventHandler(async (event) => {
  const attachmentId = getRouterParam(event, "attachmentId");
  if (!attachmentId) {
    throw createError({ statusCode: 400, statusMessage: "attachmentId is required" });
  }

  const { userId, platformRole, adminClient } = await requireChatUser(event);
  const { data: attachment, error } = await adminClient
    .from("chat_attachments")
    .select("id, message_id, storage_bucket, storage_path, deleted_at")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!attachment) throw createError({ statusCode: 404, statusMessage: "Attachment not found" });

  await loadAccessibleChatMessage(
    adminClient,
    String((attachment as any).message_id),
    userId,
    platformRole,
  );

  const { data, error: signedError } = await adminClient.storage
    .from(String((attachment as any).storage_bucket))
    .createSignedUrl(String((attachment as any).storage_path), SIGNED_URL_TTL_SECONDS);
  if (signedError) {
    throw createError({ statusCode: 500, statusMessage: signedError.message });
  }

  return { signedUrl: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
});