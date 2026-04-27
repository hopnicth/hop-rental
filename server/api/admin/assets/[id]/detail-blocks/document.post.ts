import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  mapAssetDetail,
} from "~~/server/utils/admin-asset";
import {
  buildBlockDocumentPath,
  findOrCreateBlock,
  readDetailBlocks,
} from "~~/server/utils/asset-detail-blocks";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";

const ALLOWED_DOC_TYPES = new Set(["application/pdf"]);
const ALLOWED_KINDS = new Set([
  "manual",
  "catalog",
  "datasheet",
  "guide",
  "report",
  "other",
]);
const MAX_BYTES = 30 * 1024 * 1024;

function readTextPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "document file is required",
    });
  }
  if (!ALLOWED_DOC_TYPES.has(file.type || "")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only PDF documents are supported",
    });
  }
  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Document file must be 30MB or smaller",
    });
  }

  const blockKey = readTextPart(parts, "blockKey");
  const kindRaw = readTextPart(parts, "kind") || "other";
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "other";
  const titleInput = readTextPart(parts, "title");
  const filename = file.filename || "document.pdf";
  const fallbackTitle = filename.replace(/\.[^.]+$/, "") || "Document";
  const title = titleInput.length > 0 ? titleInput : fallbackTitle;

  const { data: existing, error: fetchError } = await adminClient
    .from("assets")
    .select("id, detail_blocks")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Asset not found" });
  }

  const blocks = readDetailBlocks(existing.detail_blocks);
  const located = findOrCreateBlock(blocks, blockKey);
  const docId = crypto.randomUUID();
  const path = buildBlockDocumentPath(
    id,
    located.blocks[located.index].key,
    docId,
    "pdf",
  );

  const { error: uploadError } = await adminClient.storage
    .from(CATALOG_MEDIA_BUCKET)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw createError({
      statusCode: 500,
      statusMessage: uploadError.message,
    });
  }
  const url = adminClient.storage
    .from(CATALOG_MEDIA_BUCKET)
    .getPublicUrl(path).data.publicUrl;

  const block = located.blocks[located.index];
  const nextDocs = [
    ...(block.documents ?? []),
    {
      id: docId,
      url,
      kind,
      title,
      filename,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
    },
  ];
  located.blocks[located.index] = { ...block, documents: nextDocs };

  const { data: updated, error: updateError } = await adminClient
    .from("assets")
    .update({ detail_blocks: located.blocks })
    .eq("id", id)
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .single();
  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return {
    item: mapAssetDetail(updated as Record<string, unknown>),
    upload: { docId, blockKey: block.key, url, kind, title },
  };
});
