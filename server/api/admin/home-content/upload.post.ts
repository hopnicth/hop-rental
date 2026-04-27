import { createError, defineEventHandler, readMultipartFormData } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  HOME_MEDIA_BUCKET,
  asHomeUploadKind,
  buildHomeMediaPath,
  processHomeImageUpload,
  processHomeSvgLogoUpload,
} from "~~/server/utils/home-media";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SVG_TYPE = "image/svg+xml";

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
    throw createError({
      statusCode: 400,
      statusMessage: "image file is required",
    });
  }

  const kind = asHomeUploadKind(readTextPart(parts, "kind"));
  const fileType = (file.type || "").toLowerCase();
  const filename = file.filename?.toLowerCase() || "";
  const isSvgLogo =
    kind === "partner-logo" &&
    (fileType === SVG_TYPE || filename.endsWith(".svg"));

  if (!ALLOWED_TYPES.has(fileType) && !isSvgLogo) {
    throw createError({
      statusCode: 415,
      statusMessage:
        kind === "partner-logo"
          ? "Only JPEG, PNG, WebP, or SVG logo files are supported"
          : "Only JPEG, PNG, or WebP images are supported",
    });
  }

  if (Buffer.from(file.data).byteLength > 15 * 1024 * 1024) {
    throw createError({
      statusCode: 413,
      statusMessage: "Image file must be 15MB or smaller",
    });
  }

  const uploadBuffer = Buffer.from(file.data);
  const processed = isSvgLogo
    ? processHomeSvgLogoUpload({ buffer: uploadBuffer })
    : await processHomeImageUpload({
        buffer: uploadBuffer,
        kind,
      });
  const path = buildHomeMediaPath(kind, isSvgLogo ? "svg" : "webp");

  const { error } = await adminClient.storage
    .from(HOME_MEDIA_BUCKET)
    .upload(path, processed.buffer, {
      contentType: processed.contentType,
      upsert: true,
    });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const url = adminClient.storage.from(HOME_MEDIA_BUCKET).getPublicUrl(path)
    .data.publicUrl;

  return {
    bucket: HOME_MEDIA_BUCKET,
    path,
    url,
    width: processed.width,
    height: processed.height,
  };
});
