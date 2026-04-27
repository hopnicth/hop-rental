import { createError, defineEventHandler, readMultipartFormData } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  CONTENT_MEDIA_BUCKET,
  asContentUploadKind,
  buildContentMediaPath,
  processContentImageUpload,
} from "~~/server/utils/content-media";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_TYPE = "application/pdf";

function readTextPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: "file is required" });
  }

  const kind = asContentUploadKind(readTextPart(parts, "kind"));
  const fileType = (file.type || "").toLowerCase();
  const filename = file.filename || "upload";
  const sizeBytes = Buffer.from(file.data).byteLength;

  if (kind === "image" && !IMAGE_TYPES.has(fileType)) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only JPEG, PNG, or WebP images are supported",
    });
  }
  if (kind === "file" && fileType !== PDF_TYPE) {
    throw createError({ statusCode: 415, statusMessage: "Only PDF files are supported" });
  }
  if (sizeBytes > 30 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: "File must be 30MB or smaller" });
  }

  const processed =
    kind === "image"
      ? await processContentImageUpload(Buffer.from(file.data))
      : { buffer: Buffer.from(file.data), contentType: PDF_TYPE, width: null, height: null };
  const path = buildContentMediaPath({ kind, extension: kind === "image" ? "webp" : "pdf" });

  const { error } = await adminClient.storage
    .from(CONTENT_MEDIA_BUCKET)
    .upload(path, processed.buffer, { contentType: processed.contentType, upsert: true });

  if (error) throw createError({ statusCode: 500, statusMessage: error.message });

  const url = adminClient.storage.from(CONTENT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

  return {
    bucket: CONTENT_MEDIA_BUCKET,
    path,
    url,
    filename,
    mimeType: processed.contentType,
    sizeBytes,
    width: processed.width,
    height: processed.height,
  };
});