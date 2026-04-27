import { describe, expect, it } from "vitest";
import {
  buildContentPagePayload,
  normalizeLocalizedBody,
} from "../../server/utils/content-pages";

describe("content page payload helpers", () => {
  it("normalizes core content page fields and localized body", () => {
    const payload = buildContentPagePayload({
      contentType: "service",
      slug: " Engineering Design!! ",
      titleTh: "บริการออกแบบ",
      titleEn: "Engineering Design",
      excerptTh: "คำอธิบายสั้น",
      excerptEn: "Short excerpt",
      coverImageUrl: "",
      sortOrder: 3,
      isActive: true,
      publishedAt: "2026-04-27T09:00:00Z",
      body: {
        th: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "สวัสดี" }],
            },
          ],
        },
      },
    });

    expect(payload.content_type).toBe("service");
    expect(payload.slug).toBe("engineering-design");
    expect(payload.cover_image_url).toBeNull();
    expect(payload.blocks.th).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "สวัสดี" }] },
      ],
    });
    expect(payload.blocks.en).toEqual({ type: "doc", content: [] });
    expect(payload.blocks.cn).toEqual({ type: "doc", content: [] });
    expect(payload.blocks.jp).toEqual({ type: "doc", content: [] });
  });

  it("returns empty docs for legacy or invalid body data", () => {
    expect(normalizeLocalizedBody(null)).toEqual({
      th: { type: "doc", content: [] },
      en: { type: "doc", content: [] },
      cn: { type: "doc", content: [] },
      jp: { type: "doc", content: [] },
    });
    expect(normalizeLocalizedBody([{ type: "heading" }])).toEqual({
      th: { type: "doc", content: [] },
      en: { type: "doc", content: [] },
      cn: { type: "doc", content: [] },
      jp: { type: "doc", content: [] },
    });
  });
});
