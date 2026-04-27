import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_MEDIA_BUCKET,
  CONTENT_MEDIA_PREFIX,
  asContentUploadKind,
  buildContentMediaPath,
  collectContentMediaUrls,
  extractContentStoragePathFromPublicUrl,
  removeContentMediaByPublicUrl,
} from "../../server/utils/content-media";

describe("content media helpers", () => {
  it("accepts image and file upload kinds", () => {
    expect(asContentUploadKind("image")).toBe("image");
    expect(asContentUploadKind("file")).toBe("file");
    expect(() => asContentUploadKind("video")).toThrow(/kind must be/i);
  });

  it("creates paths under the content-pages prefix", () => {
    const imagePath = buildContentMediaPath({ kind: "image", extension: "webp" });
    const filePath = buildContentMediaPath({ kind: "file", extension: "pdf" });

    expect(imagePath.startsWith(`${CONTENT_MEDIA_PREFIX}/image/`)).toBe(true);
    expect(imagePath.endsWith(".webp")).toBe(true);
    expect(filePath.startsWith(`${CONTENT_MEDIA_PREFIX}/file/`)).toBe(true);
    expect(filePath.endsWith(".pdf")).toBe(true);
  });

  it("extracts and collects only content-pages storage URLs", () => {
    const url = `https://example.supabase.co/storage/v1/object/public/${CONTENT_MEDIA_BUCKET}/content-pages/image/2026-04-27/demo.webp`;
    const otherUrl = `https://example.supabase.co/storage/v1/object/public/${CONTENT_MEDIA_BUCKET}/products/demo.webp`;

    expect(extractContentStoragePathFromPublicUrl(url)).toBe(
      "content-pages/image/2026-04-27/demo.webp",
    );
    expect(extractContentStoragePathFromPublicUrl(otherUrl)).toBeNull();
    expect([...collectContentMediaUrls({ nested: [url, otherUrl] })]).toEqual([url]);
  });

  it("removes matching content media objects", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ remove }));
    const adminClient = { storage: { from } };
    const url = `https://example.supabase.co/storage/v1/object/public/${CONTENT_MEDIA_BUCKET}/content-pages/file/2026-04-27/demo.pdf`;

    await expect(removeContentMediaByPublicUrl(adminClient, url)).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith(CONTENT_MEDIA_BUCKET);
    expect(remove).toHaveBeenCalledWith(["content-pages/file/2026-04-27/demo.pdf"]);
  });
});