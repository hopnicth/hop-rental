import { describe, expect, it, vi } from "vitest";
import {
  HOME_MEDIA_BUCKET,
  HOME_MEDIA_PREFIX,
  asHomeUploadKind,
  buildHomeMediaPath,
  extractHomeStoragePathFromPublicUrl,
  processHomeImageUpload,
  processHomeSvgLogoUpload,
  removeHomeMediaByPublicUrl,
} from "../../server/utils/home-media";

describe("asHomeUploadKind", () => {
  it("accepts the supported upload kinds", () => {
    expect(asHomeUploadKind("banner")).toBe("banner");
    expect(asHomeUploadKind("banner-mobile")).toBe("banner-mobile");
    expect(asHomeUploadKind("link-card")).toBe("link-card");
    expect(asHomeUploadKind("partner-logo")).toBe("partner-logo");
  });

  it("throws for unsupported kinds", () => {
    expect(() => asHomeUploadKind("unknown")).toThrow(/kind must be/i);
  });
});

describe("buildHomeMediaPath", () => {
  it("creates a webp path under the home-content prefix", () => {
    const path = buildHomeMediaPath("banner");
    expect(path.startsWith(`${HOME_MEDIA_PREFIX}/banner/`)).toBe(true);
    expect(path.endsWith(".webp")).toBe(true);
  });

  it("creates an svg path for uploaded partner logo SVG files", () => {
    const path = buildHomeMediaPath("partner-logo", "svg");
    expect(path.startsWith(`${HOME_MEDIA_PREFIX}/partner-logo/`)).toBe(true);
    expect(path.endsWith(".svg")).toBe(true);
  });
});

describe("processHomeSvgLogoUpload", () => {
  it("keeps safe SVG logos as SVG files", () => {
    const result = processHomeSvgLogoUpload({
      buffer: Buffer.from(
        '<svg viewBox="0 0 120 40"><path d="M0 0h120v40H0z" /></svg>',
      ),
    });

    expect(result.contentType).toBe("image/svg+xml");
    expect(result.buffer.toString("utf8")).toContain("<svg");
  });

  it("rejects SVG logos with script content", () => {
    expect(() =>
      processHomeSvgLogoUpload({
        buffer: Buffer.from('<svg><script>alert("x")</script></svg>'),
      }),
    ).toThrow(/unsafe/i);
  });
});

describe("processHomeImageUpload", () => {
  it("normalizes banner-mobile uploads to a square 1:1 webp", async () => {
    const input = await import("sharp").then(({ default: sharp }) =>
      sharp({
        create: {
          width: 1200,
          height: 1600,
          channels: 3,
          background: { r: 120, g: 160, b: 210 },
        },
      })
        .png()
        .toBuffer(),
    );

    const result = await processHomeImageUpload({
      buffer: input,
      kind: "banner-mobile",
    });

    expect(result.contentType).toBe("image/webp");
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
  });
});

describe("extractHomeStoragePathFromPublicUrl", () => {
  it("extracts the storage path for home-content URLs", () => {
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/${HOME_MEDIA_BUCKET}/home-content/banner/2026-04-27/demo-file.webp`;

    expect(extractHomeStoragePathFromPublicUrl(publicUrl)).toBe(
      "home-content/banner/2026-04-27/demo-file.webp",
    );
  });

  it("returns null for non-home-content storage URLs", () => {
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/${HOME_MEDIA_BUCKET}/products/demo.webp`;

    expect(extractHomeStoragePathFromPublicUrl(publicUrl)).toBeNull();
  });
});

describe("removeHomeMediaByPublicUrl", () => {
  it("removes a matching home-content object", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ remove }));
    const adminClient = { storage: { from } };
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/${HOME_MEDIA_BUCKET}/home-content/partner-logo/2026-04-27/demo-file.webp`;

    await expect(
      removeHomeMediaByPublicUrl(adminClient, publicUrl),
    ).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith(HOME_MEDIA_BUCKET);
    expect(remove).toHaveBeenCalledWith([
      "home-content/partner-logo/2026-04-27/demo-file.webp",
    ]);
  });

  it("does nothing for non-home-content URLs", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ remove }));
    const adminClient = { storage: { from } };
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/${HOME_MEDIA_BUCKET}/products/demo.webp`;

    await expect(
      removeHomeMediaByPublicUrl(adminClient, publicUrl),
    ).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
